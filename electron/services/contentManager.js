import { app, dialog, shell } from 'electron';
import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { createRequire } from 'module';
import { getMinecraftRoot, getMinecraftRoots, getInstanceDir } from './paths.js';
import { getMainWindow } from './windowManager.js';
import {
  assertSafeChildPath,
  downloadFileAtomic,
  fetchWithRetry,
  readJsonSafe,
  runWithConcurrency,
  sanitizeFileName,
  TTLMap,
  writeJsonAtomic,
} from './utils.js';
import {
  getModrinthProject,
  getModrinthProjectVersions,
  getModrinthVersion,
  checkModrinthVersionFilesUpdate,
} from '../../src/lib/modrinth.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const MODS_METADATA_FILE = 'mods-metadata.json';
const USER_AGENT = 'SpaceLauncher/1.0.0 (desktop)';
const MOD_EXT_REGEX = /\.(jar(\.disabled)?|slpkg|olpkg)$/i;
const PACK_EXT_REGEX = /\.zip$/i;

let metadataCache = null;
const shaderNegativeLookupCache = new TTLMap({ ttlMs: 12 * 60 * 60 * 1000, maxSize: 300 });

function getMetadataStorePath() {
  return path.join(app.getPath('userData'), MODS_METADATA_FILE);
}

function getContentRoot(instanceId = null) {
  if (instanceId) {
    const dir = getInstanceDir(instanceId);
    if (dir) return dir;
  }
  return getMinecraftRoot();
}

function getContentRoots(instanceId = null) {
  if (instanceId) {
    const dir = getInstanceDir(instanceId);
    return dir ? [dir] : [getMinecraftRoot()];
  }
  return getMinecraftRoots();
}

export function stripModExtension(fileName) {
  return String(fileName || '').replace(MOD_EXT_REGEX, '');
}

export function isModFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return (
    lower.endsWith('.jar') ||
    lower.endsWith('.jar.disabled') ||
    lower.endsWith('.slpkg') ||
    lower.endsWith('.olpkg')
  );
}

export function isEnabledModFileName(fileName) {
  return String(fileName || '').toLowerCase().endsWith('.jar');
}

export async function readModsMetadataStore() {
  if (metadataCache) return metadataCache;
  const parsed = await readJsonSafe(getMetadataStorePath(), {});
  metadataCache = parsed && typeof parsed === 'object' ? parsed : {};
  return metadataCache;
}

export async function saveModMetadataStore(newMeta) {
  if (!newMeta || typeof newMeta !== 'object') return;
  try {
    const current = await readModsMetadataStore();
    const merged = { ...current, ...newMeta };
    metadataCache = merged;
    await writeJsonAtomic(getMetadataStorePath(), merged);
  } catch (err) {
    console.warn('Failed to save mods metadata store:', err);
  }
}

export async function fetchAndCacheIconAsBase64(iconUrl) {
  if (!iconUrl || typeof iconUrl !== 'string' || !iconUrl.startsWith('http')) return iconUrl || null;
  try {
    const res = await fetchWithRetry(
      iconUrl,
      { headers: { 'User-Agent': USER_AGENT } },
      { retries: 1, timeoutMs: 8000 }
    );
    if (!res.ok) return iconUrl;
    const arrayBuffer = await res.arrayBuffer();
    if (arrayBuffer.byteLength > 512 * 1024) return iconUrl; // Avoid caching huge images in JSON
    const contentType = res.headers.get('content-type') || 'image/png';
    const base64 = Buffer.from(arrayBuffer).toString('base64');
    return `data:${contentType};base64,${base64}`;
  } catch {
    return iconUrl;
  }
}

export function extractTextComponent(component) {
  if (!component) return '';
  if (typeof component === 'string') return component;
  if (typeof component === 'number' || typeof component === 'boolean') return String(component);
  if (Array.isArray(component)) return component.map(extractTextComponent).join('');

  if (typeof component === 'object') {
    let result = '';
    if (typeof component.fallback === 'string') result += component.fallback;
    else if (typeof component.text === 'string') result += component.text;
    else if (typeof component.translate === 'string') result += component.translate;
    if (component.extra) result += extractTextComponent(component.extra);
    if (Array.isArray(component.with)) {
      result += ' ' + component.with.map(extractTextComponent).join(' ');
    }
    return result;
  }
  return '';
}

