/**
 * Resolves a storage URL returned by the backend (`/files/...`) into an
 * absolute URL the browser can fetch directly. Relative URLs would otherwise
 * hit the Vite dev origin (5173) instead of the API (3000).
 */
export function fileUrl(url: string | null | undefined): string {
  if (!url) return "";
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  const base = (import.meta.env?.VITE_API_BASE as string | undefined) ?? "http://localhost:3000";
  return `${base}${url}`;
}
