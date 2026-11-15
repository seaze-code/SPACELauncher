import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { pipeline } from 'stream/promises';
import { Transform } from 'stream';

const writeQueues = new Map();

/**
 * Serializes atomic writes per file path to prevent interleaved writes or
 * partially written JSON files during rapid state/metadata updates.
 */
export function writeJsonAtomic(filePath, data, { spaces = 2 } = {}) {
  const resolved = path.resolve(filePath);
  const previous = writeQueues.get(resolved) || Promise.resolve();

  const next = previous
    .catch(() => {})
    .then(async () => {
      const dir = path.dirname(resolved);
      await fs.promises.mkdir(dir, { recursive: true });
      const tmpPath = `${resolved}.${process.pid}.${Date.now()}.${Math.random().toString(36).slice(2, 7)}.tmp`;
      const payload = JSON.stringify(data, null, spaces);
      try {
        await fs.promises.writeFile(tmpPath, payload, 'utf8');
        await renameWithRetry(tmpPath, resolved);
      } catch (err) {
        await fs.promises.unlink(tmpPath).catch(() => {});
        throw err;
      }
    });

  writeQueues.set(resolved, next);
  return next.finally(() => {
    if (writeQueues.get(resolved) === next) {
      writeQueues.delete(resolved);
    }
  });
}

async function renameWithRetry(src, dest, attempts = 4) {
  for (let i = 0; i < attempts; i++) {
    try {
      await fs.promises.rename(src, dest);
      return;
    } catch (err) {
      const retryable = err && (err.code === 'EPERM' || err.code === 'EBUSY' || err.code === 'EACCES');
      if (!retryable || i === attempts - 1) throw err;
      await sleep(40 * (i + 1));
    }
  }
}

