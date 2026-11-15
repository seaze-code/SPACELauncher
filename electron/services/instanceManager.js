import fs from 'fs';
import path from 'path';
import { getMinecraftRoot, getInstancesDir, getInstanceDir } from './paths.js';
import { readJsonSafe, writeJsonAtomic, runWithConcurrency } from './utils.js';

export const DEFAULT_INSTANCE_ICON = 'grass_block';

const MOD_EXTENSIONS = ['.jar', '.jar.disabled', '.slpkg', '.olpkg'];

function isModFileName(fileName) {
  const lower = String(fileName || '').toLowerCase();
  return MOD_EXTENSIONS.some(ext => lower.endsWith(ext));
}

export async function ensureInstancesDir() {
  const dir = getInstancesDir();
  await fs.promises.mkdir(dir, { recursive: true });
  return dir;
}

export function sanitizeInstanceId(name) {
  const sanitized = String(name || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9_-]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return sanitized || `instance-${Date.now()}`;
}

export function detectLoaderFromVersion(version) {
  if (!version) return 'vanilla';
  const lower = String(version).toLowerCase();
  if (lower.includes('fabric')) return 'fabric';
  if (lower.includes('neoforge')) return 'neoforge';
  if (lower.includes('forge')) return 'forge';
  if (lower.includes('quilt')) return 'quilt';
  return 'vanilla';
}

export async function getCustomIconDataUri(instancePath) {
  try {
    const iconFiles = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.webp', 'icon.svg'];
    for (const name of iconFiles) {
      const fullPath = path.join(instancePath, name);
      try {
        const buf = await fs.promises.readFile(fullPath);
        const ext = path.extname(name).slice(1).toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        return `data:${mime};base64,${buf.toString('base64')}`;
      } catch {
        // try next
      }
    }
  } catch (err) {
    console.error('Error reading custom instance icon:', err);
  }
  return null;
}

export async function saveCustomIconFile(instancePath, customIconData) {
  if (!customIconData || typeof customIconData !== 'string') return;
  const match = customIconData.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
  if (!match) return;

  const rawExt = match[1].toLowerCase();
  let ext = 'png';
  if (rawExt.includes('jpeg') || rawExt.includes('jpg')) ext = 'jpg';
  else if (rawExt.includes('webp')) ext = 'webp';
  else if (rawExt.includes('svg')) ext = 'svg';

  const possibleIcons = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.webp', 'icon.svg'];
  await Promise.all(
    possibleIcons.map(name => fs.promises.unlink(path.join(instancePath, name)).catch(() => {}))
  );

  const iconFilePath = path.join(instancePath, `icon.${ext}`);
  await fs.promises.writeFile(iconFilePath, Buffer.from(match[2], 'base64'));
}

async function countEntriesSafe(dirPath, filterFn = null) {
  try {
    const items = await fs.promises.readdir(dirPath);
    return items.filter(name => !name.startsWith('.') && (!filterFn || filterFn(name))).length;
  } catch {
    return 0;
  }
}

async function readInstanceEntry(instanceDirName, instancesDir) {
  const instancePath = path.join(instancesDir, instanceDirName);
  const configPath = path.join(instancePath, 'instance.json');
  const config = await readJsonSafe(configPath);
  if (!config || typeof config !== 'object') return null;

  const [modsCount, savesCount, resolvedCustomIcon] = await Promise.all([
    countEntriesSafe(path.join(instancePath, 'mods'), isModFileName),
    countEntriesSafe(path.join(instancePath, 'saves')),
    config.icon === 'custom' ? getCustomIconDataUri(instancePath) : Promise.resolve(null),
  ]);

  return {
    id: config.id || instanceDirName,
    name: config.name || instanceDirName,
    version: config.version || '1.21.1',
    loader: config.loader || detectLoaderFromVersion(config.version),
    icon: resolvedCustomIcon || config.icon || DEFAULT_INSTANCE_ICON,
    ram: Number(config.ram) || 4,
    jvmArguments: config.jvmArguments || '',
    javaPath: config.javaPath || '',
    created: config.created || Date.now(),
    lastPlayed: config.lastPlayed || null,
    playTimeMs: Number(config.playTimeMs) || 0,
    path: instancePath,
    modsCount,
    savesCount,
  };
}

