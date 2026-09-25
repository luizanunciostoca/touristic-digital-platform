#!/bin/sh
set -eu

umask 077

CONTRACT="MYSQL-BACKUP-RESTORE-DRILL"
CONTRACT_VERSION=1

fail() {
  code="$1"
  printf '{"contract":"%s","contractVersion":%s,"status":"fail","code":"%s"}\n' \
    "$CONTRACT" "$CONTRACT_VERSION" "$code" >&2
  exit 1
}

validate_identifier() {
  value="$1"
  case "$value" in
    ""|*[!A-Za-z0-9_]*)
      fail "DRILL_IDENTIFIER_INVALID"
      ;;
  esac
}

environment="${DRILL_ENVIRONMENT:-}"
[ "$environment" = "staging" ] || fail "DRILL_ENVIRONMENT_DENIED"

[ "${DRILL_CONFIRM:-}" = "BACKUP_RESTORE_STAGING_ONLY" ] ||
  fail "DRILL_CONFIRMATION_REQUIRED"

[ "${RENDER_SERVICE_NAME:-}" = "morro-digital-v2-staging-mysql" ] ||
  fail "DRILL_SERVICE_DENIED"

[ "${DRILL_SOURCE_QUIESCED_CONFIRMED:-}" = "true" ] ||
  fail "DRILL_SOURCE_QUIESCED_CONFIRMATION_REQUIRED"

source_database="${DRILL_SOURCE_DATABASE:-}"
restore_database="${DRILL_RESTORE_DATABASE:-}"
validate_identifier "$source_database"
validate_identifier "$restore_database"

[ "$source_database" != "$restore_database" ] ||
  fail "DRILL_RESTORE_DATABASE_MUST_DIFFER"

case "$restore_database" in
  "${source_database}_restore_drill_"*) ;;
  *) fail "DRILL_RESTORE_DATABASE_NAME_DENIED" ;;
esac

source_allowed=false
for candidate in \
  "${AUTH_DATABASE_NAME:-}" \
  "${ORDERING_DATABASE_NAME:-}" \
  "${FINANCIAL_DATABASE_NAME:-}" \
  "${AFFILIATES_DATABASE_NAME:-}" \
  "${BUSINESS_DATABASE_NAME:-}" \
  "${CONTENT_DATABASE_NAME:-}" \
  "${DESTINATIONS_DATABASE_NAME:-}"; do
  if [ -n "$candidate" ]; then
    validate_identifier "$candidate"
    if [ "$source_database" = "$candidate" ]; then
      source_allowed=true
    fi
  fi
done
[ "$source_allowed" = "true" ] || fail "DRILL_SOURCE_DATABASE_DENIED"

mysql_host="${DRILL_MYSQL_HOST:-127.0.0.1}"
mysql_port="${DRILL_MYSQL_PORT:-3306}"
mysql_user="${DRILL_MYSQL_USER:-root}"
mysql_password="${DRILL_MYSQL_PASSWORD:-${MYSQL_ROOT_PASSWORD:-}}"
backup_directory="${DRILL_BACKUP_DIRECTORY:-/tmp/morro-dr}"
keep_restore="${DRILL_KEEP_RESTORE:-false}"
keep_backup="${DRILL_KEEP_BACKUP:-false}"
dry_run="${DRILL_DRY_RUN:-false}"

case "$mysql_port" in
  ""|*[!0-9]*) fail "DRILL_MYSQL_PORT_INVALID" ;;
esac
if [ "$mysql_port" -lt 1 ] || [ "$mysql_port" -gt 65535 ]; then
  fail "DRILL_MYSQL_PORT_INVALID"
fi

case "$keep_restore" in
  true|false) ;;
  *) fail "DRILL_KEEP_RESTORE_INVALID" ;;
esac
case "$keep_backup" in
  true|false) ;;
  *) fail "DRILL_KEEP_BACKUP_INVALID" ;;
esac
case "$dry_run" in
  true|false) ;;
  *) fail "DRILL_DRY_RUN_INVALID" ;;
esac

