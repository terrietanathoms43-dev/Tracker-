#!/usr/bin/env bash
# A manually invoked, FREE Supabase logical backup. Requires Docker + Supabase CLI.
set -euo pipefail
umask 077

if ! command -v supabase >/dev/null 2>&1; then
  echo "Install the Supabase CLI before using this script: https://supabase.com/docs/guides/local-development/cli/getting-started" >&2
  exit 1
fi
if [[ -z "${TRACKWISE_DATABASE_URL:-}" ]]; then
  read -r -s -p "Paste the Trackwise database connection string: " TRACKWISE_DATABASE_URL
  echo
fi
if [[ -z "$TRACKWISE_DATABASE_URL" ]]; then
  echo "Database connection string is required." >&2
  exit 1
fi

stamp="$(date -u +%Y%m%dT%H%M%SZ)"
destination="${1:-backups/trackwise-$stamp}"
if [[ -e "$destination" ]]; then
  echo "Backup destination already exists: $destination" >&2
  exit 1
fi
mkdir -p "$destination"
chmod 700 "$destination"

echo "Exporting roles, schema, and data (this may take several minutes)..."
supabase db dump --db-url "$TRACKWISE_DATABASE_URL" --role-only -f "$destination/roles.sql"
supabase db dump --db-url "$TRACKWISE_DATABASE_URL" -f "$destination/schema.sql"
supabase db dump --db-url "$TRACKWISE_DATABASE_URL" --data-only --use-copy -f "$destination/data.sql"
if command -v sha256sum >/dev/null 2>&1; then
 (cd "$destination" && sha256sum roles.sql schema.sql data.sql > SHA256SUMS)
fi
cat > "$destination/IMPORTANT.txt" <<'NOTE'
This backup contains sensitive account and organization data. Keep encrypted,
off-site, and OUTSIDE GitHub. The private task-file storage objects must be backed
up separately; Supabase logical database dumps do not include uploaded file bytes.
Always test restoration into a disposable project before any production recovery.
NOTE
unset TRACKWISE_DATABASE_URL
echo "Backup complete: $destination"
echo "Store this folder securely and separately export private Storage objects."
