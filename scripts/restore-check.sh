#!/usr/bin/env bash
#
# Restore drill: proves a backup can really be restored. Run it regularly (monthly is
# a good habit) and before any risky change. It restores the newest backup into a
# SCRATCH database and prints row counts you can compare with production.
#
#   RESTORE_DATABASE_URL  required. An empty scratch database. NEVER production.
#   DATABASE_URL          optional. If set, the script refuses to run when it equals
#                         RESTORE_DATABASE_URL.
#   BACKUP_PASSPHRASE     required.
#   BACKUP_DIR            default ./backups
#   BACKUP_FILE           optional. A specific backup instead of the newest one.
#   RESTORE_CONFIRM=yes   required. Existing objects in the scratch database are replaced.
set -euo pipefail

: "${RESTORE_DATABASE_URL:?Set RESTORE_DATABASE_URL (an empty scratch database)}"
: "${BACKUP_PASSPHRASE:?Set BACKUP_PASSPHRASE}"
[[ "${RESTORE_CONFIRM:-}" == "yes" ]] || { echo "Set RESTORE_CONFIRM=yes to continue." >&2; exit 2; }
if [[ -n "${DATABASE_URL:-}" && "$DATABASE_URL" == "$RESTORE_DATABASE_URL" ]]; then
  echo "Refusing: RESTORE_DATABASE_URL is the same as DATABASE_URL (production)." >&2
  exit 2
fi

BACKUP_DIR="${BACKUP_DIR:-./backups}"
file="${BACKUP_FILE:-$(ls -1t "$BACKUP_DIR"/bizmanager-*.dump.gpg 2>/dev/null | head -n 1 || true)}"
[[ -n "$file" && -f "$file" ]] || { echo "No backup file found in $BACKUP_DIR" >&2; exit 1; }
echo "Restoring: $file"

gpg --batch --yes --quiet --pinentry-mode loopback --passphrase-fd 3 --decrypt "$file" 3<<<"$BACKUP_PASSPHRASE" \
  | pg_restore --clean --if-exists --no-owner --no-privileges --exit-on-error --dbname "$RESTORE_DATABASE_URL"

echo "Restore finished. Row counts in the restored copy:"
psql "$RESTORE_DATABASE_URL" --no-psqlrc --quiet --tuples-only --command "
  SELECT 'tables' AS what, count(*) FROM information_schema.tables WHERE table_schema = 'public'
  UNION ALL SELECT 'users', count(*) FROM users
  UNION ALL SELECT 'businesses', count(*) FROM businesses
  UNION ALL SELECT 'sales', count(*) FROM sales
  UNION ALL SELECT 'subscription_payments', count(*) FROM subscription_payments;" 2>/dev/null \
  || echo "(Some BizManager tables were not found: is this a BizManager backup?)"