export async function listInstances() {
  const dir = await ensureInstancesDir();
  const entries = await fs.promises.readdir(dir, { withFileTypes: true }).catch(() => []);
  const dirNames = entries.filter(e => e.isDirectory()).map(e => e.name);

  const parsed = await runWithConcurrency(dirNames, 6, name => readInstanceEntry(name, dir));
  const instances = parsed.filter(Boolean);

  instances.sort((a, b) => {
    const aTime = a.lastPlayed || a.created || 0;
    const bTime = b.lastPlayed || b.created || 0;
    return bTime - aTime;
  });

  return instances;
}

export const readAllInstances = listInstances;

export async function getInstance(id) {
  const instancePath = getInstanceDir(id);
  if (!instancePath) return null;
  const config = await readJsonSafe(path.join(instancePath, 'instance.json'));
  if (!config) return null;

  const [modsCount, savesCount, resolvedCustomIcon] = await Promise.all([
    countEntriesSafe(path.join(instancePath, 'mods'), isModFileName),
    countEntriesSafe(path.join(instancePath, 'saves')),
    config.icon === 'custom' ? getCustomIconDataUri(instancePath) : Promise.resolve(null),
  ]);

  return {
    ...config,
    icon: resolvedCustomIcon || config.icon || DEFAULT_INSTANCE_ICON,
    path: instancePath,
    modsCount,
    savesCount,
  };
}

export async function createInstance({
  name,
  version,
  loader,
  icon = DEFAULT_INSTANCE_ICON,
  customIconData = null,
  ram = 4,
  jvmArguments = '',
  javaPath = '',
}) {
  await ensureInstancesDir();
  const baseId = sanitizeInstanceId(name);
  let id = baseId;
  let counter = 1;

  while (fs.existsSync(getInstanceDir(id))) {
    id = `${baseId}-${counter}`;
    counter++;
  }

  const instancePath = getInstanceDir(id);
  await Promise.all([
    fs.promises.mkdir(path.join(instancePath, 'mods'), { recursive: true }),
    fs.promises.mkdir(path.join(instancePath, 'shaderpacks'), { recursive: true }),
    fs.promises.mkdir(path.join(instancePath, 'resourcepacks'), { recursive: true }),
    fs.promises.mkdir(path.join(instancePath, 'saves'), { recursive: true }),
  ]);

  const rawVer = String(version || '1.21.1').trim();
  const detected = detectLoaderFromVersion(rawVer);
  const finalLoader = detected !== 'vanilla' ? detected : String(loader || 'vanilla').toLowerCase().trim();

  let finalIcon = icon || DEFAULT_INSTANCE_ICON;
  if (customIconData) {
    await saveCustomIconFile(instancePath, customIconData);
    finalIcon = 'custom';
  } else if (finalIcon.startsWith('data:image/')) {
    await saveCustomIconFile(instancePath, finalIcon);
    finalIcon = 'custom';
  }

  const config = {
    id,
    name: String(name || id).trim(),
    version: rawVer,
    loader: finalLoader,
    icon: finalIcon,
    ram: Number(ram) || 4,
    jvmArguments: String(jvmArguments || '').trim(),
    javaPath: String(javaPath || '').trim(),
    created: Date.now(),
    lastPlayed: null,
    playTimeMs: 0,
  };

  await writeJsonAtomic(path.join(instancePath, 'instance.json'), config);

  const resolvedIcon = finalIcon === 'custom'
    ? ((await getCustomIconDataUri(instancePath)) || customIconData || finalIcon)
    : finalIcon;

  return {
    ok: true,
    instance: { ...config, icon: resolvedIcon, path: instancePath, modsCount: 0, savesCount: 0 },
  };
}

