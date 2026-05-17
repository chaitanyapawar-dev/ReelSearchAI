import json
import os
import shutil
import subprocess
import time
from pathlib import Path
from fastapi.staticfiles import StaticFiles

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import yt_dlp
from faster_whisper import WhisperModel

# ---------------------------------------------------------------------------
# Startup: detect FFmpeg
# ---------------------------------------------------------------------------
FFMPEG_PATH = shutil.which("ffmpeg")
if FFMPEG_PATH:
    print(f"[INFO] FFmpeg found at: {FFMPEG_PATH}")
else:
    print("[WARN] FFmpeg not found in PATH. Audio extraction will fail.")

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
    print("[INFO] ChromaDB initialized successfully.")
except Exception as e:
    chroma_client = None
    chroma_collection = None
    print(f"[ERROR] ChromaDB failed to initialize: {e}")

# ---------------------------------------------------------------------------
# App setup
# ---------------------------------------------------------------------------
app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
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

# Search logs directory (Step 7)
SEARCH_LOGS_DIR = BASE_DIR / "search_logs"
SEARCH_LOGS_DIR.mkdir(exist_ok=True)

# Serve downloaded files as static assets
DOWNLOADS_DIR.mkdir(exist_ok=True)
OCR_DIR.mkdir(exist_ok=True)
FRAMES_DIR.mkdir(exist_ok=True)
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
    """Merge Whisper transcript and OCR text into one embedding document."""
    print("[INFO] Merging transcript and OCR text...")
    parts = []
    if transcript.strip():
        parts.append(f"=== TRANSCRIPT ===\n{transcript.strip()}")
    if ocr_text.strip():
        parts.append(f"=== OCR TEXT ===\n{ocr_text.strip()}")
    return "\n\n".join(parts) if parts else transcript


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
) -> None:
    if embedding_model is None:
        print("[WARN] Embedding model not loaded — skipping vector storage.")
        return
    if chroma_collection is None:
        print("[WARN] ChromaDB not initialized — skipping vector storage.")
        return

    try:
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
            }],
        )
        print(f"[INFO] Combined embedding generated and stored for {doc_id}.")
    except Exception as e:
        print(f"[WARN] Failed to store embedding: {e}")


