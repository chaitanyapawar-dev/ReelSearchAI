"use client";

import React, { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from "react";
import { checkBackendHealth, type BackendStatus, API_BASE } from "@/lib/api";
import { toast, Toaster } from "react-hot-toast";

interface BackendContextValue {
  status: BackendStatus;
  isLoading: boolean;
  refresh: () => void;
}

const BackendContext = createContext<BackendContextValue>({
  status: { fastapi: false, ollama: false, chromadb: false, reelCount: 0, latencyMs: 0 },
  isLoading: true,
  refresh: () => {},
});

export function useBackend() {
  return useContext(BackendContext);
}

export default function BackendProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<BackendStatus>({
    fastapi: false,
    ollama: false,
    chromadb: false,
    reelCount: 0,
    latencyMs: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const prevStatusRef = useRef<BackendStatus | null>(null);
  const pollingRef = useRef(false);

  const refresh = useCallback(async () => {
    if (pollingRef.current) return;
    pollingRef.current = true;
    try {
      console.debug("[BackendProvider] fetchHealth starting. API_BASE:", API_BASE);
      const result = await checkBackendHealth();
      setStatus(result);
      setIsLoading(false);
      // Compare with previous status to show toasts on change
      if (prevStatusRef.current) {
        const prev = prevStatusRef.current;
        if (!result.fastapi && prev.fastapi) {
          toast.error("FastAPI backend is unreachable");
        }
        if (!result.ollama && prev.ollama) {
          toast.error("Ollama service is down");
        }
        if (!result.chromadb && prev.chromadb) {
          toast.error("ChromaDB is not responding");
        }
        // Notify when reels become available
        if (result.reelCount > 0 && prev.reelCount === 0) {
          toast.success(`🎬 ${result.reelCount} reels loaded`);
        }
      }
      prevStatusRef.current = result;
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
      setIsLoading(false);
      console.error("[BackendProvider] Failed to fetch backend health:", e);
      toast.error("Failed to fetch backend health");
    } finally {
      pollingRef.current = false;
    }
  }, []);

  // Poll backend health every 15 seconds
  useEffect(() => {
    refresh();
    const interval = setInterval(refresh, 15_000);
    return () => clearInterval(interval);
  }, [refresh]);

  // Memoize context value to avoid unnecessary re-renders
  const contextValue = useMemo(() => ({ status, isLoading, refresh }), [status, isLoading, refresh]);

  return (
    <BackendContext.Provider value={contextValue}>
      {children}
      <Toaster position="bottom-right" />
    </BackendContext.Provider>
  );
}