export async function updateInstance(id, updates) {
  const instancePath = getInstanceDir(id);
  if (!instancePath) {
    return { error: 'InvalidId', message: 'Invalid instance ID' };
  }
  const configPath = path.join(instancePath, 'instance.json');
  const config = await readJsonSafe(configPath);
  if (!config) {
    return { error: 'NotFound', message: `Instance ${id} not found` };
  }

  try {
    const { customIconData, ...restUpdates } = updates || {};
    let newIcon = restUpdates.icon !== undefined ? restUpdates.icon : config.icon;

    if (customIconData) {
      await saveCustomIconFile(instancePath, customIconData);
      newIcon = 'custom';
    } else if (typeof newIcon === 'string' && newIcon.startsWith('data:image/')) {
      await saveCustomIconFile(instancePath, newIcon);
      newIcon = 'custom';
    } else if (newIcon && newIcon !== 'custom' && config.icon === 'custom') {
      const possibleIcons = ['icon.png', 'icon.jpg', 'icon.jpeg', 'icon.webp', 'icon.svg'];
      await Promise.all(
        possibleIcons.map(name => fs.promises.unlink(path.join(instancePath, name)).catch(() => {}))
      );
    }

    const updated = {
      ...config,
      ...restUpdates,
      icon: newIcon,
      id: config.id || id,
    };

    await writeJsonAtomic(configPath, updated);

    const [modsCount, savesCount, resolvedCustomIcon] = await Promise.all([
      countEntriesSafe(path.join(instancePath, 'mods'), isModFileName),
      countEntriesSafe(path.join(instancePath, 'saves')),
      updated.icon === 'custom' ? getCustomIconDataUri(instancePath) : Promise.resolve(null),
    ]);

    return {
      ok: true,
      instance: {
        ...updated,
        icon: resolvedCustomIcon || customIconData || updated.icon,
        path: instancePath,
        modsCount,
        savesCount,
      },
    };
  } catch (err) {
    return { error: 'UpdateFailed', message: err.message };
  }
}

export async function touchInstanceLastPlayed(id) {
  if (!id) return null;
  return updateInstance(id, { lastPlayed: Date.now() });
}

export async function duplicateInstance(sourceId, newName = null) {
  const sourcePath = getInstanceDir(sourceId);
  if (!sourcePath) return { error: 'InvalidId', message: 'Invalid source instance ID' };
  const sourceConfig = await readJsonSafe(path.join(sourcePath, 'instance.json'));
  if (!sourceConfig) return { error: 'NotFound', message: `Instance ${sourceId} not found` };

  const targetName = (newName && String(newName).trim()) || `${sourceConfig.name || sourceId} Copy`;
  await ensureInstancesDir();

  const baseId = sanitizeInstanceId(targetName);
  let targetId = baseId;
  let counter = 1;
  while (fs.existsSync(getInstanceDir(targetId))) {
    targetId = `${baseId}-${counter}`;
    counter++;
  }

  const targetPath = getInstanceDir(targetId);
  await fs.promises.mkdir(targetPath, { recursive: true });

  const skipEntries = new Set(['logs', 'crash-reports', 'natives', 'usercache.json', 'usernamecache.json']);
  const entries = await fs.promises.readdir(sourcePath);
  for (const entry of entries) {
    if (skipEntries.has(entry) || entry === 'instance.json') continue;
    await copyRecursive(path.join(sourcePath, entry), path.join(targetPath, entry));
  }

  const targetConfig = {
    ...sourceConfig,
    id: targetId,
    name: targetName,
    created: Date.now(),
    lastPlayed: null,
    playTimeMs: 0,
  };
  await writeJsonAtomic(path.join(targetPath, 'instance.json'), targetConfig);

  const created = await getInstance(targetId);
  return { ok: true, instance: created };
}

