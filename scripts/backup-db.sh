#!/usr/bin/env bash
#
# Encrypted PostgreSQL backup for BizManager.
#
#   DATABASE_URL        required. Use the DIRECT connection string, not a pooled one.
#   BACKUP_PASSPHRASE   required. Encrypts the backup (AES-256). Store it in a password
#                       manager as well as in your host's secrets: a backup you cannot
#                       decrypt is not a backup.
#   BACKUP_DIR          where backups are written (default ./backups)
#   BACKUP_KEEP         how many recent local backups to keep (default 14)
#   BACKUP_UPLOAD_CMD   optional command that copies the finished file off this machine;
#                       it receives the file path as $1, e.g.
#                       'aws s3 cp "$1" s3://my-bucket/bizmanager/ --endpoint-url https://...'
#
# Backups contain every shop's financial records: keep them encrypted and private.
set -euo pipefail

: "${DATABASE_URL:?Set DATABASE_URL (direct connection string)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
BACKUP_DIR="${BACKUP_DIR:-./backups}"
BACKUP_KEEP="${BACKUP_KEEP:-14}"

umask 077
mkdir -p "$BACKUP_DIR"

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
final="$BACKUP_DIR/bizmanager-$stamp.dump.gpg"
partial="$final.partial"
trap 'rm -f "$partial"' EXIT

# Passphrase goes in on a file descriptor, never on the command line (visible in `ps`).
encrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --symmetric --cipher-algo AES256 "$@" 3<<<"$BACKUP_PASSPHRASE"; }
decrypt() { gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$@" 3<<<"$BACKUP_PASSPHRASE"; }

echo "Dumping database…"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" | encrypt --output "$partial"

# A backup is only good if it can be read back: decrypt it and list its contents.
if ! decrypt "$partial" | pg_restore --list >/dev/null; then
  echo "ERROR: the new backup could not be read back. Not keeping it." >&2
  exit 1
fi
mv "$partial" "$final"
trap - EXIT
echo "Backup written and verified: $final ($(du -h "$final" | cut -f1))"

if [[ -n "${BACKUP_UPLOAD_CMD:-}" ]]; then
  echo "Uploading…"
  bash -c "$BACKUP_UPLOAD_CMD" _ "$final"
  echo "Upload finished."
fi

# Keep only the newest BACKUP_KEEP local files.
ls -1t "$BACKUP_DIR"/bizmanager-*.dump.gpg 2>/dev/null | tail -n +"$((BACKUP_KEEP + 1))" | while read -r old; do
  rm -f -- "$old"
done