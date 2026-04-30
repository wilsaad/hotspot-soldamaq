create extension if not exists pgcrypto;

create table if not exists stores (
  id bigserial primary key,
  name text not null,
  unifi_site text not null unique,
  google_place_id text,
  ap_aliases text[] default '{}',
  created_at timestamptz not null default now()
);

create table if not exists wifi_sessions (
  id uuid primary key default gen_random_uuid(),
  store_id bigint references stores(id),
  mac text not null,
  ap text,
  ssid text,
  unifi_site text,
  nome text,
  telefone text,
  lgpd_accepted boolean not null default false,
  otp_validado boolean not null default false,
  autorizado boolean not null default false,
  authorized_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists otp_codes (
  id bigserial primary key,
  wifi_session_id uuid references wifi_sessions(id) on delete set null,
  telefone text not null,
  codigo text not null,
  expiracao timestamptz not null,
  validado boolean not null default false,
  validated_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists audit_logs (
  id bigserial primary key,
  event text not null,
  wifi_session_id uuid references wifi_sessions(id) on delete set null,
  telefone text,
  mac text,
  payload jsonb not null default '{}',
  created_at timestamptz not null default now()
);

create index if not exists idx_wifi_sessions_mac_created_at on wifi_sessions(mac, created_at desc);
create index if not exists idx_wifi_sessions_telefone_created_at on wifi_sessions(telefone, created_at desc);
create index if not exists idx_otp_codes_telefone_created_at on otp_codes(telefone, created_at desc);
create index if not exists idx_audit_logs_created_at on audit_logs(created_at desc);

insert into stores (id, name, unifi_site, google_place_id, ap_aliases)
values
  (1, 'Loja 01', 'default', null, '{}')
on conflict (id) do nothing;