export async function deleteInstance(id) {
  const instancePath = getInstanceDir(id);
  if (!instancePath || !fs.existsSync(instancePath)) {
    return { error: 'NotFound', message: `Instance ${id} not found` };
  }

  try {
    await fs.promises.rm(instancePath, { recursive: true, force: true });
    return { ok: true, id };
  } catch (err) {
    return { error: 'DeleteFailed', message: err.message };
  }
}

export async function scanBaseDirectory() {
  const baseDir = getMinecraftRoot();

  const [modsCount, shaderpacksCount, resourcepacksCount, savesCount] = await Promise.all([
    countEntriesSafe(path.join(baseDir, 'mods')),
    countEntriesSafe(path.join(baseDir, 'shaderpacks')),
    countEntriesSafe(path.join(baseDir, 'resourcepacks')),
    countEntriesSafe(path.join(baseDir, 'saves')),
  ]);

  return {
    modsCount,
    shaderpacksCount,
    resourcepacksCount,
    savesCount,
    hasConfig: fs.existsSync(path.join(baseDir, 'config')),
    hasOptions: fs.existsSync(path.join(baseDir, 'options.txt')),
  };
}

async function copyRecursive(src, dest) {
  const stat = await fs.promises.stat(src);
  if (stat.isDirectory()) {
    await fs.promises.mkdir(dest, { recursive: true });
    const entries = await fs.promises.readdir(src);
    for (const entry of entries) {
      await copyRecursive(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.copyFile(src, dest);
  }
}

async function moveRecursive(src, dest) {
  try {
    await fs.promises.mkdir(path.dirname(dest), { recursive: true });
    await fs.promises.rename(src, dest);
  } catch {
    await copyRecursive(src, dest);
    await fs.promises.rm(src, { recursive: true, force: true });
  }
}

export async function migrateBaseToInstance({
  name = 'Migrated Instance',
  version = '1.21.1',
  loader = 'vanilla',
  icon = DEFAULT_INSTANCE_ICON,
  ram = 4,
  move = false,
  include = ['mods', 'config', 'shaderpacks', 'resourcepacks', 'saves', 'options'],
}) {
  const baseDir = getMinecraftRoot();
  const createdRes = await createInstance({ name, version, loader, icon, ram });
  if (!createdRes.ok) return createdRes;

  const instance = createdRes.instance;
  const instancePath = instance.path;

  const foldersToMigrate = [
    { key: 'mods', name: 'mods' },
    { key: 'config', name: 'config' },
    { key: 'defaultconfigs', name: 'defaultconfigs' },
    { key: 'shaderpacks', name: 'shaderpacks' },
    { key: 'resourcepacks', name: 'resourcepacks' },
    { key: 'saves', name: 'saves' },
    { key: 'options', name: 'options.txt' },
    { key: 'options', name: 'optionsshaders.txt' },
  ];

  for (const item of foldersToMigrate) {
    if (!include.includes(item.key)) continue;
    const srcPath = path.join(baseDir, item.name);
    const destPath = path.join(instancePath, item.name);
    if (!fs.existsSync(srcPath)) continue;
    try {
      if (move) await moveRecursive(srcPath, destPath);
      else await copyRecursive(srcPath, destPath);
    } catch (err) {
      console.error(`Failed to migrate ${item.name}:`, err);
    }
  }

  const [modsCount, savesCount] = await Promise.all([
    countEntriesSafe(path.join(instancePath, 'mods'), isModFileName),
    countEntriesSafe(path.join(instancePath, 'saves')),
  ]);

  await updateInstance(instance.id, { modsCount, savesCount });

  return {
    ok: true,
    instance: { ...instance, modsCount, savesCount },
    mode: move ? 'converted' : 'copied',
  };
}
