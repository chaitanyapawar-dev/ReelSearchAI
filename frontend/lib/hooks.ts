// frontend/lib/hooks.ts – React Query hooks for backend-authoritative data fetching
// All hooks wrap api.ts functions with proper caching, deduplication, and cache invalidation.

"use client";

import {
  useQuery,
  useMutation,
  useQueryClient,
  type UseQueryOptions,
} from "@tanstack/react-query";

import {
  fetchDashboardStats,
  fetchDashboardActivity,
  fetchReels,
  deleteReel,
  reindexReel,
  semanticSearch,
  fetchSystemHealth,
  fetchSearchAnalytics,
  type DashboardStats,
  type ActivityItem,
  type ReelsResponse,
  type ReelsParams,
  type SearchResponse,
  type SystemHealth,
  type SearchAnalytics,
  type ReindexResult,
} from "@/lib/api";

// ─── Query Keys (centralized to prevent typos) ──────────────────────────────
export const queryKeys = {
  dashboardStats: ["dashboard", "stats"] as const,
  dashboardActivity: (limit?: number) => ["dashboard", "activity", limit] as const,
  reels: (params?: ReelsParams) => ["reels", params] as const,
  systemHealth: ["system", "health"] as const,
  searchAnalytics: ["search", "analytics"] as const,
} as const;

// ─── Dashboard ───────────────────────────────────────────────────────────────

export function useDashboardStats(
  options?: Partial<UseQueryOptions<DashboardStats>>
) {
  return useQuery<DashboardStats>({
    queryKey: queryKeys.dashboardStats,
    queryFn: ({ signal }) => fetchDashboardStats(signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
    ...options,
  });
}

export function useDashboardActivity(limit: number = 20) {
  return useQuery<ActivityItem[]>({
    queryKey: queryKeys.dashboardActivity(limit),
    queryFn: ({ signal }) => fetchDashboardActivity(limit, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

// ─── Reels ───────────────────────────────────────────────────────────────────

export function useReels(params: ReelsParams = {}) {
  return useQuery<ReelsResponse>({
    queryKey: queryKeys.reels(params),
    queryFn: ({ signal }) => fetchReels(params, signal),
    staleTime: 30_000,
    refetchOnWindowFocus: true,
    retry: 2,
  });
}

export function useDeleteReel() {
  const queryClient = useQueryClient();

  return useMutation<{ success: boolean }, Error, string>({
    mutationFn: (reelId: string) => deleteReel(reelId),
    onSuccess: () => {
      // Invalidate reels list and dashboard stats after deletion
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
      queryClient.invalidateQueries({ queryKey: ["dashboard", "activity"] });
    },
  });
}

export function useReindexReel() {
  const queryClient = useQueryClient();

  return useMutation<ReindexResult, Error, string>({
    mutationFn: (reelId: string) => reindexReel(reelId),
    onSuccess: () => {
      // Invalidate reels list after reindex
      queryClient.invalidateQueries({ queryKey: ["reels"] });
      queryClient.invalidateQueries({ queryKey: queryKeys.dashboardStats });
    },
  });
}

// ─── Search ──────────────────────────────────────────────────────────────────

export function useSemanticSearch() {
  return useMutation<SearchResponse, Error, string>({
    mutationFn: (query: string) => semanticSearch(query),
  });
}

// ─── System ──────────────────────────────────────────────────────────────────

export function useSystemHealth() {
  return useQuery<SystemHealth>({
    queryKey: queryKeys.systemHealth,
    queryFn: ({ signal }) => fetchSystemHealth(signal),
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
    retry: 1,
  });
}

// ─── Analytics ───────────────────────────────────────────────────────────────

export function useSearchAnalytics() {
  return useQuery<SearchAnalytics>({
    queryKey: queryKeys.searchAnalytics,
    queryFn: ({ signal }) => fetchSearchAnalytics(signal),
    staleTime: 60_000,
    retry: 2,
  });
}
