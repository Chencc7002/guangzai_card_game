create table if not exists players (
  id text primary key,
  nickname text not null unique,
  password_hash text not null,
  score integer not null default 0,
  fragments integer not null default 0,
  heat integer not null default 0,
  reputation integer not null default 0,
  draw_chances integer not null default 3,
  last_recovered_at timestamptz not null default now(),
  opened_packs integer not null default 0,
  owned_cards jsonb not null default '{}'::jsonb,
  share_rewards jsonb not null default '{}'::jsonb,
  task_rewards jsonb not null default '{}'::jsonb,
  series_rewards jsonb not null default '{}'::jsonb,
  milestone_rewards jsonb not null default '{"score":{},"packs":{}}'::jsonb,
  challenge_state jsonb not null default '{}'::jsonb,
  effect_state jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table players
  add column if not exists last_recovered_at timestamptz not null default now(),
  add column if not exists heat integer not null default 0,
  add column if not exists reputation integer not null default 0,
  add column if not exists milestone_rewards jsonb not null default '{"score":{},"packs":{}}'::jsonb,
  add column if not exists challenge_state jsonb not null default '{}'::jsonb,
  add column if not exists effect_state jsonb not null default '{}'::jsonb;

create table if not exists cards (
  id text primary key,
  name text not null,
  game text not null,
  ip text not null,
  theme text not null,
  series text not null,
  rarity text not null,
  rarity_name text not null,
  score integer not null default 0,
  fragment integer not null default 0,
  price integer not null default 0,
  quote text not null,
  image text not null default '',
  is_placeholder boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table cards
  add column if not exists image text not null default '';

create table if not exists sessions (
  token text primary key,
  player_id text not null references players(id) on delete cascade,
  created_at timestamptz not null default now()
);

create table if not exists shares (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  nickname text not null,
  scene text not null,
  visits integer not null default 0,
  rewarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists share_claims (
  id text primary key,
  share_id text not null references shares(id) on delete cascade,
  owner_id text not null references players(id) on delete cascade,
  visitor_id text not null references players(id) on delete cascade,
  scene text not null,
  claim_date date not null,
  owner_reward jsonb not null default '{}'::jsonb,
  visitor_reward jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (share_id, visitor_id, claim_date)
);

create table if not exists draw_records (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  nickname text not null,
  card_id text not null,
  card_name text not null,
  series text not null,
  rarity text not null,
  rarity_name text not null,
  duplicated boolean not null default false,
  score_gained integer not null default 0,
  fragments_gained integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists player_cards (
  player_id text not null references players(id) on delete cascade,
  nickname text not null,
  card_id text not null references cards(id) on delete cascade,
  card_name text not null,
  game text not null,
  series text not null,
  rarity text not null,
  rarity_name text not null,
  count integer not null default 1,
  first_obtained_at timestamptz not null default now(),
  last_obtained_at timestamptz not null default now(),
  source text not null,
  primary key (player_id, card_id)
);

create table if not exists pack_records (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  nickname text not null,
  status text not null default 'pending',
  draw_chance_cost integer not null default 1,
  selected_count integer not null default 0,
  score_gained integer not null default 0,
  fragments_gained integer not null default 0,
  draw_chance_reward integer not null default 0,
  abandoned_hand_id text,
  abandoned_card_id text,
  abandoned_point integer,
  twenty_four_success boolean,
  twenty_four_formula text,
  twenty_four_points jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  submitted_at timestamptz
);

create table if not exists pack_cards (
  id text primary key,
  pack_id text not null references pack_records(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  slot integer not null,
  card_id text not null,
  card_name text not null,
  series text not null,
  rarity text not null,
  rarity_name text not null,
  point integer not null,
  selection_status text not null default 'pending',
  duplicated boolean,
  score_gained integer not null default 0,
  fragments_gained integer not null default 0,
  created_at timestamptz not null default now(),
  settled_at timestamptz
);

create table if not exists score_events (
  id text primary key,
  player_id text not null references players(id) on delete cascade,
  nickname text not null,
  type text not null,
  source_id text,
  card_id text references cards(id) on delete set null,
  delta integer not null,
  score_after integer not null,
  reason text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists events (
  id text primary key,
  type text not null,
  player_id text references players(id) on delete set null,
  share_id text,
  card_id text,
  scene text,
  duplicated boolean,
  rewarded boolean,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_players_score on players(score desc);
create index if not exists idx_cards_game on cards(game);
create index if not exists idx_cards_series on cards(series);
create index if not exists idx_cards_rarity on cards(rarity);
create index if not exists idx_cards_sort_order on cards(sort_order);
create index if not exists idx_draw_records_player_id on draw_records(player_id);
create index if not exists idx_draw_records_created_at on draw_records(created_at desc);
create index if not exists idx_player_cards_player_id on player_cards(player_id);
create index if not exists idx_player_cards_card_id on player_cards(card_id);
create index if not exists idx_player_cards_game on player_cards(game);
create index if not exists idx_player_cards_rarity on player_cards(rarity);
create index if not exists idx_pack_records_player_id on pack_records(player_id);
create index if not exists idx_pack_records_status on pack_records(status);
create index if not exists idx_pack_records_created_at on pack_records(created_at desc);
create index if not exists idx_pack_cards_pack_id on pack_cards(pack_id);
create index if not exists idx_pack_cards_player_id on pack_cards(player_id);
create index if not exists idx_pack_cards_card_id on pack_cards(card_id);
create index if not exists idx_score_events_player_id on score_events(player_id);
create index if not exists idx_score_events_type on score_events(type);
create index if not exists idx_score_events_source_id on score_events(source_id);
create index if not exists idx_score_events_created_at on score_events(created_at desc);
create index if not exists idx_events_type on events(type);
create index if not exists idx_events_created_at on events(created_at desc);
create index if not exists idx_shares_player_id on shares(player_id);
create index if not exists idx_share_claims_owner_id on share_claims(owner_id);
create index if not exists idx_share_claims_visitor_id on share_claims(visitor_id);
create index if not exists idx_share_claims_claim_date on share_claims(claim_date);
