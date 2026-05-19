"use client";

import { useState, useRef, useEffect, useCallback } from "react";

// ---------------------------------------------------------------------------
// Download workflow steps
// ---------------------------------------------------------------------------
const STEPS = [
  "Downloading reel",
  "Converting to MP4",
  "Extracting MP3",
  "Transcribing audio",
  "Extracting on-screen text (OCR)",
  "Understanding visuals (AI)",
  "Generating embedding",
  "Completed",
];

// ---------------------------------------------------------------------------
// Preset queries for evaluation (Step 7)
// ---------------------------------------------------------------------------
const PRESET_ENGLISH = [
  "discipline reel",
  "startup motivation",
  "dopamine detox",
  "consistency habits",
  "focus improvement",
  "productivity mindset",
  "gym discipline",
  "self improvement",
];

// Step 8 — OCR-enhanced preset queries
const PRESET_OCR = [
  "dopamine detox quote",
  "discipline caption reel",
  "productivity subtitle reel",
  "Hindi motivational quote",
  "startup text reel",
];

const PRESET_HINGLISH = [
  "discipline wala reel",
  "startup motivation ka video",
  "AI tool wala reel",
  "productive feel karne wala reel",
  "dopamine detox guy",
  "mehnat karne wala reel",
];

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type DownloadResult = {
  video_filename: string;
  audio_filename: string;
  transcript_filename: string;
  transcript_preview: string;
  ocr_filename: string;
  ocr_success: boolean;
  ocr_text_preview: string;
  // STEP 10
  visual_captions: string[];
  visual_caption_count: number;
  has_visual_understanding: boolean;
  // STEP 12.5
  instagram_caption?: string;
  caption_preview?: string;
  hashtags?: string[];
  has_caption?: boolean;
};

type SearchResult = {
  id: string;
  similarity_score: number;
  video_filename: string;
  transcript_preview: string;
  transcript_length: number;
  original_url: string;
  ocr_success: boolean;
  ocr_text_preview: string;
  // STEP 9 — LLM fields
  relevance_label?: "HIGH" | "MEDIUM" | "LOW";
  llm_reason?: string;
  original_similarity?: number;
  reranked_position?: number;
  // STEP 10
  visual_captions_preview?: string;
  visual_caption_count?: number;
  has_visual_understanding?: boolean;
  // STEP 11
  clip_score?: number;
  has_clip_match?: boolean;
  // STEP 12.5
  instagram_caption_preview?: string;
  hashtags?: string[];
  has_caption?: boolean;
};

type SearchResponse = {
  search_id: string;
  execution_time_ms: number;
  query: string;
  rewritten_query: string;
  llm_time_ms: number;
  llm_rejected: number;
  llm_warning: string | null;
  llm_active: boolean;
  empty_reason?: string;
  results: SearchResult[];
};

// STEP 12 — RAG Chat types
type ChatSource = {
  reel_id: string;
  score: number;
  reason: string;
  video_path?: string;
  relevance?: string;
};

type ChatResponse = {
  answer: string;
  sources: ChatSource[];
  used_reels: string[];
  execution_time_ms: number;
  llm_time_ms: number;
  retrieved_count: number;
  rewritten_query?: string;
  warning?: string;
};

type LibraryReel = {
  id: string;
  original_url: string;
  video_filename: string;
  audio_path: string;
  transcript_path: string;
  transcript_preview: string;
  timestamp: number;
  video_exists: boolean;
  audio_exists: boolean;
  transcript_exists: boolean;
  ocr_success: boolean;
  ocr_text_preview: string;
  ocr_exists: boolean;
  // STEP 10
  visual_captions_preview?: string;
  visual_caption_count?: number;
  has_visual_understanding?: boolean;
  // STEP 12.5
  instagram_caption?: string;
  hashtags?: string[];
  has_caption?: boolean;
  caption_length?: number;
};

type Analytics = {
  total_searches: number;
  avg_similarity: number;
  relevant_count: number;
  not_relevant_count: number;
  success_rate: number;
  failed_searches: number;
  most_common_queries: { query: string; count: number }[];
  top_queries: { query: string; score: number }[];
  worst_queries: { query: string; score: number }[];
};

const BASE = "http://localhost:8000/downloads";
const API = "http://localhost:8000";

// ---------------------------------------------------------------------------
// TranscriptBox — collapsible full-text viewer
// ---------------------------------------------------------------------------
const PREVIEW_LIMIT = 300;

