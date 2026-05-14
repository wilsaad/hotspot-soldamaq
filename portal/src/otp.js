import { config } from './config.js';
import { redis } from './redis.js';
import { saveOtp } from './db.js';
import crypto from 'node:crypto';

export function generateValidationToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export async function createValidationLinkToken({ telefone, sessionId }) {
  await enforceSendRate({ telefone, prefix: 'validation' });
  const token = generateValidationToken();
  const expiresAt = new Date(Date.now() + config.validationLinkTtlSeconds * 1000);
  await saveOtp({ telefone, codigo: token, expiresAt, sessionId });
  return { token, expiresAt };
}

async function enforceSendRate({ telefone, prefix }) {
  const resendKey = `otp:resend:${telefone}`;
  const rateKey = `${prefix}:rate:${telefone}`;
  const activeResend = await redis.ttl(resendKey);
  if (activeResend > 0) {
    const error = new Error(`Aguarde ${activeResend}s para reenviar a validacao.`);
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

  await redis.set(resendKey, '1', 'EX', config.otpResendSeconds);
}
