#!/usr/bin/env bash
set -euo pipefail

DATABASE_PATH="${DATABASE_PATH:-/var/lib/pokewar/pokewar.sqlite}"
BACKUP_DIR="${BACKUP_DIR:-/var/lib/pokewar/backups}"
mkdir -p "$BACKUP_DIR"
output="${BACKUP_DIR}/pokewar-$(date +%Y%m%d-%H%M%S).sqlite"
sqlite3 "$DATABASE_PATH" ".backup '$output'"
find "$BACKUP_DIR" -type f -name 'pokewar-*.sqlite' -mtime +14 -delete
printf 'Backup written: %s\n' "$output"
