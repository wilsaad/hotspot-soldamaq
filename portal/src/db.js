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

export async function getAdminDashboard() {
  const [
    summary,
    byStore,
    recentSessions,
    recurrentPhones,
    slowFunnels
  ] = await Promise.all([
    pool.query(`
      select
        count(*)::int as total_sessions,
        count(*) filter (where telefone is not null and telefone <> '')::int as identified_sessions,
        count(distinct nullif(telefone, ''))::int as unique_phones,
        count(distinct mac)::int as unique_devices,
        count(*) filter (where otp_validado)::int as otp_validated,
        count(*) filter (where autorizado)::int as authorized,
        count(*) filter (where created_at >= now() - interval '24 hours')::int as sessions_24h,
        count(*) filter (where created_at >= now() - interval '7 days')::int as sessions_7d
      from wifi_sessions
    `),
    pool.query(`
      select
        coalesce(st.name, 'Sem loja') as store_name,
        count(ws.*)::int as sessions,
        count(distinct nullif(ws.telefone, ''))::int as unique_phones,
        count(*) filter (where ws.otp_validado)::int as otp_validated,
        count(*) filter (where ws.autorizado)::int as authorized,
        max(ws.created_at) as last_seen
      from wifi_sessions ws
      left join stores st on st.id = ws.store_id
      group by coalesce(st.name, 'Sem loja')
      order by sessions desc
      limit 20
    `),
    pool.query(`
      select
        ws.id,
        coalesce(st.name, 'Sem loja') as store_name,
        ws.nome,
        ws.telefone,
        ws.mac,
        ws.ap,
        ws.ssid,
        ws.otp_validado,
        ws.autorizado,
        ws.created_at,
        ws.authorized_at,
        extract(epoch from (ws.authorized_at - ws.created_at))::int as seconds_to_authorize
      from wifi_sessions ws
      left join stores st on st.id = ws.store_id
      order by ws.created_at desc
      limit 80
    `),
    pool.query(`
      with ordered as (
        select
          ws.*,
          lag(ws.created_at) over (partition by ws.telefone order by ws.created_at) as previous_seen
        from wifi_sessions ws
        where ws.telefone is not null and ws.telefone <> ''
      )
      select
        telefone,
        max(nome) filter (where nome is not null and nome <> '') as nome,
        count(*)::int as visits,
        count(distinct store_id)::int as stores_visited,
        min(created_at) as first_seen,
        max(created_at) as last_seen,
        round(avg(extract(epoch from (created_at - previous_seen))) filter (where previous_seen is not null) / 60)::int as avg_minutes_between_visits
      from ordered
      group by telefone
      order by visits desc, last_seen desc
      limit 50
    `),
    pool.query(`
      select
        ws.id,
        coalesce(st.name, 'Sem loja') as store_name,
        ws.nome,
        ws.telefone,
        ws.mac,
        ws.created_at,
        ws.authorized_at,
        extract(epoch from (ws.authorized_at - ws.created_at))::int as seconds_to_authorize
      from wifi_sessions ws
      left join stores st on st.id = ws.store_id
      where ws.authorized_at is not null
      order by ws.authorized_at - ws.created_at desc
      limit 20
    `)
  ]);

  return {
    summary: summary.rows[0],
    byStore: byStore.rows,
    recentSessions: recentSessions.rows,
    recurrentPhones: recurrentPhones.rows,
    slowFunnels: slowFunnels.rows
  };
}

export async function getAdminPhoneDetails(telefone) {
  const [profile, sessions] = await Promise.all([
    pool.query(`
      with ordered as (
        select
          ws.*,
          lag(ws.created_at) over (partition by ws.telefone order by ws.created_at) as previous_seen
        from wifi_sessions ws
        where ws.telefone = $1
      )
      select
        telefone,
        max(nome) filter (where nome is not null and nome <> '') as nome,
        count(*)::int as visits,
        count(distinct mac)::int as devices,
        count(distinct store_id)::int as stores_visited,
        min(created_at) as first_seen,
        max(created_at) as last_seen,
        round(avg(extract(epoch from (created_at - previous_seen))) filter (where previous_seen is not null) / 60)::int as avg_minutes_between_visits
      from ordered
      group by telefone
    `, [telefone]),
    pool.query(`
      select
        ws.id,
        coalesce(st.name, 'Sem loja') as store_name,
        ws.nome,
        ws.telefone,
        ws.mac,
        ws.ap,
        ws.ssid,
        ws.otp_validado,
        ws.autorizado,
        ws.created_at,
        ws.authorized_at,
        extract(epoch from (ws.created_at - lag(ws.created_at) over (partition by ws.telefone order by ws.created_at)))::int as seconds_since_previous,
        extract(epoch from (ws.authorized_at - ws.created_at))::int as seconds_to_authorize
      from wifi_sessions ws
      left join stores st on st.id = ws.store_id
      where ws.telefone = $1
      order by ws.created_at desc
      limit 200
    `, [telefone])
  ]);

  return {
    profile: profile.rows[0] || null,
    sessions: sessions.rows
  };
}
