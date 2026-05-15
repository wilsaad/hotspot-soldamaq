alter table stores
  add column if not exists auto_authorize_on_entry boolean not null default false,
  add column if not exists entry_guest_minutes integer not null default 7;

update stores
set
  auto_authorize_on_entry = true,
  entry_guest_minutes = 7
where code = '13MAIO';