case "$backup_directory" in
  /var/lib/mysql|/var/lib/mysql/*)
    fail "DRILL_BACKUP_TARGET_MUST_NOT_BE_MYSQL_DATA_VOLUME"
    ;;
esac

if [ "$dry_run" = "true" ]; then
  printf '{"contract":"%s","contractVersion":%s,"status":"planned","environment":"staging","sourceDatabase":"%s","restoreDatabase":"%s","sourceQuiescedConfirmed":true,"keepRestore":%s,"keepBackup":%s}\n' \
    "$CONTRACT" "$CONTRACT_VERSION" "$source_database" "$restore_database" "$keep_restore" "$keep_backup"
  exit 0
fi

[ -n "$mysql_password" ] || fail "DRILL_MYSQL_PASSWORD_REQUIRED"

for command_name in mysql mysqldump sha256sum cmp mktemp awk wc date mkdir chmod rm; do
  command -v "$command_name" >/dev/null 2>&1 ||
    fail "DRILL_REQUIRED_COMMAND_MISSING"
done

mkdir -p "$backup_directory"
chmod 700 "$backup_directory"

timestamp="$(date -u +%Y%m%dT%H%M%SZ)"
backup_file="$backup_directory/$source_database-$timestamp.sql"
source_tables_file="$(mktemp)"
restore_tables_file="$(mktemp)"
restore_created=false
backup_created=false

mysql_base() {
  MYSQL_PWD="$mysql_password" mysql \
    --protocol=tcp \
    --host="$mysql_host" \
    --port="$mysql_port" \
    --user="$mysql_user" \
    --batch \
    --skip-column-names \
    "$@"
}

cleanup() {
  rm -f "$source_tables_file" "$restore_tables_file"
  if [ "$backup_created" = "true" ] && [ "$keep_backup" != "true" ]; then
    rm -f "$backup_file"
  fi
  if [ "$restore_created" = "true" ] && [ "$keep_restore" != "true" ]; then
    MYSQL_PWD="$mysql_password" mysql \
      --protocol=tcp \
      --host="$mysql_host" \
      --port="$mysql_port" \
      --user="$mysql_user" \
      --batch \
      --skip-column-names \
      --execute="DROP DATABASE IF EXISTS \`$restore_database\`;" \
      >/dev/null 2>&1 || true
  fi
}
trap cleanup 0 HUP INT TERM

restore_exists="$(
  mysql_base --execute="SELECT COUNT(*) FROM INFORMATION_SCHEMA.SCHEMATA WHERE SCHEMA_NAME='$restore_database';"
)"
[ "$restore_exists" = "0" ] || fail "DRILL_RESTORE_DATABASE_ALREADY_EXISTS"

backup_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MYSQL_PWD="$mysql_password" mysqldump \
  --protocol=tcp \
  --host="$mysql_host" \
  --port="$mysql_port" \
  --user="$mysql_user" \
  --single-transaction \
  --quick \
  --routines \
  --triggers \
  --events \
  --hex-blob \
  --set-gtid-purged=OFF \
  "$source_database" >"$backup_file"
backup_created=true
backup_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

[ -s "$backup_file" ] || fail "DRILL_BACKUP_EMPTY"

mysql_base --execute="CREATE DATABASE \`$restore_database\` CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;"
restore_created=true

restore_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
MYSQL_PWD="$mysql_password" mysql \
  --protocol=tcp \
  --host="$mysql_host" \
  --port="$mysql_port" \
  --user="$mysql_user" \
  "$restore_database" <"$backup_file"
restore_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

mysql_base --execute="SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='$source_database' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;" >"$source_tables_file"
mysql_base --execute="SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_SCHEMA='$restore_database' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;" >"$restore_tables_file"

cmp -s "$source_tables_file" "$restore_tables_file" ||
  fail "DRILL_RESTORE_TABLE_SET_MISMATCH"

while IFS= read -r table_name; do
  [ -n "$table_name" ] || continue
  validate_identifier "$table_name"
  source_count="$(
    mysql_base --execute="SELECT COUNT(*) FROM \`$source_database\`.\`$table_name\`;"
  )"
  restore_count="$(
    mysql_base --execute="SELECT COUNT(*) FROM \`$restore_database\`.\`$table_name\`;"
  )"
  [ "$source_count" = "$restore_count" ] ||
    fail "DRILL_RESTORE_ROW_COUNT_MISMATCH"
done <"$source_tables_file"

backup_sha256="$(sha256sum "$backup_file" | awk '{print $1}')"
backup_bytes="$(wc -c <"$backup_file" | awk '{print $1}')"
table_count="$(wc -l <"$source_tables_file" | awk '{print $1}')"
[ "$table_count" -gt 0 ] || fail "DRILL_SOURCE_HAS_NO_BASE_TABLES"
backup_basename="$source_database-$timestamp.sql"

printf '{"contract":"%s","contractVersion":%s,"status":"pass","environment":"staging","sourceDatabase":"%s","restoreDatabase":"%s","backupFile":"%s","backupBytes":%s,"backupSha256":"%s","tableCount":%s,"backupStartedAt":"%s","backupCompletedAt":"%s","restoreStartedAt":"%s","restoreCompletedAt":"%s","sourceQuiescedConfirmed":true,"keepRestore":%s,"keepBackup":%s}\n' \
  "$CONTRACT" \
  "$CONTRACT_VERSION" \
  "$source_database" \
  "$restore_database" \
  "$backup_basename" \
  "$backup_bytes" \
  "$backup_sha256" \
  "$table_count" \
  "$backup_started_at" \
  "$backup_completed_at" \
  "$restore_started_at" \
  "$restore_completed_at" \
  "$keep_restore" \
  "$keep_backup"
