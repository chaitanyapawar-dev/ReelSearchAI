import json
import os
import shutil
import subprocess
import time
from pathlib import Path
import requests
import uuid
import asyncio
from datetime import datetime
from enum import Enum
from fastapi.staticfiles import StaticFiles

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
from faster_whisper import WhisperModel

# STEP 10 — BLIP visual captioning imports
try:
    from transformers import BlipProcessor, BlipForConditionalGeneration
    from PIL import Image as PILImage
    _BLIP_IMPORTS_OK = True
except ImportError:
    _BLIP_IMPORTS_OK = False
    print("[WARN] transformers / Pillow not installed — BLIP captioning disabled.")

# STEP 11 — CLIP visual semantic embedding imports
try:
    from transformers import CLIPProcessor, CLIPModel
    import torch
    import torch.nn.functional as _F
    import numpy as _np
    _CLIP_IMPORTS_OK = True
except ImportError:
    _CLIP_IMPORTS_OK = False
    print("[WARN] transformers / torch / numpy not installed — CLIP embedding disabled.")

# ---------------------------------------------------------------------------
# Startup: detect FFmpeg
# ---------------------------------------------------------------------------
FFMPEG_PATH = shutil.which("ffmpeg")
if FFMPEG_PATH:
    print(f"[INFO] FFmpeg found at: {FFMPEG_PATH}")

# ---------------------------------------------------------------------------
# Job management structures
# ---------------------------------------------------------------------------

class PipelineStage(str, Enum):
    QUEUED = "Queued"
    DOWNLOADING = "Downloading"
    AUDIO_EXTRACT = "Audio Extraction"
    TRANSCRIBING = "Transcribing"
    OCR = "OCR"
    BLIP = "BLIP Captioning"
    CLIP = "CLIP Embedding"
    CHROMA = "Storing to ChromaDB"
    OLLAMA = "LLM Enrichment"
    FINISHED = "Finished"
    FAILED = "Failed"
    COMPLETE = "Complete"
    ERROR = "Error"

import db
import os

# Configurable concurrency
MAX_CONCURRENT_PIPELINES = int(os.getenv("MAX_CONCURRENT_PIPELINES", "2"))
pipeline_semaphore = asyncio.Semaphore(MAX_CONCURRENT_PIPELINES)

# Active pipeline tasks tracked in memory
active_pipeline_tasks: dict[str, asyncio.Task] = {}
job_lock = asyncio.Lock()


class JobNotifier:
    def __init__(self):
        self.subscribers: dict[str, set[asyncio.Queue]] = {}

    def subscribe(self, job_id: str, queue: asyncio.Queue):
        self.subscribers.setdefault(job_id, set()).add(queue)

    def unsubscribe(self, job_id: str, queue: asyncio.Queue):
        if job_id in self.subscribers:
            self.subscribers[job_id].discard(queue)
            if not self.subscribers[job_id]:
                del self.subscribers[job_id]

    def notify(self, job_id: str):
        if job_id not in self.subscribers:
            return
        try:
            job_state = db._get_job_sync(job_id)
            if not job_state:
                return
            if job_state["status"] == "queued":
                job_state["queue_position"] = db._get_queue_position_sync(job_id)
            else:
                job_state["queue_position"] = 0

            payload = {
                "type": "job_update",
                "job": job_state
            }

            loop = asyncio.get_event_loop()

            def push_to_queue(q: asyncio.Queue, data):
                if q.full():
                    try:
                        q.get_nowait()
                    except asyncio.QueueEmpty:
                        pass
                q.put_nowait(data)

            for q in list(self.subscribers[job_id]):
                loop.call_soon_threadsafe(push_to_queue, q, payload)
        except Exception as e:
            print(f"[ERROR] Notifier failed for {job_id}: {e}")

job_notifier = JobNotifier()

def update_job(job_id: str, **kwargs):
    """Update job in SQLite and notify listeners."""
    db._update_job_sync(job_id, **kwargs)
    job_notifier.notify(job_id)

def log_job(job_id: str, message: str, level: str = "INFO"):
    """Log to SQLite and notify listeners."""
    db._add_log_sync(job_id, message, level)
    job_notifier.notify(job_id)


# ---------------------------------------------------------------------------
# Startup: load Whisper model on CPU (int8)
# ---------------------------------------------------------------------------
print("[INFO] Loading Whisper model on CPU...")
try:
    whisper_model = WhisperModel("medium", device="cpu", compute_type="int8")
    print("[INFO] Whisper model loaded successfully.")
except Exception as e:
    whisper_model = None
    print(f"[ERROR] Whisper model failed to load: {e}")

# ---------------------------------------------------------------------------
# Startup: load embedding model
# ---------------------------------------------------------------------------
print("[INFO] Loading embedding model...")
try:
    from sentence_transformers import SentenceTransformer
    embedding_model = SentenceTransformer("all-MiniLM-L6-v2")
    print("[INFO] Embedding model loaded successfully.")
except Exception as e:
    embedding_model = None
    print(f"[ERROR] Embedding model failed to load: {e}")

# ---------------------------------------------------------------------------
# Startup: load OCR reader (EasyOCR — English + Hindi, CPU only)
# ---------------------------------------------------------------------------
print("[INFO] Loading OCR reader...")
try:
    import easyocr
    ocr_reader = easyocr.Reader(["en", "hi"], gpu=False, verbose=False)
    print("[INFO] OCR reader loaded successfully.")
except Exception as e:
    ocr_reader = None
    print(f"[WARN] OCR reader failed to load (OCR will be skipped): {e}")

# ---------------------------------------------------------------------------
# Startup: initialize ChromaDB
# ---------------------------------------------------------------------------
print("[INFO] Initializing ChromaDB...")
try:
    import chromadb
    BASE_DIR = Path(__file__).parent
    chroma_client = chromadb.PersistentClient(path=str(BASE_DIR / "vector_db"))
    chroma_collection = chroma_client.get_or_create_collection(name="reels")
    # STEP 11 — CLIP visual embedding collection (cosine distance, 512-d CLIP vectors)
    clip_collection = chroma_client.get_or_create_collection(
        name="reels_clip",
        metadata={"hnsw:space": "cosine"},
    )
    print("[INFO] ChromaDB initialized successfully.")
except Exception as e:
    chroma_client = None
    chroma_collection = None
    clip_collection = None
    print(f"[ERROR] ChromaDB failed to initialize: {e}")

# ---------------------------------------------------------------------------
# STEP 10 — BLIP visual captioning model
# ---------------------------------------------------------------------------
blip_processor = None
blip_model = None
if _BLIP_IMPORTS_OK:
    print("[INFO] Loading BLIP visual captioning model...")
    try:
        blip_processor = BlipProcessor.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
        blip_model = BlipForConditionalGeneration.from_pretrained(
            "Salesforce/blip-image-captioning-base"
        )
        blip_model.eval()  # inference-only
        print("[INFO] BLIP model loaded successfully.")
    except Exception as _blip_err:
        blip_processor = None
        blip_model = None
        print(f"[WARN] BLIP model failed to load (visual captioning disabled): {_blip_err}")
else:
    print("[WARN] BLIP captioning skipped — install transformers and pillow.")

# ---------------------------------------------------------------------------
# STEP 11 — CLIP visual semantic embedding model
# ---------------------------------------------------------------------------
clip_processor_model = None
clip_model_inst = None
if _CLIP_IMPORTS_OK:
    print("[INFO] Loading CLIP semantic vision model...")
    try:
        clip_processor_model = CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32")
        clip_model_inst = CLIPModel.from_pretrained("openai/clip-vit-base-patch32")
        clip_model_inst.eval()  # inference-only
        print("[INFO] CLIP model loaded successfully.")
    except Exception as _clip_err:
        clip_processor_model = None
        clip_model_inst = None
        print(f"[WARN] CLIP model failed to load (visual semantic search disabled): {_clip_err}")
else:
    print("[WARN] CLIP skipped — install transformers, torch, and numpy.")

# ---------------------------------------------------------------------------
# STEP 9 — Ollama / LLM Reasoning Layer
# ---------------------------------------------------------------------------
OLLAMA_URL = "http://localhost:11434/api/generate"
OLLAMA_MODEL = "llama3.2:3b"
OLLAMA_TIMEOUT = 60  # seconds

# Probe once at startup; search falls back gracefully if Ollama is offline
def _probe_ollama() -> bool:
    try:
        r = requests.get("http://localhost:11434/api/tags", timeout=3)
        return r.status_code == 200
    except Exception:
        return False

OLLAMA_AVAILABLE = _probe_ollama()
if OLLAMA_AVAILABLE:
    print(f"[INFO] Ollama reachable — LLM reasoning enabled ({OLLAMA_MODEL}).")
else:
    print("[WARN] Ollama not reachable — LLM reasoning disabled. Semantic search still works.")


def call_ollama(prompt: str) -> str:
    """POST a prompt to the local Ollama instance. Returns response text or empty string on failure."""
    try:
        payload = {
            "model": OLLAMA_MODEL,
            "prompt": prompt,
            "stream": False,
        }
        r = requests.post(OLLAMA_URL, json=payload, timeout=OLLAMA_TIMEOUT)
        r.raise_for_status()
        data = r.json()
        return data.get("response", "").strip()
    except requests.exceptions.ConnectionError:
        print("[WARN] Ollama connection refused — LLM step skipped.")
        return ""
    except requests.exceptions.Timeout:
        print("[WARN] Ollama request timed out — LLM step skipped.")
        return ""
    except Exception as e:
        print(f"[WARN] Ollama call failed: {e}")
        return ""


def rewrite_query(query: str) -> str:
    """Ask LLM to expand the user query for better semantic retrieval."""
    prompt = (
        "Rewrite this search query into a short semantic search query.\n"
        "Expand implied meaning. Keep concise. Return ONLY the rewritten query, nothing else.\n\n"
        f'User query: "{query}"'
    )
    rewritten = call_ollama(prompt)
    # Fallback to original if LLM returns nothing sensible
    if not rewritten or len(rewritten) > 300:
        return query
    # Strip quotes that the model sometimes adds
    rewritten = rewritten.strip('"\' \n')
    print(f"[INFO] Query rewritten: '{query}' → '{rewritten}'")
    return rewritten


_RERANK_TEMPLATE = """
You are a semantic relevance judge for a personal reel search engine.

User original query: "{original_query}"
Expanded semantic query: "{rewritten_query}"

Below are up to 10 candidate reels retrieved by vector similarity.
For each reel, decide its relevance to the user's intent.

Relevance labels:
- HIGH   : clearly about the topic
- MEDIUM : somewhat related, plausible match
- LOW    : weakly related, stretch
- IRRELEVANT : unrelated

Return STRICT JSON — a JSON array, one object per reel, in your preferred ranking order (best first).
Each object must have exactly these keys:
  "id"               (string, reel id from input)
  "relevance_label"  (one of: HIGH, MEDIUM, LOW, IRRELEVANT)
  "llm_reason"       (one short sentence explaining why)

Do NOT include any text outside the JSON array. Do NOT wrap in markdown code blocks.

Candidates:
{candidates_json}
"""


def llm_rerank(original_query: str, rewritten_query: str, results: list) -> list:
    """Send results to LLM for semantic reranking + relevance labelling."""
    # Build compact candidate list (short snippets only)
    candidates = []
    for r in results:
        transcript_snip = r.get("transcript_preview", "")[:300]
        ocr_snip        = r.get("ocr_text_preview", "")[:150]
        visual_snip     = r.get("visual_captions_preview", "")[:200]  # STEP 10
        clip_score      = r.get("clip_score", 0.0)                     # STEP 11
        caption_snip    = r.get("instagram_caption_preview", "")[:200] # STEP 12.5
        hashtag_snip    = r.get("hashtags_str", "")[:100]              # STEP 12.5
        candidates.append({
            "id": r["id"],
            "similarity": round(r["similarity_score"], 4),
            "transcript": transcript_snip,
            "ocr": ocr_snip,
            "visual_captions": visual_snip,
            "clip_visual_score": round(clip_score, 4),
            "caption": caption_snip,
            "hashtags": hashtag_snip,
        })


    prompt = _RERANK_TEMPLATE.format(
        original_query=original_query,
        rewritten_query=rewritten_query,
        candidates_json=json.dumps(candidates, ensure_ascii=False, indent=2),
    )

    raw = call_ollama(prompt)
    if not raw:
        return []

    # Parse JSON — be robust to model wrapping in ```json ... ```
    clean = raw.strip()
    if clean.startswith("```"):
        # Strip markdown code fence
        lines = clean.splitlines()
        clean = "\n".join(l for l in lines if not l.strip().startswith("```"))
    try:
        ranked = json.loads(clean)
        if not isinstance(ranked, list):
            raise ValueError("LLM did not return a JSON array")
        return ranked
    except Exception as e:
        print(f"[WARN] LLM rerank JSON parse failed: {e}")
        print(f"[DEBUG] Raw LLM output (first 500 chars): {raw[:500]}")
        return []


# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI()

@app.on_event("startup")
async def startup_event():
    print("[INFO] Running database initialization...")
    await db.init_db()
    print("[INFO] Running database recovery hook...")
    await db.recover_orphaned_jobs()
    print("[INFO] Startup sequence completed.")


# ---------------------------------------------------------------------------
# Health endpoint – provides system status without crashing
# ---------------------------------------------------------------------------
@app.get("/health")
async def health_check():
    try:
        # Basic metrics – safe fallbacks if any component missing
        total_reels = 0
        total_embeddings = 0
        total_transcripts = 0
        active_downloads = 0
        processing_queue = 0

        if chroma_collection is not None:
            total_reels = chroma_collection.count()
            # embeddings count – for now assume one embedding per reel
            total_embeddings = total_reels

        # Transcript count – iterate over stored metadata if accessible
        try:
            # Fetch all metadata (could be large, but acceptable for small dev set)
            all_meta = chroma_collection.get(include=["metadatas"]).get("metadatas", [])
            total_transcripts = sum(1 for m in all_meta if m.get("transcript"))
        except Exception:
            total_transcripts = 0

        # Placeholder values for download/processing queues – replace with real trackers if available
        active_downloads = len(active_pipeline_tasks)
        processing_queue = 0

        active_jobs_cnt = await db.get_active_jobs_count()

        return {
            "success": True,
            "backendOnline": True,
            "ollamaOnline": OLLAMA_AVAILABLE,
            "chromaOnline": chroma_collection is not None,
            "gpuAvailable": torch.cuda.is_available() if 'torch' in globals() else False,
            "gpu": torch.cuda.is_available() if 'torch' in globals() else False,
            "totalReels": total_reels,
            "totalEmbeddings": total_embeddings,
            "totalTranscripts": total_transcripts,
            "processingQueue": processing_queue,
            "activeDownloads": active_downloads,
            "activeJobs": active_jobs_cnt,
            "latency": 12,
            "models": {
                "whisper": "loaded" if whisper_model else "missing",
                "clip": "loaded" if clip_model_inst else "missing",
                "blip": "loaded" if blip_model else "missing",
                "embedding": "loaded" if embedding_model else "missing",
            },
        }
    except Exception as e:
        # Log the error but return a minimal health payload so frontend stays stable
        print(f"[WARN] /health endpoint failed: {e}")
        return {
            "success": False,
            "backendOnline": False,
        }

@app.get("/api/health")
async def api_health_check():
    return await health_check()



app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000", "http://localhost:3001"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = Path(__file__).parent
DOWNLOADS_DIR = BASE_DIR / "downloads"
AUDIO_DIR = DOWNLOADS_DIR / "audio"
TRANSCRIPTS_DIR = DOWNLOADS_DIR / "transcripts"
OCR_DIR = DOWNLOADS_DIR / "ocr"
FRAMES_DIR = DOWNLOADS_DIR / "frames"

# Step 8 — OCR performance settings
FRAME_INTERVAL_SECONDS = 2
MAX_FRAMES = 30

# Step 10 — BLIP temp frames
BLIP_FRAMES_DIR = BASE_DIR / "temp_caption_frames"
BLIP_FRAME_INTERVAL_SECONDS = 5
BLIP_MAX_FRAMES = 8

# Step 11 — CLIP temp frames
CLIP_FRAMES_DIR = BASE_DIR / "temp_clip_frames"

# Search logs directory (Step 7)
SEARCH_LOGS_DIR = BASE_DIR / "search_logs"
SEARCH_LOGS_DIR.mkdir(exist_ok=True)

# STEP 12 — Chat logs directory
CHAT_LOGS_DIR = BASE_DIR / "chat_logs"
CHAT_LOGS_DIR.mkdir(exist_ok=True)

# Serve downloaded files as static assets
DOWNLOADS_DIR.mkdir(exist_ok=True)
OCR_DIR.mkdir(exist_ok=True)
FRAMES_DIR.mkdir(exist_ok=True)
BLIP_FRAMES_DIR.mkdir(exist_ok=True)
CLIP_FRAMES_DIR.mkdir(exist_ok=True)
app.mount("/downloads", StaticFiles(directory=str(DOWNLOADS_DIR)), name="downloads")


# ---------------------------------------------------------------------------
# Request models
# ---------------------------------------------------------------------------
class DownloadRequest(BaseModel):
    url: str


class SearchRequest(BaseModel):
    query: str


class FeedbackRequest(BaseModel):
    search_id: str
    reel_id: str
    feedback: str  # "relevant" or "not_relevant"


# STEP 12 — Conversational RAG chat models
class ChatRequest(BaseModel):
    message: str


class ChatResponse(BaseModel):
    answer: str
    sources: list
    used_reels: list
    execution_time_ms: int
    llm_time_ms: int
    retrieved_count: int
    rewritten_query: str | None = None
    warning: str | None = None


# ---------------------------------------------------------------------------
# Audio extraction
# ---------------------------------------------------------------------------
def extract_audio(video_path: Path, audio_path: Path) -> None:
    ffmpeg_bin = shutil.which("ffmpeg")
    if not ffmpeg_bin:
        raise HTTPException(
            status_code=500,
            detail="FFmpeg not found in PATH. Install FFmpeg and add its bin folder to Windows PATH.",
        )

    if not video_path.exists():
        raise HTTPException(status_code=500, detail=f"Input video file not found: {video_path.name}")

    cmd = [ffmpeg_bin, "-i", str(video_path), "-q:a", "0", "-map", "a", str(audio_path), "-y"]

    try:
        result = subprocess.run(cmd, capture_output=True, text=True, timeout=120)
    except subprocess.TimeoutExpired:
        raise HTTPException(status_code=500, detail="FFmpeg timed out during audio extraction.")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Subprocess error: {str(e)}")

    if result.returncode != 0:
        lines = [l.strip() for l in result.stderr.splitlines() if l.strip()]
        readable = lines[-1] if lines else "Unknown FFmpeg error."
        raise HTTPException(status_code=500, detail=f"Audio extraction failed: {readable}")


# ---------------------------------------------------------------------------
# Transcription
# ---------------------------------------------------------------------------
def transcribe_audio(audio_path: Path, transcript_path: Path) -> str:
    if whisper_model is None:
        raise HTTPException(status_code=500, detail="Whisper model is not loaded. Check backend startup logs.")

    if not audio_path.exists():
        raise HTTPException(status_code=500, detail=f"Audio file not found: {audio_path.name}")

    try:
        segments, info = whisper_model.transcribe(
            str(audio_path),
            language=None,
            beam_size=5,
        )
        print(f"[INFO] Detected language: {info.language} (confidence: {info.language_probability:.2f})")

        text = " ".join(seg.text.strip() for seg in segments)
        text = " ".join(text.split())

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Transcription failed: {str(e)}")

    if not text:
        raise HTTPException(status_code=500, detail="Transcription produced an empty result.")

    try:
        transcript_path.write_text(text, encoding="utf-8")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save transcript: {str(e)}")

    return text


# ---------------------------------------------------------------------------
# STEP 8 — OCR helpers
# ---------------------------------------------------------------------------
import cv2

def extract_frames(video_path: Path, frames_dir: Path, doc_id: str) -> list:
    """Sample frames from video every FRAME_INTERVAL_SECONDS up to MAX_FRAMES."""
    print("[INFO] Extracting video frames...")
    frame_paths = []
    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        interval = int(fps * FRAME_INTERVAL_SECONDS)
        frame_idx = 0
        saved = 0
        while saved < MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % interval == 0:
                out_path = frames_dir / f"{doc_id}_f{saved:03d}.jpg"
                cv2.imwrite(str(out_path), frame)
                frame_paths.append(out_path)
                saved += 1
            frame_idx += 1
        cap.release()
        print(f"[INFO] Extracted {len(frame_paths)} frames.")
    except Exception as e:
        print(f"[WARN] Frame extraction failed: {e}")
    return frame_paths


def run_ocr(frame_paths: list) -> str:
    """Run EasyOCR on each frame and return deduplicated text."""
    if ocr_reader is None:
        print("[WARN] OCR reader not loaded — skipping OCR.")
        return ""
    print("[INFO] Running OCR...")
    seen = set()
    lines = []
    try:
        for fp in frame_paths:
            results = ocr_reader.readtext(str(fp), detail=0, paragraph=False)
            for text in results:
                clean = text.strip()
                if clean and clean.lower() not in seen:
                    seen.add(clean.lower())
                    lines.append(clean)
        print(f"[INFO] OCR text extracted successfully ({len(lines)} unique lines).")
    except Exception as e:
        print(f"[WARN] OCR failed: {e}")
    return " ".join(lines)


def cleanup_frames(frame_paths: list) -> None:
    """Delete temporary frame JPGs after OCR."""
    for fp in frame_paths:
        try:
            if Path(fp).exists():
                os.remove(fp)
        except Exception:
            pass


def build_combined_document(transcript: str, ocr_text: str) -> str:
    """Merge Whisper transcript and OCR text into one embedding document (legacy compat)."""
    return build_multimodal_document(transcript, ocr_text, "")


# ---------------------------------------------------------------------------
# STEP 10 — BLIP visual captioning helpers
# ---------------------------------------------------------------------------
import cv2

def extract_caption_frames(video_path: Path, doc_id: str) -> list:
    """Sample 1 frame every BLIP_FRAME_INTERVAL_SECONDS, max BLIP_MAX_FRAMES."""
    print("[INFO] Extracting visual caption frames...")
    BLIP_FRAMES_DIR.mkdir(exist_ok=True)
    frame_paths = []
    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        interval = int(fps * BLIP_FRAME_INTERVAL_SECONDS)
        frame_idx = 0
        saved = 0
        while saved < BLIP_MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % interval == 0:
                # Resize to max 512px wide to keep inference fast on CPU
                h, w = frame.shape[:2]
                if w > 512:
                    scale = 512 / w
                    frame = cv2.resize(frame, (512, int(h * scale)))
                out_path = BLIP_FRAMES_DIR / f"{doc_id}_blip_{saved:02d}.jpg"
                cv2.imwrite(str(out_path), frame)
                frame_paths.append(out_path)
                saved += 1
            frame_idx += 1
        cap.release()
        print(f"[INFO] Extracted {len(frame_paths)} caption frames.")
    except Exception as e:
        print(f"[WARN] Caption frame extraction failed: {e}")
    return frame_paths


def generate_visual_captions(frame_paths: list) -> dict:
    """Run BLIP on each frame and return deduplicated captions."""
    if blip_processor is None or blip_model is None:
        print("[WARN] BLIP model not loaded — skipping visual captioning.")
        return {"captions": [], "combined_caption_text": ""}

    print("[INFO] Generating BLIP captions...")
    seen = set()
    captions = []
    try:
        import torch
        for fp in frame_paths:
            try:
                img = PILImage.open(str(fp)).convert("RGB")
                inputs = blip_processor(images=img, return_tensors="pt")
                with torch.no_grad():
                    out = blip_model.generate(**inputs, max_new_tokens=25)
                caption = blip_processor.decode(out[0], skip_special_tokens=True).strip()
                if caption and caption.lower() not in seen:
                    seen.add(caption.lower())
                    captions.append(caption)
            except Exception as frame_err:
                print(f"[WARN] Caption failed for frame {fp.name}: {frame_err}")
    except Exception as e:
        print(f"[WARN] BLIP captioning error: {e}")

    print(f"[INFO] Generated {len(captions)} visual captions.")
    return {
        "captions": captions,
        "combined_caption_text": " ".join(captions),
    }


