import makeWASocket, {
  DisconnectReason,
  useMultiFileAuthState,
  fetchLatestBaileysVersion
} from '@whiskeysockets/baileys';
import path from 'path';
import fs from 'fs';
import QRCode from 'qrcode';
import pino from 'pino';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootSessionDir = path.join(__dirname, '../storage/session');

// Ensure root storage dir exists
if (!fs.existsSync(rootSessionDir)) {
  fs.mkdirSync(rootSessionDir, { recursive: true });
}

const sockets = new Map();
const connectionStatuses = new Map();
const lastQrs = new Map();

const logger = pino({ level: 'silent' });

export function getSessionDir(sessionId) {
  return path.join(rootSessionDir, sessionId);
}

export async function connectToWhatsApp(sessionId, onEventCallback) {
  if (!sessionId) {
    throw new Error('Session ID is required');
  }

  // If already connected or connecting and socket exists, don't re-initiate
  const currentStatus = connectionStatuses.get(sessionId);
  if ((currentStatus === 'connected' || currentStatus === 'connecting') && sockets.has(sessionId)) {
    return sockets.get(sessionId);
  }

  try {
    const sessionDir = getSessionDir(sessionId);
    if (!fs.existsSync(sessionDir)) {
      fs.mkdirSync(sessionDir, { recursive: true });
    }

    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    
    let version = [6, 7, 9];
    try {
      const versionPromise = fetchLatestBaileysVersion();
      const timeoutPromise = new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 2000));
      const latest = await Promise.race([versionPromise, timeoutPromise]);
      if (latest && latest.version) {
        version = latest.version;
      }
    } catch (e) {
      console.log('Using local fallback Baileys version [6, 7, 9] (offline or timeout)');
    }

    const makeSocket = typeof makeWASocket === 'function' ? makeWASocket : (makeWASocket.default || makeWASocket);
    const sock = makeSocket({
      version,
      auth: state,
      printQRInTerminal: true,
      logger,
      browser: ['WA Blast Platform', 'Chrome', '1.0.0']
    });

    sockets.set(sessionId, sock);
    connectionStatuses.set(sessionId, 'connecting');

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      if (qr) {
        try {
          const qrDataUrl = await QRCode.toDataURL(qr);
          lastQrs.set(sessionId, qrDataUrl);
          connectionStatuses.set(sessionId, 'qr');
          if (onEventCallback) {
            onEventCallback(sessionId, { type: 'qr', qr: qrDataUrl });
          }
        } catch (qrErr) {
          console.error(`Failed to generate QR for session ${sessionId}:`, qrErr);
        }
      }

      if (connection === 'connecting') {
        connectionStatuses.set(sessionId, 'connecting');
        if (onEventCallback) {
          onEventCallback(sessionId, { type: 'connecting' });
        }
      }

      if (connection === 'open') {
        connectionStatuses.set(sessionId, 'connected');
        lastQrs.delete(sessionId);
        
        let phoneNumber = null;
        if (sock.user && sock.user.id) {
          phoneNumber = sock.user.id.split(':')[0].split('@')[0];
        }

        if (onEventCallback) {
          onEventCallback(sessionId, { type: 'connected', phoneNumber });
        }
      }

      if (connection === 'close') {
        const statusCode = lastDisconnect?.error?.output?.statusCode || lastDisconnect?.error?.code;
        const shouldReconnect = statusCode !== DisconnectReason.loggedOut;
        
        console.log(`Session ${sessionId} closed. Status code: ${statusCode}. Reconnecting: ${shouldReconnect}`);

        // Remove the closed socket from our active sockets map so reconnect will spawn a new one
        sockets.delete(sessionId);

        if (statusCode === DisconnectReason.loggedOut) {
          connectionStatuses.set(sessionId, 'disconnected');
          lastQrs.delete(sessionId);
          clearSession(sessionId);
          if (onEventCallback) {
            onEventCallback(sessionId, { type: 'disconnected' });
          }
        } else {
          connectionStatuses.set(sessionId, 'connecting');
          if (onEventCallback) {
            onEventCallback(sessionId, { type: 'reconnecting' });
          }
          // Reconnect after delay
          setTimeout(() => connectToWhatsApp(sessionId, onEventCallback), 5000);
        }
      }
    });

    return sock;
  } catch (err) {
    console.error(`Error during session ${sessionId} WhatsApp connection initialization:`, err);
    connectionStatuses.set(sessionId, 'disconnected');
    if (onEventCallback) {
      onEventCallback(sessionId, { type: 'error', error: err.message });
    }
  }
}

export function getSocket(sessionId) {
  return sockets.get(sessionId);
}

export function getConnectionStatus(sessionId) {
  return { 
    status: connectionStatuses.get(sessionId) || 'disconnected', 
    qr: lastQrs.get(sessionId) || null 
  };
}

export function logout(sessionId) {
  const sock = sockets.get(sessionId);
  if (sock) {
    try {
      sock.logout();
    } catch (e) {
      console.error(`Socket logout failed for session ${sessionId}, clearing manually`, e);
      clearSession(sessionId);
    }
    sockets.delete(sessionId);
  } else {
    clearSession(sessionId);
  }
  connectionStatuses.set(sessionId, 'disconnected');
  lastQrs.delete(sessionId);
}

export function clearSession(sessionId) {
  try {
    const sessionDir = getSessionDir(sessionId);
    if (fs.existsSync(sessionDir)) {
      fs.rmSync(sessionDir, { recursive: true, force: true });
    }
  } catch (error) {
    console.error(`Failed to clear session directory for session ${sessionId}:`, error);
  }
}
