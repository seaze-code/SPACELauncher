import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { getMainWindow } from './windowManager.js';
import { createInstance, updateInstance } from './instanceManager.js';
import { installMinecraft } from './minecraftInstaller.js';
import { fetchAndCacheIconAsBase64 } from './contentManager.js';
import {
  assertSafeChildPath,
  downloadFileAtomic,
  runWithConcurrency,
  sanitizeFileName,
} from './utils.js';
import {
  getModrinthProject,
  getModrinthProjectVersions,
  getModrinthVersion,
} from '../../src/lib/modrinth.js';

const require = createRequire(import.meta.url);
const AdmZip = require('adm-zip');

const USER_AGENT = 'SpaceLauncher/1.0.0 (desktop)';

function resolveModpackDependencies(deps = {}) {
  const mcVersion = String(deps.minecraft || '').trim();
  if (!mcVersion) {
    throw new Error('Modpack does not specify dependencies.minecraft');
  }
  if (deps['fabric-loader']) {
    return { mcVersion, loader: 'fabric', loaderVersion: String(deps['fabric-loader']).trim() };
  }
  if (deps.neoforge) {
    return { mcVersion, loader: 'neoforge', loaderVersion: String(deps.neoforge).trim() };
  }
  if (deps.forge) {
    return { mcVersion, loader: 'forge', loaderVersion: String(deps.forge).trim() };
  }
  if (deps['quilt-loader']) {
    return { mcVersion, loader: 'quilt', loaderVersion: String(deps['quilt-loader']).trim() };
  }
  return { mcVersion, loader: 'vanilla', loaderVersion: '' };
}

export async function pickModpackFile() {
  const win = getMainWindow();
  const result = await dialog.showOpenDialog(win || undefined, {
    title: 'Select Modrinth Modpack (.mrpack)',
    properties: ['openFile'],
    filters: [
      { name: 'Modrinth Modpack', extensions: ['mrpack'] },
      { name: 'ZIP Archives', extensions: ['zip'] },
      { name: 'All Files', extensions: ['*'] },
    ],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { canceled: true, filePath: null };
  }
  return { canceled: false, filePath: result.filePaths[0] };
}

export async function installMrpackArchive({
  mrpackPath,
  projectTitle = '',
  iconUrl = '',
  instanceName = '',
}, { onLog = null, onProgress = null } = {}) {
  if (!mrpackPath || !fs.existsSync(mrpackPath)) {
    throw new Error('Modpack archive not found.');
  }

  const zip = new AdmZip(mrpackPath);
  const indexEntry = zip.getEntry('modrinth.index.json');
  if (!indexEntry) {
    throw new Error('Invalid modpack: modrinth.index.json not found.');
  }

  let index;
  try {
    index = JSON.parse(indexEntry.getData().toString('utf8'));
  } catch {
    throw new Error('Invalid modrinth.index.json format.');
  }

  const { mcVersion, loader, loaderVersion } = resolveModpackDependencies(index?.dependencies || {});
  const packTitle = String(
    instanceName
    || projectTitle
    || index?.name
    || path.basename(mrpackPath, path.extname(mrpackPath))
  ).trim() || 'Modpack Instance';

  onLog?.('info', `[Modpack] Creating instance '${packTitle}' (${mcVersion} · ${loader})...`);
  onProgress?.({ percent: 5, message: `Preparing ${packTitle}...` });

  let customIconData = null;
  if (iconUrl) {
    const cached = await fetchAndCacheIconAsBase64(iconUrl).catch(() => null);
    if (typeof cached === 'string' && cached.startsWith('data:image/')) {
      customIconData = cached;
    }
  }

  const created = await createInstance({
    name: packTitle,
    version: mcVersion,
    loader,
    customIconData,
  });

  if (!created?.ok || !created.instance?.path) {
    throw new Error(created?.message || 'Failed to create instance directory for modpack.');
  }

  const instanceDir = created.instance.path;
  const allFiles = Array.isArray(index?.files) ? index.files : [];
  const clientFiles = allFiles.filter(
    entry => entry && entry.path && Array.isArray(entry.downloads) && entry.downloads.length > 0 && entry.env?.client !== 'unsupported'
  );

  let completedFiles = 0;
  const totalFiles = clientFiles.length;
  onLog?.('info', `[Modpack] Downloading ${totalFiles} modpack files...`);

  await runWithConcurrency(clientFiles, 4, async (entry) => {
    const relPath = String(entry.path).replace(/^\/+/, '');
    const destPath = assertSafeChildPath(instanceDir, relPath);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });

    let downloaded = false;
    let lastErr = null;
    for (const url of entry.downloads) {
      if (!url || typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue;
      try {
        await downloadFileAtomic(url, destPath, {
          headers: { 'User-Agent': USER_AGENT },
          expectedSha512: entry.hashes?.sha512 || null,
          expectedSha1: entry.hashes?.sha1 || null,
        });
        downloaded = true;
        break;
      } catch (err) {
        lastErr = err;
      }
    }

    if (!downloaded) {
      throw new Error(`Failed to download '${relPath}': ${lastErr?.message || 'download failed'}`);
    }

    completedFiles += 1;
    const pct = totalFiles > 0 ? Math.round(10 + (completedFiles / totalFiles) * 60) : 70;
    onProgress?.({ percent: pct, message: `Downloading (${completedFiles}/${totalFiles}): ${path.basename(relPath)}` });
  });

  onLog?.('info', '[Modpack] Applying overrides...');
  onProgress?.({ percent: 72, message: 'Extracting overrides...' });

  const entries = zip.getEntries();
  for (const zipEntry of entries) {
    if (zipEntry.isDirectory) continue;
    const rawName = String(zipEntry.entryName || '').replace(/\\/g, '/');
    let relPath = null;
    if (rawName.startsWith('overrides/')) {
      relPath = rawName.slice('overrides/'.length);
    } else if (rawName.startsWith('client-overrides/')) {
      relPath = rawName.slice('client-overrides/'.length);
    }
    if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) continue;

    const destPath = assertSafeChildPath(instanceDir, relPath);
    await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
    await fs.promises.writeFile(destPath, zipEntry.getData());
  }

  onLog?.('info', `[Modpack] Installing ${loader === 'vanilla' ? `Minecraft ${mcVersion}` : `${loader} ${loaderVersion} for ${mcVersion}`}...`);
  onProgress?.({ percent: 78, message: `Installing ${mcVersion} (${loader})...` });

  const installRes = await installMinecraft({
    type: loader === 'vanilla' ? 'minecraft' : loader,
    version: loader === 'vanilla' ? mcVersion : undefined,
    gameVersion: mcVersion,
    loaderVersion: loader === 'vanilla' ? undefined : loaderVersion,
  }, { onLog, onProgress });

  let finalInstance = created.instance;
  if (installRes?.ok && installRes.path) {
    const installedVersionId = path.basename(path.dirname(installRes.path));
    if (installedVersionId) {
      const updated = await updateInstance(created.instance.id, { version: installedVersionId });
      if (updated?.ok && updated.instance) {
        finalInstance = updated.instance;
      }
    }
  } else if (installRes?.error) {
    onLog?.('warn', `[Modpack] Loader install warning: ${installRes.message || installRes.error}`);
  }

  onProgress?.({ percent: 100, message: `${packTitle} ready.` });
  onLog?.('success', `[Modpack] '${packTitle}' installed (${totalFiles} files).`);

  return {
    ok: true,
    instance: finalInstance,
    filesCount: totalFiles,
  };
}

