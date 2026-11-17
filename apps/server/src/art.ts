/** Artwork fetching restricted to Google's image hosts (no arbitrary URLs → no SSRF). */
const ART_HOSTS = /^(?:[\w-]+\.)*(?:googleusercontent\.com|ytimg\.com|ggpht\.com)$/;
const ART_MAX_BYTES = 5 * 1024 * 1024;

export function allowedArtUrl(raw: string | undefined): URL | null {
  try {
    const url = new URL(raw ?? '');
    return url.protocol === 'https:' && !url.port && ART_HOSTS.test(url.hostname) ? url : null;
  } catch {
    return null;
  }
}

export async function fetchArt(url: URL, signal?: AbortSignal): Promise<{ bytes: ArrayBuffer; type: string } | null> {
  const res = await fetch(url, { redirect: 'error', signal });
  const type = res.headers.get('content-type') ?? '';
  if (!res.ok || !type.startsWith('image/')) return null;
  const bytes = await res.arrayBuffer();
  return bytes.byteLength > ART_MAX_BYTES ? null : { bytes, type };
}