def cleanup_blip_frames(frame_paths: list) -> None:
    """Delete temporary BLIP frame JPGs after captioning."""
    for fp in frame_paths:
        try:
            if Path(fp).exists():
                os.remove(fp)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# STEP 12.5 — Instagram Caption Ingestion Helpers
# ---------------------------------------------------------------------------
import re as _caption_re


def extract_hashtags(text: str) -> list:
    """Extract unique lowercase hashtags from text. Max 30 returned."""
    if not text:
        return []
    raw = _caption_re.findall(r"#([A-Za-z0-9_]+)", text)
    seen: set = set()
    result = []
    for tag in raw:
        t = tag.lower().strip("_")
        if t and t not in seen:
            seen.add(t)
            result.append(t)
        if len(result) >= 30:
            break
    return result


def clean_caption_text(text: str) -> str:
    """Lightly normalise Instagram caption text. Cap at 2000 chars."""
    if not text:
        return ""
    text = _caption_re.sub(r"\n{3,}", "\n\n", text)  # collapse excess newlines
    text = _caption_re.sub(r" {3,}", "  ", text)      # collapse excess spaces
    text = text.strip()
    return text[:2000]


def extract_instagram_caption(info_dict: dict) -> dict:
    """
    Extract Instagram caption + hashtags from yt-dlp info_dict.
    Uses description (primary), falls back to title.
    Never crashes — always returns a valid dict.
    """
    raw_description = (info_dict.get("description") or "").strip()
    raw_title       = (info_dict.get("title") or "").strip()
    raw_tags        = info_dict.get("tags") or []
    uploader        = (info_dict.get("uploader") or info_dict.get("uploader_id") or "").strip()

    # Description is primary; use title only if description missing
    if raw_description:
        raw_caption = raw_description
    elif raw_title and raw_title.lower() not in ("reel", "instagram reel", "video", ""):
        raw_caption = raw_title
    else:
        raw_caption = ""

    clean_caption = clean_caption_text(raw_caption)

    # Hashtags: from caption text + yt-dlp tags array
    hashtags_from_text = extract_hashtags(clean_caption)
    hashtags_from_tags = [
        t.lower().lstrip("#").strip()
        for t in raw_tags if isinstance(t, str) and t.strip()
    ]
    # Merge, deduplicate, cap at 30
    seen_tags: set = set()
    all_hashtags = []
    for tag in hashtags_from_text + hashtags_from_tags:
        if tag and tag not in seen_tags:
            seen_tags.add(tag)
            all_hashtags.append(tag)
        if len(all_hashtags) >= 30:
            break

    has_caption = bool(clean_caption and len(clean_caption) > 3)
    print(f"[INFO] Instagram caption extracted: {len(clean_caption)} chars")
    print(f"[INFO] Hashtags extracted: {len(all_hashtags)}")
    return {
        "caption":        clean_caption,
        "clean_caption":  clean_caption,
        "hashtags":       all_hashtags,
        "has_caption":    has_caption,
        "caption_length": len(clean_caption),
        "uploader":       uploader,
    }


def build_multimodal_document(
    transcript: str,
    ocr_text: str,
    visual_captions: str,
    instagram_caption: str = "",
    hashtags: list | None = None,
) -> str:
    """Combine all modalities into one embedding document. Caption appears FIRST."""
    print("[INFO] Building multimodal semantic document...")
    if hashtags is None:
        hashtags = []
    parts = []
    # Caption first — highest semantic density / creator intent
    if instagram_caption.strip():
        parts.append(f"=== INSTAGRAM CAPTION ===\n{instagram_caption.strip()}")
        print("[INFO] Caption added to multimodal document.")
    if hashtags:
        parts.append(f"=== HASHTAGS ===\n{' '.join(hashtags)}")
    if transcript.strip():
        parts.append(f"=== TRANSCRIPT ===\n{transcript.strip()}")
    if ocr_text.strip():
        parts.append(f"=== OCR TEXT ===\n{ocr_text.strip()}")
    if visual_captions.strip():
        parts.append(f"=== VISUAL UNDERSTANDING ===\n{visual_captions.strip()}")
    return "\n\n".join(parts) if parts else transcript


# ---------------------------------------------------------------------------
# STEP 11 — CLIP visual semantic embedding helpers
# ---------------------------------------------------------------------------
CLIP_FRAMES_DIR = None  # defined properly in app-setup section below
CLIP_FRAME_INTERVAL_SECONDS = 6
CLIP_MAX_FRAMES = 6


def extract_clip_frames(video_path: Path, doc_id: str) -> list:
    """Sample 1 frame every 6s, max 6, resize ≤512px — for CLIP embedding."""
    if CLIP_FRAMES_DIR is None:
        return []
    print("[INFO] Extracting CLIP visual frames...")
    frame_paths = []
    try:
        cap = cv2.VideoCapture(str(video_path))
        fps = cap.get(cv2.CAP_PROP_FPS) or 25
        interval = int(fps * CLIP_FRAME_INTERVAL_SECONDS)
        frame_idx = 0
        saved = 0
        while saved < CLIP_MAX_FRAMES:
            ret, frame = cap.read()
            if not ret:
                break
            if frame_idx % interval == 0:
                h, w = frame.shape[:2]
                if w > 512:
                    scale = 512 / w
                    frame = cv2.resize(frame, (512, int(h * scale)))
                out_path = CLIP_FRAMES_DIR / f"{doc_id}_clip_{saved:02d}.jpg"
                cv2.imwrite(str(out_path), frame)
                frame_paths.append(out_path)
                saved += 1
            frame_idx += 1
        cap.release()
        print(f"[INFO] Extracted {len(frame_paths)} CLIP frames.")
    except Exception as e:
        print(f"[WARN] CLIP frame extraction failed: {e}")
    return frame_paths


def generate_clip_embeddings(frame_paths: list) -> dict:
    """Generate averaged, L2-normalised CLIP image embedding for a set of frames."""
    if clip_processor_model is None or clip_model_inst is None:
        return {"clip_embedding": None, "frame_count": 0}
    print("[INFO] Generating CLIP visual embeddings...")
    embeddings = []
    try:
        for fp in frame_paths:
            try:
                img = PILImage.open(str(fp)).convert("RGB")
                inputs = clip_processor_model(images=img, return_tensors="pt")
                with torch.no_grad():
                    features = clip_model_inst.get_image_features(**inputs)
                    if hasattr(features, "pooler_output"):
                        features = features.pooler_output
                    features = _F.normalize(features, dim=-1)
                embeddings.append(features[0].cpu().numpy())
            except Exception as frame_err:
                print(f"[WARN] CLIP embedding failed for {fp.name}: {frame_err}")
    except Exception as e:
        print(f"[WARN] CLIP embedding error: {e}")

    if not embeddings:
        return {"clip_embedding": None, "frame_count": 0}

    avg = _np.mean(embeddings, axis=0)
    norm = _np.linalg.norm(avg)
    if norm > 0:
        avg = avg / norm  # re-normalise after averaging
    print(f"[INFO] CLIP embedding averaged over {len(embeddings)} frames.")
    return {"clip_embedding": avg.tolist(), "frame_count": len(embeddings)}


def get_clip_query_embedding(query: str) -> list | None:
    """Encode a text query into the CLIP embedding space (512-d, L2-normalised)."""
    if clip_processor_model is None or clip_model_inst is None:
        return None
    try:
        inputs = clip_processor_model(
            text=[query], return_tensors="pt", padding=True,
            truncation=True, max_length=77,
        )
        with torch.no_grad():
            features = clip_model_inst.get_text_features(**inputs)
            if hasattr(features, "pooler_output"):
                features = features.pooler_output
            features = _F.normalize(features, dim=-1)
        return features[0].cpu().tolist()
    except Exception as e:
        print(f"[WARN] CLIP query embedding failed: {e}")
        return None


def store_clip_embedding(doc_id: str, clip_embedding: list, clip_frame_count: int) -> None:
    """Upsert CLIP image embedding into reels_clip collection."""
    if clip_collection is None or not clip_embedding:
        return
    try:
        clip_collection.upsert(
            ids=[doc_id],
            embeddings=[clip_embedding],
            metadatas=[{"clip_frame_count": str(clip_frame_count)}],
        )
        print(f"[INFO] CLIP embedding stored for {doc_id} ({clip_frame_count} frames).")
    except Exception as e:
        print(f"[WARN] Failed to store CLIP embedding for {doc_id}: {e}")


def delete_clip_embedding(doc_id: str) -> None:
    """Remove CLIP embedding from reels_clip collection."""
    if clip_collection is None:
        return
    try:
        clip_collection.delete(ids=[doc_id])
        print(f"[INFO] CLIP embedding deleted for {doc_id}.")
    except Exception:
        pass  # silently ignore if not present


def cleanup_clip_frames(frame_paths: list) -> None:
    """Delete temporary CLIP frame JPGs after embedding generation."""
    for fp in frame_paths:
        try:
            if Path(fp).exists():
                os.remove(fp)
        except Exception:
            pass


# ---------------------------------------------------------------------------
# Embedding + ChromaDB store
# ---------------------------------------------------------------------------
def store_embedding(
    doc_id: str,
    combined_document: str,
    video_filename: str,
    audio_filename: str,
    transcript_filename: str,
    original_url: str,
    timestamp: int,
    ocr_filename: str = "",
    ocr_text_preview: str = "",
    ocr_success: bool = False,
    # STEP 10 — visual captioning fields
    visual_captions: str = "",
    visual_caption_count: int = 0,
    has_visual_understanding: bool = False,
    # STEP 11 — CLIP visual embedding fields
    has_clip_embedding: bool = False,
    clip_frame_count: int = 0,
    # STEP 12.5 — Instagram caption fields
    instagram_caption: str = "",
    hashtags: list | None = None,
    has_caption: bool = False,
    caption_length: int = 0,
) -> None:
    if embedding_model is None:
        print("[WARN] Embedding model not loaded — skipping vector storage.")
        return
    if chroma_collection is None:
        print("[WARN] ChromaDB not initialized — skipping vector storage.")
        return

    try:
        print("[INFO] Embedding enriched multimodal memory...")
        embedding = embedding_model.encode(combined_document).tolist()
        chroma_collection.add(
            ids=[doc_id],
            embeddings=[embedding],
            documents=[combined_document],
            metadatas=[{
                "video_filename": video_filename,
                "audio_filename": audio_filename,
                "transcript_filename": transcript_filename,
                "original_url": original_url,
                "timestamp": str(timestamp),
                "ocr_filename": ocr_filename,
                "ocr_text_preview": ocr_text_preview[:300],
                "ocr_success": str(ocr_success),
                # STEP 10
                "visual_captions": visual_captions[:600],  # store preview
                "visual_caption_count": str(visual_caption_count),
                "has_visual_understanding": str(has_visual_understanding),
                # STEP 11
                "has_clip_embedding": str(has_clip_embedding),
                "clip_frame_count": str(clip_frame_count),
                # STEP 12.5
                "instagram_caption": instagram_caption[:2000],
                "hashtags_str": " ".join(hashtags or [])[:500],
                "hashtag_count": str(len(hashtags or [])),
                "has_caption": str(has_caption),
                "caption_length": str(caption_length),
            }],
        )
        print(f"[INFO] Combined embedding generated and stored for {doc_id}.")
    except Exception as e:
        print(f"[WARN] Failed to store embedding: {e}")


# ---------------------------------------------------------------------------
# STEP 7 — Search log helpers (updated for STEP 9 LLM fields)
# ---------------------------------------------------------------------------
def save_search_log(
    search_id: str,
    query: str,
    results: list,
    execution_time_ms: float,
    rewritten_query: str = "",
    llm_rejected: int = 0,
    llm_time_ms: float = 0.0,
) -> None:
    """Persist a search event to a JSON file in search_logs/."""
    log = {
        "search_id": search_id,
        "query": query,
        "rewritten_query": rewritten_query,
        "timestamp": int(time.time()),
        "execution_time_ms": round(execution_time_ms, 2),
        "llm_time_ms": round(llm_time_ms, 2),
        "llm_rejected": llm_rejected,
        "result_count": len(results),
        "success": len(results) > 0,
        "results": [
            {
                "reel_id": r["id"],
                "similarity_score": r["similarity_score"],
                "relevance_label": r.get("relevance_label", ""),
                "feedback": None,  # filled in by /feedback
            }
            for r in results
        ],
    }
    log_path = SEARCH_LOGS_DIR / f"{search_id}.json"
    try:
        log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False), encoding="utf-8")
        print("[INFO] Search analytics updated")
    except Exception as e:
        print(f"[WARN] Could not save search log: {e}")


