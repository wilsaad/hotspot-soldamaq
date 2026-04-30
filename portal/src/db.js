import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  max: 10
});

export async function findStore({ site, ap }) {
  const bySite = await pool.query(
    `select * from stores
     where unifi_site = $1 or $2 = any(coalesce(ap_aliases, '{}'))
     order by case when unifi_site = $1 then 0 else 1 end
     limit 1`,
    [site || config.unifi.defaultSite, ap || '']
  );
  if (bySite.rows[0]) return bySite.rows[0];

  const fallback = await pool.query('select * from stores where id = $1 limit 1', [config.defaultStoreId]);
  return fallback.rows[0] || null;
}

export async function createWifiSession({ storeId, mac, ap, ssid, site }) {
  const result = await pool.query(
    `insert into wifi_sessions (store_id, mac, ap, ssid, unifi_site)
     values ($1, $2, $3, $4, $5)
     returning *`,
    [storeId, mac, ap, ssid, site]
  );
  return result.rows[0];
}

export async function updateRegistration({ sessionId, nome, telefone, lgpdAccepted }) {
  const result = await pool.query(
    `update wifi_sessions
     set nome = $2, telefone = $3, lgpd_accepted = $4, updated_at = now()
     where id = $1
     returning *`,
    [sessionId, nome, telefone, lgpdAccepted]
  );
  return result.rows[0];
}

export async function markOtpValidated({ sessionId, telefone, codigo }) {
  await pool.query(
    `update otp_codes
     set validado = true, validated_at = now()
     where telefone = $1 and codigo = $2 and validado = false`,
    [telefone, codigo]
  );
  const result = await pool.query(
    `update wifi_sessions
     set otp_validado = true, updated_at = now()
     where id = $1
     returning *`,
    [sessionId]
  );
  return result.rows[0];
}

export async function markAuthorized({ sessionId }) {
  const result = await pool.query(
    `update wifi_sessions
     set autorizado = true, authorized_at = now(), updated_at = now()
     where id = $1
     returning *`,
    [sessionId]
  );
  return result.rows[0];
}

export async function saveOtp({ telefone, codigo, expiresAt, sessionId }) {
  const result = await pool.query(
    `insert into otp_codes (telefone, codigo, expiracao, wifi_session_id)
     values ($1, $2, $3, $4)
     returning *`,
    [telefone, codigo, expiresAt, sessionId]
  );
  return result.rows[0];
}

export async function audit({ event, sessionId, telefone, mac, payload = {} }) {
  await pool.query(
    `insert into audit_logs (event, wifi_session_id, telefone, mac, payload)
     values ($1, $2, $3, $4, $5)`,
    [event, sessionId || null, telefone || null, mac || null, payload]
  );
}
