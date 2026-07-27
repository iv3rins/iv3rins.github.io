#!/usr/bin/env bash
# =============================================================================
# PokeWar 服务器一键部署脚本
# 适用：Debian 12 / Ubuntu 22.04+，Node.js 24+
# 用法：在项目根目录下执行 sudo bash infra/scripts/deploy.sh
# 可选环境变量：SERVER_IP、PUBLIC_ORIGIN、PORT
# =============================================================================
set -Eeuo pipefail

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_DIR="$(cd -- "$SCRIPT_DIR/../.." && pwd)"
DATA_DIR="/var/lib/pokewar"
LOG_DIR="/var/log/pokewar"
SERVER_IP="${SERVER_IP:-64.90.30.38}"
PUBLIC_ORIGIN="${PUBLIC_ORIGIN:-http://$SERVER_IP}"
PORT="${PORT:-8080}"
REQUIRED_NODE_MAJOR=24
REQUIRED_PNPM_MAJOR=10
MIN_DISK_KB=$((1024 * 1024))

trap 'echo "❌ 部署失败（第 ${LINENO} 行）。" >&2' ERR

die() {
  echo "❌ $*" >&2
  exit 1
}

require_command() {
  command -v "$1" >/dev/null 2>&1 || die "缺少命令：$1"
}

version_major() {
  "$1" --version | sed -E 's/^[^0-9]*([0-9]+).*/\1/'
}