def load_all_logs() -> list:
    """Read every search log JSON from disk."""
    logs = []
    for f in SEARCH_LOGS_DIR.glob("*.json"):
        try:
            logs.append(json.loads(f.read_text(encoding="utf-8")))
        except Exception:
            pass
    return logs


# ---------------------------------------------------------------------------
# Ingestion endpoints
# ---------------------------------------------------------------------------

@app.post("/download")
async def download_reel(request: DownloadRequest):
    """Create a job for the given Instagram URL and start processing in background.
    Returns the job_id immediately. Duplicate active URLs share the same job.
    Only reuses jobs that are still queued or running — not completed/failed ones.
    """
    url = request.url.strip()
    if not url:
        raise HTTPException(status_code=400, detail="URL is required.")
    if "instagram.com" not in url:
        raise HTTPException(status_code=400, detail="Invalid Instagram URL.")

    async with job_lock:
        existing_job_id = await db.get_active_job_by_url(url)
        if existing_job_id:
            existing_job = await db.get_job(existing_job_id)
            if existing_job and existing_job.get("status") in ("queued", "running"):
                return {
                    "job_id": existing_job_id,
                    "status": existing_job["status"],
                }

        # Create a new job entry in DB
        job_id = uuid.uuid4().hex
        await db.create_job(job_id, url)

    # Store the task so it can be cancelled/inspected later
    task = asyncio.create_task(run_pipeline(job_id, url))
    active_pipeline_tasks[job_id] = task
    return {"job_id": job_id, "status": "queued"}

@app.post("/api/jobs")
async def api_download_reel(request: DownloadRequest):
    return await download_reel(request)


# ---------------------------------------------------------------------------
# Background pipeline implementation
# ---------------------------------------------------------------------------
async def run_pipeline(job_id: str, url: str):
    """Runs the full ingestion pipeline for a job, updating job state throughout.
    NOTE: Do NOT raise HTTP exceptions here — this is a background async task.
    Use plain exceptions (RuntimeError, ValueError) instead.
    """
    async with pipeline_semaphore:
        try:
            update_job(job_id, status="running", stage=PipelineStage.DOWNLOADING, progress=5)
            log_job(job_id, "Starting video download")

            # --- 1. Download video ---
            temp_video_path = DOWNLOADS_DIR / f"{job_id}_temp.mp4"
            ydl_opts = {
                "outtmpl": str(temp_video_path),
                "format": "best[ext=mp4]/best",
                "quiet": True,
                "no_warnings": True,
            }
            try:
                with yt_dlp.YoutubeDL(ydl_opts) as ydl:
                    info = ydl.extract_info(url, download=True)
            except yt_dlp.utils.DownloadError as e:
                raise RuntimeError(f"Download failed: {str(e).replace('ERROR: ', '').strip()}")
            except Exception as e:
                raise RuntimeError(f"Unexpected download error: {str(e)}")

            video_path = temp_video_path
            if not video_path.exists():
                matches = [f for f in DOWNLOADS_DIR.iterdir() if f.is_file() and f.name.startswith(job_id)]
                if not matches:
                    raise RuntimeError("Video file was not saved after download.")
                video_path = matches[0]
            video_filename = video_path.name
            update_job(job_id, stage=PipelineStage.DOWNLOADING, progress=15)
            log_job(job_id, "Video downloaded successfully")

            # --- 2. Extract audio ---
            audio_path = AUDIO_DIR / f"{job_id}.mp3"
            transcript_path = TRANSCRIPTS_DIR / f"{job_id}.txt"
            try:
                extract_audio(video_path, audio_path)
            except Exception as e:
                raise RuntimeError(f"Audio extraction failed: {str(e)}")
            update_job(job_id, stage=PipelineStage.AUDIO_EXTRACT, progress=30)
            log_job(job_id, "Audio extracted")

            # --- 3. Transcribe ---
            try:
                transcript_text = transcribe_audio(audio_path, transcript_path)
            except Exception as e:
                raise RuntimeError(f"Transcription failed: {str(e)}")
            update_job(job_id, stage=PipelineStage.TRANSCRIBING, progress=45)
            log_job(job_id, "Whisper transcription completed")

            # --- 4. OCR ---
            FRAMES_DIR.mkdir(exist_ok=True)
            OCR_DIR.mkdir(exist_ok=True)
            ocr_text = ""
            ocr_success = False
            try:
                frame_paths = extract_frames(video_path, FRAMES_DIR, job_id)
                if frame_paths:
                    ocr_text = run_ocr(frame_paths)
                    cleanup_frames(frame_paths)
                if ocr_text.strip():
                    (OCR_DIR / f"{job_id}_ocr.txt").write_text(ocr_text, encoding="utf-8")
                    ocr_success = True
            except Exception as e:
                log_job(job_id, f"OCR step error (continuing): {e}")
            update_job(job_id, stage=PipelineStage.OCR, progress=55)
            log_job(job_id, "OCR step completed")

            # --- 5. BLIP visual captioning ---
            visual_captions_text = ""
            visual_captions_list: list = []
            has_visual_understanding = False
            try:
                blip_frame_paths = extract_caption_frames(video_path, job_id)
                if blip_frame_paths:
                    blip_result = generate_visual_captions(blip_frame_paths)
                    cleanup_blip_frames(blip_frame_paths)
                    visual_captions_list = blip_result.get("captions", [])
                    visual_captions_text = blip_result.get("combined_caption_text", "")
                    has_visual_understanding = len(visual_captions_list) > 0
            except Exception as e:
                log_job(job_id, f"BLIP captioning error (continuing): {e}")
            update_job(job_id, stage=PipelineStage.BLIP, progress=70)
            log_job(job_id, "BLIP captioning completed")

            # --- 6. CLIP embedding ---
            clip_embedding_vec = None
            clip_frame_count = 0
            has_clip_embedding = False
            try:
                clip_frame_paths = extract_clip_frames(video_path, job_id)
                if clip_frame_paths:
                    clip_result = generate_clip_embeddings(clip_frame_paths)
                    cleanup_clip_frames(clip_frame_paths)
                    clip_embedding_vec = clip_result.get("clip_embedding")
                    clip_frame_count = clip_result.get("frame_count", 0)
                    has_clip_embedding = clip_embedding_vec is not None
                    if has_clip_embedding:
                        store_clip_embedding(job_id, clip_embedding_vec, clip_frame_count)
            except Exception as e:
                log_job(job_id, f"CLIP embedding error (continuing): {e}")
            update_job(job_id, stage=PipelineStage.CLIP, progress=80)
            log_job(job_id, "CLIP embedding completed")

            # --- 7. Instagram caption & hashtags ---
            caption_info = extract_instagram_caption(info if isinstance(info, dict) else {})
            instagram_caption = caption_info["caption"]
            hashtags = caption_info["hashtags"]
            has_caption = caption_info["has_caption"]
            caption_length = caption_info["caption_length"]
            log_job(job_id, "Instagram caption extracted")

            # --- 8. Build multimodal document ---
            combined_document = build_multimodal_document(
                transcript_text,
                ocr_text,
                visual_captions_text,
                instagram_caption=instagram_caption,
                hashtags=hashtags,
            )

            # --- 9. Ollama semantic enrichment (BEFORE Chroma) ---
            update_job(job_id, stage=PipelineStage.OLLAMA, progress=85)
            log_job(job_id, "Ollama semantic enrichment started")
            ollama_result = {}
            if OLLAMA_AVAILABLE:
                try:
                    _ollama_prompt = (
                        "You are a semantic memory indexer for short-form video content.\n"
                        "Analyze the following multimodal content from an Instagram Reel and return STRICT JSON.\n"
                        "Return ONLY a JSON object with these exact keys:\n"
                        "  \"summary\": a 2-3 sentence summary of what this reel is about\n"
                        "  \"topics\": an array of 3-5 main topics covered\n"
                        "  \"tags\": an array of 5-10 searchable keyword tags\n"
                        "  \"semantic_memory\": a single paragraph capturing the core meaning for memory retrieval\n"
                        "  \"searchable_context\": a dense paragraph optimised for semantic similarity search\n"
                        "Do NOT include any text outside the JSON object.\n\n"
                        f"Content:\n{combined_document[:3000]}"
                    )
                    raw_ollama = call_ollama(_ollama_prompt)
                    if raw_ollama:
                        clean_ollama = raw_ollama.strip()
                        if clean_ollama.startswith("```"):
                            lines = clean_ollama.splitlines()
                            clean_ollama = "\n".join(ln for ln in lines if not ln.strip().startswith("```"))
                        try:
                            ollama_result = json.loads(clean_ollama)
                        except Exception:
                            ollama_result = {"summary": raw_ollama[:500]}
                    log_job(job_id, "Ollama semantic enrichment completed")
                except Exception as e:
                    log_job(job_id, f"Ollama enrichment error (continuing): {e}")
            else:
                log_job(job_id, "Ollama unavailable — skipping semantic enrichment")

            # --- 10. Store embeddings in ChromaDB ---
            update_job(job_id, stage=PipelineStage.CHROMA, progress=93)
            log_job(job_id, "Storing to ChromaDB started")
            try:
                store_embedding(
                    doc_id=job_id,
                    combined_document=combined_document,
                    video_filename=video_filename,
                    audio_filename=audio_path.name,
                    transcript_filename=transcript_path.name,
                    original_url=url,
                    timestamp=int(time.time()),
                    ocr_filename=f"{job_id}_ocr.txt" if ocr_success else "",
                    ocr_text_preview=ocr_text[:300] if ocr_text else "",
                    ocr_success=ocr_success,
                    visual_captions=visual_captions_text,
                    visual_caption_count=len(visual_captions_list),
                    has_visual_understanding=has_visual_understanding,
                    has_clip_embedding=has_clip_embedding,
                    clip_frame_count=clip_frame_count,
                    instagram_caption=instagram_caption,
                    hashtags=hashtags,
                    has_caption=has_caption,
                    caption_length=caption_length,
                )
            except Exception as e:
                raise RuntimeError(f"ChromaDB persistence failed: {str(e)}")
            log_job(job_id, "ChromaDB persistence completed")

            # --- FINAL: mark completed ---
            update_job(
                job_id,
                status="completed",
                stage=PipelineStage.FINISHED,
                progress=100,
                result={
                    "transcript": transcript_text[:500] if transcript_text else "",
                    "ocr": ocr_text[:300] if ocr_text else "",
                    "captions": visual_captions_list[:5],
                    "ollama": ollama_result,
                    "hashtags": hashtags,
                    "video_filename": video_filename,
                },
            )
            log_job(job_id, "Pipeline completed successfully")

        except Exception as exc:
            import traceback
            traceback.print_exc()
            err_msg = str(exc)
            log_job(job_id, f"Pipeline failed: {err_msg}")
            update_job(
                job_id,
                status="failed",
                stage=PipelineStage.FAILED,
                error=err_msg,
            )

        finally:
            # Always clean up task registry
            active_pipeline_tasks.pop(job_id, None)



# ---------------------------------------------------------------------------
# Endpoint to fetch job status
# ---------------------------------------------------------------------------
@app.get("/jobs/{job_id}")
async def get_job(job_id: str):
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    
    # Calculate queue position dynamically
    if job.get("status") == "queued":
        queue_position = await db.get_queue_position(job_id)
    else:
        queue_position = 0

    return {
        "job_id": job["job_id"],
        "url": job.get("url"),
        "status": job.get("status"),
        "stage": job.get("stage"),
        "progress": job.get("progress"),
        "logs": job.get("logs", []),
        "error": job.get("error"),
        "result": job.get("result"),
        "created_at": job.get("created_at"),
        "updated_at": job.get("updated_at"),
        "queue_position": queue_position,
    }

@app.get("/api/jobs/{job_id}")
async def api_get_job(job_id: str):
    return await get_job(job_id)

