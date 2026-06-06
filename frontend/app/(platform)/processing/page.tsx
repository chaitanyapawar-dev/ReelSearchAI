"use client";

import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Download, Mic, ScanText, Eye, Layers, Database, CheckCircle2, 
  Loader2, Link2, Upload, Terminal, Copy, Check, AlertCircle,
  Brain, RefreshCw, ChevronRight, Clock, ListFilter
} from "lucide-react";
import { 
  downloadReel, getJobStatus, getJobStream, fetchJobsList, 
  type Job, type JobLog 
} from "@/lib/api";

const PIPELINE_STAGES = [
  { id: "download", label: "Download", icon: Download, desc: "yt-dlp ingestion" },
  { id: "whisper", label: "Whisper", icon: Mic, desc: "Speech transcription" },
  { id: "ocr", label: "OCR", icon: ScanText, desc: "On-screen text extraction" },
  { id: "blip", label: "BLIP", icon: Eye, desc: "Visual description" },
  { id: "clip", label: "CLIP", icon: Layers, desc: "Semantic embeddings" },
  { id: "ollama", label: "Ollama", icon: Brain, desc: "AI metadata enrichment" },
  { id: "chroma", label: "ChromaDB", icon: Database, desc: "Vector database index" },
];

type StageStatus = "idle" | "active" | "done" | "error";

interface LogMessage {
  time: string;
  type: "system" | "model" | "stage" | "error" | "success" | "warning" | "debug" | "info";
  text: string;
}

