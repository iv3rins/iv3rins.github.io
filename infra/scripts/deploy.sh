#!/usr/bin/env bash
# =============================================================================
# PokeWar 服务器一键部署脚本（当前目录版）
# 适用：Debian 12 / Ubuntu 22.04+，Node.js 24+ 已安装
# 用法：在项目根目录下执行 bash infra/scripts/deploy.sh
# =============================================================================
set -euo pipefail

# ✅ 修复1: 从脚本位置向上推导项目根目录（infra/scripts → 项目根）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

DATA_DIR="/var/lib/pokewar"
LOG_DIR="/var/log/pokewar"
SERVER_IP="64.90.30.38"

echo "====== [1/6] 准备目录 ======"
echo "📁 部署目录: $DEPLOY_DIR"
mkdir -p "$DATA_DIR" "$LOG_DIR"

# ✅ 修复2: 自动探测 Node.js / pnpm 路径
load_node_env() {
  # 尝试加载 nvm
  export NVM_DIR="${NVM_DIR:-$HOME/.nvm}"
  [ -s "$NVM_DIR/nvm.sh" ] && . "$NVM_DIR/nvm.sh" || true
  # 尝试加载 fnm
  eval "$(fnm env 2>/dev/null)" || true
  # 常见 Node.js 安装路径兜底
  for p in /usr/local/bin /opt/nodejs/bin /root/.local/share/fnm/aliases/default/bin; do
    [ -d "$p" ] && export PATH="$p:$PATH"
  done
}

load_node_env

if ! command -v node &>/dev/null; then
  echo "❌ 未检测到 Node.js，请先安装 Node.js 24+"
  exit 1
fi
echo "✅ Node.js $(node -v) | npm $(npm -v)"

# 确保 corepack + pnpm 可用
corepack enable 2>/dev/null || npm install -g corepack
if ! command -v pnpm &>/dev/null; then
  corepack prepare pnpm@latest --activate 2>/dev/null || npm install -g pnpm
fi
echo "✅ pnpm $(pnpm -v)"

echo "====== [2/6] 写入环境变量 ======"
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
echo "✅ .env 已写入"

echo "====== [3/6] 安装依赖 ======"
cd "$DEPLOY_DIR"
pnpm install --frozen-lockfile

echo "====== [4/6] 构建服务端 ======"
pnpm --filter @pokewar/server build
echo "✅ 服务端构建完成 → apps/server/dist/index.js"

echo "====== [5/6] 配置 Nginx ======"
apt-get update -qq && apt-get install -y -qq nginx 2>/dev/null || true

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

ln -sf /etc/nginx/sites-available/pokewar /etc/nginx/sites-enabled/pokewar
rm -f /etc/nginx/sites-enabled/default
nginx -t && systemctl reload nginx
echo "✅ Nginx 配置完成"

echo "====== [6/6] 启动 PM2 服务 ======"
if ! command -v pm2 &>/dev/null; then
  npm install -g pm2
fi

set -a; source "$DEPLOY_DIR/.env"; set +a
pm2 delete pokewar 2>/dev/null || true
pm2 start "$DEPLOY_DIR/infra/pm2/ecosystem.config.cjs" --env production
pm2 save
pm2 startup systemd -u root --hp /root 2>/dev/null || true

echo ""
echo "====== 🎉 部署完成 ======"
echo "健康检查：curl http://127.0.0.1:8080/health"
echo "外部访问：http://$SERVER_IP"
echo "PM2 日志：pm2 logs pokewar"