export function cleanMinecraftText(raw) {
  if (raw === null || raw === undefined) return '';
  let text = typeof raw === 'object' ? extractTextComponent(raw) : String(raw || '');
  const trimmed = text.trim();
  if ((trimmed.startsWith('{') && trimmed.endsWith('}')) || (trimmed.startsWith('[') && trimmed.endsWith(']'))) {
    try {
      const parsed = JSON.parse(trimmed);
      if (parsed && typeof parsed === 'object') {
        text = extractTextComponent(parsed);
      }
    } catch {}
  }

  return text
    .replace(/(?:§|\\u00a7|&)[0-9a-fk-or]/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTomlModMetadata(zip, entryName, loaderName) {
  const entry = zip.getEntry(entryName);
  if (!entry) return null;
  const text = entry.getData().toString('utf8');
  const idMatch = text.match(/modId\s*=\s*["']([^"']+)["']/i);
  const nameMatch = text.match(/displayName\s*=\s*["']([^"']+)["']/i);
  const verMatch = text.match(/version\s*=\s*["']([^"']+)["']/i);
  const descMatch =
    text.match(/description\s*=\s*'''([\s\S]*?)'''/i) ||
    text.match(/description\s*=\s*"""([\s\S]*?)"""/i) ||
    text.match(/description\s*=\s*["']([^"']+)["']/i);
  const logoMatch = text.match(/logoFile\s*=\s*["']([^"']+)["']/i);
  const authorsMatch = text.match(/authors\s*=\s*["']([^"']+)["']/i);

  let iconUrl = null;
  if (logoMatch?.[1]) {
    const logoEntry = zip.getEntry(logoMatch[1]) || zip.getEntry(`META-INF/${logoMatch[1]}`);
    if (logoEntry) {
      iconUrl = `data:image/png;base64,${logoEntry.getData().toString('base64')}`;
    }
  }

  return {
    id: idMatch ? idMatch[1] : null,
    displayName: nameMatch ? nameMatch[1] : null,
    version: verMatch ? verMatch[1] : '',
    description: descMatch ? descMatch[1].trim() : '',
    authors: authorsMatch ? authorsMatch[1].trim() : '',
    iconUrl,
    loader: loaderName,
  };
}

export function extractJarMetadata(jarFilePath) {
  try {
    const zip = new AdmZip(jarFilePath);

    const quiltEntry = zip.getEntry('quilt.mod.json');
    if (quiltEntry) {
      const data = JSON.parse(quiltEntry.getData().toString('utf8'));
      const qmod = data?.quilt_loader?.metadata || data;
      let iconUrl = null;
      if (qmod?.icon) {
        const iconEntry = zip.getEntry(qmod.icon);
        if (iconEntry) iconUrl = `data:image/png;base64,${iconEntry.getData().toString('base64')}`;
      }
      return {
        id: qmod?.id || data?.quilt_loader?.id || null,
        displayName: qmod?.name || qmod?.id || null,
        version: qmod?.version || data?.quilt_loader?.version || '',
        description: qmod?.description || '',
        authors: qmod?.contributors && typeof qmod.contributors === 'object'
          ? Object.keys(qmod.contributors).join(', ')
          : '',
        iconUrl,
        loader: 'quilt',
      };
    }

    const fabricEntry = zip.getEntry('fabric.mod.json');
    if (fabricEntry) {
      const data = JSON.parse(fabricEntry.getData().toString('utf8'));
      let iconUrl = null;
      if (data.icon) {
        const iconPath = typeof data.icon === 'string' ? data.icon : Object.values(data.icon)[0];
        const iconEntry = iconPath ? zip.getEntry(iconPath) : null;
        if (iconEntry) iconUrl = `data:image/png;base64,${iconEntry.getData().toString('base64')}`;
      }
      return {
        id: data.id || null,
        displayName: data.name || data.id,
        version: data.version || '',
        description: data.description || '',
        authors: Array.isArray(data.authors)
          ? data.authors.map(a => (typeof a === 'string' ? a : a?.name)).filter(Boolean).join(', ')
          : (data.authors || ''),
        iconUrl,
        loader: 'fabric',
      };
    }

    const neoForgeMeta = parseTomlModMetadata(zip, 'META-INF/neoforge.mods.toml', 'neoforge');
    if (neoForgeMeta) return neoForgeMeta;

    const forgeMeta = parseTomlModMetadata(zip, 'META-INF/mods.toml', 'forge');
    if (forgeMeta) return forgeMeta;

    const mcmodEntry = zip.getEntry('mcmod.info');
    if (mcmodEntry) {
      const info = JSON.parse(mcmodEntry.getData().toString('utf8'));
      const item = Array.isArray(info) ? info[0] : (info?.modList?.[0] || info);
      return {
        id: item?.modid || null,
        displayName: item?.name || item?.modid,
        version: item?.version || '',
        description: item?.description || '',
        authors: Array.isArray(item?.authorList) ? item.authorList.join(', ') : '',
        loader: 'forge',
      };
    }
  } catch {}
  return null;
}

export async function readInstalledMods(instanceId = null) {
  const metadataStore = await readModsMetadataStore();
  const roots = getContentRoots(instanceId);
  const seen = new Set();
  const pendingFiles = [];

  for (const root of roots) {
    const modsDir = path.join(root, 'mods');
    const dirEntries = await fs.promises.readdir(modsDir, { withFileTypes: true }).catch(() => []);
    for (const entry of dirEntries) {
      if (!entry.isFile() || !isModFileName(entry.name)) continue;
      const modId = stripModExtension(entry.name);
      const dedupeKey = modId.toLowerCase();
      if (seen.has(dedupeKey)) continue;
      seen.add(dedupeKey);
      pendingFiles.push({ fileName: entry.name, modId, fullPath: path.join(modsDir, entry.name) });
    }
  }

  const results = await runWithConcurrency(pendingFiles, 8, async ({ fileName, modId, fullPath }) => {
    const baseKey = modId.toLowerCase();
    const enabled = isEnabledModFileName(fileName);
    let meta = metadataStore[baseKey] || metadataStore[fileName.toLowerCase()] || null;
    if (!meta) {
      meta = extractJarMetadata(fullPath);
    }

    return {
      id: modId,
      modId: meta?.id || null,
      name: meta?.displayName || meta?.title || modId,
      fileName,
      version: meta?.version || 'installed',
      type: meta?.loader || 'jar',
      description: cleanMinecraftText(meta?.description || ''),
      authors: meta?.authors || meta?.author || '',
      iconUrl: meta?.iconUrl || meta?.icon_url || null,
      enabled,
      path: fullPath,
    };
  });

  return results.sort((a, b) => a.name.localeCompare(b.name));
}

export async function resolveModFile(modsDir, modId, extension) {
  const baseId = stripModExtension(modId).trim();
  if (!baseId) return null;
  const exts = Array.isArray(extension) ? extension : [extension];

  for (const ext of exts) {
    const cleanExt = ext.replace(/^\./, '');
    const directPath = path.join(modsDir, `${baseId}.${cleanExt}`);
    if (fs.existsSync(directPath)) return directPath;
  }

  try {
    const entries = await fs.promises.readdir(modsDir, { withFileTypes: true });
    for (const ext of exts) {
      const targetName = `${baseId}.${ext.replace(/^\./, '')}`.toLowerCase();
      const match = entries.find(entry => entry.isFile() && entry.name.toLowerCase() === targetName);
      if (match) return path.join(modsDir, match.name);
    }
  } catch {}
  return null;
}

export async function toggleMod(modId, enable, instanceId = null) {
  const root = getContentRoot(instanceId);
  const modsDir = path.join(root, 'mods');
  const baseId = sanitizeFileName(stripModExtension(modId).trim());
  if (!baseId) return { error: 'BadInput', message: 'Invalid mod id.' };

  try {
    if (enable) {
      const disabledPath = await resolveModFile(modsDir, baseId, ['jar.disabled', 'slpkg', 'olpkg']);
      if (disabledPath) {
        const enabledPath = assertSafeChildPath(modsDir, `${baseId}.jar`);
        await fs.promises.rename(disabledPath, enabledPath);
        return { ok: true, enabled: true };
      }
      return { error: 'NotFound', message: `Disabled mod not found: ${baseId}` };
    } else {
      const enabledPath = await resolveModFile(modsDir, baseId, ['jar']);
      if (enabledPath) {
        const disabledPath = assertSafeChildPath(modsDir, `${baseId}.jar.disabled`);
        await fs.promises.rename(enabledPath, disabledPath);
        return { ok: true, enabled: false };
      }
      return { error: 'NotFound', message: `Enabled mod not found: ${baseId}.jar` };
    }
  } catch (error) {
    return { error: 'RenameFailed', message: error?.message || String(error) };
  }
}

export async function setAllModsEnabled(enable, instanceId = null) {
  const mods = await readInstalledMods(instanceId);
  const targetMods = mods.filter(mod => Boolean(mod.enabled) !== Boolean(enable));
  const results = await runWithConcurrency(targetMods, 4, mod => toggleMod(mod.id, enable, instanceId));
  const failed = results.find(r => r?.error);
  if (failed) {
    return { error: failed.error, message: failed.message || 'Failed to update all mods.' };
  }
  return { ok: true, updated: targetMods.length };
}

export async function deleteMod(modId, instanceId = null) {
  const root = getContentRoot(instanceId);
  const modsDir = path.join(root, 'mods');
  const baseId = sanitizeFileName(stripModExtension(modId).trim());
  if (!baseId) return { error: 'BadInput', message: 'Missing mod id.' };

  const candidates = [
    path.join(modsDir, `${baseId}.jar`),
    path.join(modsDir, `${baseId}.jar.disabled`),
    path.join(modsDir, `${baseId}.slpkg`),
    path.join(modsDir, `${baseId}.olpkg`),
  ];
  const existingPaths = candidates.filter(p => fs.existsSync(p));

  if (existingPaths.length === 0) {
    try {
      const files = await fs.promises.readdir(modsDir);
      for (const file of files) {
        if (!isModFileName(file)) continue;
        if (stripModExtension(file).toLowerCase() === baseId.toLowerCase()) {
          existingPaths.push(assertSafeChildPath(modsDir, file));
        }
      }
    } catch {}
  }

  if (existingPaths.length === 0) return { error: 'NotFound', message: `Mod not found: ${baseId}` };

  const mainWindow = getMainWindow();
  const choice = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    title: 'Delete mod?',
    message: `Delete ${baseId}?`,
    detail: 'This will remove the mod file from the mods folder.',
  });
  if (choice.response !== 1) return { canceled: true, reason: 'delete-cancelled' };

  try {
    const metaStore = { ...(await readModsMetadataStore()) };
    let metaChanged = false;
    for (const existingPath of existingPaths) {
      const fn = path.basename(existingPath);
      const fnKey = fn.toLowerCase();
      const baseKey = stripModExtension(fn).toLowerCase();
      if (metaStore[fnKey]) { delete metaStore[fnKey]; metaChanged = true; }
      if (metaStore[baseKey]) { delete metaStore[baseKey]; metaChanged = true; }
      await fs.promises.unlink(existingPath).catch(() => {});
    }
    if (metaChanged) {
      metadataCache = metaStore;
      await writeJsonAtomic(getMetadataStorePath(), metaStore).catch(() => {});
    }
    return { ok: true, removed: existingPaths };
  } catch (error) {
    return { error: 'DeleteFailed', message: error?.message || String(error) };
  }
}

