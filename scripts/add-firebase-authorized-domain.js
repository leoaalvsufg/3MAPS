#!/usr/bin/env node
/**
 * Adiciona domínio autorizado ao Firebase Auth via Identity Toolkit API.
 * Usa firebase-service-account.json para autenticação.
 *
 * Uso: node scripts/add-firebase-authorized-domain.js [dominio]
 * Exemplo: node scripts/add-firebase-authorized-domain.js 3maps.profleonardoalves.com
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PROJECT_ID = 'maps-dc9df';
const DOMAIN = process.argv[2] || '3maps.profleonardoalves.com';

async function getAccessToken(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iss: serviceAccount.client_email,
    sub: serviceAccount.client_email,
    aud: 'https://oauth2.googleapis.com/token',
    iat: now,
    exp: now + 3600,
    scope: 'https://www.googleapis.com/auth/cloud-platform',
  };
  const sign = (data) =>
    Buffer.from(data)
      .toString('base64url')
      .replace(/=+$/, '');
  const toSign = `${sign(JSON.stringify(header))}.${sign(JSON.stringify(payload))}`;
  const crypto = await import('node:crypto');
  const sig = crypto.createSign('RSA-SHA256').update(toSign).sign(serviceAccount.private_key, 'base64url').replace(/=+$/, '');
  const jwt = `${toSign}.${sig}`;

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });
  if (!res.ok) throw new Error(`Token failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return json.access_token;
}

async function main() {
  const keyPath = path.resolve(__dirname, '..', 'server', 'firebase-service-account.json');
  if (!fs.existsSync(keyPath)) {
    console.error('Arquivo não encontrado:', keyPath);
    process.exit(1);
  }
  const serviceAccount = JSON.parse(fs.readFileSync(keyPath, 'utf8'));

  const token = await getAccessToken(serviceAccount);
  const base = `https://identitytoolkit.googleapis.com/admin/v2/projects/${PROJECT_ID}/config`;
  const headers = { Authorization: `Bearer ${token}` };

  const getRes = await fetch(base, { headers });
  if (!getRes.ok) {
    const txt = await getRes.text();
    if (getRes.status === 403) {
      console.error('Sem permissão. A service account precisa da role "Firebase Authentication Admin" no GCP.');
    }
    throw new Error(`GET config failed: ${getRes.status} ${txt}`);
  }
  const config = await getRes.json();
  const domains = config.authorizedDomains || [];

  if (domains.includes(DOMAIN)) {
    console.log(`Domínio "${DOMAIN}" já está autorizado.`);
    return;
  }

  domains.push(DOMAIN);
  const patchRes = await fetch(`${base}?updateMask=authorizedDomains`, {
    method: 'PATCH',
    headers: { ...headers, 'Content-Type': 'application/json' },
    body: JSON.stringify({ authorizedDomains: domains }),
  });

  if (!patchRes.ok) {
    const txt = await patchRes.text();
    if (patchRes.status === 403) {
      console.error('Sem permissão. Adicione a role "Firebase Authentication Admin" à service account no GCP Console.');
    }
    throw new Error(`PATCH config failed: ${patchRes.status} ${txt}`);
  }

  console.log(`Domínio "${DOMAIN}" adicionado com sucesso aos domínios autorizados do Firebase.`);
}

main().catch((err) => {
  console.error(err.message);
  process.exit(1);
});
