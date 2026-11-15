const MOJANG_CONTENT_BASE = 'https://launchercontent.mojang.com';
const MOJANG_NEWS_URL = `${MOJANG_CONTENT_BASE}/v2/news.json`;
const MOJANG_PATCH_NOTES_URL = `${MOJANG_CONTENT_BASE}/v2/javaPatchNotes.json`;

const FEED_TTL_MS = 10 * 60 * 1000;
let cachedFeed = null;
let cachedAt = 0;

export function resolveMojangImageUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  const trimmed = rawUrl.trim();
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `${MOJANG_CONTENT_BASE}${trimmed.startsWith('/') ? '' : '/'}${trimmed}`;
}

function normalizeDateMs(dateStr) {
  if (!dateStr) return 0;
  const parsed = Date.parse(dateStr);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeNewsEntry(entry) {
  const rawImg = entry?.newsPageImage?.url || entry?.playPageImage?.url || '';
  return {
    id: `news-${entry?.id || entry?.title}`,
    kind: 'news',
    title: String(entry?.title || '').trim(),
    category: String(entry?.category || 'Minecraft').trim(),
    newsType: Array.isArray(entry?.newsType) ? entry.newsType : [],
    date: String(entry?.date || ''),
    timestamp: normalizeDateMs(entry?.date),
    excerpt: String(entry?.text || '').trim(),
    imageUrl: resolveMojangImageUrl(rawImg),
    readMoreLink: typeof entry?.readMoreLink === 'string' ? entry.readMoreLink : '',
    isJava: Array.isArray(entry?.newsType) && entry.newsType.includes('Java'),
  };
}

function normalizePatchEntry(entry) {
  return {
    id: `patch-${entry?.id || entry?.version || entry?.title}`,
    kind: 'patch',
    title: String(entry?.title || '').trim(),
    version: String(entry?.version || '').trim(),
    patchType: entry?.type === 'release' ? 'release' : 'snapshot',
    date: String(entry?.date || ''),
    timestamp: normalizeDateMs(entry?.date),
    excerpt: String(entry?.shortText || '').trim(),
    imageUrl: resolveMojangImageUrl(entry?.image?.url || ''),
    contentPath: typeof entry?.contentPath === 'string' ? entry.contentPath : '',
    readMoreLink: entry?.version
      ? `https://feedback.minecraft.net/hc/en-us/sections/360001186971-Release-Changelogs`
      : 'https://www.minecraft.net/en-us/article',
  };
}

export async function fetchHomeFeed({ forceRefresh = false } = {}) {
  if (!forceRefresh && cachedFeed && (Date.now() - cachedAt) < FEED_TTL_MS) {
    return cachedFeed;
  }

  const [newsRes, patchRes] = await Promise.all([
    fetch(MOJANG_NEWS_URL, { signal: AbortSignal.timeout(10000) }),
    fetch(MOJANG_PATCH_NOTES_URL, { signal: AbortSignal.timeout(10000) }),
  ]);

  if (!newsRes.ok && !patchRes.ok) {
    throw new Error(`Mojang feed HTTP ${newsRes.status}/${patchRes.status}`);
  }

  const [newsJson, patchJson] = await Promise.all([
    newsRes.ok ? newsRes.json().catch(() => ({ entries: [] })) : Promise.resolve({ entries: [] }),
    patchRes.ok ? patchRes.json().catch(() => ({ entries: [] })) : Promise.resolve({ entries: [] }),
  ]);

  const rawNews = Array.isArray(newsJson?.entries) ? newsJson.entries : [];
  const rawPatches = Array.isArray(patchJson?.entries) ? patchJson.entries : [];

  const news = rawNews
    .map(normalizeNewsEntry)
    .filter(item => item.title)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 24);

  const patchNotes = rawPatches
    .map(normalizePatchEntry)
    .filter(item => item.title)
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, 24);

  const payload = {
    ok: true,
    news,
    patchNotes,
    fetchedAt: Date.now(),
  };

  if (news.length > 0 || patchNotes.length > 0) {
    cachedFeed = payload;
    cachedAt = Date.now();
  }

  return payload;
}

export async function fetchPatchNoteDetail(contentPath) {
  const safePath = String(contentPath || '').trim().replace(/^\/+/, '');
  if (!/^javaPatchNotes\/[a-zA-Z0-9._-]+\.json$/.test(safePath)) {
    throw new Error('Invalid patch note path');
  }
  const url = `${MOJANG_CONTENT_BASE}/v2/${safePath}`;
  const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
  if (!res.ok) {
    throw new Error(`Failed to fetch patch note (${res.status})`);
  }
  const data = await res.json();
  return {
    ok: true,
    id: data?.id || '',
    title: data?.title || '',
    version: data?.version || '',
    type: data?.type || 'release',
    date: data?.date || '',
    imageUrl: resolveMojangImageUrl(data?.image?.url || ''),
    body: typeof data?.body === 'string' ? data.body : '',
  };
}
