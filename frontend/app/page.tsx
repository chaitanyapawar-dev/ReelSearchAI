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
  "Saving transcript",
  "Storing embedding",
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
};

type SearchResult = {
  id: string;
  similarity_score: number;
  video_filename: string;
  transcript_preview: string;
  transcript_length: number;
  original_url: string;
};

type SearchResponse = {
  search_id: string;
  execution_time_ms: number;
  results: SearchResult[];
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
      if (step <= 5) setCurrentStep(step);
      else if (timerRef.current) clearInterval(timerRef.current);
    }, 4000);
  }

  function stopSimulation(success: boolean) {
    if (timerRef.current) clearInterval(timerRef.current);
    setCurrentStep(success ? 6 : -1);
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
    setSearching(true);

    try {
      const res = await fetch(`${API}/search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query: query.trim() }),
      });
      const data = await res.json();
      if (!res.ok) setSearchError(data.detail || "Search failed.");
      else {
        setSearchResults(data.results || []);
        if ((data.results || []).length === 0) setSearchError("No matching reels found.");
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
        if ((data.results || []).length === 0) {
          setEvalError("No meaningful semantic match found.");
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
              </tbody>
            </table>
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
            {searching ? "Searching..." : "Search"}
          </button>
        </form>

        {searchError && <div className="error-box">❌ {searchError}</div>}

        {searchResults.length > 0 && (
          <div id="search-results">
            <h3 className="results-heading">Top Results</h3>
            {searchResults.map((r) => (
              <div key={r.id} className="search-card">
                <div className="search-card-header">
                  <span className="search-id">{r.id}</span>
                  <span className="search-score">Score: <strong>{(r.similarity_score * 100).toFixed(1)}%</strong></span>
                </div>
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
            </div>
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

        {/* Timing */}
        {evalTime && (
          <p className="eval-timing">⏱ Search completed in {evalTime}</p>
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
              </div>

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

              {/* Debug panel */}
              {showDebug && (
                <div className="debug-panel">
                  <p><strong>Reel ID:</strong> {r.id}</p>
                  <p><strong>Raw similarity:</strong> {r.similarity_score}</p>
                  <p><strong>Transcript length:</strong> {r.transcript_length} chars</p>
                  <p><strong>Video:</strong> {r.video_filename || "—"}</p>
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
