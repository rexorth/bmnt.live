const ID = /^[A-Za-z0-9_-]{11}$/;

function parseStart(value: string | null): number | null {
  if (!value) return null;
  if (/^\d+$/.test(value)) return Number(value);
  const m = value.match(/^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/);
  if (!m || !m[0]) return null;
  return Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

// Accepts watch, youtu.be, /live/, /embed/, /shorts/ links or a bare 11-character ID.
export function parseYouTubeUrl(input: string): { id: string; startSec: number | null } | null {
  const raw = input.trim();
  if (ID.test(raw)) return { id: raw, startSec: null };
  let url: URL;
  try {
    url = new URL(raw.startsWith("http") ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^(www|m|music)\./, "");
  let id: string | null = null;
  if (host === "youtu.be") {
    id = url.pathname.slice(1).split("/")[0];
  } else if (host === "youtube.com" || host === "youtube-nocookie.com") {
    if (url.pathname === "/watch") id = url.searchParams.get("v");
    else {
      const m = url.pathname.match(/^\/(?:live|embed|shorts|v)\/([^/?#]+)/);
      id = m?.[1] ?? null;
    }
  }
  if (!id || !ID.test(id)) return null;
  return { id, startSec: parseStart(url.searchParams.get("t") ?? url.searchParams.get("start")) };
}

export function watchUrl(id: string, startSec?: number | null): string {
  return startSec ? `https://www.youtube.com/watch?v=${id}&t=${startSec}s` : `https://www.youtube.com/watch?v=${id}`;
}

export function embedUrl(id: string, startSec?: number | null): string {
  const base = `https://www.youtube-nocookie.com/embed/${id}`;
  return startSec ? `${base}?start=${startSec}` : base;
}
