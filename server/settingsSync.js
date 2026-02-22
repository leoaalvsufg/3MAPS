/**
 * server/settingsSync.js
 *
 * Sincroniza admin_settings entre SQLite local e Firebase Firestore.
 * Valores sensíveis (api keys, secrets) são criptografados com AES-256-GCM
 * antes de serem enviados ao Firestore.
 */

import crypto from 'node:crypto';
import { initFirebaseAdmin, getFirestore } from './firebaseAdmin.js';
import { getAdminSettings, setAdminSettings } from './activity.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;
const SENSITIVE_PATTERNS = /api_key|_secret|webhook_secret|smtp_pass/i;

function getEncryptionKey() {
  const key = process.env.SETTINGS_ENCRYPTION_KEY;
  if (!key || typeof key !== 'string' || key.length < 32) return null;
  const hex = key.replace(/^0x/, '');
  if (hex.length !== 64 || !/^[0-9a-fA-F]+$/.test(hex)) return null;
  return Buffer.from(hex, 'hex');
}

function isSensitive(key) {
  return SENSITIVE_PATTERNS.test(key);
}

function encrypt(value, keyBuffer) {
  if (value === undefined || value === null) return null;
  const str = typeof value === 'string' ? value : JSON.stringify(value);
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv);
  let encrypted = cipher.update(str, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(encrypted, keyBuffer) {
  if (!encrypted || typeof encrypted !== 'string') return null;
  const parts = encrypted.split(':');
  if (parts.length !== 3) return encrypted;
  try {
    const iv = Buffer.from(parts[0], 'hex');
    const authTag = Buffer.from(parts[1], 'hex');
    const encryptedHex = parts[2];
    const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv);
    decipher.setAuthTag(authTag);
    return decipher.update(encryptedHex, 'hex', 'utf8') + decipher.final('utf8');
  } catch {
    return null;
  }
}

/**
 * Sincroniza settings locais para o Firestore.
 * Criptografa valores sensíveis antes do envio.
 * @param {Record<string, any>} settings
 * @param {string} [updatedBy]
 * @returns {Promise<boolean>} true se sincronizou, false se Firestore indisponível
 */
export async function syncSettingsToFirestore(settings, updatedBy = null) {
  if (!initFirebaseAdmin()) return false;
  const firestore = getFirestore();
  if (!firestore) return false;

  const keyBuffer = getEncryptionKey();
  const doc = {
    _updatedAt: new Date().toISOString(),
    _updatedBy: updatedBy ?? '',
  };

  for (const [key, value] of Object.entries(settings)) {
    if (value === undefined || value === null) continue;
    const strVal = typeof value === 'string' ? value : JSON.stringify(value);
    if (keyBuffer && isSensitive(key)) {
      doc[key] = encrypt(strVal, keyBuffer);
    } else {
      doc[key] = strVal;
    }
  }

  try {
    await firestore.collection('admin_settings').doc('config').set(doc, { merge: true });
    return true;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[settingsSync] Firestore write failed', err?.message ?? String(err));
    }
    return false;
  }
}

/**
 * Lê settings do Firestore e retorna objeto deserializado.
 * Descriptografa valores sensíveis.
 * @returns {Promise<Record<string, any> | null>} settings ou null se indisponível
 */
export async function syncSettingsFromFirestore() {
  if (!initFirebaseAdmin()) return null;
  const firestore = getFirestore();
  if (!firestore) return null;

  const keyBuffer = getEncryptionKey();

  try {
    const snap = await firestore.collection('admin_settings').doc('config').get();
    if (!snap.exists) return {};

    const data = snap.data();
    const settings = {};
    const skip = ['_updatedAt', '_updatedBy'];

    for (const [key, raw] of Object.entries(data)) {
      if (skip.includes(key)) continue;
      if (raw === undefined || raw === null) continue;

      let value = raw;
      if (keyBuffer && typeof raw === 'string' && raw.includes(':') && raw.split(':').length === 3) {
        const decrypted = decrypt(raw, keyBuffer);
        if (decrypted !== null) value = decrypted;
      }

      try {
        settings[key] = typeof value === 'string' && /^[{\[]/.test(value)
          ? JSON.parse(value)
          : value;
      } catch {
        settings[key] = value;
      }
    }
    return settings;
  } catch (err) {
    if (process.env.NODE_ENV !== 'test') {
      console.error('[settingsSync] Firestore read failed', err?.message ?? String(err));
    }
    return null;
  }
}

/**
 * Mescla Firestore com SQLite local e sincroniza.
 * Firestore tem prioridade para chaves existentes.
 * Chamar no startup do servidor.
 */
export async function mergeAndSync() {
  const local = getAdminSettings();
  const remote = await syncSettingsFromFirestore();

  if (remote === null) {
    return;
  }

  const merged = { ...local };
  for (const [key, value] of Object.entries(remote)) {
    if (value !== undefined && value !== null && value !== '') {
      merged[key] = value;
    }
  }

  const changed = Object.keys(merged).filter((k) => JSON.stringify(merged[k]) !== JSON.stringify(local[k]));
  if (changed.length > 0) {
    setAdminSettings(merged, '_firestore_sync');
    syncSettingsToFirestore(merged, '_firestore_sync').catch(() => {});
  }
}
