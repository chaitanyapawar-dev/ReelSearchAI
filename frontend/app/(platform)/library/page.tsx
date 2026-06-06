"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import Link from "next/link";
import { Search, Grid3X3, List, Play, Mic, ScanText, RefreshCw, AlertCircle, Plus } from "lucide-react";
import { fadeUp, staggerContainer } from "@/lib/motion";
import { fetchLibrary, type ReelItem } from "@/lib/api";

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
    return clean.length > 50 ? clean.substring(0, 50) + "..." : clean;
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

export default function LibraryPage() {
  const [reels, setReels] = useState<ReelItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("All");
  const [view, setView] = useState<"grid" | "list">("grid");
  const [search, setSearch] = useState("");

  const loadLibrary = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetchLibrary();
      if (res.success) {
        setReels(res.reels || []);
      } else {
        setError("Failed to fetch library.");
      }
    } catch (e: any) {
      setError(e.message || "Failed to load library.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadLibrary();
  }, []);

  // Compute dynamic filters from active hashtags
  const allHashtags = reels.flatMap(r => r.hashtags || []);
  const uniqueHashtags = Array.from(new Set(allHashtags)).slice(0, 8);
  const filtersList = ["All", ...uniqueHashtags];

  const filtered = reels.filter((r) => {
    const matchFilter = filter === "All" || (r.hashtags && r.hashtags.includes(filter));
    const title = getReelTitle(r).toLowerCase();
    const transcript = (r.transcript_preview || "").toLowerCase();
    const ocr = (r.ocr_text_preview || "").toLowerCase();
    const searchLower = search.toLowerCase();
    const matchSearch = 
      title.includes(searchLower) || 
      transcript.includes(searchLower) || 
      ocr.includes(searchLower);
    return matchFilter && matchSearch;
  });

  return (
    <div className="p-6 space-y-6">
      {/* Ambient glow */}
      <div className="fixed top-0 right-1/4 w-[400px] h-[300px] pointer-events-none -z-10"
        style={{ background: "radial-gradient(ellipse, rgba(123,97,255,0.06) 0%, transparent 70%)", filter: "blur(80px)" }} />

      <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
        className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white tracking-tight">Reel Library</h1>
          <p className="mt-0.5 text-sm text-white/40">
            {reels.length} reels indexed in local storage
          </p>
        </div>
        <button 
          onClick={loadLibrary}
          className="flex h-8 w-8 items-center justify-center rounded-xl bg-white/5 border border-white/10 hover:bg-white/10 transition-all duration-200 text-white/60 hover:text-white"
          title="Refresh library"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
        </button>
      </motion.div>

      {/* Toolbar */}
      <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.05 }}
        className="flex flex-wrap items-center gap-3">
        {/* Search input */}
        <div className="flex items-center gap-2 rounded-2xl px-4 py-2 glass-panel relative overflow-hidden">
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          <Search className="h-4 w-4 text-white/30 shrink-0" />
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search transcription, OCR..."
            className="bg-transparent text-sm text-white placeholder:text-white/28 outline-none w-52" />
        </div>

        {/* Category filters */}
        <div className="flex flex-wrap gap-2">
          {filtersList.map(f => (
            <button key={f} onClick={() => setFilter(f)}
              className={`rounded-full px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                filter === f
                  ? "text-[#5B8CFF] border border-[#5B8CFF]/40"
                  : "text-white/40 hover:text-white/70 border border-white/10 hover:border-white/20 hover:bg-white/[0.04]"
              }`}
              style={filter === f ? { background: "rgba(91,140,255,0.12)", boxShadow: "0 0 12px rgba(91,140,255,0.12)" } : {}}>
              {f === "All" ? f : `#${f}`}
            </button>
          ))}
        </div>

        {/* View toggle */}
        <div className="ml-auto flex items-center gap-1 rounded-xl p-1 glass-panel">
          {([["grid", Grid3X3], ["list", List]] as const).map(([v, Icon]) => (
            <button key={v} onClick={() => setView(v)}
              className={`rounded-lg p-1.5 transition-all ${view === v ? "bg-white/10 text-white" : "text-white/28 hover:text-white/60"}`}>
              <Icon className="h-4 w-4" />
            </button>
          ))}
        </div>
      </motion.div>

      {/* Reel List/Grid */}
      {loading ? (
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[1, 2, 3, 4, 5, 6].map((p) => (
            <div key={p} className="h-48 rounded-2xl glass-panel animate-pulse relative overflow-hidden">
              <div className="absolute inset-0 bg-white/[0.02]" />
            </div>
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="glass-panel rounded-2xl p-12 text-center space-y-4 max-w-[600px] mx-auto border border-white/10 relative overflow-hidden">
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/15 to-transparent pointer-events-none" />
          <AlertCircle className="h-8 w-8 text-white/35 mx-auto" strokeWidth={1.5} />
          <h3 className="text-sm font-semibold text-white/80">No reels found</h3>
          <p className="text-xs text-white/40 max-w-sm mx-auto leading-relaxed">
            {reels.length === 0 
              ? "Your local catalog is empty. Ingest a reel to populate the database."
              : "No reels match your active search terms or category filters."}
          </p>
          {reels.length === 0 && (
            <Link href="/processing" className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-[#5B8CFF] to-[#7B61FF] px-4 py-2 text-xs font-semibold text-white hover:scale-[1.02] transition-all">
              <Plus className="h-4 w-4" /> Ingest New Reel
            </Link>
          )}
        </div>
      ) : (
        <motion.div variants={staggerContainer} initial="hidden" animate="visible"
          className={view === "grid" ? "grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4" : "flex flex-col gap-3"}>
          {filtered.map((reel, i) => (
            <motion.div key={reel.id} variants={fadeUp} custom={i * 0.04}>
              <Link href={`/library/${reel.id}`}
                className={`block rounded-2xl overflow-hidden card-hover glass-panel cursor-pointer group relative ${view === "list" ? "flex items-center gap-4 p-4" : ""}`}>
                {/* Top sheen */}
                {view === "grid" && <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none z-10" />}

                {view === "grid" ? (
                  <>
                    <div className="relative h-32" style={{ background: getGradientById(reel.id) }}>
                      <div className="absolute inset-0 bg-gradient-to-t from-black/40 to-transparent" />
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="h-9 w-9 rounded-full bg-white/10 flex items-center justify-center border border-white/15 group-hover:bg-white/20 group-hover:scale-105 transition-all duration-300">
                          <Play className="h-4 w-4 text-white/70" />
                        </div>
                      </div>
                      <div className="absolute bottom-2 right-2 rounded bg-black/60 px-1.5 py-0.5 text-[10px] text-white/80 backdrop-blur-sm">0:30</div>
                      <div className="absolute top-2 left-2 flex items-center gap-1 rounded-full bg-emerald-500/20 border border-emerald-400/30 px-2 py-0.5 text-[9px] text-emerald-300">
                        <span className="h-1 w-1 rounded-full bg-emerald-400" />
                        Indexed
                      </div>
                      <div className="absolute bottom-2 left-2 flex gap-1">
                        {reel.transcript_preview && (
                          <div className="rounded bg-black/50 p-1 backdrop-blur-sm" title="Transcription Available">
                            <Mic className="h-2.5 w-2.5 text-cyan-300" />
                          </div>
                        )}
                        {reel.ocr_success && (
                          <div className="rounded bg-black/50 p-1 backdrop-blur-sm" title="OCR Available">
                            <ScanText className="h-2.5 w-2.5 text-violet-300" />
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="p-4">
                      <p className="text-sm font-semibold text-white/90 truncate group-hover:text-white transition-colors">{getReelTitle(reel)}</p>
                      <p className="mt-0.5 text-[11px] text-white/40">@{getReelSource(reel)}</p>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {reel.hashtags && reel.hashtags.length > 0 ? (
                          reel.hashtags.slice(0, 2).map(t => (
                            <span key={t} className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50">#{t}</span>
                          ))
                        ) : (
                          <span className="rounded-full border border-white/10 bg-white/[0.05] px-2 py-0.5 text-[10px] text-white/50">video</span>
                        )}
                      </div>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="h-12 w-16 rounded-xl shrink-0 flex items-center justify-center" style={{ background: getGradientById(reel.id) }}>
                      <Play className="h-4 w-4 text-white/50" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-white/90 truncate">{getReelTitle(reel)}</p>
                      <p className="text-[11px] text-white/40">@{getReelSource(reel)} · 0:30</p>
                    </div>
                    <div className="flex gap-1.5 items-center">
                      {reel.transcript_preview && <Mic className="h-3.5 w-3.5 text-cyan-300/50" />}
                      {reel.ocr_success && <ScanText className="h-3.5 w-3.5 text-violet-300/50" />}
                      <div className="h-2 w-2 rounded-full ml-2 bg-emerald-400 shadow-[0_0_6px_rgba(52,211,113,0.7)]" />
                    </div>
                  </>
                )}
              </Link>
            </motion.div>
          ))}
        </motion.div>
      )}
    </div>
  );
}
