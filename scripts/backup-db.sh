#!/usr/bin/env bash
# ==============================================================================
# Backup Harian Terenkripsi PostgreSQL (Sesuai PRD Keamanan VPS & UU PDP)
# Jalankan via cron harian: 0 2 * * * /path/to/scripts/backup-db.sh
# ==============================================================================
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/absensi-face}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
PASSPHRASE="${BACKUP_ENCRYPTION_PASSPHRASE:-}"
CONTAINER_NAME="${POSTGRES_CONTAINER:-absensi_postgres}"
DB_USER="${POSTGRES_USER:-absensi_user}"
DB_NAME="${POSTGRES_DB:-absensi_face}"

if [[ -z "$PASSPHRASE" ]]; then
  echo "ERROR: Set BACKUP_ENCRYPTION_PASSPHRASE sebelum menjalankan backup." >&2
  exit 1
fi

mkdir -p "$BACKUP_DIR"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")
OUT_FILE="${BACKUP_DIR}/absensi_${TIMESTAMP}.sql.gz.enc"

echo "[$(date -Iseconds)] Memulai backup terenkripsi ke ${OUT_FILE}..."
docker exec "$CONTAINER_NAME" pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip -9 \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass "pass:${PASSPHRASE}" -out "$OUT_FILE"

chmod 600 "$OUT_FILE"
echo "[$(date -Iseconds)] Backup selesai: $(du -h "$OUT_FILE" | cut -f1)"

# Hapus backup lama melebihi retensi
find "$BACKUP_DIR" -name "absensi_*.sql.gz.enc" -mtime "+${RETENTION_DAYS}" -delete
echo "[$(date -Iseconds)] Pembersihan backup > ${RETENTION_DAYS} hari selesai."
