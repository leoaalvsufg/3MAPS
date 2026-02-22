/**
 * Crypto utilities for encrypting/decrypting sensitive values (e.g. API keys)
 * stored in localStorage. Uses the Web Crypto API (SubtleCrypto) with AES-GCM.
 *
 * The encryption key is derived from a fixed application-level passphrase
 * combined with the current origin, so the ciphertext is bound to this app.
 * This is NOT a substitute for server-side security, but it prevents plain-text
 * API keys from being trivially readable in localStorage.
 */

const APP_PASSPHRASE = '3maps-local-storage-key-v1';
const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;
const IV_LENGTH = 12; // bytes for AES-GCM

/** Returns true when SubtleCrypto is available in the current environment. */
function isCryptoAvailable(): boolean {
  return (
    typeof globalThis !== 'undefined' &&
    typeof globalThis.crypto !== 'undefined' &&
    typeof globalThis.crypto.subtle !== 'undefined'
  );
}

/**
 * Derives an AES-GCM CryptoKey from the application passphrase + origin.
 * The derivation is deterministic so the same key is always produced for the
 * same browser origin.
 */
async function deriveKey(): Promise<CryptoKey> {
  const subtle = globalThis.crypto.subtle;

  // Combine passphrase with origin to bind the key to this deployment.
  const origin =
    typeof globalThis.location !== 'undefined' ? globalThis.location.origin : 'localhost';
  const rawPassphrase = `${APP_PASSPHRASE}:${origin}`;

  const enc = new TextEncoder();
  const keyMaterial = await subtle.importKey(
    'raw',
    enc.encode(rawPassphrase),
    { name: 'PBKDF2' },
    false,
    ['deriveKey'],
  );

  return subtle.deriveKey(
    {
      name: 'PBKDF2',
      // A fixed salt is acceptable here because the passphrase already
      // incorporates the origin; the goal is obfuscation, not password hashing.
      salt: enc.encode('3maps-salt-v1'),
      iterations: 100_000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: ALGORITHM, length: KEY_LENGTH },
    false,
    ['encrypt', 'decrypt'],
  );
}

/**
 * Converts an ArrayBuffer to a base64 string.
 */
function bufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return globalThis.btoa(binary);
}

/**
 * Converts a base64 string to a Uint8Array.
 */
function base64ToBuffer(b64: string): Uint8Array {
  const binary = globalThis.atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

/**
 * Encrypts a plaintext string using AES-GCM.
 * Returns a base64-encoded string of the form: `<iv_b64>.<ciphertext_b64>`.
 *
 * Falls back to returning the plaintext unchanged if Web Crypto is unavailable.
 */
export async function encryptValue(plaintext: string): Promise<string> {
  if (!plaintext) return plaintext;
  if (!isCryptoAvailable()) {
    console.warn('[crypto] Web Crypto API unavailable – storing value unencrypted.');
    return plaintext;
  }

  try {
    const key = await deriveKey();
    const iv = globalThis.crypto.getRandomValues(new Uint8Array(IV_LENGTH));
    const enc = new TextEncoder();
    const cipherBuffer = await globalThis.crypto.subtle.encrypt(
      { name: ALGORITHM, iv: iv as unknown as ArrayBuffer },
      key,
      enc.encode(plaintext),
    );

    const ivB64 = bufferToBase64(iv.buffer as ArrayBuffer);
    const cipherB64 = bufferToBase64(cipherBuffer);
    return `${ivB64}.${cipherB64}`;
  } catch (err) {
    console.warn('[crypto] Encryption failed – storing value unencrypted.', err);
    return plaintext;
  }
}

/**
 * Decrypts a ciphertext string previously produced by `encryptValue`.
 * Accepts both encrypted (`<iv>.<cipher>`) and legacy plain-text values so
 * that existing stored keys continue to work after the migration.
 *
 * Falls back to returning the ciphertext unchanged if Web Crypto is unavailable
 * or decryption fails (e.g. legacy plain-text value).
 */
export async function decryptValue(ciphertext: string): Promise<string> {
  if (!ciphertext) return ciphertext;
  if (!isCryptoAvailable()) {
    return ciphertext;
  }

  // If the value doesn't look like our encrypted format, treat it as plain text
  // (backward-compatibility for keys stored before encryption was introduced).
  const dotIndex = ciphertext.indexOf('.');
  if (dotIndex === -1) {
    return ciphertext;
  }

  try {
    const ivB64 = ciphertext.slice(0, dotIndex);
    const cipherB64 = ciphertext.slice(dotIndex + 1);

    const iv = base64ToBuffer(ivB64);
    const cipherBuffer = base64ToBuffer(cipherB64);

    const key = await deriveKey();
    const plainBuffer = await globalThis.crypto.subtle.decrypt(
      { name: ALGORITHM, iv: iv as unknown as ArrayBuffer },
      key,
      cipherBuffer.buffer as ArrayBuffer,
    );

    return new TextDecoder().decode(plainBuffer);
  } catch {
    // Decryption failed – value is likely a legacy plain-text key.
    return ciphertext;
  }
}