@app.get("/api/jobs")
async def api_list_jobs(limit: int = 50, offset: int = 0, status: str = None):
    jobs_list = await db.list_jobs(limit=limit, offset=offset, status=status)
    for j in jobs_list:
        if j.get("status") == "queued":
            j["queue_position"] = await db.get_queue_position(j["job_id"])
        else:
            j["queue_position"] = 0
    return jobs_list

from fastapi.responses import StreamingResponse

@app.get("/api/jobs/{job_id}/stream")
async def api_stream_job(job_id: str):
    job = await db.get_job(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")

    async def event_generator():
        q = asyncio.Queue(maxsize=100)
        job_notifier.subscribe(job_id, q)
        
        try:
            # Yield initial state immediately
            job_state = await db.get_job(job_id)
            if job_state:
                if job_state.get("status") == "queued":
                    job_state["queue_position"] = await db.get_queue_position(job_id)
                else:
                    job_state["queue_position"] = 0
                yield f"data: {json.dumps({'type': 'job_update', 'job': job_state})}\n\n"

            while True:
                try:
                    payload = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield f"data: {json.dumps(payload)}\n\n"
                    q.task_done()
                except asyncio.TimeoutError:
                    yield ": keepalive\n\n"
        except asyncio.CancelledError:
            # Handle client disconnect
            print(f"[INFO] SSE stream client disconnected for job {job_id}")
            raise
        finally:
            job_notifier.unsubscribe(job_id, q)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no", # disable nginx buffering
        }
    )



@app.post("/search")
def search_reels(request: SearchRequest):
    query = request.query.strip()

    if not query:
        raise HTTPException(status_code=400, detail="Search query is required.")

    if embedding_model is None:
        raise HTTPException(status_code=500, detail="Embedding model is not loaded.")

    if chroma_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB is not initialized.")

    print("[INFO] Semantic search started...")
    t_total_start = time.perf_counter()

    # -----------------------------------------------------------------------
    # STEP 9 — 1. Query Rewriting
    # -----------------------------------------------------------------------
    ollama_online = OLLAMA_AVAILABLE  # re-check would be expensive; trust startup probe
    rewritten_query = query  # fallback
    if ollama_online:
        try:
            rewritten_query = rewrite_query(query)
        except Exception as e:
            print(f"[WARN] Query rewriting failed, using original: {e}")
            ollama_online = False

    # -----------------------------------------------------------------------
    # STEP 9 — 2. Embed the (rewritten) query
    # -----------------------------------------------------------------------
    embed_query = rewritten_query if rewritten_query != query else query
    try:
        query_embedding = embedding_model.encode(embed_query).tolist()
        print(f"[INFO] Search query embedded (using: '{embed_query[:80]}...' )" if len(embed_query) > 80 else f"[INFO] Search query embedded (using: '{embed_query}')")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate query embedding: {str(e)}")

    # -----------------------------------------------------------------------
    # STEP 9 — 3. Retrieve top 10 from ChromaDB
    # -----------------------------------------------------------------------
    try:
        db_count = chroma_collection.count()
        n_retrieve = min(10, max(1, db_count))
        raw_results = chroma_collection.query(
            query_embeddings=[query_embedding],
            n_results=n_retrieve,
            include=["documents", "metadatas", "distances"],
        )
        print(f"[INFO] Top {n_retrieve} matches retrieved from ChromaDB")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ChromaDB search failed: {str(e)}")

    ids = raw_results.get("ids", [[]])[0]
    documents = raw_results.get("documents", [[]])[0]
    metadatas = raw_results.get("metadatas", [[]])[0]
    distances = raw_results.get("distances", [[]])[0]

    # -----------------------------------------------------------------------
    # STEP 11 — CLIP hybrid search: generate visual query embedding + search
    # -----------------------------------------------------------------------
    # Weights: text covers transcript+OCR+BLIP, CLIP covers pure visual semantics
    TEXT_WEIGHT = 0.65
    CLIP_WEIGHT = 0.35

    clip_score_map: dict = {}  # doc_id → clip_similarity
    clip_only_pool: list = []  # results found via CLIP but not in text top-10

    clip_query_vec = get_clip_query_embedding(embed_query)
    if clip_query_vec and clip_collection is not None:
        try:
            clip_db_count = clip_collection.count()
            if clip_db_count > 0:
                n_clip = min(6, clip_db_count)
                clip_raw = clip_collection.query(
                    query_embeddings=[clip_query_vec],
                    n_results=n_clip,
                    include=["metadatas", "distances"],
                )
                clip_ids = clip_raw.get("ids", [[]])[0]
                clip_distances = clip_raw.get("distances", [[]])[0]
                # cosine distance → similarity: cosine space uses distance = 1 - cos_sim
                for cid, cdist in zip(clip_ids, clip_distances):
                    clip_sim = round(max(0.0, 1.0 - cdist), 4)
                    clip_score_map[cid] = clip_sim
                print(f"[INFO] CLIP visual search: {len(clip_score_map)} matches found")
        except Exception as e:
            print(f"[WARN] CLIP collection query failed: {e}")

    # Build pre-LLM output list with hybrid scoring
    pre_llm = []
    text_ids_seen = set()
    for i, doc_id in enumerate(ids):
        meta = metadatas[i]
        distance = distances[i]
        text_sim = round(max(0.0, 1.0 - distance / 2.0), 4)
        clip_sim = clip_score_map.get(doc_id)
        transcript_text = documents[i] if i < len(documents) else ""
        text_ids_seen.add(doc_id)

        # Hybrid final score
        if clip_sim is not None:
            final_score = round(TEXT_WEIGHT * text_sim + CLIP_WEIGHT * clip_sim, 4)
            has_clip_match = True
        else:
            final_score = text_sim
            clip_sim = 0.0
            has_clip_match = False

        pre_llm.append({
            "id": doc_id,
            "similarity_score": final_score,
            "text_score": text_sim,
            "clip_score": round(clip_sim, 4),
            "has_clip_match": has_clip_match,
            "video_filename": meta.get("video_filename", ""),
            "video_path": str(DOWNLOADS_DIR / meta.get("video_filename", "")),
            "audio_path": str(AUDIO_DIR / meta.get("audio_filename", "")),
            "transcript_path": str(TRANSCRIPTS_DIR / meta.get("transcript_filename", "")),
            "transcript_preview": transcript_text,
            "transcript_length": len(transcript_text),
            "original_url": meta.get("original_url", ""),
            "ocr_success": meta.get("ocr_success", "False") == "True",
            "ocr_text_preview": meta.get("ocr_text_preview", ""),
            # STEP 10
            "visual_captions_preview": meta.get("visual_captions", ""),
            "visual_caption_count": int(meta.get("visual_caption_count", "0")),
            "has_visual_understanding": meta.get("has_visual_understanding", "False") == "True",
            # STEP 12.5
            "instagram_caption_preview": meta.get("instagram_caption", "")[:300],
            "hashtags": meta.get("hashtags_str", "").split() if meta.get("hashtags_str") else [],
            "hashtags_str": meta.get("hashtags_str", ""),
            "has_caption": meta.get("has_caption", "False") == "True",
        })

    # Add CLIP-only results (strong visual match not in text top-10)
    clip_only_ids = [cid for cid in clip_score_map if cid not in text_ids_seen]
    if clip_only_ids and chroma_collection is not None:
        try:
            extra = chroma_collection.get(ids=clip_only_ids, include=["documents", "metadatas"])
            extra_ids = extra.get("ids", [])
            extra_docs = extra.get("documents", [])
            extra_metas = extra.get("metadatas", [])
            for j, cid in enumerate(extra_ids):
                clip_sim = clip_score_map.get(cid, 0.0)
                extra_final = round(CLIP_WEIGHT * clip_sim, 4)  # clip-only, lower weight
                emeta = extra_metas[j] if j < len(extra_metas) else {}
                etxt = extra_docs[j] if j < len(extra_docs) else ""
                pre_llm.append({
                    "id": cid,
                    "similarity_score": extra_final,
                    "text_score": 0.0,
                    "clip_score": round(clip_sim, 4),
                    "has_clip_match": True,
                    "video_filename": emeta.get("video_filename", ""),
                    "video_path": str(DOWNLOADS_DIR / emeta.get("video_filename", "")),
                    "audio_path": str(AUDIO_DIR / emeta.get("audio_filename", "")),
                    "transcript_path": str(TRANSCRIPTS_DIR / emeta.get("transcript_filename", "")),
                    "transcript_preview": etxt,
                    "transcript_length": len(etxt),
                    "original_url": emeta.get("original_url", ""),
                    "ocr_success": emeta.get("ocr_success", "False") == "True",
                    "ocr_text_preview": emeta.get("ocr_text_preview", ""),
                    "visual_captions_preview": emeta.get("visual_captions", ""),
                    "visual_caption_count": int(emeta.get("visual_caption_count", "0")),
                    "has_visual_understanding": emeta.get("has_visual_understanding", "False") == "True",
                    # STEP 12.5
                    "instagram_caption_preview": emeta.get("instagram_caption", "")[:300],
                    "hashtags": emeta.get("hashtags_str", "").split() if emeta.get("hashtags_str") else [],
                    "hashtags_str": emeta.get("hashtags_str", ""),
                    "has_caption": emeta.get("has_caption", "False") == "True",
                })
        except Exception as e:
            print(f"[WARN] CLIP-only result fetch failed: {e}")

    # Sort final pool by hybrid score descending
    pre_llm.sort(key=lambda r: r["similarity_score"], reverse=True)

    # -----------------------------------------------------------------------
    # STEP 9 — 4 & 5. LLM Reranking + Filtering
    # -----------------------------------------------------------------------
    llm_time_ms = 0.0
    llm_rejected = 0
    llm_warning = None
    output = pre_llm  # default: unmodified vector results

    if ollama_online and pre_llm:
        t_llm_start = time.perf_counter()
        ranked_labels = llm_rerank(query, rewritten_query, pre_llm)
        llm_time_ms = (time.perf_counter() - t_llm_start) * 1000

        if ranked_labels:
            # Build lookup from id → LLM decision
            label_map = {item["id"]: item for item in ranked_labels}

            # Merge LLM reasoning into result objects & filter IRRELEVANT
            merged = []
            original_positions = {r["id"]: idx for idx, r in enumerate(pre_llm)}
            for rerank_pos, label_item in enumerate(ranked_labels):
                rid = label_item.get("id", "")
                relevance = label_item.get("relevance_label", "LOW").upper()
                reason = label_item.get("llm_reason", "")

                if relevance == "IRRELEVANT":
                    llm_rejected += 1
                    continue

                # Find matching pre_llm record
                base = next((r for r in pre_llm if r["id"] == rid), None)
                if base is None:
                    continue

                merged.append({
                    **base,
                    "relevance_label": relevance,
                    "llm_reason": reason,
                    "original_similarity": base["similarity_score"],
                    "reranked_position": rerank_pos + 1,
                })

            output = merged
            print(f"[INFO] LLM reranking done: {len(output)} kept, {llm_rejected} rejected ({llm_time_ms:.0f} ms)")
        else:
            # LLM returned nothing parseable — fall back silently
            print("[WARN] LLM reranking returned no parseable output; using raw vector results.")
            llm_warning = "LLM reranking unavailable — raw vector results shown."
    elif not ollama_online:
        llm_warning = "LLM enhancement unavailable — Ollama offline. Showing vector results."

    t_total_end = time.perf_counter()
    execution_time_ms = (t_total_end - t_total_start) * 1000

    # -----------------------------------------------------------------------
    # STEP 9 — 7. Analytics log
    # -----------------------------------------------------------------------
    search_id = f"srch_{int(time.time() * 1000)}"
    save_search_log(
        search_id=search_id,
        query=query,
        results=output,
        execution_time_ms=execution_time_ms,
        rewritten_query=rewritten_query,
        llm_rejected=llm_rejected,
        llm_time_ms=llm_time_ms,
    )

    # -----------------------------------------------------------------------
    # STEP 9 — 6. Response
    # -----------------------------------------------------------------------
    if not output and llm_rejected > 0:
        return {
            "success": True,
            "search_id": search_id,
            "query": query,
            "rewritten_query": rewritten_query,
            "execution_time_ms": round(execution_time_ms, 2),
            "llm_time_ms": round(llm_time_ms, 2),
            "llm_rejected": llm_rejected,
            "llm_warning": llm_warning,
            "llm_active": ollama_online,
            "empty_reason": "No meaningful semantic match found.",
            "results": [],
        }

    return {
        "success": True,
        "search_id": search_id,
        "query": query,
        "rewritten_query": rewritten_query,
        "execution_time_ms": round(execution_time_ms, 2),
        "llm_time_ms": round(llm_time_ms, 2),
        "llm_rejected": llm_rejected,
        "llm_warning": llm_warning,
        "llm_active": ollama_online,
        "results": output,
    }

