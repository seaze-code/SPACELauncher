import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';
import { Buffer } from 'buffer';
import { dialog } from 'electron';

const MAX_SKIN_BYTES = 2 * 1024 * 1024;
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

function getSkinsDir(userDataDir) {
  return path.join(userDataDir, 'skins');
}

function getCacheDir(userDataDir) {
  return path.join(getSkinsDir(userDataDir), 'cache');
}

function getLibraryIndexPath(userDataDir) {
  return path.join(getSkinsDir(userDataDir), 'skins-library.json');
}

export function validatePngSkinBuffer(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 24) {
    throw new Error('Invalid PNG file.');
  }
  if (buf.length > MAX_SKIN_BYTES) {
    throw new Error('Skin PNG file exceeds 2 MB limit.');
  }
  if (!buf.subarray(0, 8).equals(PNG_SIGNATURE)) {
    throw new Error('File must be a valid PNG image.');
  }
  const width = buf.readUInt32BE(16);
  const height = buf.readUInt32BE(20);
  const validDimensions = (width === 64 && (height === 64 || height === 32));
  if (!validDimensions) {
    throw new Error(`Invalid Minecraft skin dimensions (${width}x${height}). Expected 64x64 or 64x32 PNG.`);
  }
  return { width, height };
}

export function decodeDataUriToPngBuffer(dataUri) {
  const match = String(dataUri || '').match(/^data:image\/png;base64,([A-Za-z0-9+/=]+)$/);
  if (!match) {
    throw new Error('Invalid PNG data URI.');
  }
  const buf = Buffer.from(match[1], 'base64');
  validatePngSkinBuffer(buf);
  return buf;
}

export function encodePngBufferToDataUri(buf) {
  return `data:image/png;base64,${buf.toString('base64')}`;
}

export async function fetchTextureAsDataUri(textureUrl, userDataDir = '') {
  const url = String(textureUrl || '').trim();
  if (!url) throw new Error('Texture URL is required.');

  const hash = crypto.createHash('sha256').update(url).digest('hex').slice(0, 24);
  const cacheFile = userDataDir ? path.join(getCacheDir(userDataDir), `${hash}.png`) : '';

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) {
      throw new Error(`HTTP ${res.status}`);
    }
    const buf = Buffer.from(await res.arrayBuffer());
    validatePngSkinBuffer(buf);
    if (cacheFile) {
      await fs.mkdir(path.dirname(cacheFile), { recursive: true });
      await fs.writeFile(cacheFile, buf).catch(() => {});
    }
    return { ok: true, dataUri: encodePngBufferToDataUri(buf) };
  } catch (err) {
    if (cacheFile) {
      try {
        const cachedBuf = await fs.readFile(cacheFile);
        return { ok: true, dataUri: encodePngBufferToDataUri(cachedBuf), cached: true };
      } catch {
        // Cache miss
      }
    }
    return { error: 'TextureFetchFailed', message: err?.message || String(err) };
  }
}

export async function importUsernameSkin(username, userDataDir = '') {
  const cleanName = String(username || '').trim();
  if (!cleanName || !/^[A-Za-z0-9_]{1,20}$/.test(cleanName)) {
    throw new Error('Please enter a valid Minecraft username (letters, numbers, underscore).');
  }

  const profileLookup = await fetch(`https://api.mojang.com/users/profiles/minecraft/${encodeURIComponent(cleanName)}`);
  if (!profileLookup.ok) {
    throw new Error(profileLookup.status === 404 || profileLookup.status === 204
      ? `Minecraft player "${cleanName}" was not found.`
      : `Failed to lookup player (${profileLookup.status}).`);
  }
  const { id: uuid, name } = await profileLookup.json();
  if (!uuid) throw new Error(`Could not resolve UUID for "${cleanName}".`);

  const sessionRes = await fetch(`https://sessionserver.mojang.com/session/minecraft/profile/${encodeURIComponent(uuid)}`);
  if (!sessionRes.ok) {
    throw new Error(`Failed to fetch skin profile (${sessionRes.status}).`);
  }
  const sessionData = await sessionRes.json();
  const texturesProp = (sessionData.properties || []).find(p => p.name === 'textures');
  if (!texturesProp?.value) {
    throw new Error(`Player "${name || cleanName}" does not have a custom skin.`);
  }

  const decoded = JSON.parse(Buffer.from(texturesProp.value, 'base64').toString('utf8'));
  const skinMeta = decoded?.textures?.SKIN;
  if (!skinMeta?.url) {
    throw new Error(`No skin texture URL found for "${name || cleanName}".`);
  }

  const variant = skinMeta?.metadata?.model === 'slim' ? 'slim' : 'classic';
  const fetched = await fetchTextureAsDataUri(skinMeta.url, userDataDir);
  if (fetched.error) {
    throw new Error(fetched.message);
  }

  return {
    ok: true,
    username: name || cleanName,
    uuid,
    url: skinMeta.url,
    variant,
    dataUri: fetched.dataUri,
  };
}

