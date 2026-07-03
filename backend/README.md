# 光仔卡牌后端

Node.js 原生 HTTP 后端，同时托管 `frontend/` 静态文件。

## 运行

在项目根目录执行：

```bash
npm start
```

默认地址：

```text
http://localhost:8787
```

## 主要接口

- `POST /api/register` 注册
- `POST /api/login` 登录
- `GET /api/profile` 用户资料
- `POST /api/draw` 抽卡
- `POST /api/exchange` 碎片兑换
- `POST /api/share/create` 创建分享
- `POST /api/share/visit` 分享页访问，检测到跳转后给分享者奖励
- `POST /api/share/claim` 登录用户蹭好友包，绑定分享者和访问者并给双方发奖
- `GET /api/ranking` 排行榜，登录态下会标记当前玩家
- `GET /api/stats` 数据统计
- `GET /api/users` 查看所有玩家与抽卡记录

## 卡牌配置

- `../data/cards.json` 是当前卡牌主维护源，包含卡牌 ID、名称、游戏、主题、稀有度、文案、图片路径。
- `../data/combos.json` 是隐藏彩蛋组合维护源，包含组合 ID、卡牌 ID 列表和奖励。
- 后端启动和 `GET /api/cards` 时会读取 JSON，并把卡牌主数据同步到 `cards` 表。
- 卡面图片放在 `../frontend/assets/cards/`，在 `data/cards.json` 的 `image` 字段里填写前端可访问路径。

## 数据迁移

已有 MySQL 环境需要执行：

```bash
mysql -u root -p < migrations/20260703_share_claims.sql
mysql -u root -p < migrations/20260703_card_assets.sql
```

新表 `share_claims` 用于记录好友蹭包双方关系和每日防重。
`20260703_card_assets.sql` 用于给已有 `cards` 表补充 `image` 字段。

## 正式部署

MySQL / Redis / PM2 / Nginx 的生产配置样例见：

```text
../docs/deployment-mysql-redis.md
../deploy/env.production.example
../deploy/mysql-init.sql
../deploy/redis-production.conf
../ecosystem.config.cjs
```
