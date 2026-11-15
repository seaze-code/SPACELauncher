import { app, dialog } from 'electron';
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { getMainWindow } from './windowManager.js';
import { createInstance, getInstance, updateInstance } from './instanceManager.js';
import { installMinecraft } from './minecraftInstaller.js';
import { getMinecraftRoot } from './paths.js';
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
  const spaceManifestEntry = zip.getEntry('space-instance.json');

  if (!indexEntry && spaceManifestEntry) {
    let manifest = {};
    try { manifest = JSON.parse(spaceManifestEntry.getData().toString('utf8')); } catch { }
    const packTitle = String(instanceName || projectTitle || manifest?.name || path.basename(mrpackPath, path.extname(mrpackPath))).trim() || 'Imported Instance';
    const mcVer = String(manifest?.mcVersion || manifest?.version || '1.21.1').trim();
    const loader = String(manifest?.loader || 'vanilla').toLowerCase();

    onLog?.('info', `[Import] Creating instance '${packTitle}' from archive...`);
    onProgress?.({ percent: 10, message: `Creating ${packTitle}...` });

    const created = await createInstance({
      name: packTitle,
      version: manifest?.version || mcVer,
      loader,
      ram: Number(manifest?.ram) || 4,
      jvmArguments: manifest?.jvmArguments || '',
      serverAddress: manifest?.serverAddress || '',
    });
    if (!created?.ok || !created.instance?.path) {
      throw new Error(created?.message || 'Failed to create instance directory.');
    }

    const entries = zip.getEntries();
    for (let idx = 0; idx < entries.length; idx++) {
      const zipEntry = entries[idx];
      if (zipEntry.isDirectory) continue;
      const rawName = String(zipEntry.entryName || '').replace(/\\/g, '/');
      if (rawName === 'space-instance.json' || rawName === 'instance.json') continue;
      const relPath = rawName.startsWith('overrides/') ? rawName.slice('overrides/'.length) : rawName;
      if (!relPath || relPath.startsWith('..') || path.isAbsolute(relPath)) continue;
      const destPath = assertSafeChildPath(created.instance.path, relPath);
      await fs.promises.mkdir(path.dirname(destPath), { recursive: true });
      await fs.promises.writeFile(destPath, zipEntry.getData());
      if (idx % 10 === 0) {
        onProgress?.({ percent: Math.min(95, Math.round(15 + (idx / Math.max(1, entries.length)) * 80)), message: `Extracting ${path.basename(relPath)}...` });
      }
    }

    onProgress?.({ percent: 100, message: `${packTitle} ready.` });
    onLog?.('success', `[Import] '${packTitle}' imported.`);
    return { ok: true, instance: created.instance, filesCount: entries.length };
  }

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

function addInstanceDirEntriesToZip(zip, rootDir, zipPrefix, skipTopDirs) {
  const entries = fs.readdirSync(rootDir, { withFileTypes: true });
  for (const entry of entries) {
    if (skipTopDirs && skipTopDirs.has(entry.name)) continue;
    if (entry.name === 'session.lock' || entry.name === '.DS_Store') continue;
    const fullPath = path.join(rootDir, entry.name);
    if (entry.isDirectory()) {
      const nextPrefix = zipPrefix ? `${zipPrefix}/${entry.name}` : entry.name;
      addInstanceDirEntriesToZip(zip, fullPath, nextPrefix, null);
    } else if (entry.isFile()) {
      zip.addLocalFile(fullPath, zipPrefix || '', entry.name);
    }
  }
}