export default function ProcessingPage() {
  const [url, setUrl] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [jobs, setJobs] = useState<Job[]>([]);
  const [selectedJobId, setSelectedJobId] = useState<string | null>(null);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [stages, setStages] = useState<Record<string, StageStatus>>({});
  const [logs, setLogs] = useState<LogMessage[]>([]);
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  
  const terminalEndRef = useRef<HTMLDivElement>(null);
  const sseCleanupRef = useRef<(() => void) | null>(null);
  const jobsRequestInFlight = useRef(false);
  const detailsRequestInFlight = useRef(false);
  const lastFetchedJobIdRef = useRef<string | null>(null);

  const filterStatusRef = useRef(filterStatus);
  useEffect(() => {
    filterStatusRef.current = filterStatus;
  }, [filterStatus]);

  // Auto-scroll logs
  useEffect(() => {
    terminalEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [logs]);

  // Load jobs list
  const loadJobs = async () => {
    if (jobsRequestInFlight.current) return;
    jobsRequestInFlight.current = true;
    try {
      const list = await fetchJobsList(100, 0, filterStatusRef.current === "all" ? undefined : filterStatusRef.current);
      setJobs(list);
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if ((err as any)?.name === "AbortError") {
        return;
      }
      console.error("Failed to fetch jobs list:", err);
    } finally {
      jobsRequestInFlight.current = false;
    }
  };

  // Poll jobs list periodically (every 2 seconds) to keep sidebar state fresh
  useEffect(() => {
    // console.log("Polling jobs");
    loadJobs();
    const interval = setInterval(() => {
      // console.log("Polling jobs");
      loadJobs();
    }, 2000);
    return () => clearInterval(interval);
  }, []);

  // Fetch when category filter changes
  useEffect(() => {
    loadJobs();
  }, [filterStatus]);

  // Detail loading helper
  const loadJobDetails = async (jobId: string, checkSubscribed?: () => boolean) => {
    if (detailsRequestInFlight.current) return;
    detailsRequestInFlight.current = true;
    try {
      const job = await getJobStatus(jobId);
      if (checkSubscribed && !checkSubscribed()) return;
      
      setSelectedJob(job);
      setStages(getStageStatuses(job.stage, job.status, job.progress || 0));
      
      if (job.logs) {
        setLogs(parseBackendLogs(job.logs));
      } else {
        setLogs([]);
      }

      // Only stream if job is active (queued or running)
      if (job.status === "queued" || job.status === "running") {
        const unsubscribe = getJobStream(
          jobId,
          (payload) => {
            if (checkSubscribed && !checkSubscribed()) return;
            if (payload.type === "job_update") {
              const updatedJob = payload.job;
              setSelectedJob(updatedJob);
              setStages(getStageStatuses(updatedJob.stage, updatedJob.status, updatedJob.progress || 0));
              
              if (updatedJob.logs) {
                setLogs(prev => mergeLogs(prev, updatedJob.logs || []));
              }
              
              // Refresh list to keep sidebar sync'd
              loadJobs();

              // If finished, remove tracking from local storage if it matches
              if (updatedJob.status === "completed" || updatedJob.status === "failed") {
                if (localStorage.getItem("reel_saver_active_job_id") === jobId) {
                  localStorage.removeItem("reel_saver_active_job_id");
                }
              }
            }
          },
          (err) => {
            if (
              err instanceof DOMException &&
              err.name === "AbortError"
            ) {
              return;
            }
            if ((err as any)?.name === "AbortError") {
              return;
            }
            console.error("SSE stream error:", err);
          }
        );

        sseCleanupRef.current = unsubscribe;
      }
    } catch (err) {
      if (
        err instanceof DOMException &&
        err.name === "AbortError"
      ) {
        return;
      }
      if ((err as any)?.name === "AbortError") {
        return;
      }
      console.error("Failed to load job details:", err);
    } finally {
      detailsRequestInFlight.current = false;
    }
  };

  // Poll selected job details periodically (every 2 seconds) to keep Focus Panel fresh
  useEffect(() => {
    if (!selectedJobId) return;

    let isSubscribed = true;
    const checkSubscribed = () => isSubscribed;

    // console.log("Polling selected job", selectedJobId);
    loadJobDetails(selectedJobId, checkSubscribed);

    const interval = setInterval(() => {
      // console.log("Polling selected job", selectedJobId);
      loadJobDetails(selectedJobId, checkSubscribed);
    }, 2000);

    return () => {
      isSubscribed = false;
      clearInterval(interval);
    };
  }, [selectedJobId]);

  // Handle selected job tracking via SSE
  useEffect(() => {
    if (sseCleanupRef.current) {
      sseCleanupRef.current();
      sseCleanupRef.current = null;
    }

    if (!selectedJobId) {
      setSelectedJob(null);
      setStages({});
      setLogs([]);
      return;
    }

    let isSubscribed = true;
    const checkSubscribed = () => isSubscribed;

    loadJobDetails(selectedJobId, checkSubscribed);

    return () => {
      isSubscribed = false;
      if (sseCleanupRef.current) {
        sseCleanupRef.current();
        sseCleanupRef.current = null;
      }
    };
  }, [selectedJobId]);

  // Check localStorage on mount to resume active ingestion job
  useEffect(() => {
    const savedJobId = localStorage.getItem("reel_saver_active_job_id");
    if (savedJobId) {
      setSelectedJobId(savedJobId);
    }
  }, []);

  // Stage mapping helper
  function getStageStatuses(currentStage: string, status: string, progress: number): Record<string, StageStatus> {
    const res: Record<string, StageStatus> = {
      download: "idle",
      whisper: "idle",
      ocr: "idle",
      blip: "idle",
      clip: "idle",
      ollama: "idle",
      chroma: "idle",
    };

    const stageMapping: Record<string, number> = {
      "Queued": 0,
      "Downloading": 0,
      "Audio Extraction": 1,
      "Transcribing": 1,
      "OCR": 2,
      "BLIP Captioning": 3,
      "CLIP Embedding": 4,
      "LLM Enrichment": 5,
      "Storing to ChromaDB": 6,
      "Finished": 7,
      "Complete": 7,
    };

    let activeIndex = 0;
    if (status === "completed") {
      activeIndex = 7;
    } else if (status === "failed") {
      if (progress <= 5) activeIndex = 0;
      else if (progress <= 30) activeIndex = 1;
      else if (progress <= 50) activeIndex = 2;
      else if (progress <= 65) activeIndex = 3;
      else if (progress <= 78) activeIndex = 4;
      else if (progress <= 85) activeIndex = 5;
      else activeIndex = 6;
    } else {
      activeIndex = stageMapping[currentStage] ?? 0;
    }

    PIPELINE_STAGES.forEach((s, idx) => {
      if (status === "failed" && idx === activeIndex) {
        res[s.id] = "error";
      } else if (idx < activeIndex) {
        res[s.id] = "done";
      } else if (idx === activeIndex) {
        res[s.id] = status === "completed" ? "done" : "active";
      } else {
        res[s.id] = "idle";
      }
    });

    return res;
  }

  // Parse backend log items into UI log formats
  function parseBackendLogs(backendLogs: JobLog[]): LogMessage[] {
    return backendLogs.map(l => {
      let time = "";
      let msg = "";
      let level = "";
      
      if (l && typeof l === "object") {
        if ("timestamp" in l) {
          time = new Date(l.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
        }
        msg = l.msg || "";
        level = (l.level || "").toUpperCase();
      }
      
      let type: LogMessage["type"] = "info";
      if (level === "ERROR") {
        type = "error";
      } else if (level === "WARN") {
        type = "warning";
      } else if (level === "DEBUG") {
        type = "debug";
      } else {
        const lower = msg.toLowerCase();
        if (lower.includes("cuda") || lower.includes("whisper model") || lower.includes("blip") || lower.includes("clip") || lower.includes("easyocr")) {
          type = "model";
        } else if (lower.includes("success") || lower.includes("completed successfully")) {
          type = "success";
        } else if (lower.includes("failed") || lower.includes("error") || lower.includes("exception")) {
          type = "error";
        } else if (lower.includes("starting") || lower.includes("completed") || lower.includes("extracted") || lower.includes("generated") || lower.includes("indexed")) {
          type = "stage";
        } else if (lower.includes("scheduling") || lower.includes("queued") || lower.includes("connecting")) {
          type = "system";
        }
      }
      
      return { time, type, text: msg };
    });
  }

  // Merges new logs with existing logs to avoid duplicates
  const mergeLogs = (existing: LogMessage[], incoming: JobLog[]): LogMessage[] => {
    const parsedIncoming = parseBackendLogs(incoming);
    if (existing.length === 0) return parsedIncoming;

    const lastExisting = existing[existing.length - 1];
    const matchIdx = parsedIncoming.findIndex(
      inc => inc.text === lastExisting.text && inc.time === lastExisting.time
    );

    if (matchIdx !== -1) {
      const newLogs = parsedIncoming.slice(matchIdx + 1);
      return [...existing, ...newLogs];
    }

    return parsedIncoming;
  };

  const copyToClipboard = (cmd: string, key: string) => {
    navigator.clipboard.writeText(cmd);
    setCopiedCmd(key);
    setTimeout(() => setCopiedCmd(null), 2000);
  };

  const runPipeline = async () => {
    if (!url.trim() || submitting) return;

    setSubmitting(true);
    try {
      const response = await downloadReel(url);
      if (response && response.job_id) {
        const jobId = response.job_id;
        setUrl("");
        setSelectedJobId(jobId);
        setSelectedJob({
          job_id: jobId,
          status: "queued",
          stage: "Queued",
          progress: 0,
          url: url,
        });
        localStorage.setItem("reel_saver_active_job_id", jobId);
        
        // Immediately fetch details and list
        loadJobDetails(jobId, () => true);
        loadJobs();
      } else {
        throw new Error("Invalid scheduler response from backend.");
      }
    } catch (e: any) {
      if (
        e instanceof DOMException &&
        e.name === "AbortError"
      ) {
        return;
      }
      if ((e as any)?.name === "AbortError") {
        return;
      }
      console.error(e);
      alert(e.message || "Failed to submit job.");
    } finally {
      setSubmitting(false);
    }
  };

  const stopTracking = () => {
    if (localStorage.getItem("reel_saver_active_job_id") === selectedJobId) {
      localStorage.removeItem("reel_saver_active_job_id");
    }
    setSelectedJobId(null);
  };

  return (
    <div className="p-6 space-y-8 max-w-[1400px] mx-auto">
      {/* Ambient glow */}
      <div className="fixed top-1/3 left-1/2 w-[600px] h-[500px] pointer-events-none -z-10"
        style={{ background: "radial-gradient(ellipse, rgba(91,140,255,0.04) 0%, transparent 70%)", filter: "blur(100px)" }} />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} className="flex justify-between items-center">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Ingestion Dashboard</h1>
          <p className="mt-0.5 text-sm text-white/40">Monitor and manage local AI ingestion pipelines.</p>
        </div>
        <button 
          onClick={() => loadJobs()}
          className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 px-4 py-2 text-xs font-semibold text-white/80 hover:text-white transition-all"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh
        </button>
      </motion.div>

      {/* Split Pane Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        
        {/* LEFT COLUMN: Sidebar (Jobs List + URL Input) (4 cols) */}
        <div className="lg:col-span-4 space-y-6">
          
          {/* Submit New URL */}
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.06 }}
            className="glass-panel rounded-2xl p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Ingest New Reel</p>
            <div className="flex gap-2">
              <div className="flex items-center gap-2 flex-1 rounded-xl px-3 py-2.5 transition-all duration-200 focus-within:border-white/20"
                style={{ background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.08)" }}>
                <Link2 className="h-3.5 w-3.5 text-white/30 shrink-0" />
                <input
                  value={url} 
                  onChange={e => setUrl(e.target.value)}
                  onKeyDown={e => e.key === "Enter" && runPipeline()}
                  placeholder="https://instagram.com/reel/..."
                  className="flex-1 bg-transparent text-xs text-white placeholder:text-white/25 outline-none"
                  disabled={submitting}
                />
              </div>
              <button 
                onClick={runPipeline} 
                disabled={!url.trim() || submitting}
                className="flex items-center justify-center rounded-xl px-4 py-2.5 text-xs font-medium text-white transition-all duration-200 disabled:opacity-40 hover:opacity-90 shrink-0"
                style={{
                  background: "linear-gradient(135deg, #5B8CFF, #7B61FF)",
                  boxShadow: "0 0 20px rgba(91,140,255,0.25)",
                }}
              >
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
              </button>
            </div>
          </motion.div>

          {/* Jobs History Sidebar */}
          <div className="glass-panel rounded-2xl p-5 relative overflow-hidden flex flex-col max-h-[600px]">
            <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
            
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2 text-white/60">
                <ListFilter className="h-3.5 w-3.5" />
                <span className="text-xs font-bold uppercase tracking-wider">Jobs History</span>
              </div>
              <select
                value={filterStatus}
                onChange={e => setFilterStatus(e.target.value)}
                className="bg-black/40 border border-white/10 rounded-lg text-[10px] text-white/60 px-2 py-1 outline-none cursor-pointer"
              >
                <option value="all">All Jobs</option>
                <option value="running">Running</option>
                <option value="queued">Queued</option>
                <option value="completed">Completed</option>
                <option value="failed">Failed</option>
              </select>
            </div>

            <div className="space-y-2 overflow-y-auto pr-1 scrollbar-none flex-1 max-h-[480px]">
              {jobs.length === 0 ? (
                <div className="text-center py-10 text-xs text-white/20 italic">
                  No ingestion jobs found.
                </div>
              ) : (
                jobs.map((job) => {
                  const isSelected = selectedJobId === job.job_id;
                  const isQueued = job.status === "queued";
                  const isRunning = job.status === "running";
                  const isCompleted = job.status === "completed";
                  const isFailed = job.status === "failed";

                  let statusBg = "bg-white/5 border-white/10 text-white/40";
                  if (isRunning) statusBg = "bg-cyan-500/10 border-cyan-500/20 text-cyan-400";
                  if (isQueued) statusBg = "bg-blue-500/10 border-blue-500/20 text-blue-400";
                  if (isCompleted) statusBg = "bg-emerald-500/10 border-emerald-500/20 text-emerald-400";
                  if (isFailed) statusBg = "bg-rose-500/10 border-rose-500/20 text-rose-400";

                  return (
                    <button
                      key={job.job_id}
                      onClick={() => setSelectedJobId(job.job_id)}
                      className={`w-full text-left rounded-xl p-3.5 border transition-all flex items-center justify-between group ${
                        isSelected 
                        ? "bg-[#5B8CFF]/10 border-[#5B8CFF]/40 shadow-[0_0_15px_rgba(91,140,255,0.1)]" 
                        : "bg-white/[0.02] border-white/5 hover:bg-white/[0.05] hover:border-white/10"
                      }`}
                    >
                      <div className="space-y-1.5 min-w-0 pr-2">
                        <p className="text-[11px] font-mono text-white/80 truncate group-hover:text-white transition-colors">
                          {job.url || "Unknown URL"}
                        </p>
                        <div className="flex items-center gap-2 text-[10px] text-white/30">
                          <Clock className="h-3 w-3 shrink-0" />
                          <span>
                            {job.created_at ? new Date(job.created_at).toLocaleDateString() + " " + new Date(job.created_at).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'}) : "N/A"}
                          </span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <span className={`text-[9px] px-2 py-0.5 rounded-full border font-medium ${statusBg}`}>
                          {isQueued && job.queue_position ? `Queue #${job.queue_position}` : job.status}
                        </span>
                        <ChevronRight className="h-3.5 w-3.5 text-white/20 group-hover:text-white/40 transition-colors" />
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {/* Launcher Panel */}
          <div className="glass-panel rounded-2xl p-5 space-y-4 relative overflow-hidden">
            <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
            <div>
              <p className="text-[10px] uppercase tracking-widest text-[#5B8CFF] font-semibold">Local Stack Control</p>
              <p className="text-xs text-white/40 mt-1">Commands to launch the stack on your system.</p>
            </div>
            <div className="space-y-2 text-[10px]">
              <div className="flex items-center justify-between rounded-xl bg-black/40 border border-white/5 px-3 py-2 font-mono text-white/60">
                <span className="truncate">cd backend && python main.py</span>
                <button 
                  onClick={() => copyToClipboard("cd backend && python main.py", "backend")}
                  className="text-white/30 hover:text-white/60 p-1"
                >
                  {copiedCmd === "backend" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
              <div className="flex items-center justify-between rounded-xl bg-black/40 border border-white/5 px-3 py-2 font-mono text-white/60">
                <span className="truncate">cd frontend && npm run dev</span>
                <button 
                  onClick={() => copyToClipboard("cd frontend && npm run dev", "frontend")}
                  className="text-white/30 hover:text-white/60 p-1"
                >
                  {copiedCmd === "frontend" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                </button>
              </div>
            </div>
          </div>

        </div>

        {/* RIGHT COLUMN: Focus Panel (Selected Job details + Stages + Console) (8 cols) */}
        <div className="lg:col-span-8">
          
          <AnimatePresence mode="wait">
            {!selectedJob ? (
              <motion.div 
                key="placeholder"
                initial={{ opacity: 0, scale: 0.98 }} 
                animate={{ opacity: 1, scale: 1 }} 
                exit={{ opacity: 0 }}
                className="glass-panel rounded-3xl p-12 text-center flex flex-col items-center justify-center min-h-[480px] border-white/5 bg-white/[0.01]"
              >
                <div className="h-16 w-16 rounded-2xl bg-white/[0.02] border border-white/5 flex items-center justify-center mb-6">
                  <Terminal className="h-7 w-7 text-white/20" strokeWidth={1.5} />
                </div>
                <h3 className="text-sm font-semibold text-white/80">No Ingestion Job Selected</h3>
                <p className="mt-1.5 text-xs text-white/40 max-w-[340px] leading-relaxed">
                  Select an ingestion pipeline from the sidebar to inspect its execution steps, progress, and logs, or submit a new Reel URL to start.
                </p>
              </motion.div>
            ) : (
              <motion.div 
                key={selectedJob.job_id}
                initial={{ opacity: 0, y: 10 }} 
                animate={{ opacity: 1, y: 0 }} 
                exit={{ opacity: 0 }}
                className="space-y-6"
              >
                {/* Active Job Header Details */}
                <div className="glass-panel rounded-2xl p-6 relative overflow-hidden">
                  <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                  
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="min-w-0 space-y-1">
                      <p className="text-[10px] font-semibold uppercase tracking-wider text-white/40">Currently Tracking Job</p>
                      <h2 className="text-sm font-mono font-bold text-white truncate pr-4">
                        {selectedJob.url}
                      </h2>
                      <p className="text-[10px] text-white/30 font-mono">Job ID: {selectedJob.job_id}</p>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      {selectedJob.status === "queued" && (
                        <div className="text-[11px] text-cyan-400 font-semibold flex items-center gap-1.5 bg-cyan-500/10 px-3 py-1.5 rounded-xl border border-cyan-500/20 animate-pulse">
                          <span>Queue Position: #{selectedJob.queue_position || 0}</span>
                        </div>
                      )}
                      {(selectedJob.status === "queued" || selectedJob.status === "running") && (
                        <button 
                          onClick={stopTracking}
                          className="flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold text-white/70 hover:text-white bg-white/5 hover:bg-white/10 border border-white/10 transition-all"
                        >
                          Stop Tracking
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Progress Line */}
                  {(selectedJob.status === "running" || selectedJob.status === "queued") && (
                    <div className="mt-5 space-y-2">
                      <div className="flex justify-between items-center text-[10px] font-bold text-cyan-300">
                        <span className="uppercase tracking-widest">{selectedJob.stage}</span>
                        <span>{selectedJob.progress}%</span>
                      </div>
                      <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden border border-white/5">
                        <motion.div 
                          className="h-full bg-gradient-to-r from-cyan-400 to-[#5B8CFF]"
                          initial={{ width: 0 }}
                          animate={{ width: `${selectedJob.progress}%` }}
                          transition={{ duration: 0.5 }}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Pipeline Execution Stages Grid */}
                <div className="space-y-4">
                  <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Pipeline Execution Stages</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                    {PIPELINE_STAGES.map((stage, i) => {
                      const Icon = stage.icon;
                      const status = stages[stage.id] ?? "idle";
                      const isActive = status === "active";
                      const isDone = status === "done";
                      const isError = status === "error";

                      return (
                        <div key={stage.id}
                          className="relative rounded-2xl p-4 overflow-hidden border transition-all duration-300"
                          style={{
                            background: isActive
                              ? "rgba(34,211,238,0.07)"
                              : isDone
                              ? "rgba(52,211,113,0.05)"
                              : isError
                              ? "rgba(244,63,94,0.07)"
                              : "rgba(255,255,255,0.03)",
                            borderColor: isActive
                              ? "rgba(34,211,238,0.3)"
                              : isDone
                              ? "rgba(52,211,113,0.2)"
                              : isError
                              ? "rgba(244,63,94,0.3)"
                              : "rgba(255,255,255,0.06)",
                          }}
                        >
                          <div className="flex items-center justify-between mb-3">
                            <span className="text-[9px] font-bold uppercase tracking-widest text-white/20">Step {i + 1}</span>
                            {isDone && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
                            {isError && <AlertCircle className="h-4 w-4 text-rose-500" />}
                            {isActive && (
                              <motion.div
                                className="h-2 w-2 rounded-full bg-cyan-400 shadow-[0_0_8px_rgba(34,211,238,0.8)]"
                                animate={{ opacity: [0.4, 1, 0.4] }}
                                transition={{ duration: 0.8, repeat: Infinity }}
                              />
                            )}
                          </div>

                          <div className={`mb-3 flex h-8 w-8 items-center justify-center rounded-lg border ${
                            isActive ? "bg-cyan-500/15 border-cyan-400/20" 
                            : isDone ? "bg-emerald-500/10 border-emerald-400/15" 
                            : isError ? "bg-rose-500/15 border-rose-400/20"
                            : "bg-white/5 border-white/5"
                          }`}>
                            <Icon className={`h-4 w-4 ${
                              isActive ? "text-cyan-300" : isDone ? "text-emerald-300" : isError ? "text-rose-400" : "text-white/35"
                            }`} strokeWidth={1.5} />
                          </div>

                          <p className="text-xs font-bold text-white/80">{stage.label}</p>
                          <p className="mt-0.5 text-[9px] text-white/40 leading-snug">{stage.desc}</p>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Banners (Success / Error) */}
                {selectedJob.status === "completed" && (
                  <div className="glass-panel border-emerald-500/20 bg-emerald-500/5 rounded-2xl p-5 space-y-3 relative overflow-hidden">
                    <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-emerald-400/20 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                      <CheckCircle2 className="h-5 w-5" />
                      Ingestion Pipeline Completed Successfully
                    </div>
                    <div className="text-xs text-white/60 space-y-2">
                      <p>All pipeline stages finalized. The video transcription, frames semantic descriptions, and visual annotations have been saved locally.</p>
                      {Array.isArray((selectedJob.result as any)?.hashtags) && (selectedJob.result as any).hashtags.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {((selectedJob.result as any).hashtags as string[]).map((h: string) => (
                            <span key={h} className="rounded-md bg-white/5 border border-white/10 px-2 py-0.5 text-[9px] text-white/40">#{h}</span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {selectedJob.status === "failed" && (
                  <div className="glass-panel border-rose-500/20 bg-rose-500/5 rounded-2xl p-5 space-y-2 relative overflow-hidden">
                    <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-rose-400/20 to-transparent pointer-events-none" />
                    <div className="flex items-center gap-2 text-rose-500 font-semibold text-sm">
                      <AlertCircle className="h-5 w-5" />
                      Ingestion Pipeline Interrupted
                    </div>
                    <p className="text-xs text-white/55 leading-relaxed">
                      {selectedJob.error || "An unknown error interrupted the pipeline execution. Review terminal logs for details."}
                    </p>
                  </div>
                )}

                {/* Console Outputs */}
                <div className="glass-panel rounded-2xl border-white/10 bg-black/40 flex flex-col h-[340px] overflow-hidden relative">
                  <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
                  
                  {/* Console Header */}
                  <div className="flex items-center justify-between px-4 py-3 bg-white/[0.02] border-b border-white/[0.07] shrink-0">
                    <div className="flex items-center gap-2">
                      <Terminal className="h-4 w-4 text-[#5B8CFF]" />
                      <span className="text-[11px] font-bold text-white/70 uppercase tracking-widest">Orchestration Logs</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
                      <span className="h-1.5 w-1.5 rounded-full bg-white/10" />
                    </div>
                  </div>

                  {/* Console Content */}
                  <div className="flex-1 p-4 overflow-y-auto font-mono text-[10px] space-y-2 scrollbar-none">
                    {logs.length === 0 ? (
                      <div className="text-white/20 italic text-center pt-28">
                        Console idle. Submitting job or fetching logs...
                      </div>
                    ) : (
                      logs.map((log, index) => {
                        let colorClass = "text-white/60";
                        if (log.type === "system") colorClass = "text-cyan-400";
                        else if (log.type === "model") colorClass = "text-violet-400";
                        else if (log.type === "error") colorClass = "text-rose-400 font-bold";
                        else if (log.type === "success") colorClass = "text-emerald-400 font-semibold";
                        else if (log.type === "warning") colorClass = "text-amber-400 font-semibold";
                        else if (log.type === "debug") colorClass = "text-white/30 italic";
                        else if (log.type === "stage") colorClass = "text-violet-300";
                        
                        return (
                          <div key={index} className="flex gap-2 items-start leading-relaxed">
                            <span className="text-white/25 shrink-0">[{log.time}]</span>
                            <span className={colorClass}>{log.text}</span>
                          </div>
                        );
                      })
                    )}
                    <div ref={terminalEndRef} />
                  </div>
                </div>

              </motion.div>
            )}
          </AnimatePresence>

        </div>

      </div>
    </div>
  );
}

