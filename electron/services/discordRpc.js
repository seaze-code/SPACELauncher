import net from 'net';
import path from 'path';
import os from 'os';
import crypto from 'crypto';

const OP_HANDSHAKE = 0;
const OP_FRAME = 1;
const OP_CLOSE = 2;

let socket = null;
let connectedClientId = '';
let connectingPromise = null;
let lastPresencePayload = null;
let lastStatus = { connected: false, reason: 'idle', clientId: '' };

function getIpcEndpoints() {
  if (process.platform === 'win32') {
    return Array.from({ length: 10 }, (_, idx) => `\\\\?\\pipe\\discord-ipc-${idx}`);
  }
  const baseDirs = [
    process.env.XDG_RUNTIME_DIR,
    process.env.TMPDIR,
    process.env.TMP,
    process.env.TEMP,
    os.tmpdir(),
    '/tmp',
  ].filter(Boolean);

  const unique = [];
  for (const dir of baseDirs) {
    for (let idx = 0; idx < 10; idx += 1) {
      const candidate = path.join(dir, `discord-ipc-${idx}`);
      if (!unique.includes(candidate)) unique.push(candidate);
      const flatpak = path.join(dir, 'app', 'com.discordapp.Discord', `discord-ipc-${idx}`);
      if (!unique.includes(flatpak)) unique.push(flatpak);
    }
  }
  return unique;
}

function encodeFrame(opcode, payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  const packet = Buffer.alloc(8 + json.length);
  packet.writeInt32LE(opcode, 0);
  packet.writeInt32LE(json.length, 4);
  json.copy(packet, 8);
  return packet;
}

function tryConnectEndpoint(endpoint, clientId) {
  return new Promise((resolve, reject) => {
    const client = net.createConnection(endpoint);
    let settled = false;

    const cleanupFailure = (err) => {
      if (settled) return;
      settled = true;
      try { client.destroy(); } catch { }
      reject(err || new Error('Connection failed'));
    };

    const timer = setTimeout(() => {
      cleanupFailure(new Error('Discord IPC handshake timed out'));
    }, 1500);

    client.once('error', cleanupFailure);

    client.once('connect', () => {
      try {
        client.write(encodeFrame(OP_HANDSHAKE, { v: 1, client_id: String(clientId) }));
      } catch (err) {
        clearTimeout(timer);
        cleanupFailure(err);
      }
    });

    client.on('data', (chunk) => {
      if (settled) return;
      if (chunk.length >= 8) {
        clearTimeout(timer);
        settled = true;
        resolve(client);
      }
    });

    client.once('close', () => {
      clearTimeout(timer);
      if (!settled) cleanupFailure(new Error('Discord IPC closed during handshake'));
    });
  });
}

async function ensureConnected(clientId) {
  const cleanId = String(clientId || process.env.SPACELAUNCHER_DISCORD_CLIENT_ID || '').trim();
  if (!cleanId) {
    lastStatus = { connected: false, reason: 'missing-client-id', clientId: '' };
    return null;
  }

  if (socket && !socket.destroyed && connectedClientId === cleanId) {
    return socket;
  }

  if (socket && connectedClientId !== cleanId) {
    disconnectDiscordRpc();
  }

  if (connectingPromise) return connectingPromise;

  connectingPromise = (async () => {
    const endpoints = getIpcEndpoints();
    for (const endpoint of endpoints) {
      try {
        const client = await tryConnectEndpoint(endpoint, cleanId);
        client.on('close', () => {
          if (socket === client) {
            socket = null;
            connectedClientId = '';
            lastStatus = { connected: false, reason: 'disconnected', clientId: cleanId };
          }
        });
        client.on('error', () => {
          if (socket === client) {
            try { client.destroy(); } catch { }
            socket = null;
            connectedClientId = '';
            lastStatus = { connected: false, reason: 'error', clientId: cleanId };
          }
        });
        socket = client;
        connectedClientId = cleanId;
        lastStatus = { connected: true, reason: 'connected', clientId: cleanId };
        return client;
      } catch {
        // try next discord-ipc slot
      }
    }
    lastStatus = { connected: false, reason: 'discord-not-running', clientId: cleanId };
    return null;
  })().finally(() => {
    connectingPromise = null;
  });

  return connectingPromise;
}

export function disconnectDiscordRpc() {
  if (socket && !socket.destroyed) {
    try {
      socket.write(encodeFrame(OP_CLOSE, {}));
    } catch { }
    try {
      socket.destroy();
    } catch { }
  }
  socket = null;
  connectedClientId = '';
  lastPresencePayload = null;
  lastStatus = { connected: false, reason: 'disabled', clientId: '' };
}

export function getDiscordRpcStatus() {
  return { ...lastStatus };
}

export async function updateDiscordPresence({
  enabled = true,
  clientId = '',
  details = 'In SpaceLauncher',
  state = 'Idle',
  startTimestamp = null,
  largeImageText = 'SpaceLauncher',
} = {}) {
  if (!enabled) {
    disconnectDiscordRpc();
    return getDiscordRpcStatus();
  }

  const client = await ensureConnected(clientId);
  if (!client || client.destroyed) {
    return getDiscordRpcStatus();
  }

  const activity = {
    details: String(details || 'In SpaceLauncher').slice(0, 128),
    state: String(state || 'Ready').slice(0, 128),
    assets: {
      large_image: 'spacelauncher',
      large_text: String(largeImageText || 'SpaceLauncher').slice(0, 128),
    },
    instance: false,
  };

  if (Number.isFinite(startTimestamp) && startTimestamp > 0) {
    activity.timestamps = { start: Math.floor(startTimestamp / 1000) };
  }

  const payload = {
    cmd: 'SET_ACTIVITY',
    args: {
      pid: process.pid,
      activity,
    },
    nonce: crypto.randomUUID(),
  };

  lastPresencePayload = activity;
  try {
    client.write(encodeFrame(OP_FRAME, payload));
    lastStatus = { connected: true, reason: 'connected', clientId: connectedClientId };
  } catch {
    disconnectDiscordRpc();
  }
  return getDiscordRpcStatus();
}
