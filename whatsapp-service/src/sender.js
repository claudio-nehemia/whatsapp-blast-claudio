import { getSocket } from './connection.js';
import fs from 'fs';
import path from 'path';

/**
 * Normalizes phone numbers to standard WhatsApp JIDs
 * e.g., '08123456789' -> '628123456789@s.whatsapp.net'
 * e.g., '+62 812-3456-789' -> '628123456789@s.whatsapp.net'
 */
export function normalizeJid(phone) {
  let clean = phone.toString().replace(/[^0-9]/g, '');
  if (clean.startsWith('0')) {
    clean = '62' + clean.slice(1);
  } else if (clean.startsWith('8') && clean.length >= 9 && clean.length <= 13) {
    clean = '62' + clean;
  }
  if (!clean.endsWith('@s.whatsapp.net')) {
    clean = clean + '@s.whatsapp.net';
  }
  return clean;
}

/**
 * Sends a message with optional simulated typing and image attachment
 */
export async function sendMessage({ sessionId, phone, text, imagePath, typingSimulation = true }) {
  const sock = getSocket(sessionId);
  if (!sock) {
    throw new Error(`WhatsApp sender session '${sessionId}' is not connected`);
  }

  const jid = normalizeJid(phone);

  // Check if contact exists on WA
  // Note: on-the-fly checking can sometimes rate-limit or fail, but Baileys lets us check:
  // const [result] = await sock.onWhatsApp(jid);
  // However, sending directly is standard unless bulk validation is specifically desired.

  if (typingSimulation) {
    try {
      await sock.sendPresenceUpdate('composing', jid);
      // Simulate typing delay: 10ms per character, between 1s and 3s
      const typingTime = Math.max(1000, Math.min(3000, (text || '').length * 15));
      await new Promise((resolve) => setTimeout(resolve, typingTime));
      await sock.sendPresenceUpdate('paused', jid);
    } catch (e) {
      console.warn('Failed to send presence update (typing simulation). Proceeding to send message.', e);
    }
  }

  let result;
  if (imagePath) {
    // Resolve absolute path or verify it exists
    const resolvedPath = path.resolve(imagePath);
    if (!fs.existsSync(resolvedPath)) {
      throw new Error(`Attachment image not found at path: ${resolvedPath}`);
    }

    result = await sock.sendMessage(jid, {
      image: { url: resolvedPath },
      caption: text || ''
    });
  } else {
    result = await sock.sendMessage(jid, {
      text: text || ''
    });
  }

  return result;
}
