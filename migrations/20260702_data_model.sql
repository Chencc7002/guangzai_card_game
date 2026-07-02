use guangzai_card_game;

create table if not exists cards (
  id varchar(32) primary key,
  name varchar(64) not null,
  game varchar(64) not null,
  ip varchar(64) not null,
  theme varchar(64) not null,
  series varchar(64) not null,
  rarity varchar(32) not null,
  rarity_name varchar(32) not null,
  score int not null default 0,
  fragment int not null default 0,
  price int not null default 0,
  quote varchar(255) not null,
  is_placeholder tinyint(1) not null default 0,
  sort_order int not null default 0,
  created_at datetime(3) not null default current_timestamp(3),
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  index idx_cards_game (game),
  index idx_cards_series (series),
  index idx_cards_rarity (rarity),
  index idx_cards_sort_order (sort_order)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists player_cards (
  player_id varchar(64) not null,
  nickname varchar(64) not null,
  card_id varchar(32) not null,
  card_name varchar(64) not null,
  game varchar(64) not null,
  series varchar(64) not null,
  rarity varchar(32) not null,
  rarity_name varchar(32) not null,
  count int not null default 1,
  first_obtained_at datetime(3) not null default current_timestamp(3),
  last_obtained_at datetime(3) not null default current_timestamp(3),
  source varchar(32) not null,
  primary key (player_id, card_id),
  index idx_player_cards_player_id (player_id),
  index idx_player_cards_card_id (card_id),
  index idx_player_cards_game (game),
  index idx_player_cards_rarity (rarity),
  constraint fk_player_cards_player foreign key (player_id) references players(id) on delete cascade,
  constraint fk_player_cards_card foreign key (card_id) references cards(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists score_events (
  id varchar(64) primary key,
  player_id varchar(64) not null,
  nickname varchar(64) not null,
  type varchar(64) not null,
  source_id varchar(64),
  card_id varchar(32),
  delta int not null,
  score_after int not null,
  reason varchar(128) not null,
  payload json not null,
  created_at datetime(3) not null default current_timestamp(3),
  index idx_score_events_player_id (player_id),
  index idx_score_events_type (type),
  index idx_score_events_source_id (source_id),
  index idx_score_events_created_at (created_at desc),
  constraint fk_score_events_player foreign key (player_id) references players(id) on delete cascade,
  constraint fk_score_events_card foreign key (card_id) references cards(id) on delete set null
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
