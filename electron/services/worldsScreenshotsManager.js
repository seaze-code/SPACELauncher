import { app, clipboard, dialog, nativeImage, shell } from 'electron';
import fs from 'fs';
import path from 'path';
import zlib from 'zlib';
import { createRequire } from 'module';
import { getInstanceDir, getMinecraftRoot } from './paths.js';
import { getMainWindow } from './windowManager.js';
import { assertSafeChildPath, sanitizeFileName } from './utils.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

function resolveTargetGameDir(instanceId = null) {
  if (instanceId) {
    const dir = getInstanceDir(instanceId);
    if (dir) return dir;
  }
  return getMinecraftRoot();
}

async function computeDirectorySize(dirPath) {
  let total = 0;
  const entries = await fs.promises.readdir(dirPath, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      total += await computeDirectorySize(full);
    } else if (entry.isFile()) {
      const st = await fs.promises.stat(full).catch(() => null);
      if (st) total += st.size;
    }
  }
  return total;
}

function extractNbtStringTag(buffer, tagName) {
  try {
    const nameBuf = Buffer.from(tagName, 'utf8');
    const marker = Buffer.alloc(3 + nameBuf.length);
    marker[0] = 0x08; // TAG_String
    marker.writeUInt16BE(nameBuf.length, 1);
    nameBuf.copy(marker, 3);
    const idx = buffer.indexOf(marker);
    if (idx < 0) return '';
    const valueOffset = idx + marker.length;
    if (valueOffset + 2 > buffer.length) return '';
    const valueLen = buffer.readUInt16BE(valueOffset);
    if (valueLen <= 0 || valueOffset + 2 + valueLen > buffer.length) return '';
    return buffer.toString('utf8', valueOffset + 2, valueOffset + 2 + valueLen).trim();
  } catch {
    return '';
  }
}

async function readWorldMetadata(worldPath, folderName) {
  let worldName = folderName;
  let lastPlayed = 0;
  let iconDataUri = null;

  const levelDatPath = path.join(worldPath, 'level.dat');
  try {
    const [compressed, stat] = await Promise.all([
      fs.promises.readFile(levelDatPath),
      fs.promises.stat(levelDatPath),
    ]);
    lastPlayed = stat.mtimeMs || 0;
    const rawNbt = zlib.gunzipSync(compressed);
    const parsedName = extractNbtStringTag(rawNbt, 'LevelName');
    if (parsedName) worldName = parsedName;
  } catch {
    const dirStat = await fs.promises.stat(worldPath).catch(() => null);
    lastPlayed = dirStat?.mtimeMs || 0;
  }

  const iconPath = path.join(worldPath, 'icon.png');
  try {
    const iconBuf = await fs.promises.readFile(iconPath);
    iconDataUri = `data:image/png;base64,${iconBuf.toString('base64')}`;
  } catch { }

  const sizeBytes = await computeDirectorySize(worldPath);

  return {
    folderName,
    name: worldName,
    path: worldPath,
    lastPlayed,
    sizeBytes,
    iconDataUri,
    hasLevelDat: fs.existsSync(levelDatPath),
  };
}

export async function listInstanceWorlds(instanceId = null) {
  const gameDir = resolveTargetGameDir(instanceId);
  const savesDir = path.join(gameDir, 'saves');
  const entries = await fs.promises.readdir(savesDir, { withFileTypes: true }).catch(() => []);
  const dirs = entries.filter(e => e.isDirectory() && !e.name.startsWith('.'));

  const worlds = await Promise.all(
    dirs.map(entry => readWorldMetadata(path.join(savesDir, entry.name), entry.name))
  );

  worlds.sort((a, b) => (b.lastPlayed || 0) - (a.lastPlayed || 0));
  return { ok: true, worlds, savesDir };
}

function addDirectoryToZip(zip, srcDir, zipPrefix) {
  const entries = fs.readdirSync(srcDir, { withFileTypes: true });
  for (const entry of entries) {
    if (entry.name === 'session.lock') continue;
    const fullPath = path.join(srcDir, entry.name);
    const relZipPath = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      addDirectoryToZip(zip, fullPath, relZipPath);
    } else if (entry.isFile()) {
      zip.addLocalFile(fullPath, zipPrefix || '', entry.name);
    }
  }
}

