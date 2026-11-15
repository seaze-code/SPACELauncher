import os from 'os';
import path from 'path';

let customRootOverride = null;

export function setCustomMinecraftRoot(rootPath) {
  customRootOverride = rootPath && String(rootPath).trim() ? path.resolve(String(rootPath).trim()) : null;
}

export function getMinecraftRoot() {
  if (customRootOverride) return customRootOverride;
  if (process.env.SPACELAUNCHER_MC_ROOT) {
    return path.resolve(process.env.SPACELAUNCHER_MC_ROOT);
  }
  if (process.platform === 'win32') {
    return path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), '.minecraft');
  }
  if (process.platform === 'darwin') {
    return path.join(os.homedir(), 'Library', 'Application Support', 'minecraft');
  }
  return path.join(os.homedir(), '.minecraft');
}

export function sanitizeInstanceId(instanceId) {
  if (!instanceId || typeof instanceId !== 'string') return '';
  const cleaned = path.basename(instanceId.trim()).replace(/[^a-zA-Z0-9._-]/g, '');
  if (!cleaned || cleaned === '.' || cleaned === '..') return '';
  return cleaned;
}

export function getInstancesDir() {
  return path.join(getMinecraftRoot(), 'instances');
}

export function getInstanceDir(instanceId) {
  const safeId = sanitizeInstanceId(instanceId);
  if (!safeId) return '';
  return path.join(getInstancesDir(), safeId);
}

export function getMinecraftRoots(instanceId = null) {
  const baseDir = getMinecraftRoot();
  const safeId = sanitizeInstanceId(instanceId);
  const gameDir = safeId ? getInstanceDir(safeId) : null;
  if (gameDir && gameDir !== baseDir) {
    return [gameDir, baseDir];
  }
  return [baseDir];
}