self_check() {
  echo "====== [1/8] 部署环境自检 ======"

  [[ "$EUID" -eq 0 ]] || die "需要 root 权限，请使用 sudo 运行。"
  [[ -r /etc/os-release ]] || die "无法识别操作系统。"
  # shellcheck disable=SC1091
  source /etc/os-release
  case "${ID:-}" in
    debian)
      [[ "${VERSION_ID%%.*}" -ge 12 ]] || die "仅支持 Debian 12+。"
      ;;
    ubuntu)
      [[ "${VERSION_ID%%.*}" -ge 22 ]] || die "仅支持 Ubuntu 22.04+。"
      ;;
    *)
      die "不支持的操作系统：${PRETTY_NAME:-unknown}"
      ;;
  esac

  for command in apt-get awk corepack df node npm sed systemctl; do
    require_command "$command"
  done

  [[ -f "$DEPLOY_DIR/package.json" ]] || die "未找到项目根 package.json：$DEPLOY_DIR"
  [[ -f "$DEPLOY_DIR/pnpm-lock.yaml" ]] || die "未找到 pnpm-lock.yaml。"
  [[ -f "$DEPLOY_DIR/apps/server/package.json" ]] || die "服务端工作区不完整。"
  [[ -f "$DEPLOY_DIR/apps/web/package.json" ]] || die "Web 工作区不完整。"

  local node_major available_kb memory_kb
  node_major="$(version_major node)"
  [[ "$node_major" =~ ^[0-9]+$ && "$node_major" -ge "$REQUIRED_NODE_MAJOR" ]] || \
    die "Node.js 版本过低：$(node --version)，要求 ${REQUIRED_NODE_MAJOR}+."

  available_kb="$(df -Pk "$DEPLOY_DIR" | awk 'NR == 2 { print $4 }')"
  [[ "$available_kb" =~ ^[0-9]+$ && "$available_kb" -ge "$MIN_DISK_KB" ]] || \
    die "部署磁盘可用空间不足 1 GiB。"

  memory_kb="$(awk '/^MemAvailable:/ { print $2 }' /proc/meminfo)"
  if [[ "$memory_kb" =~ ^[0-9]+$ && "$memory_kb" -lt 524288 ]]; then
    echo "⚠️  可用内存低于 512 MiB，构建可能失败。" >&2
  fi

  [[ "$PORT" =~ ^[0-9]+$ && "$PORT" -ge 1 && "$PORT" -le 65535 ]] || \
    die "PORT 必须是 1-65535 之间的整数。"
  [[ "$SERVER_IP" =~ ^[A-Za-z0-9.:-]+$ ]] || die "SERVER_IP 包含非法字符。"
  [[ "$PUBLIC_ORIGIN" =~ ^https?://[^[:space:]]+$ ]] || \
    die "PUBLIC_ORIGIN 必须是有效的 http(s) 地址。"

  echo "✅ 系统：${PRETTY_NAME}"
  echo "✅ Node.js：$(node --version)"
  echo "✅ 项目目录：$DEPLOY_DIR"
  echo "✅ 可用磁盘：$((available_kb / 1024)) MiB"
}

self_check

echo "====== [2/8] 准备目录 ======"
install -d -m 0755 "$DATA_DIR" "$LOG_DIR"

echo "====== [3/8] 写入环境变量 ======"
cat > "$DEPLOY_DIR/.env" << EOF
NODE_ENV=production
HOST=127.0.0.1
PORT=$PORT
PUBLIC_ORIGIN=$PUBLIC_ORIGIN
DATABASE_PATH=$DATA_DIR/pokewar.sqlite
MAX_ROOMS=200
MAX_CONNECTIONS=800
LOG_LEVEL=info
EOF
echo "✅ .env 已写入"

echo "====== [4/8] 安装依赖 ======"
cd "$DEPLOY_DIR"
corepack enable
corepack prepare pnpm@10.15.0 --activate
pnpm_major="$(version_major pnpm)"
[[ "$pnpm_major" =~ ^[0-9]+$ && "$pnpm_major" -ge "$REQUIRED_PNPM_MAJOR" ]] || \
  die "pnpm 版本过低：$(pnpm --version)，要求 ${REQUIRED_PNPM_MAJOR}+."
pnpm install --frozen-lockfile

echo "====== [5/8] 构建应用 ======"
pnpm --filter @pokewar/server build
pnpm --filter @pokewar/web build
[[ -f "$DEPLOY_DIR/apps/server/dist/index.js" ]] || die "服务端构建产物缺失。"
[[ -f "$DEPLOY_DIR/apps/web/dist/index.html" ]] || die "Web 构建产物缺失。"
echo "✅ 服务端与 Web 构建完成"

echo "====== [6/8] 配置 Nginx ======"
apt-get update -qq
apt-get install -y -qq --no-install-recommends nginx curl

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
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    access_log off;
  }
  location /api/ {
    limit_req zone=pokewar_api burst=40 nodelay;
    proxy_pass http://127.0.0.1:$PORT;
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto \$scheme;
  }
  location /ws {
    proxy_pass         http://127.0.0.1:$PORT;
    proxy_http_version 1.1;
    proxy_set_header   Upgrade    \$http_upgrade;
    proxy_set_header   Connection \$connection_upgrade;
    proxy_set_header   Host       \$host;
    proxy_set_header   Origin     \$http_origin;
    proxy_set_header   X-Real-IP  \$remote_addr;
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
nginx -t
systemctl reload nginx
echo "✅ Nginx 配置完成"

echo "====== [7/8] 启动 PM2 服务 ======"
if ! command -v pm2 >/dev/null 2>&1; then
  npm install -g pm2
fi

set -a
# shellcheck disable=SC1091
source "$DEPLOY_DIR/.env"
set +a
pm2 delete pokewar 2>/dev/null || true
pm2 start "$DEPLOY_DIR/apps/server/dist/index.js" \
  --name pokewar \
  --cwd "$DEPLOY_DIR" \
  --node-args="--max-old-space-size=512 --enable-source-maps" \
  --max-memory-restart 700M \
  --time \
  --merge-logs \
  --output "$LOG_DIR/out.log" \
  --error "$LOG_DIR/error.log"
pm2 save
pm2 startup systemd -u root --hp /root >/dev/null 2>&1 || \
  echo "⚠️  PM2 开机启动配置失败，请手动执行：pm2 startup" >&2

echo "====== [8/8] 服务健康检查 ======"
health_url="http://127.0.0.1:$PORT/health"
healthy=false
for attempt in {1..15}; do
  if curl --fail --silent --show-error --max-time 5 "$health_url" >/dev/null; then
    healthy=true
    break
  fi
  echo "等待服务就绪（$attempt/15）..."
  sleep 2
done

if [[ "$healthy" != true ]]; then
  pm2 logs pokewar --lines 30 --nostream >&2 || true
  die "健康检查失败：$health_url"
fi
curl --fail --silent --show-error --max-time 5 "http://127.0.0.1/health" >/dev/null || \
  die "Nginx 反向代理健康检查失败。"

echo ""
echo "====== 🎉 部署完成 ======"
echo "健康检查：$health_url"
echo "外部访问：$PUBLIC_ORIGIN"
echo "PM2 日志：pm2 logs pokewar"
