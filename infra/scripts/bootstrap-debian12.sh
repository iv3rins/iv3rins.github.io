#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run as root." >&2
  exit 1
fi

apt-get update
apt-get install -y --no-install-recommends \
  ca-certificates curl git nginx xz-utils build-essential sqlite3 logrotate ufw

if ! id pokewar >/dev/null 2>&1; then
  useradd --create-home --shell /bin/bash pokewar
fi

install -d -o pokewar -g pokewar -m 0750 /opt/pokewar/releases
install -d -o pokewar -g pokewar -m 0750 /var/lib/pokewar
install -d -o pokewar -g pokewar -m 0750 /var/log/pokewar

ufw allow OpenSSH
ufw allow 'Nginx Full'
ufw --force enable

if ! command -v node >/dev/null 2>&1 || [[ "$(node -p 'Number(process.versions.node.split(".")[0])')" -lt 24 ]]; then
  echo "Node.js 24 is required. Run infra/scripts/install-node24.sh next." >&2
fi

echo "Debian 12 bootstrap complete."
