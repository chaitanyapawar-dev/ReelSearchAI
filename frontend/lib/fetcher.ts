// fetcher.ts – production-grade fetch wrapper with timeout, exponential backoff retry, AbortController

export interface FetchOptions {
  method?: string;
  body?: any;
  headers?: Record<string, string>;
  timeoutMs?: number;
  retry?: number;
  signal?: AbortSignal;
}

/**
 * Fetch with automatic timeout and exponential backoff retry.
 * Respects external AbortSignal for React cleanup.
 */
export async function fetchWithRetry<T = any>(
  url: string,
  options: FetchOptions = {}
): Promise<T> {
  const {
    method = "GET",
    body,
    headers = {},
    timeoutMs = 10000,
    retry = 1,
    signal: externalSignal,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

  // If an external signal is provided, abort our controller when it fires
  const onExternalAbort = () => controller.abort();
  externalSignal?.addEventListener("abort", onExternalAbort);

  const init: RequestInit = {
    method,
    headers: {
      "Content-Type": "application/json",
      ...headers,
    },
    signal: controller.signal,
    cache: "no-store",
  };

  if (body !== undefined) {
    init.body = JSON.stringify(body);
  }

  try {
    const resp = await fetch(url, init);
    clearTimeout(timeoutId);

    if (!resp.ok) {
      const errText = await resp.text().catch(() => `HTTP ${resp.status}`);
      throw new Error(`HTTP ${resp.status}: ${errText}`);
    }

    return (await resp.json()) as T;
  } catch (e: any) {
    clearTimeout(timeoutId);

    // Don't retry on intentional cancellation
    if (e?.name === "AbortError" && externalSignal?.aborted) {
      throw e;
    }

    if (retry > 0) {
      const attempt = Math.max(0, 2 - retry); // 0-indexed attempt number
      const backoff = Math.min(1000 * Math.pow(2, attempt), 10000);
      await new Promise((r) => setTimeout(r, backoff));
      return fetchWithRetry<T>(url, {
        method,
        body,
        headers,
        timeoutMs,
        retry: retry - 1,
        signal: externalSignal,
      });
    }

    throw e;
  } finally {
    externalSignal?.removeEventListener("abort", onExternalAbort);
  }
}

/**
 * Single-attempt fetch with timeout and AbortController support.
 * Used for requests where retry is not desired (e.g., mutations).
 */
export async function apiFetch<T>(
  url: string,
  options: Omit<FetchOptions, "retry"> = {}
): Promise<T> {
  return fetchWithRetry<T>(url, { ...options, retry: 0 });
}