export async function pickSkinPngFile(win) {
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Select Minecraft Skin PNG (64x64 or 64x32)',
    properties: ['openFile'],
    filters: [
      { name: 'PNG Skin Image', extensions: ['png'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });

  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true };
  }

  const filePath = result.filePaths[0];
  const buf = await fs.readFile(filePath);
  const dims = validatePngSkinBuffer(buf);

  return {
    canceled: false,
    fileName: path.basename(filePath, path.extname(filePath)),
    width: dims.width,
    height: dims.height,
    dataUri: encodePngBufferToDataUri(buf),
  };
}

export async function loadSkinsLibrary(userDataDir) {
  const indexPath = getLibraryIndexPath(userDataDir);
  try {
    const raw = await fs.readFile(indexPath, 'utf8');
    const parsed = JSON.parse(raw);
    const skins = Array.isArray(parsed?.skins) ? parsed.skins : [];
    const hydrated = await Promise.all(
      skins.map(async (item) => {
        if (!item?.id) return null;
        try {
          const pngPath = path.join(getSkinsDir(userDataDir), `${item.id}.png`);
          const buf = await fs.readFile(pngPath);
          return {
            ...item,
            dataUri: encodePngBufferToDataUri(buf),
          };
        } catch {
          return null;
        }
      }),
    );
    return {
      skins: hydrated.filter(Boolean),
      activeByProfile: parsed?.activeByProfile && typeof parsed.activeByProfile === 'object' ? parsed.activeByProfile : {},
    };
  } catch {
    return { skins: [], activeByProfile: {} };
  }
}

async function writeLibraryIndex(userDataDir, indexObj) {
  const dir = getSkinsDir(userDataDir);
  await fs.mkdir(dir, { recursive: true });
  const target = getLibraryIndexPath(userDataDir);
  const tmp = `${target}.${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(indexObj, null, 2), 'utf8');
  await fs.rename(tmp, target);
}

export async function saveCustomSkin({ userDataDir, id, name, dataUri, variant = 'classic', profileKey = '' }) {
  const buf = decodeDataUriToPngBuffer(dataUri);
  const dir = getSkinsDir(userDataDir);
  await fs.mkdir(dir, { recursive: true });

  const skinId = id && /^[A-Za-z0-9_-]+$/.test(id) ? id : `skin-${Date.now()}`;
  const cleanName = String(name || 'Custom Skin').trim() || 'Custom Skin';
  const cleanVariant = String(variant).toLowerCase() === 'slim' ? 'slim' : 'classic';

  await fs.writeFile(path.join(dir, `${skinId}.png`), buf);

  const current = await loadSkinsLibrary(userDataDir);
  const existingIdx = current.skins.findIndex(s => s.id === skinId);
  const metaEntry = {
    id: skinId,
    name: cleanName,
    variant: cleanVariant,
    updatedAt: new Date().toISOString(),
  };

  const rawMetaList = current.skins.map(({ id: sId, name: sName, variant: sVar, updatedAt }) => ({
    id: sId,
    name: sName,
    variant: sVar,
    updatedAt,
  }));

  if (existingIdx >= 0) {
    rawMetaList[existingIdx] = metaEntry;
  } else {
    rawMetaList.unshift(metaEntry);
  }

  const activeByProfile = { ...(current.activeByProfile || {}) };
  if (profileKey) {
    activeByProfile[String(profileKey)] = skinId;
  }

  await writeLibraryIndex(userDataDir, { skins: rawMetaList, activeByProfile });
  return {
    ok: true,
    skin: { ...metaEntry, dataUri: encodePngBufferToDataUri(buf) },
    activeByProfile,
  };
}

export async function setProfileLocalSkin({ userDataDir, profileKey, skinId = '' }) {
  const current = await loadSkinsLibrary(userDataDir);
  const activeByProfile = { ...(current.activeByProfile || {}) };
  const key = String(profileKey || 'default');
  if (skinId) {
    activeByProfile[key] = skinId;
  } else {
    delete activeByProfile[key];
  }

  const rawMetaList = current.skins.map(({ id, name, variant, updatedAt }) => ({ id, name, variant, updatedAt }));
  await writeLibraryIndex(userDataDir, { skins: rawMetaList, activeByProfile });
  return { ok: true, activeByProfile };
}

export async function deleteCustomSkin({ userDataDir, id }) {
  if (!id || !/^[A-Za-z0-9_-]+$/.test(id)) {
    return { error: 'InvalidSkinId' };
  }
  const current = await loadSkinsLibrary(userDataDir);
  const rawMetaList = current.skins
    .filter(s => s.id !== id)
    .map(({ id: sId, name, variant, updatedAt }) => ({ id: sId, name, variant, updatedAt }));

  const activeByProfile = { ...(current.activeByProfile || {}) };
  for (const [pk, sid] of Object.entries(activeByProfile)) {
    if (sid === id) delete activeByProfile[pk];
  }

  await writeLibraryIndex(userDataDir, { skins: rawMetaList, activeByProfile });
  await fs.unlink(path.join(getSkinsDir(userDataDir), `${id}.png`)).catch(() => {});
  return { ok: true, activeByProfile };
}
