/**
 * server/email.js
 *
 * Email sending utility for password reset and notifications.
 *
 * Configuration via environment variables:
 *   SMTP_HOST     — SMTP server hostname (default: smtp.gmail.com)
 *   SMTP_PORT     — SMTP port (default: 587)
 *   SMTP_SECURE   — Use TLS (default: false for STARTTLS on port 587)
 *   SMTP_USER     — SMTP username / sender email
 *   SMTP_PASS     — SMTP password or app password
 *   SMTP_FROM     — From address (default: SMTP_USER)
 *   APP_URL       — Base URL of the app (default: http://localhost:5173)
 *
 * If SMTP_USER / SMTP_PASS are not set, emails are logged to console only
 * (development mode).
 */

import { createTransport } from 'nodemailer';
import { logger } from './logger.js';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

const SMTP_HOST   = process.env.SMTP_HOST   ?? 'smtp.gmail.com';
const SMTP_PORT   = Number(process.env.SMTP_PORT ?? 587);
const SMTP_SECURE = process.env.SMTP_SECURE === 'true';
const SMTP_USER   = process.env.SMTP_USER   ?? '';
const SMTP_PASS   = process.env.SMTP_PASS   ?? '';
const SMTP_FROM   = process.env.SMTP_FROM   ?? (SMTP_USER || 'noreply@3maps.app');
const APP_URL     = (process.env.APP_URL    ?? 'http://localhost:5173').replace(/\/$/, '');

// ---------------------------------------------------------------------------
// Transporter (lazy singleton)
// ---------------------------------------------------------------------------

let _transporter = null;

function getTransporter() {
  if (_transporter) return _transporter;

  if (!SMTP_USER || !SMTP_PASS) {
    // Development mode — no real transport
    return null;
  }

  _transporter = createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_SECURE,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
    tls: {
      // Allow self-signed certificates (some hosting providers use them)
      rejectUnauthorized: false,
    },
  });

  return _transporter;
}

// ---------------------------------------------------------------------------
// Send email helper
// ---------------------------------------------------------------------------

/**
 * Send an email.
 * In development (no SMTP credentials), logs the email to console.
 *
 * @param {{ to: string, subject: string, html: string, text: string }} options
 * @returns {Promise<boolean>} true if sent (or logged), false on error
 */
