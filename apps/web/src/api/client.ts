import { getOrCreateUserId } from "../lib/userId.js";

const DEFAULT_BASE = "http://localhost:3000";

function getBaseUrl(): string {
  const fromEnv = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "";
  return fromEnv || DEFAULT_BASE;
}

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface RequestOptions {
  signal?: AbortSignal;
  /** When true, the body is JSON-serialised and content-type set automatically. */
  json?: unknown;
  /** When set, body is sent as-is (e.g. FormData). */
  body?: BodyInit;
  /** Additional headers (auth/content-type are injected automatically). */
  headers?: Record<string, string>;
  method?: "GET" | "POST" | "PATCH" | "DELETE";
}

async function request<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = {
    "x-user-id": getOrCreateUserId(),
    ...opts.headers,
  };
  let body: BodyInit | undefined = opts.body;
  if (opts.json !== undefined) {
    body = JSON.stringify(opts.json);
    headers["content-type"] = "application/json";
  }
  const response = await fetch(url, {
    method: opts.method ?? "GET",
    headers,
    body,
    signal: opts.signal,
  });
  if (!response.ok) {
    let payload: { code?: string; message?: string } | null = null;
    try {
      payload = (await response.json()) as { code?: string; message?: string };
    } catch {
      // ignore body parse errors
    }
    throw new ApiError(
      response.status,
      payload?.code ?? "http_error",
      payload?.message ?? response.statusText,
      payload,
    );
  }
  if (response.status === 204) {
    return undefined as T;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return (await response.json()) as T;
  }
  return (await response.text()) as unknown as T;
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "GET" }),
  post: <T>(path: string, json?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", json }),
  patch: <T>(path: string, json?: unknown, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "PATCH", json }),
  delete: <T>(path: string, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "DELETE" }),
  postMultipart: <T>(path: string, formData: FormData, opts?: RequestOptions) =>
    request<T>(path, { ...opts, method: "POST", body: formData }),
};

export const __testing = { getBaseUrl };