export async function readJsonSafe(filePath, fallback = null) {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf8');
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Sanitizes a filename (strips directory separators and traversal sequences).
 */
export function sanitizeFileName(name, fallback = 'file') {
  const cleaned = Array.from(path.basename(String(name || '')))
    .map(ch => (ch.charCodeAt(0) < 32 || '<>:"/\\|?*'.includes(ch) ? '_' : ch))
    .join('')
    .trim();
  if (!cleaned || cleaned === '.' || cleaned === '..') return fallback;
  return cleaned;
}

/**
 * Resolves candidatePath relative to rootDir and throws if it escapes rootDir.
 */
export function assertSafeChildPath(rootDir, candidatePath) {
  const root = path.resolve(rootDir);
  const resolved = path.isAbsolute(candidatePath)
    ? path.resolve(candidatePath)
    : path.resolve(root, candidatePath);
  const rel = path.relative(root, resolved);
  if (!rel || rel.startsWith('..') || path.isAbsolute(rel)) {
    throw new Error(`Unsafe path outside target directory: ${candidatePath}`);
  }
  return resolved;
}

/**
 * Executes fetch with AbortController timeout and exponential backoff retries
 * on network failures, HTTP 429 (honoring Retry-After), and 5xx errors.
 */
export async function fetchWithRetry(
  url,
  options = {},
  { retries = 2, timeoutMs = 20000, retryDelayMs = 600 } = {}
) {
  let lastError;
  const externalSignal = options.signal;

  for (let attempt = 0; attempt <= retries; attempt++) {
    if (externalSignal?.aborted) {
      throw externalSignal.reason || new DOMException('Aborted', 'AbortError');
    }

    const controller = new AbortController();
    const onExternalAbort = () => controller.abort(externalSignal.reason);
    if (externalSignal) {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
    const timer = timeoutMs > 0 ? setTimeout(() => controller.abort(new Error(`Request timeout (${timeoutMs}ms): ${url}`)), timeoutMs) : null;

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (response.ok) {
        return response;
      }

      const retryableStatus = response.status === 429 || (response.status >= 500 && response.status < 600);
      if (!retryableStatus || attempt === retries) {
        return response;
      }

      let delay = retryDelayMs * Math.pow(2, attempt);
      const retryAfter = response.headers?.get?.('retry-after');
      if (retryAfter) {
        const parsedSeconds = Number(retryAfter);
        if (Number.isFinite(parsedSeconds) && parsedSeconds > 0) {
          delay = Math.min(parsedSeconds * 1000, 15000);
        }
      }
      await response.body?.cancel?.().catch(() => {});
      await sleep(delay);
    } catch (err) {
      lastError = err;
      if (externalSignal?.aborted || attempt === retries) {
        throw err;
      }
      await sleep(retryDelayMs * Math.pow(2, attempt));
    } finally {
      if (timer) clearTimeout(timer);
      if (externalSignal) {
        externalSignal.removeEventListener('abort', onExternalAbort);
      }
    }
  }

  throw lastError || new Error(`Failed to fetch ${url}`);
}

/**
 * Streams a remote URL to a `.part` temporary file, verifies optional SHA-1/SHA-512
 * hashes, reports byte progress, and atomically renames into `destPath`.
 */
export async function downloadFileAtomic(
  url,
  destPath,
  {
    headers = {},
    timeoutMs = 60000,
    retries = 2,
    expectedSha1 = null,
    expectedSha512 = null,
    signal = null,
    onProgress = null,
  } = {}
) {
  const dir = path.dirname(destPath);
  await fs.promises.mkdir(dir, { recursive: true });

  let lastError;
  for (let attempt = 0; attempt <= retries; attempt++) {
    if (signal?.aborted) {
      throw signal.reason || new DOMException('Download aborted', 'AbortError');
    }

    const partPath = `${destPath}.${process.pid}.${Math.random().toString(36).slice(2, 7)}.part`;
    const controller = new AbortController();
    const onAbort = () => controller.abort(signal.reason);
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
    const timer = timeoutMs > 0
      ? setTimeout(() => controller.abort(new Error(`Download timeout (${timeoutMs}ms): ${url}`)), timeoutMs)
      : null;

    try {
      const response = await fetch(url, { headers, signal: controller.signal });
      if (!response.ok || !response.body) {
        throw new Error(`HTTP ${response.status} downloading ${url}`);
      }

      const totalBytes = Number(response.headers?.get?.('content-length') || 0);
      let downloadedBytes = 0;

      const sha1Hash = expectedSha1 ? crypto.createHash('sha1') : null;
      const sha512Hash = expectedSha512 ? crypto.createHash('sha512') : null;

      const meter = new Transform({
        transform(chunk, _encoding, callback) {
          downloadedBytes += chunk.length;
          if (sha1Hash) sha1Hash.update(chunk);
          if (sha512Hash) sha512Hash.update(chunk);
          if (onProgress) {
            onProgress(downloadedBytes, totalBytes);
          }
          callback(null, chunk);
        },
      });

      await pipeline(response.body, meter, fs.createWriteStream(partPath));

      if (sha1Hash) {
        const actual = sha1Hash.digest('hex').toLowerCase();
        if (actual !== String(expectedSha1).toLowerCase()) {
          throw new Error(`SHA-1 mismatch for ${path.basename(destPath)}`);
        }
      }
      if (sha512Hash) {
        const actual = sha512Hash.digest('hex').toLowerCase();
        if (actual !== String(expectedSha512).toLowerCase()) {
          throw new Error(`SHA-512 mismatch for ${path.basename(destPath)}`);
        }
      }

      await renameWithRetry(partPath, destPath);
      return destPath;
    } catch (err) {
      lastError = err;
      await fs.promises.unlink(partPath).catch(() => {});
      if (signal?.aborted || attempt === retries) {
        throw err;
      }
      await sleep(700 * Math.pow(2, attempt));
    } finally {
      if (timer) clearTimeout(timer);
      if (signal) signal.removeEventListener('abort', onAbort);
    }
  }

  throw lastError || new Error(`Failed to download ${url}`);
}

/**
 * Runs an async worker over items with bounded concurrency.
 */
export async function runWithConcurrency(items, concurrency, worker) {
  const list = Array.isArray(items) ? items : [];
  if (list.length === 0) return [];
  const limit = Math.max(1, Math.min(Number(concurrency) || 4, list.length));
  const results = new Array(list.length);
  let cursor = 0;

  async function nextWorker() {
    while (true) {
      const idx = cursor++;
      if (idx >= list.length) break;
      results[idx] = await worker(list[idx], idx);
    }
  }

  await Promise.all(Array.from({ length: limit }, () => nextWorker()));
  return results;
}

/**
 * Simple bounded TTL cache for Modrinth and local metadata lookups.
 */
export class TTLMap {
  constructor({ ttlMs = 120000, maxSize = 250 } = {}) {
    this.ttlMs = ttlMs;
    this.maxSize = maxSize;
    this.store = new Map();
  }

  get(key) {
    const entry = this.store.get(key);
    if (!entry) return undefined;
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key);
      return undefined;
    }
    return entry.value;
  }

  set(key, value, customTtlMs = null) {
    if (this.store.size >= this.maxSize) {
      const oldestKey = this.store.keys().next().value;
      if (oldestKey !== undefined) this.store.delete(oldestKey);
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (customTtlMs ?? this.ttlMs),
    });
  }

  delete(key) {
    this.store.delete(key);
  }

  clear() {
    this.store.clear();
  }
}