export async function sendEmail({ to, subject, html, text }) {
  const transporter = getTransporter();

  if (!transporter) {
    // Development fallback — log to console
    logger.info('[EMAIL DEV] Would send email', { to, subject });
    logger.info('[EMAIL DEV] Text body:\n' + text);
    return true;
  }

  try {
    const info = await transporter.sendMail({
      from: SMTP_FROM,
      to,
      subject,
      text,
      html,
    });
    logger.info('Email sent', { to, subject, messageId: info.messageId });
    return true;
  } catch (err) {
    logger.error('Failed to send email', {
      to,
      subject,
      error: err instanceof Error ? err.message : String(err),
    });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Password reset email
// ---------------------------------------------------------------------------

/**
 * Send a password reset email.
 * @param {{ to: string, username: string, token: string }} options
 * @returns {Promise<boolean>}
 */
export async function sendPasswordResetEmail({ to, username, token }) {
  const resetUrl = `${APP_URL}/auth?action=reset&token=${encodeURIComponent(token)}`;

  const text = `
Olá, ${username}!

Recebemos uma solicitação para redefinir a senha da sua conta no 3Maps.

Clique no link abaixo para criar uma nova senha (válido por 1 hora):

${resetUrl}

Se você não solicitou a redefinição de senha, ignore este e-mail.
Sua senha permanecerá a mesma.

Atenciosamente,
Equipe 3Maps
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Redefinir Senha — 3Maps</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">🧠 3Maps</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Gerador de mapas mentais com IA</p>
            </td>
          </tr>
          <!-- Body -->
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:700;">Redefinir sua senha</h2>
              <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
                Olá, <strong>${username}</strong>!
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Recebemos uma solicitação para redefinir a senha da sua conta.
                Clique no botão abaixo para criar uma nova senha.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${resetUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Redefinir Senha
                </a>
              </div>
              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.6;">
                Este link é válido por <strong>1 hora</strong>.
              </p>
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                Se você não solicitou a redefinição de senha, ignore este e-mail.
                Sua senha permanecerá a mesma.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
              <p style="margin:0;color:#cbd5e1;font-size:12px;text-align:center;">
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${resetUrl}" style="color:#6366f1;word-break:break-all;">${resetUrl}</a>
              </p>
            </td>
          </tr>
          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                3Maps © ${new Date().getFullYear()} — Gerador de mapas mentais com IA
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return sendEmail({ to, subject: '🔐 Redefinir senha — 3Maps', html, text });
}

// ---------------------------------------------------------------------------
// Magic link email (login sem senha)
// ---------------------------------------------------------------------------

/**
 * Send a magic link email for passwordless login.
 * @param {{ to: string, username: string, token: string }} options
 * @returns {Promise<boolean>}
 */
export async function sendMagicLinkEmail({ to, username, token }) {
  const magicUrl = `${APP_URL}/auth?action=magic&token=${encodeURIComponent(token)}`;

  const text = `
Olá, ${username}!

Recebemos uma solicitação para entrar na sua conta no 3Maps sem senha.

Clique no link abaixo para entrar (válido por 15 minutos):

${magicUrl}

Se você não solicitou este acesso, ignore este e-mail.
Ninguém entrará na sua conta sem clicar neste link.

Atenciosamente,
Equipe 3Maps
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Entrar — 3Maps</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;letter-spacing:-0.5px;">🧠 3Maps</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Gerador de mapas mentais com IA</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:700;">Entrar na sua conta</h2>
              <p style="margin:0 0 12px;color:#475569;font-size:15px;line-height:1.6;">
                Olá, <strong>${username}</strong>!
              </p>
              <p style="margin:0 0 24px;color:#475569;font-size:15px;line-height:1.6;">
                Clique no botão abaixo para entrar sem senha.
              </p>
              <div style="text-align:center;margin:32px 0;">
                <a href="${magicUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;letter-spacing:0.2px;">
                  Entrar
                </a>
              </div>
              <p style="margin:0 0 8px;color:#94a3b8;font-size:13px;line-height:1.6;">
                Este link é válido por <strong>15 minutos</strong> e só pode ser usado uma vez.
              </p>
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                Se você não solicitou este acesso, ignore este e-mail.
              </p>
              <hr style="border:none;border-top:1px solid #e2e8f0;margin:32px 0;">
              <p style="margin:0;color:#cbd5e1;font-size:12px;text-align:center;">
                Se o botão não funcionar, copie e cole este link no seu navegador:<br>
                <a href="${magicUrl}" style="color:#6366f1;word-break:break-all;">${magicUrl}</a>
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                3Maps © ${new Date().getFullYear()} — Gerador de mapas mentais com IA
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return sendEmail({ to, subject: '🔗 Entrar no 3Maps sem senha', html, text });
}

// ---------------------------------------------------------------------------
// Welcome email (admin creates user)
// ---------------------------------------------------------------------------

/**
 * Send welcome email when admin creates a new user.
 * @param {{ to: string, username: string, password: string }} options
 * @returns {Promise<boolean>}
 */
export async function sendWelcomeEmail({ to, username, password }) {
  const authUrl = `${APP_URL}/auth`;
  const text = `
Olá!

Sua conta no 3Maps foi criada pelo administrador.

Acesso:
  Usuário: ${username}
  Senha temporária: ${password}

Entrar em: ${authUrl}

Você pode:
- Usar a senha acima para entrar e alterá-la em Meu Perfil
- Criar uma nova senha ao primeiro acesso
- Vincular login com Google (se já tiver conta com este e-mail)

Atenciosamente,
Equipe 3Maps
`.trim();

  const html = `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Bem-vindo ao 3Maps</title>
</head>
<body style="margin:0;padding:0;background:#f8fafc;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border-radius:16px;box-shadow:0 4px 24px rgba(0,0,0,0.08);overflow:hidden;">
          <tr>
            <td style="background:linear-gradient(135deg,#4f46e5,#7c3aed);padding:32px 40px;text-align:center;">
              <h1 style="margin:0;color:#ffffff;font-size:24px;font-weight:800;">🧠 3Maps</h1>
              <p style="margin:8px 0 0;color:rgba(255,255,255,0.8);font-size:14px;">Gerador de mapas mentais com IA</p>
            </td>
          </tr>
          <tr>
            <td style="padding:40px;">
              <h2 style="margin:0 0 16px;color:#1e293b;font-size:20px;font-weight:700;">Sua conta foi criada</h2>
              <p style="margin:0 0 16px;color:#475569;font-size:15px;line-height:1.6;">
                O administrador criou sua conta no 3Maps.
              </p>
              <div style="background:#f1f5f9;border-radius:8px;padding:16px;margin:20px 0;">
                <p style="margin:0 0 4px;color:#64748b;font-size:12px;">Usuário</p>
                <p style="margin:0;font-size:16px;font-weight:600;font-family:monospace;">${username}</p>
                <p style="margin:12px 0 4px;color:#64748b;font-size:12px;">Senha temporária</p>
                <p style="margin:0;font-size:16px;font-weight:600;font-family:monospace;">${password}</p>
              </div>
              <div style="text-align:center;margin:24px 0;">
                <a href="${authUrl}"
                   style="display:inline-block;background:linear-gradient(135deg,#4f46e5,#7c3aed);color:#ffffff;text-decoration:none;padding:14px 32px;border-radius:10px;font-size:15px;font-weight:600;">
                  Entrar no 3Maps
                </a>
              </div>
              <p style="margin:0;color:#94a3b8;font-size:13px;line-height:1.6;">
                Você pode usar a senha acima ou alterá-la em <strong>Meu Perfil</strong> após o login.
                Também pode vincular sua conta ao <strong>Google</strong> se usar este e-mail.
              </p>
            </td>
          </tr>
          <tr>
            <td style="background:#f8fafc;padding:20px 40px;text-align:center;border-top:1px solid #e2e8f0;">
              <p style="margin:0;color:#94a3b8;font-size:12px;">
                3Maps © ${new Date().getFullYear()}
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
`.trim();

  return sendEmail({ to, subject: '🔑 Sua conta 3Maps foi criada', html, text });
}