async function resolveExportDependencies(instance) {
  const rawVer = String(instance?.version || '1.21.1').trim();
  const loader = String(instance?.loader || 'vanilla').toLowerCase();
  const deps = {};

  let mcVer = rawVer;
  let loaderVer = '';

  try {
    const versionJsonPath = path.join(getMinecraftRoot(), 'versions', rawVer, `${rawVer}.json`);
    if (fs.existsSync(versionJsonPath)) {
      const parsed = JSON.parse(await fs.promises.readFile(versionJsonPath, 'utf8'));
      if (parsed?.inheritsFrom) mcVer = String(parsed.inheritsFrom).trim();
    }
  } catch { }

  const fabricMatch = rawVer.match(/^fabric-loader-([^-]+)-(.+)$/i);
  const quiltMatch = rawVer.match(/^quilt-loader-([^-]+)-(.+)$/i);
  const forgeMatch = rawVer.match(/^(\d+\.\d+(?:\.\d+)?)[-_]forge[-_](.+)$/i) || rawVer.match(/^forge[-_](\d+\.\d+(?:\.\d+)?)[-_](.+)$/i);
  const neoMatch = rawVer.match(/^neoforge[-_](.+)$/i);

  if (fabricMatch) {
    loaderVer = fabricMatch[1];
    mcVer = fabricMatch[2];
  } else if (quiltMatch) {
    loaderVer = quiltMatch[1];
    mcVer = quiltMatch[2];
  } else if (forgeMatch) {
    mcVer = forgeMatch[1];
    loaderVer = forgeMatch[2];
  } else if (neoMatch) {
    loaderVer = neoMatch[1];
  }

  deps.minecraft = mcVer;
  if (loader === 'fabric' && loaderVer) deps['fabric-loader'] = loaderVer;
  else if (loader === 'quilt' && loaderVer) deps['quilt-loader'] = loaderVer;
  else if (loader === 'forge' && loaderVer) deps.forge = loaderVer;
  else if (loader === 'neoforge' && loaderVer) deps.neoforge = loaderVer;

  return { deps, mcVersion: mcVer, loader, loaderVersion: loaderVer };
}

export async function exportInstanceArchive({ instanceId, format = 'mrpack', includeSaves = false } = {}) {
  const instance = await getInstance(instanceId);
  if (!instance || !instance.path || !fs.existsSync(instance.path)) {
    return { error: 'NotFound', message: 'Instance not found.' };
  }

  const ext = format === 'zip' ? 'zip' : 'mrpack';
  const baseFileName = sanitizeFileName(instance.name || instance.id, 'instance');
  const win = getMainWindow();

  const saveDialog = await dialog.showSaveDialog(win || undefined, {
    title: `Export Instance (${ext.toUpperCase()})`,
    defaultPath: `${baseFileName}.${ext}`,
    filters: ext === 'mrpack'
      ? [{ name: 'Modrinth Modpack', extensions: ['mrpack'] }, { name: 'ZIP Archive', extensions: ['zip'] }]
      : [{ name: 'ZIP Archive', extensions: ['zip'] }, { name: 'Modrinth Modpack', extensions: ['mrpack'] }],
  });

  if (saveDialog.canceled || !saveDialog.filePath) {
    return { canceled: true };
  }

  const outPath = saveDialog.filePath;
  const chosenExt = path.extname(outPath).toLowerCase() === '.zip' ? 'zip' : 'mrpack';
  const zip = new AdmZip();

  const skipDirs = new Set([
    'logs',
    'crash-reports',
    'natives',
    'backups',
    'downloads',
    '.fabric',
    '.mixin.out',
    'instance.json',
    'usercache.json',
    'usernamecache.json',
  ]);
  if (!includeSaves) skipDirs.add('saves');

  const resolved = await resolveExportDependencies(instance);

  if (chosenExt === 'mrpack') {
    const indexPayload = {
      formatVersion: 1,
      game: 'minecraft',
      versionId: '1.0.0',
      name: instance.name || instance.id,
      summary: `Exported from SpaceLauncher (${resolved.mcVersion} · ${resolved.loader})`,
      dependencies: resolved.deps,
      files: [],
    };
    zip.addFile('modrinth.index.json', Buffer.from(JSON.stringify(indexPayload, null, 2), 'utf8'));
    addInstanceDirEntriesToZip(zip, instance.path, 'overrides', skipDirs);
  } else {
    const spaceManifest = {
      format: 'spacelauncher-instance-v1',
      name: instance.name || instance.id,
      version: instance.version,
      mcVersion: resolved.mcVersion,
      loader: instance.loader || resolved.loader,
      ram: instance.ram || 4,
      jvmArguments: instance.jvmArguments || '',
      serverAddress: instance.serverAddress || '',
      exportedAt: Date.now(),
    };
    zip.addFile('space-instance.json', Buffer.from(JSON.stringify(spaceManifest, null, 2), 'utf8'));
    addInstanceDirEntriesToZip(zip, instance.path, '', skipDirs);
  }

  await zip.writeZipPromise(outPath);
  const stat = await fs.promises.stat(outPath).catch(() => null);
  return {
    ok: true,
    filePath: outPath,
    format: chosenExt,
    sizeBytes: stat?.size || 0,
  };
}