@app.post("/api/search")
def api_search_reels(request: SearchRequest):
    return search_reels(request)


# ---------------------------------------------------------------------------
# STEP 6 — Feature 1: GET /library
# ---------------------------------------------------------------------------
@app.get("/library")
def get_library():
    """Return all stored reels from ChromaDB, newest first."""
    print("[INFO] Fetching reel library...")

    if chroma_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB is not initialized.")

    try:
        count = chroma_collection.count()
        if count == 0:
            return {"success": True, "reels": []}

        result = chroma_collection.get(
            include=["documents", "metadatas"],
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch library: {str(e)}")

    ids = result.get("ids", [])
    documents = result.get("documents", [])
    metadatas = result.get("metadatas", [])

    reels = []
    for i, doc_id in enumerate(ids):
        meta = metadatas[i] if i < len(metadatas) else {}
        transcript_text = documents[i] if i < len(documents) else ""

        video_filename = meta.get("video_filename", "")
        audio_filename = meta.get("audio_filename", "")
        transcript_filename = meta.get("transcript_filename", "")
        original_url = meta.get("original_url", "")
        timestamp_str = meta.get("timestamp", "0")

        video_path = DOWNLOADS_DIR / video_filename if video_filename else None
        audio_path = AUDIO_DIR / audio_filename if audio_filename else None
        transcript_path = TRANSCRIPTS_DIR / transcript_filename if transcript_filename else None

        ocr_filename = meta.get("ocr_filename", "")
        ocr_path = OCR_DIR / ocr_filename if ocr_filename else None
        ocr_success = meta.get("ocr_success", "False") == "True"
        ocr_text_preview = meta.get("ocr_text_preview", "")

        reels.append({
            "id": doc_id,
            "original_url": original_url,
            "video_filename": video_filename,
            "video_path": str(video_path) if video_path else "",
            "audio_path": str(audio_path) if audio_path else "",
            "transcript_path": str(transcript_path) if transcript_path else "",
            "transcript_preview": transcript_text,
            "timestamp": int(timestamp_str) if timestamp_str.isdigit() else 0,
            "video_exists": video_path.exists() if video_path else False,
            "audio_exists": audio_path.exists() if audio_path else False,
            "transcript_exists": transcript_path.exists() if transcript_path else False,
            "ocr_success": ocr_success,
            "ocr_text_preview": ocr_text_preview,
            "ocr_exists": ocr_path.exists() if ocr_path else False,
            # STEP 10
            "visual_captions_preview": meta.get("visual_captions", ""),
            "visual_caption_count": int(meta.get("visual_caption_count", "0") or "0"),
            "has_visual_understanding": meta.get("has_visual_understanding", "False") == "True",
            # STEP 12.5
            "instagram_caption": meta.get("instagram_caption", ""),
            "hashtags": meta.get("hashtags_str", "").split() if meta.get("hashtags_str") else [],
            "has_caption": meta.get("has_caption", "False") == "True",
            "caption_length": int(meta.get("caption_length", "0") or "0"),
        })

    # Sort newest first
    reels.sort(key=lambda r: r["timestamp"], reverse=True)

    return {"success": True, "reels": reels}

@app.get("/api/reels")
def api_get_reels(limit: int = 20, offset: int = 0, search: str = None):
    """Frontend-compatible /api/reels endpoint with pagination."""
    full = get_library()
    all_reels = full.get("reels", [])
    # Apply search filter if provided
    if search:
        search_lower = search.lower()
        all_reels = [
            r for r in all_reels
            if search_lower in r.get("video_filename", "").lower()
            or search_lower in r.get("transcript_preview", "").lower()
            or search_lower in r.get("ocr_text_preview", "").lower()
            or search_lower in r.get("instagram_caption", "").lower()
        ]
    total = len(all_reels)
    page = all_reels[offset:offset + limit]
    return {"reels": page, "total": total, "limit": limit, "offset": offset}


# ---------------------------------------------------------------------------
# STEP 6 — Feature 3: DELETE /delete/{reel_id}
# ---------------------------------------------------------------------------
@app.delete("/delete/{reel_id}")
def delete_reel(reel_id: str):
    """Delete reel files + ChromaDB embedding completely."""
    print(f"[INFO] Deleting reel: {reel_id}")

    if chroma_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB is not initialized.")

    # Fetch metadata from ChromaDB to know which files to delete
    try:
        result = chroma_collection.get(ids=[reel_id], include=["metadatas"])
        metadatas = result.get("metadatas", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch reel metadata: {str(e)}")

    if not metadatas:
        raise HTTPException(status_code=404, detail=f"Reel '{reel_id}' not found in database.")

    meta = metadatas[0]
    video_filename = meta.get("video_filename", "")
    audio_filename = meta.get("audio_filename", "")
    transcript_filename = meta.get("transcript_filename", "")
    ocr_filename = meta.get("ocr_filename", "")

    # --- Safe file deletion (continue even if files are missing) ---
    files_to_delete = []
    if video_filename:
        files_to_delete.append(DOWNLOADS_DIR / video_filename)
    if audio_filename:
        files_to_delete.append(AUDIO_DIR / audio_filename)
    if transcript_filename:
        files_to_delete.append(TRANSCRIPTS_DIR / transcript_filename)
    if ocr_filename:
        files_to_delete.append(OCR_DIR / ocr_filename)

    for file_path in files_to_delete:
        try:
            if file_path.exists():
                os.remove(file_path)
                print(f"[INFO] Deleted file: {file_path.name}")
            else:
                print(f"[WARN] File not found (skipping): {file_path.name}")
        except Exception as e:
            print(f"[WARN] Could not delete {file_path.name}: {e}")

    # --- Remove from ChromaDB (text embedding + metadata + document) ---
    try:
        chroma_collection.delete(ids=[reel_id])
        print(f"[INFO] Reel text embedding deleted: {reel_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove from ChromaDB: {str(e)}")

    # --- STEP 11: Remove CLIP embedding from reels_clip collection ---
    delete_clip_embedding(reel_id)

    return {"success": True}

@app.delete("/api/reels/{reel_id}")
def api_delete_reel(reel_id: str):
    return delete_reel(reel_id)


# ---------------------------------------------------------------------------
# STEP 6 — Feature 5: POST /reindex/{reel_id}
# ---------------------------------------------------------------------------
@app.post("/reindex/{reel_id}")
def reindex_reel(reel_id: str):
    """Re-generate embedding for an existing transcript. Does NOT re-download or re-transcribe."""
    print(f"[INFO] Re-indexing embeddings for: {reel_id}")

    if embedding_model is None:
        raise HTTPException(status_code=500, detail="Embedding model is not loaded.")

    if chroma_collection is None:
        raise HTTPException(status_code=500, detail="ChromaDB is not initialized.")

    # Fetch existing metadata
    try:
        result = chroma_collection.get(ids=[reel_id], include=["metadatas"])
        metadatas = result.get("metadatas", [])
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch reel metadata: {str(e)}")

    if not metadatas:
        raise HTTPException(status_code=404, detail=f"Reel '{reel_id}' not found in database.")

    meta = metadatas[0]
    transcript_filename = meta.get("transcript_filename", "")
    ocr_filename = meta.get("ocr_filename", "")

    if not transcript_filename:
        raise HTTPException(status_code=400, detail="No transcript filename found in metadata.")

    transcript_path = TRANSCRIPTS_DIR / transcript_filename
    if not transcript_path.exists():
        raise HTTPException(status_code=404, detail=f"Transcript file not found: {transcript_filename}")

    try:
        transcript_text = transcript_path.read_text(encoding="utf-8").strip()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to read transcript: {str(e)}")

    if not transcript_text:
        raise HTTPException(status_code=400, detail="Transcript file is empty.")

    # Load OCR text if available
    ocr_text = ""
    if ocr_filename:
        ocr_path = OCR_DIR / ocr_filename
        if ocr_path.exists():
            try:
                ocr_text = ocr_path.read_text(encoding="utf-8").strip()
            except Exception:
                pass

    # STEP 10 — Re-run BLIP captioning for multimodal reindex
    video_filename = meta.get("video_filename", "")
    visual_captions_text = meta.get("visual_captions", "")  # keep existing if video gone
    visual_captions_list: list = [c.strip() for c in visual_captions_text.split(".") if c.strip()] if visual_captions_text else []
    has_visual_understanding = meta.get("has_visual_understanding", "False") == "True"
    if video_filename:
        video_path = DOWNLOADS_DIR / video_filename
        if video_path.exists():
            try:
                blip_frame_paths = extract_caption_frames(video_path, reel_id)
                if blip_frame_paths:
                    blip_result = generate_visual_captions(blip_frame_paths)
                    cleanup_blip_frames(blip_frame_paths)
                    visual_captions_list = blip_result.get("captions", [])
                    visual_captions_text = blip_result.get("combined_caption_text", "")
                    has_visual_understanding = len(visual_captions_list) > 0
            except Exception as e:
                print(f"[WARN] BLIP re-index captioning failed (keeping existing): {e}")

    # STEP 11 — Re-run CLIP embedding
    has_clip_embedding = meta.get("has_clip_embedding", "False") == "True"
    clip_frame_count = int(meta.get("clip_frame_count", "0") or "0")
    if video_filename:
        video_path = DOWNLOADS_DIR / video_filename
        if video_path.exists():
            try:
                clip_frame_paths = extract_clip_frames(video_path, reel_id)
                if clip_frame_paths:
                    clip_result = generate_clip_embeddings(clip_frame_paths)
                    cleanup_clip_frames(clip_frame_paths)
                    clip_emb = clip_result.get("clip_embedding")
                    clip_frame_count = clip_result.get("frame_count", 0)
                    has_clip_embedding = clip_emb is not None
                    if has_clip_embedding:
                        store_clip_embedding(reel_id, clip_emb, clip_frame_count)
            except Exception as e:
                print(f"[WARN] CLIP re-index embedding failed (keeping existing): {e}")

    # Build multimodal document (caption + hashtags + transcript + OCR + visual captions)
    # Preserve existing caption metadata from ChromaDB rather than re-fetching
    caption_from_meta   = meta.get("instagram_caption", "")
    hashtags_from_meta  = meta.get("hashtags_str", "").split() if meta.get("hashtags_str") else []
    has_caption_meta    = meta.get("has_caption", "False") == "True"
    caption_length_meta = int(meta.get("caption_length", "0") or "0")
    combined_document = build_multimodal_document(
        transcript_text,
        ocr_text,
        visual_captions_text,
        instagram_caption=caption_from_meta,
        hashtags=hashtags_from_meta,
    )

    try:
        embedding = embedding_model.encode(combined_document).tolist()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")

    # Preserve all existing metadata, update BLIP + CLIP fields
    updated_meta = dict(meta)
    updated_meta["visual_captions"] = visual_captions_text[:600]
    updated_meta["visual_caption_count"] = str(len(visual_captions_list))
    updated_meta["has_visual_understanding"] = str(has_visual_understanding)
    updated_meta["has_clip_embedding"] = str(has_clip_embedding)
    updated_meta["clip_frame_count"] = str(clip_frame_count)
    # STEP 12.5 — preserve caption metadata (do not clobber on reindex)
    updated_meta.setdefault("instagram_caption", caption_from_meta)
    updated_meta.setdefault("hashtags_str", meta.get("hashtags_str", ""))
    updated_meta.setdefault("hashtag_count", meta.get("hashtag_count", "0"))
    updated_meta.setdefault("has_caption", str(has_caption_meta))
    updated_meta.setdefault("caption_length", str(caption_length_meta))

    try:
        chroma_collection.update(
            ids=[reel_id],
            embeddings=[embedding],
            documents=[combined_document],
            metadatas=[updated_meta],
        )
        print(f"[INFO] Re-index completed for: {reel_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update ChromaDB: {str(e)}")

    return {
        "success": True,
        "reel_id": reel_id,
        "visual_caption_count": len(visual_captions_list),
        "has_visual_understanding": has_visual_understanding,
        "has_clip_embedding": has_clip_embedding,
        "clip_frame_count": clip_frame_count,
    }

@app.post("/api/reels/{reel_id}/reindex")
def api_reindex_reel(reel_id: str):
    return reindex_reel(reel_id)


# ---------------------------------------------------------------------------
# STEP 7 — Feature 2 & 3: POST /feedback
# ---------------------------------------------------------------------------
@app.post("/feedback")
def save_feedback(request: FeedbackRequest):
    """Save relevance feedback for a search result."""
    if request.feedback not in ("relevant", "not_relevant"):
        raise HTTPException(status_code=400, detail="feedback must be 'relevant' or 'not_relevant'.")

    log_path = SEARCH_LOGS_DIR / f"{request.search_id}.json"
    if not log_path.exists():
        raise HTTPException(status_code=404, detail="Search log not found.")

    try:
        log = json.loads(log_path.read_text(encoding="utf-8"))
        updated = False
        for entry in log.get("results", []):
            if entry["reel_id"] == request.reel_id:
                entry["feedback"] = request.feedback
                updated = True
                break

        if not updated:
            # Append new entry if reel_id wasn't originally in this log
            log.setdefault("results", []).append({
                "reel_id": request.reel_id,
                "similarity_score": 0,
                "feedback": request.feedback,
            })

        log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False), encoding="utf-8")
        print(f"[INFO] Feedback saved: {request.reel_id} → {request.feedback}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save feedback: {str(e)}")

    return {"success": True}

