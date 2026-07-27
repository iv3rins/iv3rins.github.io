#!/usr/bin/env bash
# =============================================================================
# PokeWar 服务器一键部署脚本
# 适用：Debian 12 / Ubuntu 22.04+，Node.js 24+ 已安装
# 用法：bash deploy.sh
# =============================================================================
set -euo pipefail

REPO_URL="https://github.com/iv3rins/iv3rins.github.io.git"
DEPLOY_DIR="/opt/pokewar/current"
DATA_DIR="/var/lib/pokewar"
LOG_DIR="/var/log/pokewar"
SERVER_IP="64.90.30.38"

echo "====== [1/7] 准备目录 ======"
mkdir -p "$DEPLOY_DIR" "$DATA_DIR" "$LOG_DIR"

echo "====== [2/7] 拉取代码 ======"
if [ -d "$DEPLOY_DIR/.git" ]; then
  cd "$DEPLOY_DIR"
  git pull origin main
else
  git clone "$REPO_URL" "$DEPLOY_DIR"
  cd "$DEPLOY_DIR"
fi

echo "====== [3/7] 写入环境变量 ======"
cat > "$DEPLOY_DIR/.env" << 'EOF'
NODE_ENV=production
HOST=127.0.0.1
PORT=8080
PUBLIC_ORIGIN=http://64.90.30.38
DATABASE_PATH=/var/lib/pokewar/pokewar.sqlite
MAX_ROOMS=200
MAX_CONNECTIONS=800
LOG_LEVEL=info
EOF
echo ".env 已写入"

echo "====== [4/7] 安装依赖 ======"
# 确保 corepack / pnpm 可用
corepack enable || true
pnpm install --frozen-lockfile

echo "====== [5/7] 构建服务端 ======"
pnpm --filter @pokewar/server build
echo "服务端构建完成 → apps/server/dist/index.js"

echo "====== [6/7] 配置 Nginx ======"
apt-get install -y nginx 2>/dev/null || true

# 写入 nginx 站点配置
cat > /etc/nginx/sites-available/pokewar << NGINXEOF
map \$http_upgrade \$connection_upgrade {
  default upgrade;
  ''      close;
}
limit_req_zone \$binary_remote_addr zone=pokewar_api:10m rate=20r/s;

server {
  listen 80;
  listen [::]:80;
  server_name $SERVER_IP _;

  root $DEPLOY_DIR/apps/web/dist;
  index index.html;

  location = /health {
    proxy_pass http://127.0.0.1:8080;
    access_log off;
  }
  location /api/ {
    limit_req zone=pokewar_api burst=40 nodelay;
    proxy_pass http://127.0.0.1:8080;
    proxy_set_header X-Real-IP \$remote_addr;
  }
  location /ws {
    proxy_pass         http://127.0.0.1:8080;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    \$http_upgrade;
    proxy_set_header   Connection \$connection_upgrade;
    proxy_set_header   Host       \$host;
    proxy_set_header   Origin     \$http_origin;
    proxy_read_timeout 75s;
    proxy_send_timeout 75s;
  }
  location /assets/ {
    try_files \$uri =404;
    expires 30d;
    add_header Cache-Control "public, immutable";
  }
  location / {
    try_files \$uri \$uri/ /index.html;
    add_header Cache-Control "no-cache";
  }
  client_max_body_size 32k;
  server_tokens off;
}
NGINXEOF

# 启用站点
ln -sf /etc/nginx/sites-available/pokewar /etc/nginx/sites-enabled/pokewar
# 禁用默认站点（避免冲突）
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "Nginx 配置完成"

echo "====== [7/7] 启动 PM2 服务 ======"
# 安装 PM2（如未安装）
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

# 加载 .env 并启动/重载
set -a; source "$DEPLOY_DIR/.env"; set +a
pm2 delete pokewar 2>/dev/null || true
pm2 start "$DEPLOY_DIR/infra/pm2/ecosystem.config.cjs" --env production
pm2 save
# 生成开机自启（Systemd）
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "====== 部署完成 ======"
echo "健康检查：curl http://127.0.0.1:8080/health"
echo "外部访问：http://$SERVER_IP"
echo "PM2 日志：pm2 logs pokewar"
