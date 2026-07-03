create database if not exists guangzai_card_game
  default character set utf8mb4
  collate utf8mb4_unicode_ci;

create user if not exists 'guangzai'@'localhost'
  identified by 'CHANGE_ME_STRONG_PASSWORD';

grant all privileges on guangzai_card_game.* to 'guangzai'@'localhost';

flush privileges;