@app.post("/api/feedback")
def api_save_feedback(request: FeedbackRequest):
    return save_feedback(request)


# ---------------------------------------------------------------------------
# STEP 7 — Feature 4: GET /search-analytics
# ---------------------------------------------------------------------------
@app.get("/search-analytics")
def get_search_analytics():
    """Aggregate all search logs and return quality metrics."""
    print("[INFO] Fetching search analytics...")

    logs = load_all_logs()

    if not logs:
        return {
            "success": True,
            "total_searches": 0,
            "avg_similarity": 0,
            "relevant_count": 0,
            "not_relevant_count": 0,
            "success_rate": 0,
            "failed_searches": 0,
            "most_common_queries": [],
            "top_queries": [],
            "worst_queries": [],
        }

    total_searches = len(logs)
    failed_searches = sum(1 for l in logs if not l.get("success", True))

    # Similarity scores from all results
    all_scores = []
    relevant_count = 0
    not_relevant_count = 0
    query_feedback: dict[str, list] = {}

    for log in logs:
        q = log.get("query", "")
        for r in log.get("results", []):
            score = r.get("similarity_score", 0)
            all_scores.append(score)
            fb = r.get("feedback")
            if fb == "relevant":
                relevant_count += 1
                query_feedback.setdefault(q, []).append(1)
            elif fb == "not_relevant":
                not_relevant_count += 1
                query_feedback.setdefault(q, []).append(0)

    avg_similarity = round(sum(all_scores) / len(all_scores), 4) if all_scores else 0

    total_feedback = relevant_count + not_relevant_count
    success_rate = round(relevant_count / total_feedback * 100, 1) if total_feedback > 0 else 0

    # Most common queries
    from collections import Counter
    query_counts = Counter(l.get("query", "") for l in logs)
    most_common_queries = [
        {"query": q, "count": c}
        for q, c in query_counts.most_common(5)
    ]

    # Top/worst performing queries (by avg feedback score)
    query_avg = {
        q: round(sum(scores) / len(scores) * 100, 1)
        for q, scores in query_feedback.items()
        if scores
    }
    sorted_queries = sorted(query_avg.items(), key=lambda x: x[1], reverse=True)
    top_queries = [{"query": q, "score": s} for q, s in sorted_queries[:3]]
    worst_queries = [{"query": q, "score": s} for q, s in sorted_queries[-3:] if s < 100]

    return {
        "success": True,
        "total_searches": total_searches,
        "avg_similarity": avg_similarity,
        "relevant_count": relevant_count,
        "not_relevant_count": not_relevant_count,
        "success_rate": success_rate,
        "failed_searches": failed_searches,
        "most_common_queries": most_common_queries,
        "top_queries": top_queries,
        "worst_queries": worst_queries,
    }

@app.get("/api/search-analytics")
def api_get_search_analytics():
    return get_search_analytics()


# ===========================================================================
# STEP 12 — CONVERSATIONAL MULTIMODAL RAG CHAT SYSTEM
# ===========================================================================

# ---------------------------------------------------------------------------
# RAG Helper 1: retrieve_relevant_reels
# ---------------------------------------------------------------------------
def retrieve_relevant_reels(query: str, top_k: int = 6) -> list:
    """
    Full hybrid retrieval pipeline:
    1. Rewrite query via Ollama
    2. Embed with SentenceTransformer
    3. Query ChromaDB (text collection)
    4. Query CLIP collection, merge hybrid scores
    5. LLM rerank + filter IRRELEVANT
    6. Return top_k enriched reel dicts
    """
    if embedding_model is None or chroma_collection is None:
        return []

    # --- 1. Query rewriting ---
    rewritten = query
    try:
        rewritten = rewrite_query(query)
    except Exception as e:
        print(f"[WARN] RAG query rewrite failed: {e}")

    # --- 2. Embed ---
    embed_q = rewritten if rewritten != query else query
    try:
        q_emb = embedding_model.encode(embed_q).tolist()
    except Exception as e:
        print(f"[WARN] RAG embed failed: {e}")
        return []

    # --- 3. ChromaDB text retrieval ---
    try:
        db_count = chroma_collection.count()
        if db_count == 0:
            return []
        n_retrieve = min(top_k + 4, db_count)  # retrieve a few extra for reranking
        raw = chroma_collection.query(
            query_embeddings=[q_emb],
            n_results=n_retrieve,
            include=["documents", "metadatas", "distances"],
        )
    except Exception as e:
        print(f"[WARN] RAG ChromaDB query failed: {e}")
        return []

    ids       = raw.get("ids", [[]])[0]
    documents = raw.get("documents", [[]])[0]
    metadatas = raw.get("metadatas", [[]])[0]
    distances = raw.get("distances", [[]])[0]

    # --- 4. CLIP hybrid scoring ---
    TEXT_W, CLIP_W = 0.65, 0.35
    clip_score_map: dict = {}
    clip_q_vec = get_clip_query_embedding(embed_q)
    if clip_q_vec and clip_collection is not None:
        try:
            cc = clip_collection.count()
            if cc > 0:
                n_clip = min(6, cc)
                cr = clip_collection.query(
                    query_embeddings=[clip_q_vec],
                    n_results=n_clip,
                    include=["metadatas", "distances"],
                )
                for cid, cdist in zip(cr.get("ids", [[]])[0], cr.get("distances", [[]])[0]):
                    clip_score_map[cid] = round(max(0.0, 1.0 - cdist), 4)
        except Exception as e:
            print(f"[WARN] RAG CLIP query failed: {e}")

    pre_llm = []
    text_ids_seen = set()
    for i, doc_id in enumerate(ids):
        meta      = metadatas[i]
        text_sim  = round(max(0.0, 1.0 - distances[i] / 2.0), 4)
        clip_sim  = clip_score_map.get(doc_id)
        doc_text  = documents[i] if i < len(documents) else ""
        text_ids_seen.add(doc_id)

        if clip_sim is not None:
            final_score = round(TEXT_W * text_sim + CLIP_W * clip_sim, 4)
            has_clip = True
        else:
            final_score = text_sim
            clip_sim = 0.0
            has_clip = False

        pre_llm.append({
            "id": doc_id,
            "similarity_score": final_score,
            "clip_score": round(clip_sim, 4),
            "has_clip_match": has_clip,
            "transcript_preview": doc_text,
            "ocr_text_preview": meta.get("ocr_text_preview", ""),
            "visual_captions_preview": meta.get("visual_captions", ""),
            "video_filename": meta.get("video_filename", ""),
            "video_path": str(DOWNLOADS_DIR / meta.get("video_filename", "")),
            "original_url": meta.get("original_url", ""),
            "ocr_success": meta.get("ocr_success", "False") == "True",
            "has_visual_understanding": meta.get("has_visual_understanding", "False") == "True",
            # STEP 12.5
            "instagram_caption_preview": meta.get("instagram_caption", "")[:300],
            "hashtags": meta.get("hashtags_str", "").split() if meta.get("hashtags_str") else [],
            "hashtags_str": meta.get("hashtags_str", ""),
            "has_caption": meta.get("has_caption", "False") == "True",
        })

    # Add CLIP-only results not in text pool
    clip_only_ids = [cid for cid in clip_score_map if cid not in text_ids_seen]
    if clip_only_ids:
        try:
            extra = chroma_collection.get(ids=clip_only_ids, include=["documents", "metadatas"])
            for j, cid in enumerate(extra.get("ids", [])):
                csim = clip_score_map.get(cid, 0.0)
                emeta = extra.get("metadatas", [])[j] if j < len(extra.get("metadatas", [])) else {}
                etxt = extra.get("documents", [])[j] if j < len(extra.get("documents", [])) else ""
                pre_llm.append({
                    "id": cid,
                    "similarity_score": round(CLIP_W * csim, 4),
                    "clip_score": round(csim, 4),
                    "has_clip_match": True,
                    "transcript_preview": etxt,
                    "ocr_text_preview": emeta.get("ocr_text_preview", ""),
                    "visual_captions_preview": emeta.get("visual_captions", ""),
                    "video_filename": emeta.get("video_filename", ""),
                    "video_path": str(DOWNLOADS_DIR / emeta.get("video_filename", "")),
                    "original_url": emeta.get("original_url", ""),
                    "ocr_success": emeta.get("ocr_success", "False") == "True",
                    "has_visual_understanding": emeta.get("has_visual_understanding", "False") == "True",
                    # STEP 12.5
                    "instagram_caption_preview": emeta.get("instagram_caption", "")[:300],
                    "hashtags": emeta.get("hashtags_str", "").split() if emeta.get("hashtags_str") else [],
                    "hashtags_str": emeta.get("hashtags_str", ""),
                    "has_caption": emeta.get("has_caption", "False") == "True",
                })
        except Exception as e:
            print(f"[WARN] RAG CLIP-only fetch failed: {e}")

    pre_llm.sort(key=lambda r: r["similarity_score"], reverse=True)

    # --- 5. LLM reranking ---
    if OLLAMA_AVAILABLE and pre_llm:
        try:
            ranked_labels = llm_rerank(query, rewritten, pre_llm)
            if ranked_labels:
                label_map = {item["id"]: item for item in ranked_labels}
                merged = []
                for label_item in ranked_labels:
                    rid       = label_item.get("id", "")
                    relevance = label_item.get("relevance_label", "LOW").upper()
                    reason    = label_item.get("llm_reason", "")
                    if relevance == "IRRELEVANT":
                        continue
                    base = next((r for r in pre_llm if r["id"] == rid), None)
                    if base is None:
                        continue
                    merged.append({
                        **base,
                        "relevance_label": relevance,
                        "llm_reason": reason,
                    })
                pre_llm = merged
        except Exception as e:
            print(f"[WARN] RAG LLM rerank failed: {e}")

    # --- 6. Cap to top_k and store rewritten query on result set ---
    results = pre_llm[:top_k]
    for r in results:
        r["rewritten_query"] = rewritten
    return results


# ---------------------------------------------------------------------------
# RAG Helper 2: build_rag_context
# ---------------------------------------------------------------------------
RAG_TRANSCRIPT_MAX  = 600
RAG_OCR_MAX         = 250
RAG_VISUAL_MAX      = 200