export async function installModrinthModpack({
  projectId,
  versionId = '',
  fileUrl = '',
  fileName = '',
  projectTitle = '',
  iconUrl = '',
}, { onLog = null, onProgress = null } = {}) {
  let resolvedProjectTitle = projectTitle;
  let resolvedIconUrl = iconUrl;

  if (projectId && (!resolvedProjectTitle || !resolvedIconUrl)) {
    const project = await getModrinthProject(projectId).catch(() => null);
    if (project) {
      if (!resolvedProjectTitle) resolvedProjectTitle = project.title || '';
      if (!resolvedIconUrl) resolvedIconUrl = project.icon_url || '';
    }
  }

  let targetVersion = null;
  if (versionId) {
    targetVersion = await getModrinthVersion(versionId).catch(() => null);
  }
  if (!targetVersion && projectId) {
    const versions = await getModrinthProjectVersions({ idOrSlug: projectId }).catch(() => []);
    targetVersion = versions?.[0] || null;
  }

  const primaryFile = targetVersion
    ? (targetVersion.files?.find(f => f.primary || String(f.filename || '').endsWith('.mrpack')) || targetVersion.files?.[0])
    : null;
  const downloadUrl = primaryFile?.url || fileUrl;
  const mrpackName = sanitizeFileName(
    primaryFile?.filename || fileName || `${projectId || 'modpack'}.mrpack`,
    'modpack.mrpack'
  );

  if (!downloadUrl) {
    throw new Error('Could not resolve .mrpack download URL for this modpack.');
  }

  const tempDir = await fs.promises.mkdtemp(path.join(app.getPath('temp'), 'spacelauncher-mrpack-'));
  try {
    const mrpackPath = path.join(tempDir, mrpackName);
    onLog?.('info', `[Modpack] Downloading archive ${mrpackName}...`);
    onProgress?.({ percent: 2, message: `Downloading ${mrpackName}...` });

    await downloadFileAtomic(downloadUrl, mrpackPath, {
      headers: { 'User-Agent': USER_AGENT },
      expectedSha512: primaryFile?.hashes?.sha512 || null,
      expectedSha1: primaryFile?.hashes?.sha1 || null,
    });

    return await installMrpackArchive(
      {
        mrpackPath,
        projectTitle: resolvedProjectTitle,
        iconUrl: resolvedIconUrl,
      },
      { onLog, onProgress }
    );
  } finally {
    await fs.promises.rm(tempDir, { recursive: true, force: true }).catch(() => {});
  }
}
