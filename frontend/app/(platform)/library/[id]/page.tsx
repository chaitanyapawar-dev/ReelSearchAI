"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "framer-motion";
import {
  Play, Mic, ScanText, Eye, Layers, Brain, Tag,
  ChevronLeft, Sparkles, TrendingUp, Hash, Volume2, RefreshCw, AlertCircle
} from "lucide-react";
import Link from "next/link";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { fetchLibrary, reindexReel, type ReelItem, API_BASE } from "@/lib/api";

const glass = {
  background: "rgba(255,255,255,0.05)",
  backdropFilter: "blur(30px)",
  WebkitBackdropFilter: "blur(30px)",
  border: "1px solid rgba(255,255,255,0.08)",
  boxShadow: "0 0 0 1px rgba(255,255,255,0.03) inset, 0 8px 32px rgba(0,0,0,0.22)",
};

// Helper to get a gradient from a string ID
const getGradientById = (id: string) => {
  const gradients = [
    "linear-gradient(135deg, #0d1230, #1a1b4b)",
    "linear-gradient(135deg, #0d2015, #113825)",
    "linear-gradient(135deg, #2a0d0d, #4a1515)",
    "linear-gradient(135deg, #0d1020, #171b38)",
    "linear-gradient(135deg, #2a1a0d, #422712)",
    "linear-gradient(135deg, #1a0d2a, #2f124d)"
  ];
  let sum = 0;
  for (let i = 0; i < id.length; i++) {
    sum += id.charCodeAt(i);
  }
  return gradients[sum % gradients.length];
};

const getReelTitle = (reel: ReelItem) => {
  if (reel.instagram_caption) {
    const clean = reel.instagram_caption.trim().split('\n')[0];
    return clean.length > 60 ? clean.substring(0, 60) + "..." : clean;
  }
  return `Reel Video #${reel.id.substring(0, 6)}`;
};

const getReelSource = (reel: ReelItem) => {
  try {
    const urlObj = new URL(reel.original_url);
    if (urlObj.hostname.includes("instagram.com")) {
      const parts = urlObj.pathname.split('/');
      const pIndex = parts.indexOf("p");
      const reelIndex = parts.indexOf("reel");
      if (pIndex !== -1 && parts[pIndex + 1]) return `instagram/${parts[pIndex + 1]}`;
      if (reelIndex !== -1 && parts[reelIndex + 1]) return `instagram/${parts[reelIndex + 1]}`;
      return "instagram.com";
    }
    return urlObj.hostname;
  } catch {
    return "local_storage";
  }
};