def build_rag_context(reels: list) -> str:
    """
    Build a compact structured context string from retrieved reels.
    Hard limits per field ensure the total prompt stays CPU-safe.
    Caption appears FIRST for maximum semantic relevance.
    """
    parts = []
    for idx, r in enumerate(reels, start=1):
        reel_id  = r.get("id", "unknown")
        caption  = (r.get("instagram_caption_preview") or r.get("caption_preview") or "").strip()[:500]
        hashtags = r.get("hashtags") or []
        tag_str  = " ".join(f"#{t}" for t in hashtags[:10]) if hashtags else ""
        trans    = (r.get("transcript_preview") or "").strip()[:RAG_TRANSCRIPT_MAX]
        ocr      = (r.get("ocr_text_preview") or "").strip()[:RAG_OCR_MAX]
        visual   = (r.get("visual_captions_preview") or "").strip()[:RAG_VISUAL_MAX]
        reason   = (r.get("llm_reason") or "").strip()

        lines = [f"REEL {idx}", f"Filename: {reel_id}"]
        if caption:
            lines += ["\nInstagram Caption:", caption]
        if tag_str:
            lines += ["\nHashtags:", tag_str]
        if trans:
            lines += ["\nTranscript:", trans]
        if ocr:
            lines += ["\nOCR Text:", ocr]
        if visual:
            lines += ["\nVisual Understanding:", visual]
        if reason:
            lines += ["\nReason Matched:", reason]
        lines.append("\n" + "-" * 32)
        parts.append("\n".join(lines))
    return "\n\n".join(parts)


# ---------------------------------------------------------------------------
# RAG Helper 3: build_chat_prompt
# ---------------------------------------------------------------------------
_RAG_PROMPT_TEMPLATE = """\
You are ReelSearchAI, a local AI memory assistant.

You must answer ONLY using the provided reel memory context below.

Rules:
- Do not invent information not present in the context
- If the context is insufficient to answer, say so clearly
- Reference relevant reels naturally by their filename
- Summarize repeated themes if multiple reels agree
- Keep your answer concise but insightful

USER QUESTION:
{query}

REEL MEMORY CONTEXT:
{context}

Return your response in three parts:
1. Answer
2. Key themes (bullet points)
3. Referenced reels (comma-separated filenames)
"""


def build_chat_prompt(user_query: str, context: str) -> str:
    """Render the RAG prompt template with query + context."""
    return _RAG_PROMPT_TEMPLATE.format(query=user_query.strip(), context=context)


# ---------------------------------------------------------------------------
# RAG Helper 4: log_chat_analytics
# ---------------------------------------------------------------------------
def log_chat_analytics(
    query: str,
    rewritten_query: str,
    retrieved_reels: list,
    execution_time_ms: float,
    llm_time_ms: float,
    answer_length: int,
) -> None:
    """Persist a chat event to CHAT_LOGS_DIR as a JSON file."""
    log = {
        "timestamp": int(time.time()),
        "query": query,
        "rewritten_query": rewritten_query,
        "retrieved_reels": [r.get("id") for r in retrieved_reels],
        "retrieved_count": len(retrieved_reels),
        "execution_time_ms": round(execution_time_ms, 2),
        "llm_time_ms": round(llm_time_ms, 2),
        "answer_length": answer_length,
    }
    log_path = CHAT_LOGS_DIR / f"chat_{int(time.time() * 1000)}.json"
    try:
        log_path.write_text(json.dumps(log, indent=2, ensure_ascii=False), encoding="utf-8")
        print("[INFO] Chat analytics logged.")
    except Exception as e:
        print(f"[WARN] Could not save chat log: {e}")


# ---------------------------------------------------------------------------
# STEP 12 — POST /chat endpoint
# ---------------------------------------------------------------------------
@app.post("/chat", response_model=ChatResponse)
def chat_with_reels(request: ChatRequest):
    """
    Conversational RAG endpoint.
    Retrieves relevant reels → builds context → asks Ollama → returns grounded answer.
    """
    user_message = request.message.strip()
    if not user_message:
        raise HTTPException(status_code=400, detail="message is required.")

    print(f"[INFO] Chat request: '{user_message}'")
    t_total_start = time.perf_counter()

    # --- Ollama availability check (non-fatal) ---
    ollama_ok = _probe_ollama()
    warning: str | None = None
    if not ollama_ok:
        warning = "LLM chat unavailable — Ollama offline."
        print("[WARN] Ollama offline — returning empty chat response.")
        return ChatResponse(
            answer="I could not find meaningful reel memory related to your question. (LLM unavailable — Ollama is offline.)",
            sources=[],
            used_reels=[],
            execution_time_ms=0,
            llm_time_ms=0,
            retrieved_count=0,
            rewritten_query=None,
            warning=warning,
        )

    # --- 1. Retrieve relevant reels (full hybrid pipeline) ---
    reels = retrieve_relevant_reels(user_message, top_k=6)
    rewritten_query = reels[0].get("rewritten_query") if reels else user_message

    if not reels:
        t_end = time.perf_counter()
        exec_ms = int((t_end - t_total_start) * 1000)
        log_chat_analytics(user_message, rewritten_query or user_message, [], exec_ms, 0, 0)
        return ChatResponse(
            answer="I could not find meaningful reel memory related to your question.",
            sources=[],
            used_reels=[],
            execution_time_ms=exec_ms,
            llm_time_ms=0,
            retrieved_count=0,
            rewritten_query=rewritten_query,
            warning=None,
        )

    # --- 2. Build RAG context ---
    context = build_rag_context(reels)

    # --- 3. Build prompt (cap total to ~5000 chars for CPU safety) ---
    prompt = build_chat_prompt(user_message, context)
    if len(prompt) > 5000:
        prompt = prompt[:5000] + "\n...[context truncated for CPU safety]"
    print(f"[INFO] RAG prompt length: {len(prompt)} chars")

    # --- 4. Generate answer via Ollama ---
    t_llm_start = time.perf_counter()
    final_answer = ""
    llm_warning: str | None = None
    try:
        # Use a 90-second timeout for chat (longer than search)
        payload = {"model": OLLAMA_MODEL, "prompt": prompt, "stream": False}
        r = requests.post(OLLAMA_URL, json=payload, timeout=90)
        r.raise_for_status()
        final_answer = r.json().get("response", "").strip()
    except requests.exceptions.Timeout:
        llm_warning = "LLM response timed out (90s limit). Showing retrieved sources only."
        print("[WARN] Ollama chat timed out.")
    except requests.exceptions.ConnectionError:
        llm_warning = "LLM chat unavailable — Ollama offline."
        print("[WARN] Ollama connection refused during chat.")
    except Exception as e:
        llm_warning = f"LLM call failed: {str(e)[:100]}"
        print(f"[WARN] Ollama chat error: {e}")

    llm_time_ms = int((time.perf_counter() - t_llm_start) * 1000)

    if not final_answer:
        final_answer = "I could not generate a meaningful answer from the retrieved reel memory."

    # --- 5. Extract source metadata ---
    sources = [
        {
            "reel_id": r.get("id", ""),
            "score": round(r.get("similarity_score", 0.0), 4),
            "reason": r.get("llm_reason", ""),
            "video_path": r.get("video_filename", ""),
            "relevance": r.get("relevance_label", "MEDIUM"),
        }
        for r in reels
    ]
    used_reels = [r.get("id", "") for r in reels]

    t_total_end = time.perf_counter()
    exec_ms = int((t_total_end - t_total_start) * 1000)

    # --- 6. Log analytics ---
    log_chat_analytics(
        query=user_message,
        rewritten_query=rewritten_query or user_message,
        retrieved_reels=reels,
        execution_time_ms=exec_ms,
        llm_time_ms=llm_time_ms,
        answer_length=len(final_answer),
    )

    print(f"[INFO] Chat completed in {exec_ms}ms (LLM: {llm_time_ms}ms), {len(reels)} reels used.")

    return ChatResponse(
        answer=final_answer,
        sources=sources,
        used_reels=used_reels,
        execution_time_ms=exec_ms,
        llm_time_ms=llm_time_ms,
        retrieved_count=len(reels),
        rewritten_query=rewritten_query,
        warning=llm_warning,
    )

@app.post("/api/chat")
def api_chat_with_reels(request: ChatRequest):
    return chat_with_reels(request)


# ---------------------------------------------------------------------------
# API aliases: /api/dashboard/stats, /api/dashboard/activity, /api/system/health
# These bridge the frontend expectations to existing backend logic.
# ---------------------------------------------------------------------------

@app.get("/api/dashboard/stats")
async def api_dashboard_stats():
    """Aggregate dashboard statistics from health + analytics data."""
    health_data = await health_check()
    analytics_data = get_search_analytics()

    # Count completed / failed jobs from DB
    all_jobs = await db.list_jobs(limit=10000, offset=0)
    completed_jobs = sum(1 for j in all_jobs if j.get("status") == "completed")
    failed_jobs = sum(1 for j in all_jobs if j.get("status") == "failed")

    return {
        "reels_indexed": health_data.get("totalReels", 0),
        "vectors_stored": health_data.get("totalEmbeddings", 0),
        "transcripts": health_data.get("totalTranscripts", 0),
        "active_jobs": health_data.get("activeJobs", 0),
        "completed_jobs": completed_jobs,
        "failed_jobs": failed_jobs,
        "total_searches": analytics_data.get("total_searches", 0),
        "avg_match_score": analytics_data.get("avg_similarity", 0),
        "ollama_online": health_data.get("ollamaOnline", False),
        "chromadb_online": health_data.get("chromaOnline", False),
        "api_online": True,
        "gpu_available": health_data.get("gpuAvailable", False),
        "latency_ms": health_data.get("latency", 0),
        "models": health_data.get("models", {}),
    }


@app.get("/api/dashboard/activity")
async def api_dashboard_activity(limit: int = 20):
    """Return recent activity from job completions/failures."""
    all_jobs = await db.list_jobs(limit=limit, offset=0)
    activity = []
    for job in all_jobs:
        if job.get("status") == "completed":
            activity.append({
                "type": "indexed",
                "message": f"Reel indexed from {job.get('url', 'unknown')}",
                "timestamp": job.get("updated_at", job.get("created_at", "")),
            })
        elif job.get("status") == "failed":
            activity.append({
                "type": "error",
                "message": f"Pipeline failed: {(job.get('error') or 'unknown error')[:80]}",
                "timestamp": job.get("updated_at", job.get("created_at", "")),
            })
    return activity[:limit]


@app.get("/api/system/health")
async def api_system_health():
    """Detailed system health for Settings page."""
    import shutil
    health_data = await health_check()
    models = health_data.get("models", {})

    # Compute storage sizes
    storage_used_mb = 0
    db_size_mb = 0
    vector_db_size_mb = 0
    try:
        dl_dir = Path(__file__).parent / "downloads"
        if dl_dir.exists():
            storage_used_mb = round(sum(f.stat().st_size for f in dl_dir.rglob("*") if f.is_file()) / (1024 * 1024), 2)
    except Exception:
        pass
    try:
        db_file = Path(__file__).parent / "vector_db" / "jobs.db"
        if db_file.exists():
            db_size_mb = round(db_file.stat().st_size / (1024 * 1024), 2)
    except Exception:
        pass
    try:
        vdb_dir = Path(__file__).parent / "vector_db"
        if vdb_dir.exists():
            vector_db_size_mb = round(sum(f.stat().st_size for f in vdb_dir.rglob("*") if f.is_file()) / (1024 * 1024), 2)
    except Exception:
        pass

    return {
        "api_online": True,
        "ollama_online": health_data.get("ollamaOnline", False),
        "chromadb_online": health_data.get("chromaOnline", False),
        "whisper_loaded": models.get("whisper") == "loaded",
        "whisper_model": "medium",
        "whisper_device": "cpu",
        "whisper_compute": "int8",
        "clip_loaded": models.get("clip") == "loaded",
        "blip_loaded": models.get("blip") == "loaded",
        "embedding_loaded": models.get("embedding") == "loaded",
        "gpu_available": health_data.get("gpuAvailable", False),
        "storage_used_mb": storage_used_mb,
        "db_size_mb": db_size_mb,
        "vector_db_size_mb": vector_db_size_mb,
        "max_concurrent_pipelines": MAX_CONCURRENT_PIPELINES,
        "active_pipelines": len(active_pipeline_tasks),
        "latency_ms": health_data.get("latency", 0),
    }
