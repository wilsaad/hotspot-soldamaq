alter table stores
  add column if not exists code text,
  add column if not exists address text,
  add column if not exists city text,
  add column if not exists state text default 'MS',
  add column if not exists phone text,
  add column if not exists manager text;

create unique index if not exists idx_stores_code_unique on stores(code) where code is not null;

insert into stores (id, code, name, unifi_site, address, city, state, phone, manager, google_review_url, ap_aliases)
values
  (1, '13MAIO', 'Soldamaq - Matriz 13 de Maio', 'btmae4e2', 'Rua 13 de Maio, 568 - Centro', 'Campo Grande', 'MS', '(67) 3345-8585', 'Marcelo Cruz', 'https://www.google.com/search?q=Soldamaq+Matriz+13+de+Maio+Campo+Grande+MS+Comentarios', '{}'),
  (2, 'EULER', 'Soldamaq - Euler de Azevedo', 'soldamaq-euler', 'Av. Euler de Azevedo, 815 - Sao Francisco', 'Campo Grande', 'MS', '(67) 2180-0519', 'Diego', 'https://www.google.com/search?q=Soldamaq+Euler+de+Azevedo+Campo+Grande+MS+Comentarios', '{}'),
  (3, 'GHS', 'Soldamaq - Gunter Hans', 'soldamaq-ghs', 'Av. Gunter Hans, 3762 - Tijuca', 'Campo Grande', 'MS', '(67) 3047-6980', 'Jose Advair', 'https://www.google.com/search?q=Soldamaq+Gunter+Hans+Campo+Grande+MS+Comentarios', '{}'),
  (4, 'CDBR', 'Soldamaq - Zila Correa', 'soldamaq-cdbr', 'Av. Zila Correa Machado, 9082', 'Campo Grande', 'MS', '(67) 3398-1700', 'Felipe Cardoso', 'https://www.google.com/search?q=Soldamaq+Zila+Correa+Campo+Grande+MS+Comentarios', '{}'),
  (5, 'CEL', 'Soldamaq - Coronel Antonino', 'soldamaq-cel', 'Av. Coronel Antonino, 1585', 'Campo Grande', 'MS', '(67) 3357-4400', 'Antonio Avila', 'https://www.google.com/search?q=Soldamaq+Coronel+Antonino+Campo+Grande+MS+Comentarios', '{}'),
  (6, 'JQM', 'Soldamaq - Joaquim Murtinho', 'soldamaq-jqm', 'Rua Joaquim Murtinho, 7041', 'Campo Grande', 'MS', '(67) 3357-4460', 'Janaina', 'https://www.google.com/search?q=Soldamaq+Joaquim+Murtinho+Campo+Grande+MS+Comentarios', '{}'),
  (7, 'CHP', 'Soldamaq - Chapadao do Sul', 'soldamaq-chp', 'Av. Dois, 351', 'Chapadao do Sul', 'MS', '(67) 3562-3233', 'Sandro', 'https://www.google.com/search?q=Soldamaq+Chapadao+do+Sul+MS+Comentarios', '{}'),
  (8, 'CRB', 'Soldamaq - Corumba', 'soldamaq-crb', 'Av. Rio Branco, 355', 'Corumba', 'MS', '(67) 3232-4380', 'Everson', 'https://www.google.com/search?q=Soldamaq+Corumba+MS+Comentarios', '{}'),
  (9, 'DDS-I', 'Soldamaq - Dourados I', 'soldamaq-dds-i', 'Rua Hayel Bon Faker, 705', 'Dourados', 'MS', '(67) 3423-3028', 'Lucas', 'https://www.google.com/search?q=Soldamaq+Hayel+Bon+Faker+Dourados+MS+Comentarios', '{}'),
  (10, 'DDS-II', 'Soldamaq - Dourados II', 'soldamaq-dds-ii', 'Rua Marcelino Pires, 7325', 'Dourados', 'MS', '(67) 3422-1451', 'Oriel', 'https://www.google.com/search?q=Soldamaq+Marcelino+Pires+Dourados+MS+Comentarios', '{}'),
  (11, 'MJU', 'Soldamaq - Maracaju', 'soldamaq-mju', 'Rua Perimetral Norte Wilson Beltramin, 311', 'Maracaju', 'MS', '(67) 3458-5900', 'Moadi', 'https://www.google.com/search?q=Soldamaq+Maracaju+MS+Comentarios', '{}'),
  (12, 'SDL', 'Soldamaq - Sidrolandia', 'soldamaq-sdl', 'Av. Dorvalino dos Santos, 1690', 'Sidrolandia', 'MS', '(67) 3272-9300', 'Izabel', 'https://www.google.com/search?q=Soldamaq+Sidrolandia+MS+Comentarios', '{}'),
  (13, 'SGO', 'Soldamaq - Sao Gabriel do Oeste', 'soldamaq-sgo', 'Av. Juscelino Kubitscheck, 210', 'Sao Gabriel do Oeste', 'MS', '(67) 3295-3344', 'Leandro', 'https://www.google.com/search?q=Soldamaq+Sao+Gabriel+do+Oeste+MS+Comentarios', '{}'),
  (14, 'TRL', 'Soldamaq - Tres Lagoas', 'soldamaq-trl', 'Av. Capitao Olinto Mancini, 2760', 'Tres Lagoas', 'MS', '(67) 3509-4800', 'Lucas Goncalves', 'https://www.google.com/search?q=Soldamaq+Tres+Lagoas+MS+Comentarios', '{}'),
  (15, 'RRP', 'Soldamaq - Ribas do Rio Pardo', 'soldamaq-rrp', 'Av. Aureliano Moura Brandao, 1808', 'Ribas do Rio Pardo', 'MS', '(67) 2076-0950', 'Eduardo', 'https://www.google.com/search?q=Soldamaq+Ribas+do+Rio+Pardo+MS+Comentarios', '{}')
on conflict (id) do update set
  code = excluded.code,
  name = excluded.name,
  unifi_site = excluded.unifi_site,
  address = excluded.address,
  city = excluded.city,
  state = excluded.state,
  phone = excluded.phone,
  manager = excluded.manager,
  google_review_url = excluded.google_review_url,
  ap_aliases = excluded.ap_aliases;

select setval('stores_id_seq', (select max(id) from stores));