export default function ReelDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = typeof params.id === "string" ? params.id : "";

  const [reel, setReel] = useState<ReelItem | null>(null);
  const [related, setRelated] = useState<ReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [reindexing, setReindexing] = useState(false);
  const [reindexSuccess, setReindexSuccess] = useState(false);

  const loadData = async () => {
    if (!id) return;
    try {
      setLoading(true);
      setError(null);
      const res = await fetchLibrary();
      if (res.success) {
        const found = res.reels.find((r) => r.id === id);
        if (found) {
          setReel(found);
          // Find other reels as "similar"
          const others = res.reels.filter((r) => r.id !== id).slice(0, 2);
          setRelated(others);
        } else {
          setError(`Reel with ID ${id} not found in library.`);
        }
      } else {
        setError("Failed to fetch library database.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load reel details.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [id]);

  const handleReindex = async () => {
    if (!reel) return;
    try {
      setReindexing(true);
      setReindexSuccess(false);
      const res = await reindexReel(reel.id);
      if (res.success) {
        setReindexSuccess(true);
        loadData();
      } else {
        alert("Failed to reindex reel.");
      }
    } catch (e: any) {
      alert(e.message || "Error reindexing reel.");
    } finally {
      setReindexing(false);
    }
  };

  if (loading) {
    return (
      <div className="p-6 max-w-[1100px] space-y-6">
        <div className="h-6 w-28 bg-white/5 rounded animate-pulse" />
        <div className="h-10 w-2/3 bg-white/5 rounded animate-pulse" />
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="h-64 rounded-2xl glass-panel animate-pulse" />
            <div className="h-32 rounded-2xl glass-panel animate-pulse" />
          </div>
          <div className="space-y-6">
            <div className="h-40 rounded-2xl glass-panel animate-pulse" />
            <div className="h-40 rounded-2xl glass-panel animate-pulse" />
          </div>
        </div>
      </div>
    );
  }

  if (error || !reel) {
    return (
      <div className="p-6 max-w-[1100px]">
        <Link href="/library" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-6">
          <ChevronLeft className="h-3.5 w-3.5" />
          Back to Library
        </Link>
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4 max-w-[600px] mx-auto border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          <AlertCircle className="h-8 w-8 text-rose-500 mx-auto" />
          <h3 className="text-sm font-semibold text-white/80">Failed to load Reel</h3>
          <p className="text-xs text-white/40 max-w-sm mx-auto leading-relaxed">
            {error || "An unexpected error occurred while loading the reel details."}
          </p>
          <button onClick={loadData} className="inline-flex items-center gap-2 rounded-xl bg-white/5 border border-white/10 px-4 py-2 text-xs font-semibold text-white hover:bg-white/10 transition-all">
            <RefreshCw className="h-3.5 w-3.5" /> Retry
          </button>
        </div>
      </div>
    );
  }

  const ocrLines = reel.ocr_text_preview 
    ? reel.ocr_text_preview.split('\n').map(l => l.trim()).filter(Boolean) 
    : [];

  return (
    <div className="p-6 max-w-[1100px]">
      {/* Back */}
      <Link href="/library" className="inline-flex items-center gap-1.5 text-xs text-white/40 hover:text-white/70 transition-colors mb-6">
        <ChevronLeft className="h-3.5 w-3.5" />
        Back to Library
      </Link>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">{getReelTitle(reel)}</h1>
            <p className="mt-1 text-sm text-white/40">@{getReelSource(reel)} · 0:30</p>
          </div>
          <div className="flex items-center gap-3">
            <button 
              onClick={handleReindex}
              disabled={reindexing}
              className="flex items-center gap-1.5 rounded-xl bg-white/5 border border-white/10 px-3.5 py-1.5 text-xs text-white/70 hover:text-white hover:bg-white/10 transition-all duration-200 disabled:opacity-50"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${reindexing ? "animate-spin" : ""}`} />
              {reindexing ? "Reindexing..." : reindexSuccess ? "Reindexed!" : "Reindex"}
            </button>
            <div className="flex items-center gap-1.5 rounded-full bg-emerald-500/15 border border-emerald-400/25 px-3 py-1.5 text-xs text-emerald-300">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 shadow-[0_0_8px_rgba(52,211,113,0.7)]" />
              Indexed
            </div>
          </div>
        </div>
        <div className="flex flex-wrap gap-2 mt-3">
          {reel.hashtags && reel.hashtags.length > 0 ? (
            reel.hashtags.map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/55">#{tag}</span>
            ))
          ) : (
            ["video", "local_ai"].map((tag) => (
              <span key={tag} className="rounded-full border border-white/10 bg-white/5 px-2.5 py-0.5 text-[11px] text-white/55">#{tag}</span>
            ))
          )}
        </div>
      </motion.div>

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Col — Player + AI Summary */}
        <div className="lg:col-span-2 space-y-6">
          {/* Video Player */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible"
            className="rounded-2xl overflow-hidden aspect-video relative flex items-center justify-center bg-black border border-white/10"
            style={glass}>
            {reel.video_exists ? (
              <video
                src={`${API_BASE}/downloads/${reel.video_filename}`}
                controls
                className="w-full h-full object-contain"
              />
            ) : (
              <div className="text-center p-6 text-white/40">
                <AlertCircle className="h-8 w-8 text-rose-500 mx-auto mb-2" />
                <p className="text-xs font-semibold text-white/80">Local video file not found</p>
                <p className="text-[10px] text-white/35 mt-1">Check downloads folder or re-download.</p>
              </div>
            )}
          </motion.div>

          {/* AI Visual Description */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.08 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-3">
              <Sparkles className="h-4 w-4 text-[#5B8CFF]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">AI Visual Description</span>
            </div>
            <p className="text-sm text-white/70 leading-relaxed">
              {reel.visual_captions_preview || "No visual caption metadata generated yet. Try reindexing the reel to trigger optical understanding."}
            </p>
            <div className="mt-4 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-3.5 w-3.5 text-[#5B8CFF]" />
                <span className="text-[11px] text-white/45">Visual Captions: <span className="text-white/70 font-semibold">{reel.visual_caption_count} frames</span></span>
              </div>
              <div className="flex items-center gap-2">
                <Volume2 className="h-3.5 w-3.5 text-cyan-400" />
                <span className="text-[11px] text-white/45">Understanding: <span className="text-white/70 font-semibold">{reel.has_visual_understanding ? "Enabled" : "Disabled"}</span></span>
              </div>
            </div>
          </motion.div>

          {/* Transcript */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.12 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-3">
              <Mic className="h-4 w-4 text-cyan-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Whisper Transcript</span>
            </div>
            <p className="text-sm text-white/65 leading-relaxed">
              {reel.transcript_preview || "Transcription is empty or could not be loaded."}
            </p>
          </motion.div>

          {/* Topic Detection */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.15 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-4">
              <Brain className="h-4 w-4 text-violet-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Topic Detection</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {reel.hashtags && reel.hashtags.length > 0 ? (
                reel.hashtags.map((topic, i) => (
                  <span key={topic}
                    className="rounded-xl px-3 py-1.5 text-xs font-medium text-white/75"
                    style={{
                      background: `rgba(91, 140, 255, ${0.08 + i * 0.02})`,
                      border: "1px solid rgba(91,140,255,0.2)",
                    }}>
                    {topic.toUpperCase()}
                  </span>
                ))
              ) : (
                ["Social Media", "Video Pipeline", "Local Database"].map((topic, i) => (
                  <span key={topic}
                    className="rounded-xl px-3 py-1.5 text-xs font-medium text-white/75"
                    style={{
                      background: `rgba(91, 140, 255, ${0.08 + i * 0.02})`,
                      border: "1px solid rgba(91,140,255,0.2)",
                    }}>
                    {topic}
                  </span>
                ))
              )}
            </div>
          </motion.div>
        </div>

        {/* Right Col — OCR, Captions, Similar */}
        <div className="space-y-6">
          {/* OCR Extractions */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.1 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-4">
              <ScanText className="h-4 w-4 text-violet-300" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">OCR Extraction</span>
            </div>
            <div className="space-y-2">
              {ocrLines.length > 0 ? (
                ocrLines.map((text, i) => (
                  <div key={i} className="flex items-start gap-2 rounded-xl px-3 py-2"
                    style={{ background: "rgba(123, 97, 255, 0.08)", border: "1px solid rgba(123,97,255,0.15)" }}>
                    <span className="text-[9px] font-bold uppercase tracking-widest text-violet-400/70 mt-0.5 shrink-0">T{i+1}</span>
                    <span className="text-xs text-white/70 leading-snug">{text}</span>
                  </div>
                ))
              ) : (
                <div className="text-xs text-white/30 italic py-2">No text overlays detected in the video frames.</div>
              )}
            </div>
          </motion.div>

          {/* Instagram Caption */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.14 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-4">
              <Hash className="h-4 w-4 text-emerald-400" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Original Caption</span>
            </div>
            <p className="text-xs leading-relaxed text-white/55 whitespace-pre-wrap">
              {reel.instagram_caption || "No original caption extracted."}
            </p>
          </motion.div>

          {/* Semantic Signals */}
          <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.16 }}
            className="rounded-2xl p-5" style={glass}>
            <div className="flex items-center gap-2 mb-4">
              <Layers className="h-4 w-4 text-[#5B8CFF]" />
              <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Pipeline Signal Integrity</span>
            </div>
            <div className="space-y-3">
              {[
                { label: "Audio (Whisper)", value: reel.transcript_preview ? 0.98 : 0 },
                { label: "Vision (CLIP)", value: reel.has_visual_understanding ? 0.92 : 0 },
                { label: "OCR (Text)", value: reel.ocr_success ? 0.85 : 0 },
                { label: "Instagram Metadata", value: reel.has_caption ? 0.90 : 0 },
              ].map(({ label, value }) => (
                <div key={label}>
                  <div className="flex justify-between text-[11px] mb-1.5">
                    <span className="text-white/45">{label}</span>
                    <span className="text-white/65 font-semibold">{Math.round(value * 100)}%</span>
                  </div>
                  <div className="h-1 rounded-full bg-white/5 overflow-hidden">
                    <motion.div
                      className="h-full rounded-full bg-gradient-to-r from-[#5B8CFF] to-[#7B61FF]"
                      initial={{ width: 0 }}
                      animate={{ width: `${value * 100}%` }}
                      transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          {/* Related Reels */}
          {related.length > 0 && (
            <motion.div variants={fadeUp} initial="hidden" animate="visible" transition={{ delay: 0.18 }}
              className="rounded-2xl p-5" style={glass}>
              <div className="flex items-center gap-2 mb-4">
                <Eye className="h-4 w-4 text-cyan-300" />
                <span className="text-xs font-semibold uppercase tracking-wider text-white/60">Other Library Reels</span>
              </div>
              <div className="space-y-3">
                {related.map((s) => (
                  <Link key={s.id} href={`/library/${s.id}`}
                    className="flex items-center gap-3 rounded-xl p-3 transition-all duration-200 hover:-translate-y-0.5 hover:bg-white/[0.05]"
                    style={{ border: "1px solid rgba(255,255,255,0.07)" }}>
                    <div className="h-10 w-14 rounded-lg shrink-0 flex items-center justify-center" style={{ background: getGradientById(s.id) }}>
                      <Play className="h-3.5 w-3.5 text-white/40" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white/80 truncate">{getReelTitle(s)}</p>
                      <p className="text-[10px] text-white/35 mt-0.5">@{getReelSource(s)}</p>
                    </div>
                  </Link>
                ))}
              </div>
            </motion.div>
          )}
        </div>
      </div>
    </div>
  );
}
