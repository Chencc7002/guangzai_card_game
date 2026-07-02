use guangzai_card_game;

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
