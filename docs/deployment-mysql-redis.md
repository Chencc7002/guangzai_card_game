# MySQL / Redis 正式部署配置

本文对应 `ARCH-002` 到 `ARCH-004`：云服务器部署后端 API、MySQL 存储正式数据、Redis 承担登录态缓存和排行榜 ZSet。

## 1. 生产环境文件

已经新增这些部署样例：

- `deploy/env.production.example`：生产 `.env` 模板。
- `deploy/mysql-init.sql`：创建正式库和最小权限 MySQL 用户。
- `deploy/redis-production.conf`：单机 Redis 样例，绑定本机、开启 AOF、限制内存。
- `ecosystem.config.cjs`：PM2 进程配置。
- `deploy/nginx-guangzai.conf`：Nginx 反向代理样例。

服务器上复制模板：

```bash
cp deploy/env.production.example .env
nano .env
```

必须改：

```env
PUBLIC_BASE_URL=https://你的域名或http://服务器公网IP:8787
MYSQL_PASSWORD=服务器上的强密码
REDIS_URL=redis://127.0.0.1:6379
```

`PUBLIC_BASE_URL` 会影响接口返回的正式分享链接。二维码页面本身也要通过公网地址打开，不能用 `localhost`。

## 2. Ubuntu / Debian 服务器安装

```bash
sudo apt update
sudo apt install -y git mysql-server redis-server nginx
```

安装 Node.js 18+ 后进入项目目录：

```bash
npm ci
```

## 3. MySQL 初始化

先编辑 `deploy/mysql-init.sql`，把 `CHANGE_ME_STRONG_PASSWORD` 改成真实强密码。

```bash
sudo mysql < deploy/mysql-init.sql
mysql -uguangzai -p < mysql-schema.sql
```

验证：

```bash
mysql -uguangzai -p
use guangzai_card_game;
show tables;
```

`.env` 对应：

```env
MYSQL_HOST=127.0.0.1
MYSQL_PORT=3306
MYSQL_USER=guangzai
MYSQL_PASSWORD=你的强密码
MYSQL_DATABASE=guangzai_card_game
```

## 4. Redis 配置

如果 Redis 和 Node 在同一台服务器：

```bash
sudo cp /etc/redis/redis.conf /etc/redis/redis.conf.bak
sudo cp deploy/redis-production.conf /etc/redis/redis.conf
sudo systemctl enable redis-server
sudo systemctl restart redis-server
redis-cli ping
```

看到 `PONG` 即正常。

`.env` 对应：

```env
REDIS_URL=redis://127.0.0.1:6379
```

如果用云 Redis：

```env
REDIS_URL=redis://:密码@Redis内网地址:6379
```

Redis 只保存 session 缓存、排行榜 ZSet 和短期榜单缓存；清空 Redis 不会丢卡册、积分、分享记录，MySQL 才是正式数据源。

## 5. 启动后端 API

临时启动：

```bash
npm start
```

正式启动：

```bash
sudo npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
pm2 status
```

## 6. Nginx 和端口

不用域名时，可以直接开放 `8787` 端口访问：

```bash
sudo ufw allow 8787/tcp
```

有域名时，建议 Nginx 代理到 Node：

```bash
sudo cp deploy/nginx-guangzai.conf /etc/nginx/sites-available/guangzai-card-game
sudo ln -s /etc/nginx/sites-available/guangzai-card-game /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

把 `deploy/nginx-guangzai.conf` 里的 `example.com` 改成真实域名。

## 7. 本机 Windows Redis 配置

当前这台机器能看到 `MySQL80` 服务正在运行，但 PATH 中没有 `redis-server` / `redis-cli`，也没有 Redis Windows 服务；`wsl.exe` 存在但还没有安装 Linux 发行版。

推荐本机方案是 WSL Ubuntu：

1. 用管理员 PowerShell 安装 WSL：

```powershell
wsl --install -d Ubuntu
```

2. 重启电脑，打开 Ubuntu，安装 Redis：

```bash
sudo apt update
sudo apt install -y redis-server
sudo service redis-server start
redis-cli ping
```

3. Windows 项目根目录 `.env` 写：

```env
REDIS_URL=redis://127.0.0.1:6379
```

如果以后安装了 Docker，也可以用：

```bash
docker run -d --name guangzai-redis -p 6379:6379 redis:7-alpine redis-server --appendonly yes
```

再用 `redis-cli ping` 或后端日志确认 Redis 已连接。