export function normalizeModFileName(fileName) {
  const sanitized = sanitizeFileName(String(fileName || '').trim(), '');
  if (!sanitized) return null;
  if (!isModFileName(sanitized)) return null;
  return sanitized;
}

export async function importModFile(payload, instanceId = null) {
  const sourcePath = typeof payload === 'string' ? payload : payload?.sourcePath;
  const fileName = typeof payload === 'object' ? payload?.fileName : null;
  const fileBytes = typeof payload === 'object' ? payload?.fileBytes : null;
  const targetInstanceId = instanceId || (typeof payload === 'object' ? payload?.instanceId : null);

  const resolvedSourcePath = String(sourcePath || '').trim();
  const resolvedFileName = normalizeModFileName(fileName || (resolvedSourcePath ? path.basename(resolvedSourcePath) : ''));
  if (!resolvedSourcePath && !resolvedFileName) return { error: 'BadInput', message: 'Missing mod file name.' };
  if (!resolvedFileName) {
    return { error: 'UnsupportedFile', message: 'Only .jar, .jar.disabled, .slpkg, and .olpkg files can be imported as mods.' };
  }

  const root = getContentRoot(targetInstanceId);
  const modsDir = path.join(root, 'mods');
  await fs.promises.mkdir(modsDir, { recursive: true });

  const baseName = stripModExtension(resolvedFileName);
  const destinationPath = assertSafeChildPath(modsDir, resolvedFileName);
  const variants = [
    destinationPath,
    path.join(modsDir, `${baseName}.jar`),
    path.join(modsDir, `${baseName}.jar.disabled`),
    path.join(modsDir, `${baseName}.slpkg`),
    path.join(modsDir, `${baseName}.olpkg`),
  ];
  const existingPaths = Array.from(new Set(variants)).filter(p => fs.existsSync(p));

  if (existingPaths.length > 0) {
    const mainWindow = getMainWindow();
    const choice = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'question',
      buttons: ['Cancel', 'Replace'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      title: 'Replace mod?',
      message: `A mod with the same name already exists: ${resolvedFileName}`,
      detail: 'Do you want to replace the existing file in the mods folder?',
    });
    if (choice.response !== 1) return { canceled: true, reason: 'replace-cancelled', path: destinationPath };
    for (const existingPath of existingPaths) await fs.promises.unlink(existingPath).catch(() => {});
  }

  if (resolvedSourcePath) {
    const stats = await fs.promises.stat(resolvedSourcePath).catch(() => null);
    if (!stats?.isFile()) return { error: 'NotFound', message: `File not found: ${resolvedSourcePath}` };
    if (path.resolve(resolvedSourcePath) !== path.resolve(destinationPath)) {
      await fs.promises.copyFile(resolvedSourcePath, destinationPath);
    }
  } else {
    const buffer = Buffer.isBuffer(fileBytes)
      ? fileBytes
      : fileBytes instanceof Uint8Array
        ? Buffer.from(fileBytes)
        : Array.isArray(fileBytes)
          ? Buffer.from(fileBytes)
          : null;
    if (!buffer || buffer.length === 0) return { error: 'BadInput', message: 'Missing mod file contents.' };
    await fs.promises.writeFile(destinationPath, buffer);
  }

  return { ok: true, path: destinationPath, enabled: isEnabledModFileName(resolvedFileName) };
}

