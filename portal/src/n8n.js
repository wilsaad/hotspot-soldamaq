import axios from 'axios';
import { config } from './config.js';
import { logger } from './logger.js';

function headers() {
  return config.n8nSharedSecret
    ? { 'x-hotspot-secret': config.n8nSharedSecret }
    : {};
}

export async function sendOtpWebhook(payload) {
  if (!config.n8nSendOtpUrl) {
    logger.warn('N8N_WEBHOOK_SEND_OTP_URL not configured; OTP was not sent');
    return { skipped: true };
  }

  const response = await axios.post(config.n8nSendOtpUrl, payload, {
    headers: headers(),
    timeout: 10000
  });
  return response.data;
}

export async function sendPostLoginWebhook(payload) {
  if (!config.postLoginMessageEnabled || !config.n8nPostLoginUrl) return { skipped: true };

  try {
    const response = await axios.post(config.n8nPostLoginUrl, payload, {
      headers: headers(),
      timeout: 10000
    });
    return response.data;
  } catch (error) {
    logger.warn({ err: error.message }, 'post-login webhook failed');
    return { failed: true };
  }
}
