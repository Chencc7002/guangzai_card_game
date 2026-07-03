use guangzai_card_game;

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