export async function backupInstanceWorld(instanceId = null, folderName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const savesDir = path.join(gameDir, 'saves');
  const worldPath = assertSafeChildPath(savesDir, folderName);
  if (!fs.existsSync(worldPath)) {
    return { error: 'NotFound', message: 'World folder not found.' };
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const cleanName = sanitizeFileName(folderName, 'world').replace(/\.zip$/i, '');
  const win = getMainWindow();
  const backupsDir = path.join(gameDir, 'backups');
  await fs.promises.mkdir(backupsDir, { recursive: true }).catch(() => {});

  const saveDialog = await dialog.showSaveDialog(win || undefined, {
    title: `Backup World (${folderName})`,
    defaultPath: path.join(backupsDir, `${cleanName}-${stamp}.zip`),
    filters: [{ name: 'ZIP Archive', extensions: ['zip'] }],
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    return { canceled: true };
  }

  const zip = new AdmZip();
  addDirectoryToZip(zip, worldPath, folderName);
  await zip.writeZipPromise(saveDialog.filePath);

  const stat = await fs.promises.stat(saveDialog.filePath).catch(() => null);
  return {
    ok: true,
    filePath: saveDialog.filePath,
    sizeBytes: stat?.size || 0,
  };
}

export async function deleteInstanceWorld(instanceId = null, folderName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const savesDir = path.join(gameDir, 'saves');
  const worldPath = assertSafeChildPath(savesDir, folderName);
  if (!fs.existsSync(worldPath)) {
    return { error: 'NotFound', message: 'World folder not found.' };
  }
  await fs.promises.rm(worldPath, { recursive: true, force: true });
  return { ok: true };
}

export async function openInstanceWorldFolder(instanceId = null, folderName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const savesDir = path.join(gameDir, 'saves');
  const target = folderName ? assertSafeChildPath(savesDir, folderName) : savesDir;
  await fs.promises.mkdir(target, { recursive: true }).catch(() => {});
  const errMsg = await shell.openPath(target);
  if (errMsg) return { error: 'OpenFailed', message: errMsg };
  return { ok: true, path: target };
}

export async function listInstanceScreenshots(instanceId = null) {
  const gameDir = resolveTargetGameDir(instanceId);
  const shotsDir = path.join(gameDir, 'screenshots');
  const entries = await fs.promises.readdir(shotsDir, { withFileTypes: true }).catch(() => []);
  const imageEntries = entries.filter(e => e.isFile() && IMAGE_EXTENSIONS.has(path.extname(e.name).toLowerCase()));

  const items = await Promise.all(
    imageEntries.map(async (entry) => {
      const fullPath = path.join(shotsDir, entry.name);
      const stat = await fs.promises.stat(fullPath).catch(() => null);
      let dataUri = null;
      try {
        const img = nativeImage.createFromPath(fullPath);
        if (!img.isEmpty()) {
          const thumb = img.resize({ width: 420 });
          dataUri = thumb.toDataURL();
        }
      } catch { }
      if (!dataUri && stat && stat.size < 4 * 1024 * 1024) {
        try {
          const buf = await fs.promises.readFile(fullPath);
          const ext = path.extname(entry.name).slice(1).toLowerCase();
          const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
          dataUri = `data:${mime};base64,${buf.toString('base64')}`;
        } catch { }
      }
      return {
        fileName: entry.name,
        path: fullPath,
        sizeBytes: stat?.size || 0,
        createdAt: stat?.mtimeMs || stat?.birthtimeMs || 0,
        dataUri,
      };
    })
  );

  items.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { ok: true, screenshots: items, screenshotsDir: shotsDir };
}

export async function getInstanceScreenshotFull(instanceId = null, fileName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const shotsDir = path.join(gameDir, 'screenshots');
  const fullPath = assertSafeChildPath(shotsDir, fileName);
  const buf = await fs.promises.readFile(fullPath);
  const ext = path.extname(fileName).slice(1).toLowerCase();
  const mime = ext === 'jpg' ? 'image/jpeg' : `image/${ext}`;
  return { ok: true, dataUri: `data:${mime};base64,${buf.toString('base64')}` };
}

export async function copyInstanceScreenshot(instanceId = null, fileName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const shotsDir = path.join(gameDir, 'screenshots');
  const fullPath = assertSafeChildPath(shotsDir, fileName);
  const image = nativeImage.createFromPath(fullPath);
  if (image.isEmpty()) {
    return { error: 'InvalidImage', message: 'Failed to decode screenshot image.' };
  }
  clipboard.writeImage(image);
  return { ok: true };
}

export async function deleteInstanceScreenshot(instanceId = null, fileName = '') {
  const gameDir = resolveTargetGameDir(instanceId);
  const shotsDir = path.join(gameDir, 'screenshots');
  const fullPath = assertSafeChildPath(shotsDir, fileName);
  await fs.promises.unlink(fullPath);
  return { ok: true };
}
