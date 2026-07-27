#!/usr/bin/env bash
set -euo pipefail

NODE_VERSION="${NODE_VERSION:-24.18.0}"
case "$(uname -m)" in
  x86_64) NODE_ARCH="x64" ;;
  aarch64|arm64) NODE_ARCH="arm64" ;;
  *) echo "Unsupported architecture: $(uname -m)" >&2; exit 1 ;;
esac

archive="node-v${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz"
base="https://nodejs.org/dist/v${NODE_VERSION}"
tmp="$(mktemp -d)"
trap 'rm -rf "$tmp"' EXIT

cd "$tmp"
curl -fsSLO "${base}/${archive}"
curl -fsSLO "${base}/SHASUMS256.txt"
grep " ${archive}$" SHASUMS256.txt | sha256sum --check --strict
sudo tar -xJf "$archive" -C /usr/local --strip-components=1
sudo corepack enable
sudo corepack prepare pnpm@10.15.0 --activate
node --version
pnpm --version