function TranscriptBox({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = text.length > PREVIEW_LIMIT;
  const displayed = expanded || !isLong ? text : text.slice(0, PREVIEW_LIMIT) + "…";

  return (
    <div>
      <p className="transcript-text">{displayed}</p>
      {isLong && (
        <button className="transcript-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less ▲" : "Show full transcript ▼"}
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ScoreBar — CSS-only similarity score visualization
// ---------------------------------------------------------------------------
function ScoreBar({ score }: { score: number }) {
  const pct = Math.round(score * 100);
  const color = pct >= 75 ? "#1a6a3a" : pct >= 50 ? "#b07d10" : "#b71c1c";
  return (
    <div className="score-bar-wrap">
      <div className="score-bar-track">
        <div
          className="score-bar-fill"
          style={{ width: `${pct}%`, background: color }}
        />
      </div>
      <span className="score-bar-label" style={{ color }}>
        {pct}% match
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 9 — RelevanceBadge
// ---------------------------------------------------------------------------
function RelevanceBadge({ label }: { label: "HIGH" | "MEDIUM" | "LOW" }) {
  const styles: Record<string, { bg: string; color: string; border: string }> = {
    HIGH:   { bg: "rgba(34,197,94,0.15)",  color: "#16a34a", border: "1px solid rgba(34,197,94,0.4)" },
    MEDIUM: { bg: "rgba(234,179,8,0.15)",  color: "#ca8a04", border: "1px solid rgba(234,179,8,0.4)" },
    LOW:    { bg: "rgba(249,115,22,0.15)", color: "#ea580c", border: "1px solid rgba(249,115,22,0.4)" },
  };
  const s = styles[label] ?? styles.LOW;
  return (
    <span style={{
      display: "inline-flex", alignItems: "center", gap: "4px",
      padding: "2px 8px", borderRadius: "999px", fontSize: "0.72rem",
      fontWeight: 700, letterSpacing: "0.05em",
      background: s.bg, color: s.color, border: s.border,
    }}>
      {label === "HIGH" ? "● HIGH" : label === "MEDIUM" ? "◑ MEDIUM" : "○ LOW"}
    </span>
  );
}

// ---------------------------------------------------------------------------
// STEP 9 — AiReasoningPanel
// ---------------------------------------------------------------------------
function AiReasoningPanel({ reason, position }: { reason: string; position?: number }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="ai-reasoning-panel">
      <button className="ai-reasoning-toggle" onClick={() => setOpen((v) => !v)}>
        🤖 AI Search Reasoning {open ? "▲" : "▼"}
        {position !== undefined && <span className="ai-rank-badge">Rank #{position}</span>}
      </button>
      {open && (
        <div className="ai-reasoning-body">
          <p className="ai-reasoning-text">{reason}</p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 10 — VisualCaptionsPanel
// ---------------------------------------------------------------------------
function VisualCaptionsPanel({
  captionsText,
  count,
}: {
  captionsText: string;
  count: number;
}) {
  if (!captionsText || count === 0) return null;
  // Take up to 2 unique captions for preview
  const captions = Array.from(new Set(
    captionsText.split(".").map((c) => c.trim()).filter(Boolean)
  )).slice(0, 2);

  return (
    <div className="visual-captions-panel">
      <span className="visual-captions-badge">🎬 Visual Understanding Detected</span>
      <div className="visual-captions-list">
        {captions.map((c, i) => (
          <span key={i} className="visual-caption-item">"{c}"</span>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 11 — VisualSemanticMatchPanel
// ---------------------------------------------------------------------------
function VisualSemanticMatchPanel({
  clipScore,
  hasClipMatch,
}: {
  clipScore: number;
  hasClipMatch: boolean;
}) {
  if (!hasClipMatch || clipScore <= 0.1) return null;
  const pct = Math.round(clipScore * 100);
  const isStrong = clipScore >= 0.3;
  return (
    <div className="clip-match-panel">
      <div className="clip-match-header">
        <span className="clip-match-badge">🎯 Visual Semantic Match</span>
        <span className="clip-match-pct">{pct}%</span>
      </div>
      {isStrong && (
        <span className="clip-matched-pill">Matched via visual understanding</span>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 12.5 — HashtagChips
// ---------------------------------------------------------------------------
function HashtagChips({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="hashtag-chips">
      {tags.slice(0, 10).map((t) => (
        <span key={t} className="hashtag-chip">#{t}</span>
      ))}
    </div>
  );
}

// ---------------------------------------------------------------------------
// STEP 12.5 — InstagramCaptionPanel
// ---------------------------------------------------------------------------
const CAPTION_PREVIEW_LIMIT = 150;

function InstagramCaptionPanel({ caption, hashtags }: { caption: string; hashtags?: string[] }) {
  const [expanded, setExpanded] = useState(false);
  if (!caption || caption.length < 4) return null;
  const isLong = caption.length > CAPTION_PREVIEW_LIMIT;
  const displayed = expanded || !isLong ? caption : caption.slice(0, CAPTION_PREVIEW_LIMIT) + "…";
  return (
    <div className="caption-panel">
      <div className="caption-panel-header">
        <span className="caption-ig-badge">📸 Instagram Caption</span>
      </div>
      <p className="caption-text">{displayed}</p>
      {isLong && (
        <button className="caption-toggle" onClick={() => setExpanded((v) => !v)}>
          {expanded ? "Show less ▲" : "Show full caption ▼"}
        </button>
      )}
      {hashtags && hashtags.length > 0 && <HashtagChips tags={hashtags} />}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function formatDate(ts: number): string {
  if (!ts) return "Unknown";
  return new Date(ts * 1000).toLocaleString();
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------
export default function Home() {
  // --- Download state ---
  const [url, setUrl] = useState("");
  const [processing, setProcessing] = useState(false);
  const [currentStep, setCurrentStep] = useState(-1);
  const [downloadResult, setDownloadResult] = useState<DownloadResult | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // --- Search state (Section 2) ---
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchError, setSearchError] = useState("");
  // STEP 9 — LLM search meta
  const [searchRewrittenQuery, setSearchRewrittenQuery] = useState("");
  const [searchLlmWarning, setSearchLlmWarning] = useState<string | null>(null);
  const [searchLlmRejected, setSearchLlmRejected] = useState(0);
  const [searchEmptyReason, setSearchEmptyReason] = useState("");

  // --- Library state ---
  const [library, setLibrary] = useState<LibraryReel[]>([]);
  const [libraryLoading, setLibraryLoading] = useState(false);
  const [libraryError, setLibraryError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [reindexingId, setReindexingId] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState("");

  // --- Evaluation state (Section 4) ---
  const [evalQuery, setEvalQuery] = useState("");
  const [evalSearching, setEvalSearching] = useState(false);
  const [evalResults, setEvalResults] = useState<SearchResult[]>([]);
  const [evalError, setEvalError] = useState("");
  const [evalSearchId, setEvalSearchId] = useState("");
  const [evalTime, setEvalTime] = useState("");
  const [feedback, setFeedback] = useState<Record<string, "relevant" | "not_relevant">>({}); 
  const [showDebug, setShowDebug] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(false);
  // STEP 9 — LLM eval meta
  const [evalRewrittenQuery, setEvalRewrittenQuery] = useState("");
  const [evalLlmWarning, setEvalLlmWarning] = useState<string | null>(null);
  const [evalLlmRejected, setEvalLlmRejected] = useState(0);
  const [evalEmptyReason, setEvalEmptyReason] = useState("");
  const [evalLlmActive, setEvalLlmActive] = useState(false);
  const [evalLlmTimeMs, setEvalLlmTimeMs] = useState(0);

  // STEP 12 — RAG Chat state
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatResponse, setChatResponse] = useState<ChatResponse | null>(null);
  const [chatError, setChatError] = useState("");

  // ---------------------------------------------------------------------------
  // Load library
  // ---------------------------------------------------------------------------
  const loadLibrary = useCallback(async () => {
    setLibraryLoading(true);
    setLibraryError("");
    try {
      const res = await fetch(`${API}/library`);
      const data = await res.json();
      if (!res.ok) setLibraryError(data.detail || "Failed to load library.");
      else setLibrary(data.reels || []);
    } catch {
      setLibraryError("Network error — is the backend running on port 8000?");
    } finally {
      setLibraryLoading(false);
    }
  }, []);

  // ---------------------------------------------------------------------------
  // Load analytics
  // ---------------------------------------------------------------------------
  const loadAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const res = await fetch(`${API}/search-analytics`);
      const data = await res.json();
      if (res.ok) setAnalytics(data);
    } catch {
      // silently fail
    } finally {
      setAnalyticsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadLibrary();
    loadAnalytics();
  }, [loadLibrary, loadAnalytics]);

  // ---------------------------------------------------------------------------
  // Step simulation
  // ---------------------------------------------------------------------------
  function startStepSimulation() {
    let step = 0;
    setCurrentStep(0);
    timerRef.current = setInterval(() => {
      step += 1;
      if (step <= 6) setCurrentStep(step);
      else if (timerRef.current) clearInterval(timerRef.current);
    }, 4000);
  }

  function stopSimulation(success: boolean) {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentStep(success ? 7 : -1);
  }

  // ---------------------------------------------------------------------------
  // STEP 12 — sendChatMessage
  // ---------------------------------------------------------------------------
  async function sendChatMessage(msg?: string) {
    const message = (msg ?? chatInput).trim();
    if (!message) return;
    setChatError("");
    setChatResponse(null);
    setChatLoading(true);
    try {
      const res = await fetch(`${API}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message }),
      });
      const data: ChatResponse & { detail?: string } = await res.json();
      if (!res.ok) setChatError(data.detail || "Chat request failed.");
      else setChatResponse(data);
    } catch {
      setChatError("Network error — is the backend running on port 8000?");
    } finally {
      setChatLoading(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Download handler
  // ---------------------------------------------------------------------------
  async function handleDownload(e: React.FormEvent) {
    e.preventDefault();
    if (!url.trim()) { setDownloadError("Please enter an Instagram reel URL."); return; }

    setDownloadError("");
    setDownloadResult(null);
    setProcessing(true);
    startStepSimulation();

    try {
      const res = await fetch(`${API}/download`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url: url.trim() }),
      });
      const data = await res.json();
      if (!res.ok) { stopSimulation(false); setDownloadError(data.detail || "Download failed."); }
      else { stopSimulation(true); setDownloadResult(data); loadLibrary(); }
    } catch {
      stopSimulation(false);
      setDownloadError("Network error — is the backend running on port 8000?");
    } finally {
      setProcessing(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Search handler (Section 2)
  // ---------------------------------------------------------------------------
  async function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) { setSearchError("Please enter a search query."); return; }

    setSearchError("");
    setSearchResults([]);
    setSearchRewrittenQuery("");
    setSearchLlmWarning(null);
    setSearchLlmRejected(0);
    setSearchEmptyReason("");
    setSearching(true);

    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data: SearchResponse & { detail?: string } = await res.json();
      if (!res.ok) setSearchError(data.detail || "Search failed.");
      else {
        setSearchResults(data.results || []);
        setSearchRewrittenQuery(data.rewritten_query || "");
        setSearchLlmWarning(data.llm_warning || null);
        setSearchLlmRejected(data.llm_rejected || 0);
        setSearchEmptyReason(data.empty_reason || "");
        if ((data.results || []).length === 0) {
          setSearchError(data.empty_reason || "No matching reels found.");
        }
      }
    } catch {
      setSearchError("Network error — is the backend running on port 8000?");
    } finally {
      setSearching(false);
    }
  }

  // ---------------------------------------------------------------------------
  // Eval search handler (Section 4)
  // ---------------------------------------------------------------------------
  async function runEvalSearch(q: string) {
    const trimmed = q.trim();
    if (!trimmed) return;

    setEvalQuery(trimmed);
    setEvalError("");
    setEvalResults([]);
    setEvalSearchId("");
    setEvalTime("");
    setFeedback({});
    setEvalRewrittenQuery("");
    setEvalLlmWarning(null);
    setEvalLlmRejected(0);
    setEvalEmptyReason("");
    setEvalLlmActive(false);
    setEvalLlmTimeMs(0);
    setEvalSearching(true);

    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: trimmed }),
      });
      const data: SearchResponse & { detail?: string } = await res.json();
      if (!res.ok) {
        setEvalError(data.detail || "Search failed.");
      } else {
        setEvalResults(data.results || []);
        setEvalSearchId(data.search_id || "");
        setEvalTime(`${(data.execution_time_ms / 1000).toFixed(2)}s`);
        setEvalRewrittenQuery(data.rewritten_query || "");
        setEvalLlmWarning(data.llm_warning || null);
        setEvalLlmRejected(data.llm_rejected || 0);
        setEvalEmptyReason(data.empty_reason || "");
        setEvalLlmActive(data.llm_active || false);
        setEvalLlmTimeMs(data.llm_time_ms || 0);
        if ((data.results || []).length === 0) {
          setEvalError(data.empty_reason || "No meaningful semantic match found.");
        }
        loadAnalytics();
      }
    } catch {
      setEvalError("Network error — is the backend running on port 8000?");
    } finally {
      setEvalSearching(false);
    }
  }

  async function handleEvalSearch(e: React.FormEvent) {
    e.preventDefault();
    await runEvalSearch(evalQuery);
  }

  // ---------------------------------------------------------------------------
  // Feedback handler
  // ---------------------------------------------------------------------------
  async function handleFeedback(reelId: string, fb: "relevant" | "not_relevant") {
    if (!evalSearchId) return;

    setFeedback((prev) => ({ ...prev, [reelId]: fb }));

    try {
      await fetch(`${API}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ search_id: evalSearchId, reel_id: reelId, feedback: fb }),
      });
      loadAnalytics();
    } catch {
      // silently fail — feedback is already shown optimistically
    }
  }

  // ---------------------------------------------------------------------------
  // Delete / Re-index handlers
  // ---------------------------------------------------------------------------
  async function handleDelete(reel: LibraryReel) {
    if (!window.confirm(`Delete reel "${reel.id}"?\n\nThis will permanently remove the video, audio, transcript, and embedding.`)) return;

    setDeletingId(reel.id);
    setActionMsg("");

    try {
      const res = await fetch(`${API}/delete/${reel.id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) setActionMsg(`❌ Delete failed: ${data.detail || "Unknown error."}`);
      else { setActionMsg(`✅ Reel "${reel.id}" deleted successfully.`); loadLibrary(); }
    } catch {
      setActionMsg("❌ Network error during delete.");
    } finally {
      setDeletingId(null);
    }
  }

  async function handleReindex(reel: LibraryReel) {
    setReindexingId(reel.id);
    setActionMsg("");

    try {
      const res = await fetch(`${API}/reindex/${reel.id}`, { method: "POST" });
      const data = await res.json();
      if (!res.ok) setActionMsg(`❌ Re-index failed: ${data.detail || "Unknown error."}`);
      else { setActionMsg(`✅ Re-index completed for "${reel.id}".`); loadLibrary(); }
    } catch {
      setActionMsg("❌ Network error during re-index.");
    } finally {
      setReindexingId(null);
    }
  }

  // ---------------------------------------------------------------------------
  // Step icon
  // ---------------------------------------------------------------------------
  function stepIcon(index: number) {
    if (currentStep === -1) return "⬜";
    if (index < currentStep) return "✅";
    if (index === currentStep) return "⏳";
    return "⬜";
  }

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  return (
    <main className="container">
      <h1>Reel Saver AI</h1>
      <p className="subtitle">Download · Transcribe · Search Instagram Reels locally.</p>

      {/* ================================================================
          SECTION 1: Download
      ================================================================ */}
      <section className="section">
        <h2>Download a Reel</h2>
        <form onSubmit={handleDownload} className="form">
          <input
            id="reel-url"
            type="text"
            placeholder="https://www.instagram.com/reels/..."
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={processing}
            className="input"
          />
          <button id="download-btn" type="submit" disabled={processing} className="btn">
            {processing ? "Processing..." : "Download"}
          </button>
        </form>

        {downloadError && <div className="error-box">❌ {downloadError}</div>}

        {(processing || currentStep >= 0) && (
          <div className="steps-box">
            <h3>Processing Status</h3>
            <ul className="steps-list">
              {STEPS.map((label, i) => (
                <li key={i} className="step-item">
                  <span className="step-icon">{stepIcon(i)}</span>
                  <span className={i === currentStep ? "step-label active" : "step-label"}>{label}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {downloadResult && (
          <div id="download-results" className="results-box">
            <h3>Saved Files</h3>
            <table className="file-table">
              <tbody>
                <tr><td className="file-label">Video</td><td><code>{downloadResult.video_filename}</code></td></tr>
                <tr><td className="file-label">Audio</td><td><code>{downloadResult.audio_filename}</code></td></tr>
                <tr><td className="file-label">Transcript</td><td><code>{downloadResult.transcript_filename}</code></td></tr>
                <tr>
                  <td className="file-label">OCR</td>
                  <td>
                    {downloadResult.ocr_success
                      ? <><span className="badge badge-ocr">✔ OCR detected</span> <code>{downloadResult.ocr_filename}</code></>
                      : <span className="badge badge-ocr-none">— No on-screen text detected</span>}
                  </td>
                </tr>
              </tbody>
            </table>
            {downloadResult.ocr_success && downloadResult.ocr_text_preview && (
              <div className="media-section">
                <h3>OCR Extracted Text</h3>
                <TranscriptBox text={downloadResult.ocr_text_preview} />
              </div>
            )}
            {/* STEP 12.5 — Instagram caption */}
            {downloadResult.has_caption && downloadResult.instagram_caption && (
              <div className="media-section">
                <InstagramCaptionPanel
                  caption={downloadResult.instagram_caption}
                  hashtags={downloadResult.hashtags}
                />
              </div>
            )}
            {/* STEP 10 — Visual understanding */}
            {downloadResult.has_visual_understanding && downloadResult.visual_captions.length > 0 && (
              <div className="media-section">
                <VisualCaptionsPanel
                  captionsText={downloadResult.visual_captions.join(". ")}
                  count={downloadResult.visual_caption_count}
                />
              </div>
            )}
            <div className="media-section">
              <h3>Video Preview</h3>
              <video controls src={`${BASE}/${downloadResult.video_filename}`} className="video-player" />
            </div>
            <div className="media-section">
              <h3>Audio Preview</h3>
              <audio controls src={`${BASE}/audio/${downloadResult.audio_filename}`} className="audio-player" />
            </div>
            <div className="media-section">
              <h3>Transcript</h3>
              <TranscriptBox text={downloadResult.transcript_preview} />
            </div>
          </div>
        )}
      </section>

      {/* ================================================================
          SECTION 2: Semantic Search
      ================================================================ */}
      <section className="section">
        <h2>Search Saved Reels</h2>
        <form onSubmit={handleSearch} className="form">
          <input
            id="search-query"
            type="text"
            placeholder="e.g. discipline and dopamine detox"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            disabled={searching}
            className="input"
          />
          <button id="search-btn" type="submit" disabled={searching} className="btn btn-search">
            {searching ? "Searching…" : "Search"}
          </button>
        </form>

        {/* STEP 9 — Rewritten query display */}
        {searchRewrittenQuery && searchRewrittenQuery !== query && (
          <div className="rewritten-query-box">
            <span className="rewritten-label">🧠 AI expanded query:</span>
            <span className="rewritten-text">{searchRewrittenQuery}</span>
          </div>
        )}

        {/* STEP 9 — LLM warning */}
        {searchLlmWarning && (
          <div className="llm-warning-box">⚠️ {searchLlmWarning}</div>
        )}

        {/* STEP 9 — All-rejected empty state */}
        {searchEmptyReason && searchResults.length === 0 && (
          <div className="llm-empty-state">
            <span className="llm-empty-icon">🔍</span>
            <p>No meaningful semantic memory found for this query.</p>
            <p className="llm-empty-sub">{searchEmptyReason}</p>
          </div>
        )}

        {searchError && !searchEmptyReason && <div className="error-box">❌ {searchError}</div>}

        {searchResults.length > 0 && (
          <div id="search-results">
            <h3 className="results-heading">Top Results</h3>
            {searchResults.map((r, idx) => (
              <div key={r.id} className="search-card">
                <div className="search-card-header">
                  <span className="search-id">{r.id}</span>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    {r.relevance_label && <RelevanceBadge label={r.relevance_label} />}
                    <span className="search-score">Score: <strong>{(r.similarity_score * 100).toFixed(1)}%</strong></span>
                  </div>
                </div>
                {r.llm_reason && <AiReasoningPanel reason={r.llm_reason} position={idx + 1} />}
                {/* STEP 12.5 — Instagram caption */}
                {r.has_caption && r.instagram_caption_preview && (
                  <InstagramCaptionPanel caption={r.instagram_caption_preview} hashtags={r.hashtags} />
                )}
                {/* STEP 10 — Visual understanding */}
                {r.has_visual_understanding && r.visual_captions_preview && (
                  <VisualCaptionsPanel captionsText={r.visual_captions_preview} count={r.visual_caption_count ?? 0} />
                )}
                {/* STEP 11 — CLIP visual semantic match */}
                {r.has_clip_match && (
                  <VisualSemanticMatchPanel clipScore={r.clip_score ?? 0} hasClipMatch={r.has_clip_match} />
                )}
                <video controls src={`${BASE}/${r.video_filename}`} className="video-player" />
                <TranscriptBox text={r.transcript_preview} />
                {r.original_url && (
                  <a href={r.original_url} target="_blank" rel="noopener noreferrer" className="original-link">
                    View original reel ↗
                  </a>
                )}
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ================================================================
          SECTION 2.5: AI REEL MEMORY CHAT (STEP 12)
      ================================================================ */}
      <section className="section chat-section">
        <h2 className="chat-heading">🤖 AI Reel Memory Chat</h2>
        <p className="section-desc">Ask questions about your saved reels. The AI will retrieve and synthesize insights from your reel library.</p>

        {/* Suggested prompts */}
        <div className="chat-suggestions">
          {[
            "Summarize my motivational reels",
            "What do my reels teach about discipline?",
            "Show spiritual themes",
            "Find consistency advice",
            "What mindset patterns appear?",
            "Summarize gym motivation reels",
          ].map((prompt) => (
            <button
              key={prompt}
              className="chat-suggestion-btn"
              disabled={chatLoading}
              onClick={() => { setChatInput(prompt); sendChatMessage(prompt); }}
            >
              {prompt}
            </button>
          ))}
        </div>

        {/* Chat input */}
        <form
          className="chat-form"
          onSubmit={(e) => { e.preventDefault(); sendChatMessage(); }}
        >
          <input
            id="chat-input"
            type="text"
            className="chat-input"
            placeholder="Ask about your reel library…"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            disabled={chatLoading}
          />
          <button
            id="chat-send-btn"
            type="submit"
            className="btn chat-send-btn"
            disabled={chatLoading || !chatInput.trim()}
          >
            {chatLoading ? "Thinking…" : "Ask AI"}
          </button>
        </form>

        {/* Error */}
        {chatError && <div className="error-box">❌ {chatError}</div>}

        {/* Loading state */}
        {chatLoading && (
          <div className="chat-thinking">
            <div className="chat-thinking-dots">
              <span /><span /><span />
            </div>
            <p className="chat-thinking-text">🤖 Thinking through your reel memory…</p>
          </div>
        )}

        {/* Chat response */}
        {chatResponse && !chatLoading && (
          <div className="chat-response-box">
            {/* Timing pills */}
            <div className="chat-timing-row">
              <span className="chat-timing-pill">⏱ {chatResponse.execution_time_ms}ms total</span>
              {chatResponse.llm_time_ms > 0 && (
                <span className="chat-timing-pill chat-timing-llm">🧠 {chatResponse.llm_time_ms}ms LLM</span>
              )}
              {chatResponse.retrieved_count > 0 && (
                <span className="chat-timing-pill chat-timing-reels">📼 {chatResponse.retrieved_count} reels used</span>
              )}
            </div>

            {/* Rewritten query */}
            {chatResponse.rewritten_query && chatResponse.rewritten_query !== chatInput && (
              <div className="rewritten-query-box" style={{ marginBottom: "12px" }}>
                <span className="rewritten-label">🧠 AI expanded:</span>
                <span className="rewritten-text">{chatResponse.rewritten_query}</span>
              </div>
            )}

            {/* Warning */}
            {chatResponse.warning && (
              <div className="chat-warning-banner">⚠️ {chatResponse.warning}</div>
            )}

            {/* AI Answer bubble */}
            <div className="chat-answer-bubble">
              <div className="chat-answer-header">
                <span className="chat-ai-badge">🤖 ReelSearchAI</span>
              </div>
              <div className="chat-answer-body">
                {chatResponse.answer.split("\n").map((line, i) => (
                  <p key={i} className="chat-answer-line">{line}</p>
                ))}
              </div>
            </div>

            {/* Source reel cards */}
            {chatResponse.sources.length > 0 && (
              <div className="chat-sources-panel">
                <p className="chat-sources-title">📌 Source Reels</p>
                <div className="chat-sources-grid">
                  {chatResponse.sources.map((src) => {
                    const rel = src.relevance ?? "MEDIUM";
                    const relColors: Record<string, { bg: string; color: string; border: string }> = {
                      HIGH:   { bg: "rgba(34,197,94,0.12)",  color: "#16a34a", border: "rgba(34,197,94,0.4)" },
                      MEDIUM: { bg: "rgba(234,179,8,0.12)",  color: "#ca8a04", border: "rgba(234,179,8,0.4)" },
                      LOW:    { bg: "rgba(249,115,22,0.12)", color: "#ea580c", border: "rgba(249,115,22,0.4)" },
                    };
                    const rc = relColors[rel] ?? relColors.MEDIUM;
                    return (
                      <div key={src.reel_id} className="chat-source-card">
                        <div className="chat-source-card-header">
                          <code className="chat-source-id">{src.reel_id}</code>
                          <span
                            className="chat-relevance-badge"
                            style={{ background: rc.bg, color: rc.color, border: `1px solid ${rc.border}` }}
                          >
                            {rel === "HIGH" ? "● HIGH" : rel === "MEDIUM" ? "◑ MED" : "○ LOW"}
                          </span>
                        </div>
                        <div className="chat-source-score">
                          Match: <strong>{Math.round(src.score * 100)}%</strong>
                        </div>
                        {src.reason && (
                          <p className="chat-source-reason">{src.reason}</p>
                        )}
                        {src.video_path && (
                          <video
                            controls
                            src={`${BASE}/${src.video_path}`}
                            className="video-player chat-source-video"
                          />
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Empty state */}
            {chatResponse.sources.length === 0 && (
              <div className="chat-empty-state">
                <span>🔍</span>
                <p>No meaningful reel memory found.</p>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ================================================================
          SECTION 3: Saved Reels Library
      ================================================================ */}
      <section className="section">
        <div className="library-header">
          <h2>Saved Reels Library</h2>
          <button id="refresh-library-btn" className="btn btn-sm btn-refresh" onClick={loadLibrary} disabled={libraryLoading}>
            {libraryLoading ? "Loading..." : "↻ Refresh"}
          </button>
        </div>

        {libraryError && <div className="error-box">❌ {libraryError}</div>}
        {actionMsg && <div className={actionMsg.startsWith("✅") ? "success-box" : "error-box"}>{actionMsg}</div>}
        {!libraryLoading && library.length === 0 && !libraryError && (
          <div className="empty-state">No saved reels yet.</div>
        )}

        {library.map((reel) => (
          <div key={reel.id} className="library-card">
            <div className="library-card-header">
              <span className="library-reel-id">{reel.id}</span>
              <span className="library-timestamp">{formatDate(reel.timestamp)}</span>
            </div>
            <div className="file-status-row">
              <span className={`badge ${reel.video_exists ? "badge-ok" : "badge-missing"}`}>{reel.video_exists ? "✔ Video" : "✘ Video missing"}</span>
              <span className={`badge ${reel.audio_exists ? "badge-ok" : "badge-missing"}`}>{reel.audio_exists ? "✔ Audio" : "✘ Audio missing"}</span>
              <span className={`badge ${reel.transcript_exists ? "badge-ok" : "badge-missing"}`}>{reel.transcript_exists ? "✔ Transcript" : "✘ Transcript missing"}</span>
              {reel.ocr_success
                ? <span className="badge badge-ocr">👁 OCR text</span>
                : <span className="badge badge-ocr-none">— No OCR</span>}
            </div>
            {reel.ocr_success && reel.ocr_text_preview && (
              <div className="ocr-preview-row">
                <span className="ocr-label">OCR:</span>
                <span className="ocr-preview-text">{reel.ocr_text_preview.slice(0, 120)}{reel.ocr_text_preview.length > 120 ? "…" : ""}</span>
              </div>
            )}
            {/* STEP 12.5 — Instagram caption */}
            {reel.has_caption && reel.instagram_caption && (
              <InstagramCaptionPanel caption={reel.instagram_caption} hashtags={reel.hashtags} />
            )}
            {/* STEP 10 — Visual understanding */}
            {reel.has_visual_understanding && reel.visual_captions_preview && (
              <VisualCaptionsPanel captionsText={reel.visual_captions_preview} count={reel.visual_caption_count ?? 0} />
            )}
            {reel.video_exists && reel.video_filename && (
              <video controls src={`${BASE}/${reel.video_filename}`} className="video-player" />
            )}
            {reel.transcript_preview && <TranscriptBox text={reel.transcript_preview} />}
            {reel.original_url && (
              <a href={reel.original_url} target="_blank" rel="noopener noreferrer" className="original-link">View original reel ↗</a>
            )}
            <div className="library-actions">
              <button id={`reindex-btn-${reel.id}`} className="btn btn-sm btn-reindex" onClick={() => handleReindex(reel)} disabled={reindexingId === reel.id || deletingId === reel.id}>
                {reindexingId === reel.id ? "Re-indexing..." : "↺ Re-index"}
              </button>
              <button id={`delete-btn-${reel.id}`} className="btn btn-sm btn-delete" onClick={() => handleDelete(reel)} disabled={deletingId === reel.id || reindexingId === reel.id}>
                {deletingId === reel.id ? "Deleting..." : "🗑 Delete"}
              </button>
            </div>
          </div>
        ))}
      </section>

      {/* ================================================================
          SECTION 4: Search Evaluation Dashboard
      ================================================================ */}
      <section className="section">
        <h2>Search Evaluation Dashboard</h2>
        <p className="section-desc">Test semantic retrieval quality. Mark results as Relevant or Not Relevant to measure how well the AI memory works.</p>

        {/* Eval search form */}
        <form onSubmit={handleEvalSearch} className="form">
          <input
            id="eval-query"
            type="text"
            placeholder="e.g. discipline wala reel, motivational guy..."
            value={evalQuery}
            onChange={(e) => setEvalQuery(e.target.value)}
            disabled={evalSearching}
            className="input"
          />
          <button id="eval-search-btn" type="submit" disabled={evalSearching} className="btn btn-eval">
            {evalSearching ? "Searching..." : "🔍 Evaluate Search"}
          </button>
        </form>

        {/* English presets */}
        <div className="preset-group">
          <p className="preset-label">English presets</p>
          <div className="preset-row">
            {PRESET_ENGLISH.map((p) => (
              <button key={p} className="preset-btn" onClick={() => runEvalSearch(p)} disabled={evalSearching}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Hinglish presets */}
        <div className="preset-group">
          <p className="preset-label">Hinglish presets</p>
          <div className="preset-row">
            {PRESET_HINGLISH.map((p) => (
              <button key={p} className="preset-btn preset-btn-hinglish" onClick={() => runEvalSearch(p)} disabled={evalSearching}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* OCR presets */}
        <div className="preset-group">
          <p className="preset-label">OCR / caption presets</p>
          <div className="preset-row">
            {PRESET_OCR.map((p) => (
              <button key={p} className="preset-btn preset-btn-ocr" onClick={() => runEvalSearch(p)} disabled={evalSearching}>
                {p}
              </button>
            ))}
          </div>
        </div>

        {/* Timing */}
        {evalTime && (
          <p className="eval-timing">
            ⏱ Search completed in {evalTime}
            {evalLlmActive && evalLlmTimeMs > 0 && (
              <span className="llm-timing-note"> &mdash; LLM reasoning: {(evalLlmTimeMs / 1000).toFixed(1)}s</span>
            )}
          </p>
        )}

        {/* STEP 9 — Rewritten query banner */}
        {evalRewrittenQuery && evalRewrittenQuery !== evalQuery && (
          <div className="rewritten-query-box">
            <span className="rewritten-label">🧠 AI expanded query:</span>
            <span className="rewritten-text">{evalRewrittenQuery}</span>
          </div>
        )}

        {/* STEP 9 — LLM warning */}
        {evalLlmWarning && <div className="llm-warning-box">⚠️ {evalLlmWarning}</div>}

        {/* STEP 9 — LLM rejected stat */}
        {evalLlmActive && evalLlmRejected > 0 && (
          <div className="llm-rejected-note">
            🚫 LLM filtered out <strong>{evalLlmRejected}</strong> irrelevant result{evalLlmRejected !== 1 ? "s" : ""}
          </div>
        )}

        {/* STEP 9 — All-rejected empty state */}
        {evalEmptyReason && evalResults.length === 0 && !evalError && (
          <div className="llm-empty-state">
            <span className="llm-empty-icon">🔍</span>
            <p>No meaningful semantic memory found for this query.</p>
            <p className="llm-empty-sub">The AI determined none of the retrieved reels were relevant.</p>
          </div>
        )}

        {evalError && <div className="error-box">❌ {evalError}</div>}

        {/* Debug toggle */}
        {evalResults.length > 0 && (
          <div className="debug-toggle-row">
            <button className="transcript-toggle" onClick={() => setShowDebug((v) => !v)}>
              {showDebug ? "Hide debug panel ▲" : "Show debug panel ▼"}
            </button>
          </div>
        )}

        {/* Eval result cards */}
        {evalResults.map((r, idx) => {
          const fb = feedback[r.id];
          return (
            <div key={r.id} className="eval-card">
              <div className="eval-card-header">
                <span className="eval-rank">#{idx + 1}</span>
                <span className="search-id">{r.id}</span>
                {r.relevance_label && <RelevanceBadge label={r.relevance_label} />}
              </div>

              {/* STEP 9 — AI reasoning */}
              {r.llm_reason && <AiReasoningPanel reason={r.llm_reason} position={idx + 1} />}

              {/* STEP 10 — Visual understanding */}
              {r.has_visual_understanding && r.visual_captions_preview && (
                <VisualCaptionsPanel captionsText={r.visual_captions_preview} count={r.visual_caption_count ?? 0} />
              )}
              {/* STEP 11 — CLIP visual semantic match */}
              {r.has_clip_match && (
                <VisualSemanticMatchPanel clipScore={r.clip_score ?? 0} hasClipMatch={r.has_clip_match} />
              )}

              {/* Confidence bar */}
              <ScoreBar score={r.similarity_score} />

              {/* Transcript preview */}
              <TranscriptBox text={r.transcript_preview} />

              {/* Feedback buttons */}
              <div className="feedback-row">
                <span className="feedback-label">Is this relevant?</span>
                <button
                  id={`relevant-btn-${r.id}`}
                  className={`feedback-btn feedback-relevant${fb === "relevant" ? " active" : ""}`}
                  onClick={() => handleFeedback(r.id, "relevant")}
                  disabled={!!fb}
                >
                  ✔ Relevant
                </button>
                <button
                  id={`notrelevant-btn-${r.id}`}
                  className={`feedback-btn feedback-notrelevant${fb === "not_relevant" ? " active" : ""}`}
                  onClick={() => handleFeedback(r.id, "not_relevant")}
                  disabled={!!fb}
                >
                  ✘ Not Relevant
                </button>
                {fb && <span className="feedback-saved">Saved ✓</span>}
              </div>

              {/* OCR info inline */}
              {r.ocr_success && r.ocr_text_preview && (
                <div className="ocr-preview-row">
                  <span className="ocr-label">OCR:</span>
                  <span className="ocr-preview-text">{r.ocr_text_preview.slice(0, 120)}{r.ocr_text_preview.length > 120 ? "…" : ""}</span>
                </div>
              )}

              {/* Debug panel */}
              {showDebug && (
                <div className="debug-panel">
                  <p><strong>Reel ID:</strong> {r.id}</p>
                  <p><strong>Hybrid score:</strong> {r.similarity_score}</p>
                  <p><strong>Text score:</strong> {(r as any).text_score ?? "—"}</p>
                  <p><strong>CLIP score:</strong> {r.clip_score !== undefined ? r.clip_score : "—"}</p>
                  <p><strong>CLIP matched:</strong> {r.has_clip_match ? "✅ Yes" : "No"}</p>
                  <p><strong>Transcript length:</strong> {r.transcript_length} chars</p>
                  <p><strong>Video:</strong> {r.video_filename || "—"}</p>
                  <p><strong>OCR detected:</strong> {r.ocr_success ? "Yes" : "No"}</p>
                  {r.relevance_label && <p><strong>LLM label:</strong> {r.relevance_label}</p>}
                  {r.reranked_position !== undefined && <p><strong>Original AI Rank:</strong> #{r.reranked_position}</p>}
                </div>
              )}
            </div>
          );
        })}

        {/* ================================================================
            Analytics Summary
        ================================================================ */}
        <div className="analytics-panel">
          <div className="analytics-header">
            <h3>Search Quality Summary</h3>
            <button className="btn btn-sm btn-refresh" onClick={loadAnalytics} disabled={analyticsLoading}>
              {analyticsLoading ? "..." : "↻"}
            </button>
          </div>

          {analytics && (
            <>
              <div className="analytics-stats">
                <div className="stat-box">
                  <span className="stat-value">{analytics.total_searches}</span>
                  <span className="stat-label">Total searches</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{(analytics.avg_similarity * 100).toFixed(1)}%</span>
                  <span className="stat-label">Avg similarity</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{analytics.relevant_count}</span>
                  <span className="stat-label">Marked relevant</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{analytics.not_relevant_count}</span>
                  <span className="stat-label">Not relevant</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{analytics.success_rate}%</span>
                  <span className="stat-label">Relevance rate</span>
                </div>
                <div className="stat-box">
                  <span className="stat-value">{analytics.failed_searches}</span>
                  <span className="stat-label">Failed searches</span>
                </div>
              </div>

              {analytics.most_common_queries.length > 0 && (
                <div className="analytics-section">
                  <p className="analytics-section-title">Most searched</p>
                  {analytics.most_common_queries.map((q) => (
                    <div key={q.query} className="analytics-row">
                      <span className="analytics-query">"{q.query}"</span>
                      <span className="analytics-count">×{q.count}</span>
                    </div>
                  ))}
                </div>
              )}

              {analytics.top_queries.length > 0 && (
                <div className="analytics-section">
                  <p className="analytics-section-title">Top performing queries</p>
                  {analytics.top_queries.map((q) => (
                    <div key={q.query} className="analytics-row">
                      <span className="analytics-query">"{q.query}"</span>
                      <span className="analytics-score analytics-score-good">{q.score}% relevant</span>
                    </div>
                  ))}
                </div>
              )}

              {analytics.worst_queries.length > 0 && (
                <div className="analytics-section">
                  <p className="analytics-section-title">Needs improvement</p>
                  {analytics.worst_queries.map((q) => (
                    <div key={q.query} className="analytics-row">
                      <span className="analytics-query">"{q.query}"</span>
                      <span className="analytics-score analytics-score-bad">{q.score}% relevant</span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}

          {!analytics && !analyticsLoading && (
            <p className="empty-state">No searches recorded yet. Run some evaluation searches above.</p>
          )}
        </div>
      </section>
    </main>
  );
}
