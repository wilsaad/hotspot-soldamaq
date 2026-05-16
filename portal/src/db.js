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

export async function createWifiSession({ storeId, mac, ap, ssid, site, hotspotLoginUrl, hotspotOrigUrl, clientIp }) {
  const result = await pool.query(
    `insert into wifi_sessions (store_id, mac, ap, ssid, unifi_site, hotspot_login_url, hotspot_orig_url, client_ip)
     values ($1, $2, $3, $4, $5, $6, $7, $8)
     returning *`,
    [storeId, mac, ap, ssid, site, hotspotLoginUrl, hotspotOrigUrl, clientIp]
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

export async function findValidationToken(token) {
  const result = await pool.query(
    `select
       oc.*,
       ws.mac,
       ws.ap,
       ws.ssid,
       ws.unifi_site,
       ws.hotspot_login_url,
       ws.hotspot_orig_url,
       ws.client_ip,
       ws.nome,
       ws.store_id,
       st.name as store_name,
       st.google_place_id,
       st.google_review_url,
       st.auth_backend
     from otp_codes oc
     join wifi_sessions ws on ws.id = oc.wifi_session_id
     left join stores st on st.id = ws.store_id
     where oc.codigo = $1
       and oc.validado = false
       and oc.expiracao > now()
     order by oc.created_at desc
     limit 1`,
    [token]
  );
  return result.rows[0] || null;
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

export async function getAdminStores() {
  const result = await pool.query(`
    select
      st.id,
      st.code,
      st.name,
      st.unifi_site,
      st.address,
      st.city,
      st.state,
      st.phone,
      st.manager,
      st.google_place_id,
      st.google_review_url,
      st.auth_backend,
      st.auto_authorize_on_entry,
      st.entry_guest_minutes,
      coalesce(array_length(st.ap_aliases, 1), 0)::int as ap_alias_count,
      count(ws.*)::int as sessions,
      count(distinct nullif(ws.telefone, ''))::int as unique_phones,
      max(ws.created_at) as last_seen
    from stores st
    left join wifi_sessions ws on ws.store_id = st.id
    group by st.id
    order by st.id
  `);
  return result.rows;
}

export async function getAdminStore(id) {
  const result = await pool.query('select * from stores where id = $1 limit 1', [id]);
  return result.rows[0] || null;
}

export async function createAdminStore(store) {
  const values = normalizeStoreValues(store);
  const result = await pool.query(
    `insert into stores (
      code, name, unifi_site, address, city, state, phone, manager,
      google_place_id, google_review_url, ap_aliases, auto_authorize_on_entry, entry_guest_minutes, auth_backend
    )
    values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
    returning *`,
    values
  );
  return result.rows[0];
}

export async function updateAdminStore(id, store) {
  const values = normalizeStoreValues(store);
  const result = await pool.query(
    `update stores
     set
      code = $2,
      name = $3,
      unifi_site = $4,
      address = $5,
      city = $6,
      state = $7,
      phone = $8,
      manager = $9,
      google_place_id = $10,
      google_review_url = $11,
      ap_aliases = $12,
      auto_authorize_on_entry = $13,
      entry_guest_minutes = $14,
      auth_backend = $15
     where id = $1
     returning *`,
    [id, ...values]
  );
  return result.rows[0] || null;
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

function normalizeStoreValues(store) {
  const apAliases = String(store.ap_aliases || '')
    .split(/[\n,]/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return [
    cleanOptional(store.code)?.toUpperCase() || null,
    cleanRequired(store.name, 'Nome da loja'),
    cleanRequired(store.unifi_site, 'Site UniFi').toLowerCase(),
    cleanOptional(store.address),
    cleanOptional(store.city),
    cleanOptional(store.state)?.toUpperCase() || 'MS',
    cleanOptional(store.phone),
    cleanOptional(store.manager),
    cleanOptional(store.google_place_id),
    cleanOptional(store.google_review_url),
    apAliases,
    store.auto_authorize_on_entry === 'on' || store.auto_authorize_on_entry === true,
    parsePositiveInt(store.entry_guest_minutes, 7),
    ['unifi', 'mikrotik'].includes(store.auth_backend) ? store.auth_backend : 'unifi'
  ];
}

function cleanRequired(value, label) {
  const text = cleanOptional(value);
  if (!text) {
    const error = new Error(`${label} e obrigatorio.`);
    error.status = 400;
    throw error;
  }
  return text;
}

function cleanOptional(value) {
  const text = String(value || '').trim().replace(/\s+/g, ' ');
  return text || null;
}

function parsePositiveInt(value, fallback) {
  const parsed = Number.parseInt(String(value || ''), 10);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}
