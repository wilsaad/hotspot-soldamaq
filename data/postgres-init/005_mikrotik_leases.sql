create table if not exists mikrotik_leases (
  id bigserial primary key,
  site text not null,
  mac text not null,
  client_ip text not null,
  ssid text,
  public_ip text,
  status text not null default 'bound',
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_mikrotik_leases_site_mac_ip
  on mikrotik_leases(site, mac, client_ip);

create index if not exists idx_mikrotik_leases_lookup
  on mikrotik_leases(site, public_ip, status, last_seen_at desc);
