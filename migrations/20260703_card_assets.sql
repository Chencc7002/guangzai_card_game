use guangzai_card_game;

set @card_image_column_exists := (
  select count(*)
  from information_schema.columns
  where table_schema = database()
    and table_name = 'cards'
    and column_name = 'image'
);

set @card_image_migration_sql := if(
  @card_image_column_exists = 0,
  'alter table cards add column image varchar(255) not null default '''' after quote',
  'select 1'
);

prepare card_image_migration_stmt from @card_image_migration_sql;
execute card_image_migration_stmt;
deallocate prepare card_image_migration_stmt;
