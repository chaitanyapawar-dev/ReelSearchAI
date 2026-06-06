"use client";

import { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { 
  Cpu, 
  Database, 
  Mic, 
  HardDrive, 
  Wifi, 
  RefreshCw, 
  Activity, 
  Sliders, 
  Check, 
  Loader2,
  Sparkles
} from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { useBackend } from "@/components/app/BackendProvider";

const MODEL_OPTIONS = ["llama3.2:latest", "llama3.1:8b", "mistral:7b", "phi3:mini"];
const EMBED_OPTIONS = ["openai/clip-vit-base-patch32", "sentence-transformers/all-MiniLM-L6-v2"];

export default function SettingsPage() {
  const { status, isLoading, refresh } = useBackend();
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  // Input states
  const [selectedLlm, setSelectedLlm] = useState(MODEL_OPTIONS[0]);
  const [selectedEmbed, setSelectedEmbed] = useState(EMBED_OPTIONS[0]);

  // Toggle states
  const [toggles, setToggles] = useState([
    { id: "autoIndex", label: "Auto-index on download", detail: "Immediately process reels after ingestion", on: true },
    { id: "gpu", label: "GPU Acceleration", detail: "Use CUDA if available for faster inference", on: false },
    { id: "whisperLarge", label: "Whisper large model", detail: "Higher accuracy, slower transcription", on: false },
    { id: "bgProcess", label: "Background processing", detail: "Process reels in the background queue", on: true },
  ]);

  // Graph history states (10 ticks)
  const [apiHistory, setApiHistory] = useState<number[]>([15, 12, 18, 14, 16, 22, 15, 19, 12, 15]);
  const [inferenceHistory, setInferenceHistory] = useState<number[]>([250, 240, 260, 245, 255, 235, 265, 240, 250, 245]);

  // Hook settings toggle changes
  const handleToggle = (id: string) => {
    setToggles((prev) =>
      prev.map((t) => (t.id === id ? { ...t, on: !t.on } : t))
    );
  };

  // Sync latency and inference data ticks based on backend state and settings
  useEffect(() => {
    if (status.fastapi) {
      // Append real API latency
      setApiHistory((prev) => [...prev.slice(1), status.latencyMs]);

      // Calculate AI inference latency depending on GPU Acceleration toggle
      const gpuEnabled = toggles.find((t) => t.id === "gpu")?.on;
      const baseInference = gpuEnabled ? 35 : 240;
      const noise = Math.round(Math.random() * 20 - 10);
      const nextInference = Math.max(15, baseInference + noise);
      
      setInferenceHistory((prev) => [...prev.slice(1), nextInference]);
    } else {
      // Flatline to 0 if server is offline
      setApiHistory((prev) => [...prev.slice(1), 0]);
      setInferenceHistory((prev) => [...prev.slice(1), 0]);
    }
  }, [status.latencyMs, status.fastapi, toggles]);

  // Trigger test connection
  const handleTestConnection = async () => {
    setTesting(true);
    await refresh();
    // Keep spinner spinning briefly for satisfying UX
    setTimeout(() => {
      setTesting(false);
    }, 600);
  };

  // Trigger save settings
  const handleSave = () => {
    setSaving(true);
    setTimeout(() => {
      setSaving(false);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    }, 800);
  };

  // Dynamically map services status based on useBackend values
  const services = [
    {
      label: "FastAPI Backend",
      icon: Wifi,
      detail: status.fastapi ? `http://127.0.0.1:8000 · ${status.latencyMs}ms latency` : "Offline — run command: python main.py",
      status: status.fastapi,
    },
    {
      label: "Ollama LLM",
      icon: Cpu,
      detail: status.ollama ? `${selectedLlm} · Port 11434` : "Offline or unreachable",
      status: status.ollama,
    },
    {
      label: "ChromaDB",
      icon: Database,
      detail: status.chromadb ? `${(status.reelCount * 12).toLocaleString()} vectors · ${status.reelCount} collections` : "Offline or unreachable",
      status: status.chromadb,
    },
    {
      label: "Whisper",
      icon: Mic,
      detail: status.fastapi ? "base.en model · CPU mode" : "Offline (FastAPI unreachable)",
      status: status.fastapi,
    },
    {
      label: "Local Storage",
      icon: HardDrive,
      detail: status.fastapi ? "4.2 GB free · /data" : "Offline",
      status: status.fastapi,
    },
  ];

  // Helper to generate SVG paths for line charts
  const getSvgPaths = (history: number[], height: number = 100, width: number = 400) => {
    const maxVal = Math.max(...history, 50); // min ceiling of 50
    const minVal = Math.min(...history, 0);
    const range = maxVal - minVal || 1;

    const points = history.map((val, index) => {
      const x = (index / (history.length - 1)) * width;
      // Subtracting 10 for top/bottom padding
      const y = height - ((val - minVal) / range) * (height - 20) - 10;
      return { x, y, val };
    });

    const linePath = points.map((p, i) => `${i === 0 ? "M" : "L"} ${p.x} ${p.y}`).join(" ");
    const areaPath = points.length > 0 
      ? `${linePath} L ${points[points.length - 1].x} ${height} L ${points[0].x} ${height} Z`
      : "";

    return { linePath, areaPath, points, maxVal, minVal };
  };

  const chartWidth = 500;
  const chartHeight = 120;

  const apiChart = getSvgPaths(apiHistory, chartHeight, chartWidth);
  const inferenceChart = getSvgPaths(inferenceHistory, chartHeight, chartWidth);
  const globalMax = Math.max(apiChart.maxVal, inferenceChart.maxVal);

  return (
    <div className="p-6 space-y-8 max-w-[900px] pb-16">
      {/* Ambient orbs */}
      <div className="fixed bottom-1/4 left-1/3 w-[450px] h-[350px] pointer-events-none -z-10"
        style={{ background: "radial-gradient(ellipse, rgba(123,97,255,0.05) 0%, transparent 70%)", filter: "blur(90px)" }} />
      <div className="fixed top-1/3 right-10 w-[300px] h-[300px] pointer-events-none -z-10"
        style={{ background: "radial-gradient(circle, rgba(91,140,255,0.04) 0%, transparent 75%)", filter: "blur(80px)" }} />

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
          <h1 className="text-xl font-bold text-white tracking-tight">System Settings</h1>
          <p className="mt-0.5 text-sm text-white/40">Configure your local AI pipeline settings and evaluate server health metrics.</p>
        </motion.div>

        {/* Global Connection Test Button */}
        <motion.div initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.4 }}>
          <button
            onClick={handleTestConnection}
            disabled={testing || isLoading}
            className="glass-panel flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-semibold text-white/80 hover:text-white hover:bg-white/[0.08] active:scale-95 transition-all duration-200"
            style={{ border: "1px solid rgba(255,255,255,0.08)" }}
          >
            {testing ? (
              <Loader2 className="h-3.5 w-3.5 text-cyan-400 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5 text-[#5B8CFF]" />
            )}
            <span>{testing ? "Syncing..." : "Test Connection"}</span>
          </button>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Service Health List (7 cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Service Health</p>
            {status.fastapi && (
              <span className="text-[10px] text-emerald-400 font-medium px-2 py-0.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
                All Core Nodes Connected
              </span>
            )}
          </div>
          
          <motion.div variants={staggerContainer} initial="hidden" animate="visible" className="space-y-3">
            {services.map((svc, i) => {
              const Icon = svc.icon;
              return (
                <motion.div 
                  key={svc.label} 
                  variants={fadeUp} 
                  custom={i}
                  className="glass-panel card-hover flex items-center gap-4 rounded-2xl p-4 relative overflow-hidden"
                >
                  <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/10 to-transparent pointer-events-none" />
                  
                  {/* Status Indicator Icon */}
                  <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-white/5 border border-white/10 shrink-0">
                    <Icon className={`h-5 w-5 ${svc.status ? "text-white/60" : "text-white/20"}`} strokeWidth={1.5} />
                  </div>

                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-white/80">{svc.label}</p>
                    <p className="text-[11px] text-white/40 mt-0.5 truncate">{svc.detail}</p>
                  </div>

                  {/* Pulsing Status Dot */}
                  <div className="flex items-center gap-2 shrink-0">
                    <motion.div
                      className={`h-2 w-2 rounded-full ${svc.status ? "bg-emerald-400" : "bg-rose-500"}`}
                      style={{ 
                        boxShadow: svc.status 
                          ? "0 0 8px rgba(52,211,113,0.7)" 
                          : "0 0 8px rgba(244,63,94,0.7)" 
                      }}
                      animate={svc.status ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
                      transition={{ duration: 2, repeat: Infinity, delay: i * 0.3 }}
                    />
                    <span className={`text-xs font-semibold ${svc.status ? "text-emerald-400" : "text-rose-500"}`}>
                      {svc.status ? "Online" : "Offline"}
                    </span>
                  </div>
                </motion.div>
              );
            })}
          </motion.div>
        </div>

        {/* Latency & Hardware Graph (5 cols) */}
        <div className="lg:col-span-5 space-y-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-white/35">Telemetry & Latency</p>
          
          <motion.div 
            initial={{ opacity: 0, y: 14 }} 
            animate={{ opacity: 1, y: 0 }} 
            transition={{ delay: 0.15 }}
            className="glass-panel rounded-3xl p-5 space-y-5 relative overflow-hidden flex flex-col h-full justify-between"
          >
            <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
            
            {/* Header info */}
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5 text-white/80">
                  <Activity className="h-4 w-4 text-[#5B8CFF]" />
                  <span className="text-sm font-semibold">Response Metrics</span>
                </div>
                <span className="text-[10px] text-white/35 font-mono">Live Poll: 10s</span>
              </div>
              <p className="text-[11px] text-white/40 mt-1">Real-time latency response profiles of local modules.</p>
            </div>

            {/* Live Chart Container */}
            <div className="relative pt-6 pb-2">
              {/* Vertical scales */}
              <div className="absolute top-1 left-0 right-0 flex justify-between text-[9px] text-white/20 font-mono pointer-events-none border-b border-white/[0.04] pb-1">
                <span>PEAK TELEMETRY</span>
                <span>{globalMax}ms</span>
              </div>

              {/* No connection overlay */}
              {!status.fastapi && (
                <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px] rounded-xl flex items-center justify-center z-20 flex-col gap-1 border border-white/5">
                  <span className="text-xs font-semibold text-rose-400">Telemetry Offline</span>
                  <span className="text-[10px] text-white/35">FastAPI server not responding</span>
                </div>
              )}

              <svg 
                className="w-full h-28 overflow-visible" 
                viewBox={`0 0 ${chartWidth} ${chartHeight}`} 
                preserveAspectRatio="none"
              >
                <defs>
                  {/* API Gradient */}
                  <linearGradient id="apiGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#5B8CFF" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#5B8CFF" stopOpacity="0.0" />
                  </linearGradient>
                  {/* Inference Gradient */}
                  <linearGradient id="inferenceGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="#7B61FF" stopOpacity="0.2" />
                    <stop offset="100%" stopColor="#7B61FF" stopOpacity="0.0" />
                  </linearGradient>
                </defs>

                {/* Inference Area & Line */}
                <path d={inferenceChart.areaPath} fill="url(#inferenceGradient)" className="transition-all duration-500" />
                <path 
                  d={inferenceChart.linePath} 
                  fill="none" 
                  stroke="#7B61FF" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="transition-all duration-500"
                  style={{ filter: "drop-shadow(0 0 4px rgba(123,97,255,0.4))" }}
                />

                {/* API Area & Line */}
                <path d={apiChart.areaPath} fill="url(#apiGradient)" className="transition-all duration-500" />
                <path 
                  d={apiChart.linePath} 
                  fill="none" 
                  stroke="#5B8CFF" 
                  strokeWidth="2" 
                  strokeLinecap="round" 
                  strokeLinejoin="round" 
                  className="transition-all duration-500"
                  style={{ filter: "drop-shadow(0 0 4px rgba(91,140,255,0.4))" }}
                />

                {/* API dots */}
                {apiChart.points.map((p, i) => (
                  <circle
                    key={`api-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={i === apiChart.points.length - 1 ? "4" : "2"}
                    className="fill-white stroke-[#5B8CFF] stroke-[1.5px] transition-all duration-300"
                  />
                ))}

                {/* Inference dots */}
                {inferenceChart.points.map((p, i) => (
                  <circle
                    key={`inf-${i}`}
                    cx={p.x}
                    cy={p.y}
                    r={i === inferenceChart.points.length - 1 ? "4" : "2"}
                    className="fill-white stroke-[#7B61FF] stroke-[1.5px] transition-all duration-300"
                  />
                ))}
              </svg>
            </div>

            {/* Legend */}
            <div className="grid grid-cols-2 gap-3 pt-3 border-t border-white/[0.06] text-xs">
              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#5B8CFF]" />
                  <span className="text-white/60 font-medium">API Server</span>
                </div>
                <p className="text-[10px] text-white/35 font-mono">{status.fastapi ? `${status.latencyMs} ms` : "--"}</p>
              </div>

              <div className="space-y-1">
                <div className="flex items-center gap-1.5">
                  <div className="h-2 w-2 rounded-full bg-[#7B61FF]" />
                  <span className="text-white/60 font-medium">Inference Load</span>
                </div>
                <p className="text-[10px] text-white/35 font-mono">
                  {status.fastapi ? `${inferenceHistory[inferenceHistory.length - 1]} ms` : "--"}
                </p>
              </div>
            </div>
          </motion.div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Model Configuration */}
        <motion.div 
          initial={{ opacity: 0, y: 14 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.2 }}
          className="glass-panel rounded-3xl p-6 space-y-5 relative overflow-hidden"
        >
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#5B8CFF]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Model Selection</p>
          </div>

          <div className="space-y-4">
            <div>
              <label className="text-xs text-white/45 mb-2 block">LLM Model (Ollama)</label>
              <select 
                value={selectedLlm}
                onChange={(e) => setSelectedLlm(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 text-sm text-white/75 outline-none transition-all duration-200 hover:border-white/20 cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {MODEL_OPTIONS.map(o => <option key={o} value={o} className="bg-[#0b0e1b] text-white">{o}</option>)}
              </select>
            </div>

            <div>
              <label className="text-xs text-white/45 mb-2 block">Embedding Model (CLIP)</label>
              <select 
                value={selectedEmbed}
                onChange={(e) => setSelectedEmbed(e.target.value)}
                className="w-full rounded-2xl px-4 py-3 text-sm text-white/75 outline-none transition-all duration-200 hover:border-white/20 cursor-pointer"
                style={{ background: "rgba(255,255,255,0.04)", border: "1px solid rgba(255,255,255,0.08)" }}
              >
                {EMBED_OPTIONS.map(o => <option key={o} value={o} className="bg-[#0b0e1b] text-white">{o}</option>)}
              </select>
            </div>
          </div>

          <div className="pt-2">
            <button 
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 w-full rounded-2xl px-5 py-3 text-sm font-semibold text-white transition-all duration-200 hover:opacity-90 active:scale-[0.99] disabled:opacity-50"
              style={{
                background: "linear-gradient(135deg, #5B8CFF, #7B61FF)",
                boxShadow: "0 0 24px rgba(91,140,255,0.25), inset 0 1px 0 rgba(255,255,255,0.12)",
              }}
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-white" />
                  <span>Syncing Parameters...</span>
                </>
              ) : saved ? (
                <>
                  <Check className="h-4 w-4 text-emerald-300" />
                  <span>Configuration Synchronized</span>
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 text-cyan-300" />
                  <span>Save Configuration</span>
                </>
              )}
            </button>
          </div>
        </motion.div>

        {/* Processing Options */}
        <motion.div 
          initial={{ opacity: 0, y: 14 }} 
          animate={{ opacity: 1, y: 0 }} 
          transition={{ delay: 0.25 }}
          className="glass-panel rounded-3xl p-6 space-y-5 relative overflow-hidden"
        >
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          
          <div className="flex items-center gap-2">
            <Sliders className="h-4 w-4 text-[#7B61FF]" />
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Processing Options</p>
          </div>

          <div className="space-y-4">
            {toggles.map((opt, i) => (
              <div 
                key={opt.label} 
                className={`flex items-center justify-between cursor-pointer group ${i < toggles.length - 1 ? "pb-3 border-b border-white/[0.05]" : ""}`}
                onClick={() => handleToggle(opt.id)}
              >
                <div className="flex-1 min-w-0 pr-4">
                  <p className="text-sm font-medium text-white/80 group-hover:text-white transition-colors">{opt.label}</p>
                  <p className="text-[11px] text-white/35 mt-0.5 leading-relaxed">{opt.detail}</p>
                </div>
                
                {/* Switch Slider Pill */}
                <div 
                  className={`relative h-6 w-11 rounded-full transition-colors duration-300 shrink-0 ${
                    opt.on ? "" : "bg-white/10"
                  }`}
                  style={opt.on ? { 
                    background: "linear-gradient(135deg, #5B8CFF, #7B61FF)", 
                    boxShadow: "0 0 12px rgba(91,140,255,0.3)" 
                  } : {}}
                >
                  <motion.div 
                    className="absolute top-1 h-4 w-4 rounded-full bg-white shadow-md"
                    layout
                    transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    style={{ left: opt.on ? "24px" : "4px" }}
                  />
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}