# ---------------------------------------------------------------------------
# STEP 7 — Search log helpers
# ---------------------------------------------------------------------------
def save_search_log(
    search_id: str,
    query: str,
    results: list,
    execution_time_ms: float,
) -> None:
    """Persist a search event to a JSON file in search_logs/."""
    log = {
        "search_id": search_id,
        "query": query,
        "timestamp": int(time.time()),
        "execution_time_ms": round(execution_time_ms, 2),
        "result_count": len(results),
        "success": len(results) > 0,
        "results": [
            {
                "reel_id": r["id"],
                "similarity_score": r["similarity_score"],
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
# Endpoints
# ---------------------------------------------------------------------------

@app.post("/download")
def download_reel(request: DownloadRequest):
    url = request.url.strip()

    if not url:
        raise HTTPException(status_code=400, detail="URL is required.")

    if "instagram.com" not in url:
        raise HTTPException(status_code=400, detail="Invalid Instagram URL.")

    DOWNLOADS_DIR.mkdir(exist_ok=True)
    AUDIO_DIR.mkdir(exist_ok=True)
    TRANSCRIPTS_DIR.mkdir(exist_ok=True)

    timestamp = int(time.time())
    doc_id = f"reel_{timestamp}"
    video_filename = f"{doc_id}.mp4"
    audio_filename = f"{doc_id}.mp3"
    transcript_filename = f"{doc_id}.txt"

    video_path = DOWNLOADS_DIR / video_filename
    audio_path = AUDIO_DIR / audio_filename
    transcript_path = TRANSCRIPTS_DIR / transcript_filename

    # --- 1. Download video ---
    ydl_opts = {
        "outtmpl": str(video_path),
        "format": "best[ext=mp4]/best",
        "quiet": True,
        "no_warnings": True,
    }

    try:
        with yt_dlp.YoutubeDL(ydl_opts) as ydl:
            info = ydl.extract_info(url, download=True)
            if info is None:
                raise HTTPException(status_code=400, detail="Could not extract video info. The reel may be unavailable.")
    except yt_dlp.utils.DownloadError as e:
        msg = str(e).replace("ERROR: ", "").strip()
        if "private" in msg.lower() or "login" in msg.lower() or "checkpoint" in msg.lower():
            raise HTTPException(status_code=403, detail="This reel is private or requires Instagram login.")
        if "not found" in msg.lower() or "does not exist" in msg.lower() or "404" in msg:
            raise HTTPException(status_code=404, detail="Reel not found. The URL may be incorrect or deleted.")
        raise HTTPException(status_code=400, detail=f"Download failed: {msg}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Unexpected error: {str(e)}")

    # Resolve actual saved file (yt-dlp may modify the extension)
    if not video_path.exists():
        matches = [f for f in DOWNLOADS_DIR.iterdir() if f.name.startswith(doc_id) and f.is_file()]
        if not matches:
            raise HTTPException(status_code=500, detail="Video file was not saved after download.")
        video_path = matches[0]
        video_filename = video_path.name

    # --- 2. Extract audio ---
    extract_audio(video_path, audio_path)

    # --- 3. Transcribe ---
    transcript_text = transcribe_audio(audio_path, transcript_path)

    # --- 4. OCR: extract frames → run OCR → cleanup frames ---
    FRAMES_DIR.mkdir(exist_ok=True)
    OCR_DIR.mkdir(exist_ok=True)
    ocr_filename = f"{doc_id}_ocr.txt"
    ocr_path = OCR_DIR / ocr_filename
    ocr_text = ""
    ocr_success = False
    try:
        frame_paths = extract_frames(video_path, FRAMES_DIR, doc_id)
        if frame_paths:
            ocr_text = run_ocr(frame_paths)
            cleanup_frames(frame_paths)
        if ocr_text.strip():
            ocr_path.write_text(ocr_text, encoding="utf-8")
            ocr_success = True
        else:
            ocr_filename = ""
    except Exception as e:
        print(f"[WARN] OCR pipeline failed (continuing without OCR): {e}")
        ocr_filename = ""

    # --- 5. Build combined document (transcript + OCR) ---
    combined_document = build_combined_document(transcript_text, ocr_text)

    # --- 6. Store embedding ---
    store_embedding(
        doc_id=doc_id,
        combined_document=combined_document,
        video_filename=video_filename,
        audio_filename=audio_filename,
        transcript_filename=transcript_filename,
        original_url=url,
        timestamp=timestamp,
        ocr_filename=ocr_filename,
        ocr_text_preview=ocr_text[:300] if ocr_text else "",
        ocr_success=ocr_success,
    )

    return {
        "success": True,
        "video_filename": video_filename,
        "audio_filename": audio_filename,
        "transcript_filename": transcript_filename,
        "ocr_filename": ocr_filename,
        "ocr_success": ocr_success,
        "ocr_text_preview": ocr_text[:300] if ocr_text else "",
        "video_path": str(video_path),
        "audio_path": str(audio_path),
        "transcript_path": str(transcript_path),
        "transcript_preview": transcript_text,
    }


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
    t_start = time.perf_counter()

    # --- Embed query ---
    try:
        query_embedding = embedding_model.encode(query).tolist()
        print("[INFO] Search query embedded")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate query embedding: {str(e)}")

    # --- Retrieve from ChromaDB ---
    try:
        results = chroma_collection.query(
            query_embeddings=[query_embedding],
            n_results=5,
            include=["documents", "metadatas", "distances"],
        )
        print("[INFO] Top matches retrieved")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"ChromaDB search failed: {str(e)}")

    t_end = time.perf_counter()
    execution_time_ms = (t_end - t_start) * 1000

    ids = results.get("ids", [[]])[0]
    documents = results.get("documents", [[]])[0]
    metadatas = results.get("metadatas", [[]])[0]
    distances = results.get("distances", [[]])[0]

    output = []
    for i, doc_id in enumerate(ids):
        meta = metadatas[i]
        distance = distances[i]
        # Chroma returns L2 distance; convert to a 0-1 similarity score
        similarity = round(max(0.0, 1.0 - distance / 2.0), 4)
        transcript_text = documents[i] if i < len(documents) else ""

        output.append({
            "id": doc_id,
            "similarity_score": similarity,
            "video_filename": meta.get("video_filename", ""),
            "video_path": str(DOWNLOADS_DIR / meta.get("video_filename", "")),
            "audio_path": str(AUDIO_DIR / meta.get("audio_filename", "")),
            "transcript_path": str(TRANSCRIPTS_DIR / meta.get("transcript_filename", "")),
            "transcript_preview": transcript_text,
            "transcript_length": len(transcript_text),
            "original_url": meta.get("original_url", ""),
            "ocr_success": meta.get("ocr_success", "False") == "True",
            "ocr_text_preview": meta.get("ocr_text_preview", ""),
        })

    # --- Persist search log ---
    search_id = f"srch_{int(time.time() * 1000)}"
    save_search_log(search_id, query, output, execution_time_ms)

    return {
        "success": True,
        "search_id": search_id,
        "execution_time_ms": round(execution_time_ms, 2),
        "results": output,
    }


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
        })

    # Sort newest first
    reels.sort(key=lambda r: r["timestamp"], reverse=True)

    return {"success": True, "reels": reels}


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

    # --- Remove from ChromaDB (embedding + metadata + document) ---
    try:
        chroma_collection.delete(ids=[reel_id])
        print(f"[INFO] Reel deleted successfully: {reel_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to remove from ChromaDB: {str(e)}")

    return {"success": True}


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

    # Build combined document (transcript + OCR)
    combined_document = build_combined_document(transcript_text, ocr_text)

    try:
        embedding = embedding_model.encode(combined_document).tolist()
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate embedding: {str(e)}")

    try:
        chroma_collection.update(
            ids=[reel_id],
            embeddings=[embedding],
            documents=[combined_document],
            metadatas=[meta],
        )
        print(f"[INFO] Re-index completed for: {reel_id}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update ChromaDB: {str(e)}")

    return {"success": True, "reel_id": reel_id}


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
