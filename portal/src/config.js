import dotenv from 'dotenv';

dotenv.config();

const int = (name, fallback) => Number.parseInt(process.env[name] || String(fallback), 10);
const bool = (name, fallback = false) => {
  const value = process.env[name];
  if (value === undefined) return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
};

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: int('PORT', 3000),
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-me',
  cookieSecure: bool('COOKIE_SECURE', false),
  databaseUrl: process.env.DATABASE_URL || 'postgresql://hotspot:hotspot@localhost:5432/hotspot',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379/0',
  defaultStoreId: int('DEFAULT_STORE_ID', 1),
  guestMinutes: int('GUEST_MINUTES', 480),
  tempGuestMinutes: int('TEMP_GUEST_MINUTES', 7),
  extendedGuestMinutes: int('EXTENDED_GUEST_MINUTES', 120),
  validationLinkTtlSeconds: int('VALIDATION_LINK_TTL_SECONDS', 1800),
  otpTtlSeconds: int('OTP_TTL_SECONDS', 300),
  otpResendSeconds: int('OTP_RESEND_SECONDS', 60),
  otpMaxAttempts: int('OTP_MAX_ATTEMPTS', 5),
  otpRateLimitWindowSeconds: int('OTP_RATE_LIMIT_WINDOW_SECONDS', 900),
  otpRateLimitMax: int('OTP_RATE_LIMIT_MAX', 5),
  n8nSendOtpUrl: process.env.N8N_WEBHOOK_SEND_OTP_URL || '',
  n8nPostLoginUrl: process.env.N8N_WEBHOOK_POST_LOGIN_URL || '',
  n8nSharedSecret: process.env.N8N_SHARED_SECRET || '',
  postLoginMessageEnabled: bool('POST_LOGIN_MESSAGE_ENABLED', true),
  admin: {
    username: process.env.ADMIN_USERNAME || '',
    password: process.env.ADMIN_PASSWORD || ''
  },
  unifi: {
    baseUrl: process.env.UNIFI_BASE_URL || '',
    username: process.env.UNIFI_USERNAME || '',
    password: process.env.UNIFI_PASSWORD || '',
    defaultSite: process.env.UNIFI_DEFAULT_SITE || 'default',
    verifyTls: bool('UNIFI_VERIFY_TLS', true),
    apiMode: process.env.UNIFI_API_MODE || 'auto'
  }
};
