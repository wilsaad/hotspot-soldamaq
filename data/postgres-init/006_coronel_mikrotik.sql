update stores
set
  unifi_site = 'vx909env',
  auth_backend = 'mikrotik',
  auto_authorize_on_entry = true,
  entry_guest_minutes = 7
where code = 'CEL'
   or lower(name) like '%coronel%';
