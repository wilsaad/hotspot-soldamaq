alter table stores
  add column if not exists auth_backend text not null default 'unifi';

alter table wifi_sessions
  add column if not exists hotspot_login_url text,
  add column if not exists hotspot_orig_url text,
  add column if not exists client_ip text;
