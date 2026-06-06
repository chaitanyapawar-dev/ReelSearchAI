"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Search, Mic, ScanText, Eye, Layers, Sparkles, ArrowRight, Play, AlertCircle, Cpu } from "lucide-react";
import Link from "next/link";
import { searchReels, type SearchResult, type SearchResponse } from "@/lib/api";

const EXAMPLES = [
  "Find reels about startup marketing",
  "Show clips mentioning OpenAI",
  "Find motivational editing styles",
  "Reels about machine learning",
  "Clips with productivity advice",
];

const TYPE_STYLES: Record<string, string> = {
  Semantic: "text-[#5B8CFF] bg-[#5B8CFF]/10 border-[#5B8CFF]/25",
  Audio: "text-cyan-300 bg-cyan-300/10 border-cyan-300/25",
  OCR: "text-violet-300 bg-violet-300/10 border-violet-300/25",
  Visual: "text-emerald-300 bg-emerald-300/10 border-emerald-300/25",
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

const getResultTitle = (r: SearchResult) => {
  if (r.instagram_caption_preview) {
    const clean = r.instagram_caption_preview.trim().split('\n')[0];
    return clean.length > 50 ? clean.substring(0, 50) + "..." : clean;
  }
  return `Reel Match #${r.id.substring(0, 6)}`;
};

const getResultSource = (r: SearchResult) => {
  try {
    const urlObj = new URL(r.original_url);
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

const getMatchType = (r: SearchResult) => {
  if ((r.clip_score ?? 0) > 0.3) return "Visual";
  if (r.ocr_success && r.ocr_text_preview) return "OCR";
  if ((r.text_score ?? 0) > 0.0) return "Audio";
  return "Semantic";
};

export default function SearchPage() {
  const [query, setQuery] = useState("");
  const [searchResponse, setSearchResponse] = useState<SearchResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const doSearch = async (overrideQuery?: string) => {
    const activeQuery = overrideQuery ?? query;
    if (!activeQuery.trim()) return;
    
    setLoading(true);
    setError(null);
    setSearchResponse(null);
    try {
      const res = await searchReels(activeQuery);
      if (res.success) {
        setSearchResponse(res);
      } else {
        setError("Vector retrieval failed.");
      }
    } catch (e: any) {
      if (e?.name === "AbortError") {
        console.log("[Search] Request aborted:", e.message);
        return;
      }
      setError(e.message || "Failed to contact local FastAPI search model.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-full flex flex-col px-6 py-12">

      {/* Deep ambient glow */}
      <div className="fixed inset-0 pointer-events-none -z-10 flex items-center justify-center">
        <div style={{
          width: "600px", height: "400px",
          background: "radial-gradient(ellipse, rgba(91,140,255,0.07) 0%, transparent 65%)",
          filter: "blur(80px)",
        }} />
      </div>

      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 18 }} animate={{ opacity: 1, y: 0 }} className="text-center mb-12">
        <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.05] px-4 py-1.5 mb-6"
          style={{ boxShadow: "0 0 20px rgba(91,140,255,0.08)" }}>
          <Sparkles className="h-3 w-3 text-[#5B8CFF]" />
          <span className="text-xs font-semibold uppercase tracking-widest text-white/70">Semantic AI Search</span>
        </div>
        <h1 className="text-3xl md:text-[40px] font-bold tracking-[-0.03em] leading-tight"
          style={{ background: "linear-gradient(to bottom, rgba(255,255,255,1), rgba(180,190,255,0.75))", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>
          Search Your Reel Memory
        </h1>
        <p className="mt-4 text-white/45 text-sm max-w-[420px] mx-auto leading-relaxed">
          Natural language queries across audio transcripts, video text overlays, and visual contexts.
        </p>
      </motion.div>

      {/* Neural Search Shell */}
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}
        className="max-w-[620px] w-full mx-auto">
        <div
          className="relative flex items-center gap-3 rounded-[26px] px-5 py-4 transition-all duration-300"
          style={{
            background: "rgba(255,255,255,0.06)",
            backdropFilter: "blur(30px) saturate(180%)",
            WebkitBackdropFilter: "blur(30px) saturate(180%)",
            border: "1px solid rgba(255,255,255,0.14)",
            boxShadow: "0 0 0 1px rgba(255,255,255,0.04) inset, 0 10px 40px rgba(0,0,0,0.25), 0 0 60px rgba(91,140,255,0.10)",
          }}
        >
          {/* Top sheen */}
          <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none rounded-full" />
          {/* Ambient inner glow on focus */}
          <div className="absolute inset-0 rounded-[26px] opacity-0 focus-within:opacity-100 transition-opacity duration-300"
            style={{ boxShadow: "0 0 0 2px rgba(91,140,255,0.25), 0 0 40px rgba(91,140,255,0.1)" }} />

          <Search className="h-5 w-5 text-white/35 shrink-0 relative z-10" />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => e.key === "Enter" && doSearch()}
            placeholder="Find reels about startup marketing..."
            className="flex-1 bg-transparent text-[15px] text-white placeholder:text-white/28 outline-none relative z-10"
            autoFocus
          />
          <button onClick={() => doSearch()}
            disabled={loading}
            className="flex items-center gap-1.5 rounded-[18px] px-4 py-2 text-sm font-semibold text-white shrink-0 hover:opacity-90 transition-all duration-200 relative z-10 disabled:opacity-50"
            style={{
              background: "linear-gradient(135deg, #5B8CFF, #7B61FF)",
              boxShadow: "0 0 24px rgba(91,140,255,0.35), inset 0 1px 0 rgba(255,255,255,0.15)",
            }}>
            Search <ArrowRight className="h-4 w-4" />
          </button>
        </div>

        {/* Signal type badges */}
        <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
          {([["Semantic", Layers], ["Audio", Mic], ["OCR", ScanText], ["Visual", Eye]] as const).map(([label, Icon]) => (
            <div key={label} className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-[11px] font-medium ${TYPE_STYLES[label]}`}>
              <Icon className="h-3 w-3" />{label}
            </div>
          ))}
        </div>

        {/* Example queries */}
        <AnimatePresence>
          {!searchResponse && !loading && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-8 text-center">
              <p className="text-[10px] uppercase tracking-widest text-white/22 mb-4">Try these</p>
              <div className="flex flex-wrap justify-center gap-2">
                {EXAMPLES.map((q) => (
                  <button key={q} onClick={() => { setQuery(q); doSearch(q); }}
                    className="rounded-full px-3 py-1.5 text-xs text-white/40 hover:text-white/75 border border-white/10 hover:border-white/20 hover:bg-white/[0.04] transition-all duration-200">
                    {q}
                  </button>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>

      {/* Loading */}
      <AnimatePresence>
        {loading && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="flex flex-col items-center gap-4 mt-16">
            <div className="relative h-12 w-12">
              <motion.div className="absolute inset-0 rounded-full border-2 border-[#5B8CFF]/40"
                animate={{ rotate: 360 }} transition={{ duration: 1, repeat: Infinity, ease: "linear" }} />
              <motion.div className="absolute inset-2 rounded-full border border-[#7B61FF]/60"
                animate={{ rotate: -360 }} transition={{ duration: 1.5, repeat: Infinity, ease: "linear" }} />
            </div>
            <div className="flex items-center gap-1.5 text-xs text-white/40 font-medium">
              <Cpu className="h-3.5 w-3.5 animate-pulse text-[#5B8CFF]" />
              Running multimodal query expansion & retrieval...
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Error */}
      <AnimatePresence>
        {error && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-[620px] w-full mx-auto mt-10 p-5 rounded-2xl border border-rose-500/20 bg-rose-500/5 flex items-start gap-3">
            <AlertCircle className="h-5 w-5 text-rose-500 shrink-0 mt-0.5" />
            <div>
              <h3 className="text-sm font-semibold text-white/90">Search Error</h3>
              <p className="text-xs text-white/50 leading-relaxed mt-1">{error}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Results */}
      <AnimatePresence>
        {searchResponse && (
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}
            className="max-w-[620px] w-full mx-auto mt-10 space-y-4">
            
            {/* LLM Query Rewriting Info */}
            {searchResponse.llm_active && (
              <div className="rounded-2xl p-4 bg-gradient-to-r from-violet-500/10 to-[#5B8CFF]/10 border border-violet-500/15 text-[12px] text-white/60 leading-relaxed space-y-1.5">
                <div className="flex items-center gap-1.5 text-violet-300 font-semibold uppercase tracking-wider text-[10px]">
                  <Sparkles className="h-3.5 w-3.5 text-[#5B8CFF]" />
                  Query Expanded via Ollama
                </div>
                <p>
                  Rewritten Query: <span className="text-white font-medium">"{searchResponse.rewritten_query}"</span>
                </p>
                <div className="text-[10px] text-white/30">
                  Expansion latency: {searchResponse.execution_time_ms}ms · Rejected intents: {searchResponse.llm_rejected}
                </div>
              </div>
            )}

            <div className="flex justify-between items-center px-1">
              <p className="text-xs text-white/30">
                {searchResponse.results?.length ?? 0} results for <span className="text-white/55">"{query}"</span>
              </p>
              {!searchResponse.llm_active && (
                <span className="text-[10px] text-white/20">Retrieval took {searchResponse.execution_time_ms}ms</span>
              )}
            </div>

            {searchResponse.results && searchResponse.results.length === 0 ? (
              <div className="glass-panel rounded-2xl p-10 text-center space-y-2 border border-white/10 relative overflow-hidden">
                <AlertCircle className="h-6 w-6 text-white/25 mx-auto" />
                <p className="text-sm font-semibold text-white/70">No matches found</p>
                <p className="text-xs text-white/45 max-w-sm mx-auto leading-relaxed">
                  {searchResponse.empty_reason || "ChromaDB search completed but returned zero matches with high cosine similarity scores."}
                </p>
              </div>
            ) : (
              searchResponse.results?.map((r, i) => {
                const matchType = getMatchType(r);
                const snippet = r.llm_reason || r.transcript_preview || r.instagram_caption_preview || "Vector index match";
                return (
                  <motion.div key={r.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: i * 0.08 }}
                    className="glass-panel card-hover rounded-2xl p-5 relative overflow-hidden">
                    <Link href={`/library/${r.id}`} className="absolute inset-0 z-0" />
                    <div className="absolute top-0 left-[5%] right-[5%] h-px bg-gradient-to-r from-transparent via-white/12 to-transparent pointer-events-none" />
                    
                    <div className="flex items-start gap-3 relative z-10">
                      <div className="h-12 w-16 rounded-xl shrink-0 flex items-center justify-center" style={{ background: getGradientById(r.id) }}>
                        <Play className="h-4 w-4 text-white/30" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-white/90 truncate">{getResultTitle(r)}</p>
                          <span className={`flex-shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-medium ${TYPE_STYLES[matchType]}`}>{matchType}</span>
                        </div>
                        <p className="text-[11px] text-white/40 mt-0.5">@{getResultSource(r)} · 0:30</p>
                        <p className="text-xs text-white/50 mt-2 leading-relaxed line-clamp-2 italic">"{snippet}"</p>
                      </div>
                    </div>
                    
                    <div className="mt-4 flex items-center gap-3 relative z-10">
                      <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: "rgba(255,255,255,0.06)" }}>
                        <motion.div className="h-full rounded-full"
                          style={{ background: "linear-gradient(90deg, #5B8CFF, #7B61FF)" }}
                          initial={{ width: 0 }}
                          animate={{ width: `${(r.similarity_score ?? 0) * 100}%` }}
                          transition={{ duration: 0.8, delay: 0.3 + i * 0.08, ease: [0.22, 1, 0.36, 1] }}
                        />
                      </div>
                      <span className="text-[10px] text-white/35 shrink-0 font-semibold">{Math.round((r.similarity_score ?? 0) * 100)}% relevance</span>
                    </div>
                  </motion.div>
                );
              })
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
