# Debian 12 单机部署

推荐 Node.js 24 LTS、Nginx、PM2。生产只开放 80/443，Node 监听 `127.0.0.1:8080`。

## 1. 初始化

```bash
sudo bash infra/scripts/bootstrap-debian12.sh
sudo mkdir -p /opt/pokewar /var/lib/pokewar /var/log/pokewar
sudo chown -R pokewar:pokewar /opt/pokewar /var/lib/pokewar /var/log/pokewar
```

把仓库放到 `/opt/pokewar/current`，创建 `.env`。

```bash
cd /opt/pokewar/current
sudo -u pokewar corepack enable
sudo -u pokewar pnpm install --frozen-lockfile
sudo -u pokewar pnpm verify
sudo -u pokewar pnpm build
```

## 2. PM2

```bash
sudo -u pokewar pm2 start infra/pm2/ecosystem.config.cjs
sudo -u pokewar pm2 save
sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u pokewar --hp /home/pokewar
```

## 3. Nginx

```bash
sudo cp infra/nginx/pokewar.conf /etc/nginx/sites-available/pokewar
sudo ln -s /etc/nginx/sites-available/pokewar /etc/nginx/sites-enabled/pokewar
sudo nginx -t
sudo systemctl reload nginx
```

替换配置中的域名并用 Certbot 配置 TLS。WebSocket 路径为 `/ws`。

## 4. 验证

```bash
curl -fsS http://127.0.0.1:8080/health
curl -fsS https://game.example.com/health
sudo -u pokewar pm2 logs pokewar --lines 100
```

## 5. 回滚

保留 `/opt/pokewar/releases/<commit>`。发布失败时切换 `/opt/pokewar/current` 软链接到上一版本，再执行 `pm2 reload pokewar`。数据库 schema 迁移必须先备份，且不得与代码发布耦合为不可逆一步。
