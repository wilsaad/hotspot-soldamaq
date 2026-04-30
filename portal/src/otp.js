import crypto from 'node:crypto';
import { config } from './config.js';
import { redis } from './redis.js';
import { saveOtp } from './db.js';

export function generateOtp() {
  return String(crypto.randomInt(0, 1000000)).padStart(6, '0');
}

export async function createOtp({ telefone, sessionId }) {
  const resendKey = `otp:resend:${telefone}`;
  const rateKey = `otp:rate:${telefone}`;
  const activeResend = await redis.ttl(resendKey);
  if (activeResend > 0) {
    const error = new Error(`Aguarde ${activeResend}s para reenviar o codigo.`);
    error.status = 429;
    throw error;
  }

  const sentCount = await redis.incr(rateKey);
  if (sentCount === 1) await redis.expire(rateKey, config.otpRateLimitWindowSeconds);
  if (sentCount > config.otpRateLimitMax) {
    const error = new Error('Limite de envios atingido. Tente novamente mais tarde.');
    error.status = 429;
    throw error;
  }

  const codigo = generateOtp();
  const expiresAt = new Date(Date.now() + config.otpTtlSeconds * 1000);
  const key = `otp:${telefone}`;
  await redis.set(
    key,
    JSON.stringify({ codigo, sessionId, attempts: 0 }),
    'EX',
    config.otpTtlSeconds
  );
  await redis.set(resendKey, '1', 'EX', config.otpResendSeconds);
  await saveOtp({ telefone, codigo, expiresAt, sessionId });
  return { codigo, expiresAt };
}

export async function validateOtp({ telefone, sessionId, codigo }) {
  const key = `otp:${telefone}`;
  const raw = await redis.get(key);
  if (!raw) return { ok: false, reason: 'Codigo expirado. Solicite um novo.' };

  const data = JSON.parse(raw);
  if (data.sessionId !== sessionId) return { ok: false, reason: 'Sessao invalida.' };
  if (data.attempts >= config.otpMaxAttempts) return { ok: false, reason: 'Muitas tentativas. Solicite um novo codigo.' };

  if (data.codigo !== String(codigo || '').trim()) {
    data.attempts += 1;
    await redis.set(key, JSON.stringify(data), 'KEEPTTL');
    return { ok: false, reason: 'Codigo incorreto.' };
  }

  await redis.del(key);
  return { ok: true };
}