export async function cleanupOldModVersions(modsDir, modId, targetFileName, onLog = null) {
  if (!modsDir || !modId || !targetFileName) return;
  const cleanModId = String(modId).toLowerCase().trim();
  const cleanTargetFile = String(targetFileName).toLowerCase().trim();

  try {
    const files = await fs.promises.readdir(modsDir);
    for (const file of files) {
      const lowerFile = file.toLowerCase().trim();
      if (lowerFile === cleanTargetFile || !isModFileName(lowerFile)) continue;

      const filePath = path.join(modsDir, file);
      let shouldDelete = false;

      try {
        const meta = extractJarMetadata(filePath);
        if (meta?.id && String(meta.id).toLowerCase().trim() === cleanModId) {
          shouldDelete = true;
        }
      } catch {}

      if (!shouldDelete) {
        const isCompanion =
          (cleanModId === 'sodium' && (lowerFile.includes('extra') || lowerFile.includes('reeses') || lowerFile.includes('options'))) ||
          (cleanModId === 'iris' && lowerFile.includes('flawless'));
        if (!isCompanion) {
          const stripped = stripModExtension(lowerFile);
          if (
            stripped === cleanModId ||
            lowerFile.startsWith(`${cleanModId}-`) ||
            lowerFile.startsWith(`${cleanModId}_`) ||
            lowerFile.startsWith(`${cleanModId}+`)
          ) {
            shouldDelete = true;
          }
        }
      }

      if (shouldDelete) {
        await fs.promises.unlink(filePath).catch(() => {});
        onLog?.('info', `[Mod Manager] Removed older version: ${file}`);
      }
    }
  } catch {}
}

export async function cleanupOldFileVersions(dir, projectId, targetFileName, onLog = null) {
  if (!dir || !projectId || !targetFileName) return;
  const cleanId = String(projectId).toLowerCase().trim();
  const cleanTarget = String(targetFileName).toLowerCase().trim();
  try {
    const files = await fs.promises.readdir(dir);
    for (const file of files) {
      const lower = file.toLowerCase().trim();
      if (lower === cleanTarget) continue;
      if (
        lower.startsWith(`${cleanId}-`) ||
        lower.startsWith(`${cleanId}_`) ||
        lower.startsWith(`${cleanId}+`) ||
        lower === `${cleanId}.zip` ||
        lower.replace(PACK_EXT_REGEX, '') === cleanId
      ) {
        const fp = path.join(dir, file);
        const stat = await fs.promises.stat(fp).catch(() => null);
        if (!stat) continue;
        if (stat.isDirectory()) {
          await fs.promises.rm(fp, { recursive: true, force: true }).catch(() => {});
        } else {
          await fs.promises.unlink(fp).catch(() => {});
        }
        onLog?.('info', `[File Manager] Removed older version: ${file}`);
      }
    }
  } catch {}
}

export async function extractShaderEmbeddedIcon(fullPath, isDirectory) {
  const iconCandidates = [
    'pack.png',
    'icon.png',
    'preview.png',
    'thumbnail.png',
    'shaders/icon.png',
    'shaders/pack.png',
    'shaders/preview.png',
  ];
  try {
    if (!isDirectory && String(fullPath).toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(fullPath);
      for (const candidate of iconCandidates) {
        const entry = zip.getEntry(candidate);
        if (entry) return `data:image/png;base64,${entry.getData().toString('base64')}`;
      }
    } else if (isDirectory) {
      for (const candidate of iconCandidates) {
        const p = path.join(fullPath, ...candidate.split('/'));
        try {
          const buf = await fs.promises.readFile(p);
          return `data:image/png;base64,${buf.toString('base64')}`;
        } catch { }
      }
    }
  } catch {}
  return null;
}

async function extractPackMcMeta(fullPath, isDirectory) {
  try {
    let rawJson = null;
    let iconUrl = null;
    if (!isDirectory && String(fullPath).toLowerCase().endsWith('.zip')) {
      const zip = new AdmZip(fullPath);
      const mcmetaEntry = zip.getEntry('pack.mcmeta');
      if (mcmetaEntry) rawJson = mcmetaEntry.getData().toString('utf8');
      const pngEntry = zip.getEntry('pack.png') || zip.getEntry('icon.png');
      if (pngEntry) iconUrl = `data:image/png;base64,${pngEntry.getData().toString('base64')}`;
    } else if (isDirectory) {
      const mcmetaPath = path.join(fullPath, 'pack.mcmeta');
      const pngPath = path.join(fullPath, 'pack.png');
      const [rawRes, pngRes] = await Promise.allSettled([
        fs.promises.readFile(mcmetaPath, 'utf8'),
        fs.promises.readFile(pngPath),
      ]);
      if (rawRes.status === 'fulfilled') rawJson = rawRes.value;
      if (pngRes.status === 'fulfilled') iconUrl = `data:image/png;base64,${pngRes.value.toString('base64')}`;
    }

    let description = '';
    let packFormat = null;
    if (rawJson) {
      const parsed = JSON.parse(rawJson);
      if (parsed?.pack?.description) description = cleanMinecraftText(parsed.pack.description);
      if (parsed?.pack?.pack_format) packFormat = parsed.pack.pack_format;
    }
    return { description, packFormat, iconUrl };
  } catch {
    return { description: '', packFormat: null, iconUrl: null };
  }
}

