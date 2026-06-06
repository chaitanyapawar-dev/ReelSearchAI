// frontend/lib/api.ts – Central API layer with typed contracts
// All frontend data fetching flows through this module.
// Backend is the single source of truth for all response shapes.

import { fetchWithRetry, apiFetch } from "@/lib/fetcher";

// ─── API Base URL ────────────────────────────────────────────────────────────
export const API_BASE =
  process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

// ─── Typed Fetch Helpers ─────────────────────────────────────────────────────
async function get<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchWithRetry<T>(`${API_BASE}${path}`, { method: "GET", signal });
}

async function post<T>(path: string, body: any, signal?: AbortSignal, timeoutMs?: number): Promise<T> {
  return fetchWithRetry<T>(`${API_BASE}${path}`, { method: "POST", body, signal, timeoutMs });
}

async function del<T>(path: string, signal?: AbortSignal): Promise<T> {
  return fetchWithRetry<T>(`${API_BASE}${path}`, { method: "DELETE", signal });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SSE EVENT CONTRACT
// ═══════════════════════════════════════════════════════════════════════════════

export interface SSEJobStatePayload {
  status: string;
  stage: string;
  progress: number;
  error?: string | null;
  result?: Record<string, unknown>;
  queue_position: number;
}

export interface SSELogAppendPayload {
  msg: string;
  level: "INFO" | "WARN" | "ERROR" | "DEBUG";
  timestamp: string;
}

export interface SSEErrorPayload {
  message: string;
  code?: string;
}

export type SSEEvent =
  | { type: "job_state"; job_id: string; timestamp: string; payload: SSEJobStatePayload }
  | { type: "log_append"; job_id: string; timestamp: string; payload: SSELogAppendPayload }
  | { type: "heartbeat"; job_id: string; timestamp: string; payload: Record<string, never> }
  | { type: "error"; job_id: string; timestamp: string; payload: SSEErrorPayload };

// ═══════════════════════════════════════════════════════════════════════════════
// SHARED RESPONSE TYPES
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Jobs ────────────────────────────────────────────────────────────────────
export interface JobLog {
  timestamp: string;
  msg: string;
  level?: "INFO" | "WARN" | "ERROR" | "DEBUG";
}

export interface Job {
  job_id: string;
  url?: string;
  status: string;
  stage: string;
  progress: number;
  logs?: JobLog[];
  error?: string | null;
  result?: Record<string, unknown>;
  created_at?: string;
  updated_at?: string;
  queue_position?: number;
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export interface DashboardStats {
  reels_indexed: number;
  vectors_stored: number;
  transcripts: number;
  active_jobs: number;
  completed_jobs: number;
  failed_jobs: number;
  total_searches: number;
  avg_match_score: number;
  ollama_online: boolean;
  chromadb_online: boolean;
  api_online: boolean;
  gpu_available: boolean;
  latency_ms: number;
  models: Record<string, string>;
}

export interface ActivityItem {
  type: "indexed" | "search" | "error" | "system";
  message: string;
  timestamp: string;
}

// ─── Reels ───────────────────────────────────────────────────────────────────
export interface Reel {
  id: string;
  original_url: string;
  video_filename: string;
  video_path: string;
  audio_path: string;
  transcript_preview: string;
  transcript_path?: string;
  timestamp: string;
  duration?: number | null;
  thumbnail_url?: string | null;
  video_exists: boolean;
  audio_exists: boolean;
  transcript_exists: boolean;
  ocr_success: boolean;
  ocr_text_preview: string;
  ocr_exists?: boolean;
  visual_captions_preview: string;
  visual_caption_count: number;
  has_visual_understanding: boolean;
  instagram_caption: string;
  hashtags: string[];
  has_caption: boolean;
  caption_length?: number;
}

export interface ReelsResponse {
  reels: Reel[];
  total: number;
  limit: number;
  offset: number;
}

export interface ReelsParams {
  limit?: number;
  offset?: number;
  search?: string;
}

// ─── Search ──────────────────────────────────────────────────────────────────
export interface SearchResult {
  id: string;
  similarity_score: number;
  text_score?: number;
  clip_score?: number;
  has_clip_match?: boolean;
  video_filename: string;
  video_path?: string;
  audio_path?: string;
  transcript_path?: string;
  transcript_preview: string;
  transcript_length?: number;
  original_url: string;
  ocr_success?: boolean;
  ocr_text_preview?: string;
  visual_captions_preview?: string;
  visual_caption_count?: number;
  has_visual_understanding?: boolean;
  instagram_caption_preview?: string;
  hashtags?: string[];
  hashtags_str?: string;
  has_caption?: boolean;
  relevance_label?: string;
  llm_reason?: string;
  original_similarity?: number;
  reranked_position?: number;
}

export interface SearchResponse {
  success: boolean;
  search_id?: string;
  query: string;
  rewritten_query?: string;
  execution_time_ms: number;
  llm_time_ms?: number;
  llm_rejected?: number;
  llm_warning?: string;
  llm_active?: boolean;
  results: SearchResult[];
  empty_reason?: string;
}

// ─── System ──────────────────────────────────────────────────────────────────
export interface SystemHealth {
  api_online: boolean;
  ollama_online: boolean;
  chromadb_online: boolean;
  whisper_loaded: boolean;
  whisper_model: string;
  whisper_device: string;
  whisper_compute: string;
  clip_loaded: boolean;
  blip_loaded: boolean;
  embedding_loaded: boolean;
  gpu_available: boolean;
  storage_used_mb: number;
  db_size_mb: number;
  vector_db_size_mb: number;
  max_concurrent_pipelines: number;
  active_pipelines: number;
  latency_ms: number;
}

// ─── Search Analytics ────────────────────────────────────────────────────────
export interface SearchAnalytics {
  success: boolean;
  total_searches: number;
  avg_similarity: number;
  relevant_count: number;
  not_relevant_count: number;
  success_rate: number;
  failed_searches: number;
  most_common_queries: string[];
  top_queries: any[];
  worst_queries: any[];
}

// ─── Chat ────────────────────────────────────────────────────────────────────
export interface ChatResponse {
  answer: string;
  sources: Array<{
    reel_id: string;
    score: number;
    reason: string;
    video_path?: string;
    relevance?: string;
  }>;
  used_reels: number;
  execution_time_ms: number;
  llm_time_ms?: number;
  retrieved_count?: number;
  rewritten_query?: string;
  warning?: string;
}

// ─── Reindex ─────────────────────────────────────────────────────────────────
export interface ReindexResult {
  success: boolean;
  reel_id: string;
  visual_caption_count?: number;
  has_visual_understanding?: boolean;
  has_clip_embedding?: boolean;
  clip_frame_count?: number;
}

// ─── Backend Health (legacy, used by BackendProvider) ─────────────────────────
export interface BackendStatus {
  fastapi: boolean;
  ollama: boolean;
  chromadb: boolean;
  reelCount: number;
  latencyMs: number;
  gpuAvailable?: boolean;
  activeDownloads?: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// API FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════════

// ─── Health (legacy BackendProvider) ─────────────────────────────────────────
export async function checkBackendHealth(signal?: AbortSignal): Promise<BackendStatus> {
  console.log("[api] checkBackendHealth requesting from:", `${API_BASE}/api/health`);
  try {
    const data = await get<any>("/api/health", signal);
    console.log("[api] checkBackendHealth raw data received:", data);
    return {
      fastapi: data.backendOnline ?? false,
      ollama: data.ollamaOnline ?? false,
      chromadb: data.chromaOnline ?? false,
      reelCount: data.totalReels ?? 0,
      latencyMs: data.latency ?? 0,
      gpuAvailable: data.gpuAvailable,
      activeDownloads: data.activeDownloads,
    };
  } catch (err: any) {
    if (err?.name !== "AbortError") {
      console.error("[api] checkBackendHealth failed exception:", err);
    }
    throw err;
  }
}

// ─── Dashboard ───────────────────────────────────────────────────────────────
export async function fetchDashboardStats(signal?: AbortSignal): Promise<DashboardStats> {
  return get<DashboardStats>("/api/dashboard/stats", signal);
}

export async function fetchDashboardActivity(
  limit: number = 20,
  signal?: AbortSignal
): Promise<ActivityItem[]> {
  return get<ActivityItem[]>(`/api/dashboard/activity?limit=${limit}`, signal);
}

// ─── Reels ───────────────────────────────────────────────────────────────────
export async function fetchReels(
  params: ReelsParams = {},
  signal?: AbortSignal
): Promise<ReelsResponse> {
  const { limit = 20, offset = 0, search } = params;
  let path = `/api/reels?limit=${limit}&offset=${offset}`;
  if (search) path += `&search=${encodeURIComponent(search)}`;
  return get<ReelsResponse>(path, signal);
}

export async function deleteReel(reelId: string, signal?: AbortSignal): Promise<{ success: boolean }> {
  return del<{ success: boolean }>(`/api/reels/${reelId}`, signal);
}

export async function reindexReel(reelId: string, signal?: AbortSignal): Promise<ReindexResult> {
  return post<ReindexResult>(`/api/reels/${reelId}/reindex`, {}, signal);
}

// ─── Search ──────────────────────────────────────────────────────────────────
export async function semanticSearch(query: string, signal?: AbortSignal): Promise<SearchResponse> {
  return post<SearchResponse>("/api/search", { query }, signal, 30000);
}

export const searchReels = semanticSearch;

// ─── Search Analytics ────────────────────────────────────────────────────────
export async function fetchSearchAnalytics(signal?: AbortSignal): Promise<SearchAnalytics> {
  return get<SearchAnalytics>("/api/search-analytics", signal);
}

// ─── Chat ────────────────────────────────────────────────────────────────────
export async function chatWithAI(message: string, signal?: AbortSignal): Promise<ChatResponse> {
  return post<ChatResponse>("/api/chat", { message }, signal);
}

// ─── System Health ───────────────────────────────────────────────────────────
export async function fetchSystemHealth(signal?: AbortSignal): Promise<SystemHealth> {
  return get<SystemHealth>("/api/system/health", signal);
}

// ─── Jobs ────────────────────────────────────────────────────────────────────
export async function downloadReel(url: string, signal?: AbortSignal): Promise<{ job_id: string }> {
  return post<{ job_id: string }>("/api/jobs", { url }, signal);
}

export async function getJobStatus(jobId: string, signal?: AbortSignal): Promise<Job> {
  return apiFetch<Job>(`${API_BASE}/api/jobs/${jobId}`, { method: "GET", signal });
}

export async function fetchJobsList(
  limit: number = 50,
  offset: number = 0,
  status?: string,
  signal?: AbortSignal
): Promise<Job[]> {
  const statusParam = status ? `&status=${status}` : "";
  return apiFetch<Job[]>(
    `${API_BASE}/api/jobs?limit=${limit}&offset=${offset}${statusParam}`,
    { method: "GET", signal }
  );
}

// ─── SSE Job Stream ──────────────────────────────────────────────────────────
export function getJobStream(
  jobId: string,
  onUpdate: (payload: { type: string; job: Job }) => void,
  onError?: (err: any) => void
): () => void {
  const url = `${API_BASE}/api/jobs/${jobId}/stream`;
  const eventSource = new EventSource(url);

  eventSource.onmessage = (event) => {
    try {
      const data = JSON.parse(event.data);
      onUpdate(data);
    } catch (err) {
      console.error("Failed to parse SSE event data:", err);
    }
  };

  eventSource.onerror = (err) => {
    if (onError) {
      onError(err);
    }
  };

  return () => {
    eventSource.close();
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// BACKWARD-COMPATIBLE LEGACY EXPORTS
// These aliases preserve API surface for existing pages during incremental migration.
// They will be removed in later phases when pages are updated.
// ═══════════════════════════════════════════════════════════════════════════════

/** @deprecated Use `Reel` instead */
export type ReelItem = Reel;

/** @deprecated Use `ReelsResponse` instead */
export interface LibraryResponse {
  success: boolean;
  reels: Reel[];
}

/** @deprecated Use `fetchReels()` instead */
export async function fetchLibrary(limit: number = 50): Promise<LibraryResponse> {
  const data = await get<LibraryResponse>(`/library?limit=${limit}`);
  return data;
}
