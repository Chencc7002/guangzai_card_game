create database if not exists guangzai_card_game
  default character set utf8mb4
  collate utf8mb4_unicode_ci;

use guangzai_card_game;

create table if not exists players (
  id varchar(64) primary key,
  nickname varchar(64) not null unique,
  password_hash varchar(128) not null,
  score int not null default 0,
  fragments int not null default 0,
  heat int not null default 0,
  reputation int not null default 0,
  draw_chances int not null default 3,
  last_recovered_at datetime(3) not null default current_timestamp(3),
  opened_packs int not null default 0,
  owned_cards json not null,
  share_rewards json not null,
  task_rewards json not null,
  series_rewards json not null,
  milestone_rewards json not null,
  challenge_state json not null,
  effect_state json not null,
  created_at datetime(3) not null default current_timestamp(3),
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  index idx_players_score (score desc),
  index idx_players_nickname (nickname)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

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
  image varchar(255) not null default '',
  is_placeholder tinyint(1) not null default 0,
  sort_order int not null default 0,
  created_at datetime(3) not null default current_timestamp(3),
  updated_at datetime(3) not null default current_timestamp(3) on update current_timestamp(3),
  index idx_cards_game (game),
  index idx_cards_series (series),
  index idx_cards_rarity (rarity),
  index idx_cards_sort_order (sort_order)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists shares (
  id varchar(64) primary key,
  player_id varchar(64) not null,
  nickname varchar(64) not null,
  scene varchar(64) not null,
  visits int not null default 0,
  rewarded tinyint(1) not null default 0,
  created_at datetime(3) not null default current_timestamp(3),
  index idx_shares_player_id (player_id),
  constraint fk_shares_player foreign key (player_id) references players(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists share_claims (
  id varchar(64) primary key,
  share_id varchar(64) not null,
  owner_id varchar(64) not null,
  visitor_id varchar(64) not null,
  scene varchar(64) not null,
  claim_date date not null,
  owner_reward json not null,
  visitor_reward json not null,
  created_at datetime(3) not null default current_timestamp(3),
  unique key uk_share_claims_daily (share_id, visitor_id, claim_date),
  index idx_share_claims_owner_id (owner_id),
  index idx_share_claims_visitor_id (visitor_id),
  index idx_share_claims_claim_date (claim_date),
  constraint fk_share_claims_share foreign key (share_id) references shares(id) on delete cascade,
  constraint fk_share_claims_owner foreign key (owner_id) references players(id) on delete cascade,
  constraint fk_share_claims_visitor foreign key (visitor_id) references players(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists sessions (
  token varchar(96) primary key,
  player_id varchar(64) not null,
  created_at datetime(3) not null default current_timestamp(3),
  expires_at datetime(3) not null,
  index idx_sessions_player_id (player_id),
  index idx_sessions_expires_at (expires_at),
  constraint fk_sessions_player foreign key (player_id) references players(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists draw_records (
  id varchar(64) primary key,
  player_id varchar(64) not null,
  nickname varchar(64) not null,
  card_id varchar(32) not null,
  card_name varchar(64) not null,
  series varchar(64) not null,
  rarity varchar(32) not null,
  rarity_name varchar(32) not null,
  duplicated tinyint(1) not null default 0,
  score_gained int not null default 0,
  fragments_gained int not null default 0,
  created_at datetime(3) not null default current_timestamp(3),
  index idx_draw_records_player_id (player_id),
  index idx_draw_records_created_at (created_at desc),
  constraint fk_draw_records_player foreign key (player_id) references players(id) on delete cascade
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

create table if not exists pack_records (
  id varchar(64) primary key,
  player_id varchar(64) not null,
  nickname varchar(64) not null,
  status varchar(24) not null default 'pending',
  draw_chance_cost int not null default 1,
  selected_count int not null default 0,
  score_gained int not null default 0,
  fragments_gained int not null default 0,
  draw_chance_reward int not null default 0,
  abandoned_hand_id varchar(64),
  abandoned_card_id varchar(32),
  abandoned_point int,
  twenty_four_success tinyint(1),
  twenty_four_formula varchar(255),
  twenty_four_points json not null,
  created_at datetime(3) not null default current_timestamp(3),
  submitted_at datetime(3),
  index idx_pack_records_player_id (player_id),
  index idx_pack_records_status (status),
  index idx_pack_records_created_at (created_at desc),
  constraint fk_pack_records_player foreign key (player_id) references players(id) on delete cascade
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;

create table if not exists pack_cards (
  id varchar(64) primary key,
  pack_id varchar(64) not null,
  player_id varchar(64) not null,
  slot int not null,
  card_id varchar(32) not null,
  card_name varchar(64) not null,
  series varchar(64) not null,
  rarity varchar(32) not null,
  rarity_name varchar(32) not null,
  point int not null,
  selection_status varchar(24) not null default 'pending',
  duplicated tinyint(1),
  score_gained int not null default 0,
  fragments_gained int not null default 0,
  created_at datetime(3) not null default current_timestamp(3),
  settled_at datetime(3),
  index idx_pack_cards_pack_id (pack_id),
  index idx_pack_cards_player_id (player_id),
  index idx_pack_cards_card_id (card_id),
  constraint fk_pack_cards_pack foreign key (pack_id) references pack_records(id) on delete cascade,
  constraint fk_pack_cards_player foreign key (player_id) references players(id) on delete cascade
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

create table if not exists events (
  id varchar(64) primary key,
  type varchar(64) not null,
  player_id varchar(64),
  share_id varchar(64),
  card_id varchar(32),
  scene varchar(64),
  duplicated tinyint(1),
  rewarded tinyint(1),
  payload json not null,
  created_at datetime(3) not null default current_timestamp(3),
  index idx_events_player_id (player_id),
  index idx_events_type (type),
  index idx_events_created_at (created_at desc),
  index idx_events_share_id (share_id)
) engine=InnoDB default charset=utf8mb4 collate=utf8mb4_unicode_ci;