export function generateShaderSearchQueries(fileName) {
  const base = String(fileName || '').replace(PACK_EXT_REGEX, '');
  const clean1 = base
    .replace(/[-_]v?\d+[\w.]*$/i, '')
    .replace(/[-_]r\d+[\w.]*$/i, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  const clean2 = base
    .replace(/['’]/g, '')
    .replace(/\bv?\d+(\.\d+)*[\w-]*\b/gi, '')
    .replace(/\b(lite|ultra|fast|medium|high|extreme|plus|shaders?|pack)\b/gi, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[-_]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  return [...new Set([clean1, clean2, base.split(/[-_ ]/)[0]].filter(q => q && q.length >= 2))];
}

export async function fetchModrinthShaderArtwork(fileName) {
  const cacheKey = String(fileName || '').toLowerCase();
  if (shaderNegativeLookupCache.get(cacheKey)) return null;

  try {
    const queries = generateShaderSearchQueries(fileName);
    for (const query of queries) {
      const facets = JSON.stringify([['project_type:shader']]);
      const url = `https://api.modrinth.com/v2/search?query=${encodeURIComponent(query)}&facets=${encodeURIComponent(facets)}&limit=3`;
      const res = await fetchWithRetry(
        url,
        { headers: { 'User-Agent': USER_AGENT } },
        { retries: 1, timeoutMs: 8000 }
      );
      if (res.ok) {
        const data = await res.json();
        const top = data?.hits?.[0];
        if (top?.icon_url) {
          return {
            displayName: top.title,
            iconUrl: top.icon_url,
            description: top.description || '',
            authors: top.author || '',
          };
        }
      }
    }
  } catch {}

  shaderNegativeLookupCache.set(cacheKey, true);
  return null;
}

async function readContentPackDirectory({ subDir, kind, instanceId = null }) {
  const metadataStore = await readModsMetadataStore();
  const roots = getContentRoots(instanceId);
  const seen = new Set();
  const candidates = [];

  for (const root of roots) {
    const targetDir = path.join(root, subDir);
    const dirEntries = await fs.promises.readdir(targetDir, { withFileTypes: true }).catch(() => []);
    for (const entry of dirEntries) {
      const fileName = entry.name;
      if (fileName.startsWith('.') || fileName === 'desktop.ini' || fileName === 'Thumbs.db') continue;
      const lowerName = fileName.toLowerCase();
      if (entry.isFile() && !lowerName.endsWith('.zip')) continue;
      const baseKey = lowerName.replace(PACK_EXT_REGEX, '');
      if (seen.has(baseKey)) continue;
      seen.add(baseKey);
      candidates.push({ entry, fileName, lowerName, baseKey, fullPath: path.join(targetDir, fileName) });
    }
  }

  const newDiscoveredMeta = {};

  const installed = await runWithConcurrency(candidates, 6, async ({ entry, fileName, lowerName, baseKey, fullPath }) => {
    const stat = await fs.promises.stat(fullPath).catch(() => null);
    const meta = metadataStore[baseKey] || metadataStore[lowerName] || null;

    let iconUrl = meta?.iconUrl || null;
    let displayName = meta?.displayName || fileName.replace(PACK_EXT_REGEX, '');
    let description = meta?.description || '';
    let authors = meta?.authors || '';
    let packFormat = meta?.packFormat || null;

    if (kind === 'shader') {
      if (!iconUrl) {
        iconUrl = await extractShaderEmbeddedIcon(fullPath, entry.isDirectory());
      }
      if (!iconUrl) {
        const onlineArtwork = await fetchModrinthShaderArtwork(fileName);
        if (onlineArtwork?.iconUrl) {
          iconUrl = onlineArtwork.iconUrl;
          if (!meta?.displayName && onlineArtwork.displayName) displayName = onlineArtwork.displayName;
          if (!description && onlineArtwork.description) description = onlineArtwork.description;
          if (!authors && onlineArtwork.authors) authors = onlineArtwork.authors;
          newDiscoveredMeta[baseKey] = { displayName, iconUrl, description, authors };
        }
      }
    } else if (!iconUrl || !description) {
      const mcmeta = await extractPackMcMeta(fullPath, entry.isDirectory());
      if (!iconUrl && mcmeta.iconUrl) iconUrl = mcmeta.iconUrl;
      if (!description && mcmeta.description) description = mcmeta.description;
      if (!packFormat && mcmeta.packFormat) packFormat = mcmeta.packFormat;
    }

    return {
      id: baseKey,
      name: displayName,
      fileName,
      version: meta?.version || (packFormat ? `Format ${packFormat}` : ''),
      description: cleanMinecraftText(description),
      authors,
      iconUrl,
      size: stat?.size || 0,
      isDirectory: entry.isDirectory(),
      path: fullPath,
    };
  });

  if (Object.keys(newDiscoveredMeta).length > 0) {
    saveModMetadataStore(newDiscoveredMeta).catch(() => {});
  }

  return installed.sort((a, b) => a.name.localeCompare(b.name));
}

export async function readInstalledShaders(instanceId = null) {
  return readContentPackDirectory({ subDir: 'shaderpacks', kind: 'shader', instanceId });
}

export async function readInstalledResourcePacks(instanceId = null) {
  return readContentPackDirectory({ subDir: 'resourcepacks', kind: 'resourcepack', instanceId });
}

export async function readInstalledDatapacks(instanceId = null) {
  return readContentPackDirectory({ subDir: 'datapacks', kind: 'datapack', instanceId });
}

async function deleteContentPack({ subDir, label, fileName, instanceId = null, removeShaderTxt = false }) {
  const root = getContentRoot(instanceId);
  const targetDir = path.join(root, subDir);
  let targetPath;
  try {
    targetPath = assertSafeChildPath(targetDir, sanitizeFileName(fileName));
  } catch (err) {
    return { error: 'InvalidPath', message: err.message };
  }

  if (!fs.existsSync(targetPath)) {
    return { error: 'NotFound', message: `${label} not found: ${fileName}` };
  }

  const mainWindow = getMainWindow();
  const choice = await dialog.showMessageBox(mainWindow || undefined, {
    type: 'warning',
    buttons: ['Cancel', 'Delete'],
    defaultId: 1,
    cancelId: 0,
    noLink: true,
    title: `Delete ${label.toLowerCase()}?`,
    message: `Delete ${fileName}?`,
    detail: `This will remove the ${label.toLowerCase()} from the ${subDir} folder.`,
  });
  if (choice.response !== 1) return { canceled: true, reason: 'delete-cancelled' };

  try {
    const stat = await fs.promises.stat(targetPath);
    if (stat.isDirectory()) {
      await fs.promises.rm(targetPath, { recursive: true, force: true });
    } else {
      await fs.promises.unlink(targetPath);
      if (removeShaderTxt) {
        const optTxt = path.join(targetDir, `${path.basename(targetPath)}.txt`);
        if (fs.existsSync(optTxt)) await fs.promises.unlink(optTxt).catch(() => {});
      }
    }
    return { ok: true, removed: targetPath };
  } catch (err) {
    return { error: 'DeleteFailed', message: err?.message || String(err) };
  }
}

export async function deleteDatapack(fileName, instanceId = null) {
  return deleteContentPack({ subDir: 'datapacks', label: 'Data pack', fileName, instanceId });
}

export async function deleteShader(fileName, instanceId = null) {
  return deleteContentPack({ subDir: 'shaderpacks', label: 'Shader pack', fileName, instanceId, removeShaderTxt: true });
}

export async function deleteResourcePack(fileName, instanceId = null) {
  return deleteContentPack({ subDir: 'resourcepacks', label: 'Resource pack', fileName, instanceId });
}

export async function openContentFolder(folderType = 'mods', instanceId = null) {
  const root = getContentRoot(instanceId);
  let subDir = 'mods';
  if (folderType === 'instance' || folderType === 'root') subDir = '';
  else if (folderType === 'shaders' || folderType === 'shaderpacks') subDir = 'shaderpacks';
  else if (folderType === 'texturepacks' || folderType === 'resourcepacks' || folderType === 'textures') subDir = 'resourcepacks';
  else if (folderType === 'datapacks' || folderType === 'datapack') subDir = 'datapacks';
  else if (folderType === 'saves' || folderType === 'worlds') subDir = 'saves';
  else if (folderType === 'screenshots') subDir = 'screenshots';
  else if (folderType === 'logs') subDir = 'logs';
  else if (folderType === 'config') subDir = 'config';
  else if (folderType === 'crash-reports') subDir = 'crash-reports';

  const targetPath = subDir ? path.join(root, subDir) : root;
  try {
    await fs.promises.mkdir(targetPath, { recursive: true });
    const result = await shell.openPath(targetPath);
    if (result) return { error: 'OpenPathFailed', message: result, path: targetPath };
    return { ok: true, path: targetPath };
  } catch (error) {
    return { error: 'OpenPathFailed', message: error?.message || String(error), path: targetPath };
  }
}

export async function importContentFile(payload, instanceId = null) {
  const { type = 'mod', sourcePath, fileName, fileBytes } = typeof payload === 'object' ? payload : { sourcePath: payload };
  const targetInstanceId = instanceId || (typeof payload === 'object' ? payload?.instanceId : null);
  const root = getContentRoot(targetInstanceId);

  let targetSubDir = 'mods';
  if (type === 'shader' || type === 'shaders' || type === 'shaderpacks') targetSubDir = 'shaderpacks';
  else if (type === 'resourcepack' || type === 'texturepack' || type === 'textures' || type === 'resourcepacks') targetSubDir = 'resourcepacks';
  else if (type === 'datapack' || type === 'datapacks') targetSubDir = 'datapacks';

  if (targetSubDir === 'mods') {
    return importModFile(payload, targetInstanceId);
  }

  const destDir = path.join(root, targetSubDir);
  await fs.promises.mkdir(destDir, { recursive: true });

  const resolvedSourcePath = String(sourcePath || '').trim();
  const sourceFileName = sanitizeFileName(fileName || (resolvedSourcePath ? path.basename(resolvedSourcePath) : ''), '');
  if (!resolvedSourcePath && !sourceFileName) return { error: 'BadInput', message: 'Missing file name.' };

  const destPath = assertSafeChildPath(destDir, sourceFileName);
  if (fs.existsSync(destPath)) {
    const mainWindow = getMainWindow();
    const choice = await dialog.showMessageBox(mainWindow || undefined, {
      type: 'question',
      buttons: ['Cancel', 'Replace'],
      defaultId: 1,
      cancelId: 0,
      noLink: true,
      title: 'Replace file?',
      message: `A file with the same name already exists: ${sourceFileName}`,
      detail: `Do you want to replace the existing file in the ${targetSubDir} folder?`,
    });
    if (choice.response !== 1) return { canceled: true, reason: 'replace-cancelled', path: destPath };
    await fs.promises.rm(destPath, { recursive: true, force: true }).catch(() => {});
  }

  if (resolvedSourcePath) {
    const stats = await fs.promises.stat(resolvedSourcePath).catch(() => null);
    if (!stats) return { error: 'NotFound', message: `File not found: ${resolvedSourcePath}` };
    if (stats.isDirectory()) {
      await fs.promises.cp(resolvedSourcePath, destPath, { recursive: true });
    } else if (path.resolve(resolvedSourcePath) !== path.resolve(destPath)) {
      await fs.promises.copyFile(resolvedSourcePath, destPath);
    }
  } else {
    const buffer = Buffer.isBuffer(fileBytes)
      ? fileBytes
      : fileBytes instanceof Uint8Array
        ? Buffer.from(fileBytes)
        : Array.isArray(fileBytes)
          ? Buffer.from(fileBytes)
          : null;
    if (!buffer || buffer.length === 0) return { error: 'BadInput', message: 'Missing file contents.' };
    await fs.promises.writeFile(destPath, buffer);
  }

  return { ok: true, path: destPath, fileName: sourceFileName };
}

export async function pickContentFiles(type = 'mod') {
  let title = 'Select files';
  let filters = [{ name: 'All Files', extensions: ['*'] }];
  if (type === 'shader' || type === 'shaders' || type === 'shaderpacks') {
    title = 'Select Shader Packs';
    filters = [{ name: 'Shader Packs (.zip)', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }];
  } else if (type === 'resourcepack' || type === 'texturepack' || type === 'textures' || type === 'resourcepacks') {
    title = 'Select Resource Packs';
    filters = [{ name: 'Resource Packs (.zip)', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }];
  } else if (type === 'datapack' || type === 'datapacks') {
    title = 'Select Data Packs';
    filters = [{ name: 'Data Packs (.zip)', extensions: ['zip'] }, { name: 'All Files', extensions: ['*'] }];
  } else {
    title = 'Select Mod Files';
    filters = [{ name: 'Minecraft Mods (.jar, .disabled, .slpkg, .olpkg)', extensions: ['jar', 'disabled', 'slpkg', 'olpkg'] }, { name: 'All Files', extensions: ['*'] }];
  }

  const mainWindow = getMainWindow();
  const result = await dialog.showOpenDialog(mainWindow || undefined, {
    title,
    properties: ['openFile', 'multiSelections'],
    filters,
  });
  if (result.canceled) return { canceled: true, filePaths: [] };
  return { canceled: false, filePaths: result.filePaths || [] };
}

async function resolveModrinthDependencies({
  dependencies,
  targetDir,
  gameVersion,
  loader,
  onLog,
  metaEntries,
  installedDeps,
  visitedProjects,
  depth = 0,
}) {
  if (!Array.isArray(dependencies) || depth > 2) return;
  const requiredDeps = dependencies.filter(
    d => d.dependency_type === 'required' && (d.project_id || d.version_id)
  );
  if (requiredDeps.length === 0) return;

  const existingFiles = await fs.promises.readdir(targetDir).catch(() => []);
  const existingJarIds = new Set();
  for (const file of existingFiles) {
    if (!isModFileName(file)) continue;
    const meta = extractJarMetadata(path.join(targetDir, file));
    if (meta?.id) existingJarIds.add(String(meta.id).toLowerCase().trim());
  }

  for (const dep of requiredDeps) {
    try {
      const depPid = dep.project_id ? String(dep.project_id).toLowerCase().trim() : '';
      if (depPid && visitedProjects.has(depPid)) continue;
      if (depPid) visitedProjects.add(depPid);

      const depProject = dep.project_id ? await getModrinthProject(dep.project_id).catch(() => null) : null;
      const slug = String(depProject?.slug || '').toLowerCase().trim();
      if ((depPid && existingJarIds.has(depPid)) || (slug && existingJarIds.has(slug))) {
        continue;
      }

      let depVersion = null;
      if (dep.version_id) {
        depVersion = await getModrinthVersion(dep.version_id).catch(() => null);
      } else if (dep.project_id) {
        const depVersions = await getModrinthProjectVersions({
          idOrSlug: dep.project_id,
          loaders: loader && loader !== 'all' ? [loader.toLowerCase()] : [],
          gameVersions: gameVersion && gameVersion !== 'all' ? [gameVersion] : [],
        }).catch(() => []);
        depVersion = depVersions?.[0] || null;
      }

      const depFile = depVersion?.files?.find(f => f.primary) || depVersion?.files?.[0];
      if (!depFile?.url) continue;

      const depFileName = normalizeModFileName(depFile.filename) || `${sanitizeFileName(slug || depPid || 'dependency')}.jar`;
      const depPath = assertSafeChildPath(targetDir, depFileName);
      if (!fs.existsSync(depPath)) {
        onLog?.('info', `[Modrinth] Downloading required dependency: ${depFileName}...`);
        await downloadFileAtomic(depFile.url, depPath, {
          headers: { 'User-Agent': USER_AGENT },
          expectedSha512: depFile.hashes?.sha512 || null,
          expectedSha1: depFile.hashes?.sha1 || null,
        });
        installedDeps.push(depFileName);

        const depDetectedId = slug || depPid || '';
        if (depDetectedId) {
          existingJarIds.add(depDetectedId);
          await cleanupOldModVersions(targetDir, depDetectedId, depFileName, onLog);
        }

        if (depProject) {
          const depKey = stripModExtension(depFileName).toLowerCase();
          const depCachedIcon = depProject.icon_url
            ? await fetchAndCacheIconAsBase64(depProject.icon_url)
            : null;
          metaEntries[depKey] = {
            displayName: depProject.title,
            description: depProject.description,
            iconUrl: depCachedIcon || depProject.icon_url || null,
            loader: loader || '',
            version: depVersion?.version_number || '',
            projectType: 'mod',
          };
          metaEntries[depFileName.toLowerCase()] = metaEntries[depKey];
        }
      }

      if (depVersion?.dependencies) {
        await resolveModrinthDependencies({
          dependencies: depVersion.dependencies,
          targetDir,
          gameVersion,
          loader,
          onLog,
          metaEntries,
          installedDeps,
          visitedProjects,
          depth: depth + 1,
        });
      }
    } catch (depErr) {
      console.warn('Failed to install dependency:', depErr);
    }
  }
}

export async function installModrinthProject({
  projectId,
  versionId,
  versionNumber,
  fileUrl,
  fileName,
  gameVersion,
  loader,
  projectType = 'mod',
  instanceId = null,
}, { onLog = null } = {}) {
  const root = getContentRoot(instanceId);
  const rawType = String(projectType || '').toLowerCase();
  const normalizedType = rawType.includes('shader')
    ? 'shader'
    : rawType.includes('resourcepack') || rawType.includes('texture')
      ? 'resourcepack'
      : rawType.includes('datapack')
        ? 'datapack'
        : 'mod';

  const subDirMap = {
    shader: 'shaderpacks',
    resourcepack: 'resourcepacks',
    datapack: 'datapacks',
    mod: 'mods',
  };
  const targetDir = path.join(root, subDirMap[normalizedType]);
  await fs.promises.mkdir(targetDir, { recursive: true });

  let targetVersion = null;
  if (versionId) {
    targetVersion = await getModrinthVersion(versionId).catch(() => null);
  }

  if (!targetVersion && projectId) {
    const cleanLoader = String(loader || '').trim().toLowerCase();
    const effectiveLoaders = normalizedType === 'mod' && cleanLoader && !['all', 'auto', 'vanilla'].includes(cleanLoader)
      ? [cleanLoader]
      : [];
    const cleanGameVer = gameVersion && String(gameVersion).toLowerCase() !== 'all' ? String(gameVersion).trim() : '';
    const effectiveGameVersions = cleanGameVer ? [cleanGameVer] : [];

    let versions = await getModrinthProjectVersions({
      idOrSlug: projectId,
      loaders: effectiveLoaders,
      gameVersions: effectiveGameVersions,
    }).catch(() => []);

    // Fallback 1: if exact gameVersion has no match (e.g. newer minor/patch like 1.21.11),
    // fetch with same loader and match same major.minor (e.g. 1.21.x) or newest release.
    if ((!Array.isArray(versions) || versions.length === 0) && effectiveGameVersions.length > 0) {
      const broader = await getModrinthProjectVersions({
        idOrSlug: projectId,
        loaders: effectiveLoaders,
        gameVersions: [],
      }).catch(() => []);
      if (Array.isArray(broader) && broader.length > 0) {
        const majorMinor = cleanGameVer.match(/^(\d+\.\d+)/)?.[1];
        const minorMatches = majorMinor
          ? broader.filter(v => Array.isArray(v.game_versions) && v.game_versions.some(gv => gv === majorMinor || gv.startsWith(`${majorMinor}.`)))
          : [];
        versions = minorMatches.length > 0 ? minorMatches : broader;
      }
    }

    // Fallback 2: if loader filter still yielded nothing, drop loader filter.
    if ((!Array.isArray(versions) || versions.length === 0) && effectiveLoaders.length > 0) {
      versions = await getModrinthProjectVersions({
        idOrSlug: projectId,
        loaders: [],
        gameVersions: effectiveGameVersions,
      }).catch(() => []);
      if (!Array.isArray(versions) || versions.length === 0) {
        versions = await getModrinthProjectVersions({
          idOrSlug: projectId,
          loaders: [],
          gameVersions: [],
        }).catch(() => []);
      }
    }

    const pickPreferred = (list) => {
      if (!Array.isArray(list) || list.length === 0) return null;
      return list.find(v => v.version_type === 'release') || list[0];
    };

    if (versionNumber) {
      const searchNum = String(versionNumber).toLowerCase().replace(/^v/i, '').trim();
      targetVersion = versions.find(v => {
        const vNum = String(v.version_number || '').toLowerCase().replace(/^v/i, '').trim();
        const vName = String(v.name || '').toLowerCase();
        const fileNames = (v.files || []).map(f => String(f.filename || '').toLowerCase());
        return vNum === searchNum || vNum.includes(searchNum) || vName.includes(searchNum) || fileNames.some(fn => fn.includes(searchNum));
      }) || pickPreferred(versions);
    } else {
      targetVersion = pickPreferred(versions);
    }
  }

  const primaryFile = targetVersion ? (targetVersion.files?.find(f => f.primary) || targetVersion.files?.[0]) : null;
  const downloadUrl = primaryFile?.url || fileUrl;
  let targetFileName = primaryFile?.filename || fileName;

  if (!downloadUrl) {
    throw new Error(`Could not resolve download URL for this ${normalizedType} version.`);
  }

  if (normalizedType === 'mod') {
    targetFileName = normalizeModFileName(targetFileName) || `${sanitizeFileName(projectId || 'mod')}.jar`;
  } else {
    targetFileName = sanitizeFileName(String(targetFileName || `${projectId || normalizedType}.zip`).trim(), `${normalizedType}.zip`);
  }

  const destPath = assertSafeChildPath(targetDir, targetFileName);
  const typeLabel = normalizedType === 'shader'
    ? 'Shader'
    : normalizedType === 'resourcepack'
      ? 'Resource Pack'
      : normalizedType === 'datapack'
        ? 'Data Pack'
        : 'Mod';

  onLog?.('info', `[Modrinth] Downloading ${typeLabel}: ${targetFileName}...`);

  await downloadFileAtomic(downloadUrl, destPath, {
    headers: { 'User-Agent': USER_AGENT },
    expectedSha512: primaryFile?.hashes?.sha512 || null,
    expectedSha1: primaryFile?.hashes?.sha1 || null,
  });

  const detectedId = String(projectId || '').toLowerCase().trim() ||
    (normalizedType === 'mod' ? (extractJarMetadata(destPath)?.id?.toLowerCase()?.trim() || '') : '');

  if (detectedId) {
    if (normalizedType === 'mod') {
      await cleanupOldModVersions(targetDir, detectedId, targetFileName, onLog);
    } else {
      await cleanupOldFileVersions(targetDir, detectedId, targetFileName, onLog);
    }
  }

  const metaEntries = {};
  if (projectId) {
    try {
      const project = await getModrinthProject(projectId).catch(() => null);
      if (project) {
        const fileKey = stripModExtension(targetFileName.replace(PACK_EXT_REGEX, '')).toLowerCase();
        const cachedIcon = project.icon_url ? await fetchAndCacheIconAsBase64(project.icon_url) : null;
        metaEntries[fileKey] = {
          displayName: project.title,
          description: project.description,
          iconUrl: cachedIcon || project.icon_url || null,
          authors: project.team_members || project.client_side || '',
          loader: loader || (project.loaders ? project.loaders.join(', ') : ''),
          version: targetVersion?.version_number || '',
          projectType: normalizedType,
        };
        metaEntries[targetFileName.toLowerCase()] = metaEntries[fileKey];
      }
    } catch {}
  }

  const installedDeps = [];
  if (normalizedType === 'mod' && targetVersion?.dependencies) {
    const visitedProjects = new Set([String(projectId || '').toLowerCase().trim()].filter(Boolean));
    await resolveModrinthDependencies({
      dependencies: targetVersion.dependencies,
      targetDir,
      gameVersion,
      loader,
      onLog,
      metaEntries,
      installedDeps,
      visitedProjects,
    });
  }

  if (Object.keys(metaEntries).length > 0) {
    await saveModMetadataStore(metaEntries);
  }

  onLog?.('success', `[Modrinth] Installed ${typeLabel} ${targetFileName}${installedDeps.length > 0 ? ` (+ ${installedDeps.length} dependencies)` : ''} successfully.`);

  let updatedContent = null;
  if (normalizedType === 'shader') updatedContent = await readInstalledShaders(instanceId);
  else if (normalizedType === 'resourcepack') updatedContent = await readInstalledResourcePacks(instanceId);
  else if (normalizedType === 'datapack') updatedContent = await readInstalledDatapacks(instanceId);
  else updatedContent = await readInstalledMods(instanceId);

  return {
    ok: true,
    fileName: targetFileName,
    path: destPath,
    projectType: normalizedType,
    installedDependencies: installedDeps,
    items: updatedContent,
    mods: updatedContent,
  };
}

export async function getFileSha512(filePath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha512');
    const stream = fs.createReadStream(filePath);
    stream.on('data', chunk => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
    stream.on('error', reject);
  });
}

export async function checkInstalledModsUpdates({ gameVersion, loader, instanceId } = {}) {
  const root = getContentRoot(instanceId);
  const modsDir = path.join(root, 'mods');
  try {
    const entries = await fs.promises.readdir(modsDir, { withFileTypes: true });
    const modFiles = entries
      .filter(e => e.isFile() && isModFileName(e.name))
      .map(e => e.name);

    if (modFiles.length === 0) return { updates: {}, count: 0, checked: 0 };

    const hashMap = new Map();
    const hashed = await runWithConcurrency(modFiles, 8, async (fileName) => {
      try {
        const hash = await getFileSha512(path.join(modsDir, fileName));
        return { fileName, hash };
      } catch {
        return null;
      }
    });

    const hashes = [];
    for (const item of hashed) {
      if (!item) continue;
      hashMap.set(item.hash, item.fileName);
      hashes.push(item.hash);
    }

    if (hashes.length === 0) return { updates: {}, count: 0, checked: 0 };

    const loaders = loader && loader.toLowerCase() !== 'all' && loader.toLowerCase() !== 'vanilla'
      ? [loader.toLowerCase()]
      : ['fabric', 'quilt', 'forge', 'neoforge'];
    const gameVersions = gameVersion && gameVersion.toLowerCase() !== 'all' ? [gameVersion] : [];

    const response = await checkModrinthVersionFilesUpdate({
      hashes,
      algorithm: 'sha512',
      loaders,
      gameVersions,
    });

    const updates = {};
    let distinctUpdateCount = 0;

    if (response && typeof response === 'object') {
      for (const [hash, versionObj] of Object.entries(response)) {
        const fileName = hashMap.get(hash);
        if (!fileName || !versionObj) continue;
        const primaryFile = versionObj.files?.find(f => f.primary) || versionObj.files?.[0];
        const primaryHash = primaryFile?.hashes?.sha512 || '';
        if (primaryHash && primaryHash !== hash) {
          const fileKey = stripModExtension(fileName).toLowerCase();
          const updateInfo = {
            fileName,
            fileKey,
            currentHash: hash,
            newVersionNumber: versionObj.version_number,
            newVersionName: versionObj.name,
            versionId: versionObj.id,
            projectId: versionObj.project_id,
            changelog: versionObj.changelog,
            datePublished: versionObj.date_published,
            fileUrl: primaryFile?.url || null,
            targetFileName: primaryFile?.filename || fileName,
            fileSize: primaryFile?.size || null,
          };
          updates[fileName] = updateInfo;
          updates[fileKey] = updateInfo;
          distinctUpdateCount++;
        }
      }
    }

    return { updates, count: distinctUpdateCount, checked: hashes.length };
  } catch (error) {
    console.warn('Failed to check mod updates:', error);
    return { updates: {}, count: 0, error: error?.message || String(error) };
  }
}
