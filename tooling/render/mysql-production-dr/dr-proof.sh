#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

CONTRACT="MORRO-PRODUCTION-MYSQL-BACKUP-RESTORE-PROOF"
PAYLOAD_CONTRACT="MORRO-PRODUCTION-MYSQL-BACKUP-CHUNK"
CONTRACT_VERSION=1
MANIFEST="/opt/morro-dr/canonical-manifest.tsv"
SOURCE_HOST="${SOURCE_MYSQL_HOST:-morro-digital-v2-production-mysql}"
SOURCE_PORT="${SOURCE_MYSQL_PORT:-3306}"
EXPECTED_TABLES=91
EXPECTED_SCHEMAS=13
WORK_ROOT="${DR_WORK_ROOT:-/tmp/morro-production-mysql-dr}"
RESTORE_PORT=3307
MAX_ENCRYPTED_BYTES=300000
PAYLOAD_CHUNK_SIZE=6000
HANDLED_FAILURE_EXIT=86

fail() {
  local code="$1"
  printf '{"contract":"%s","contractVersion":%s,"status":"fail","code":"%s","stage":"%s"}\n' \
    "$CONTRACT" "$CONTRACT_VERSION" "$code" "$stage" >&2
  exit "$HANDLED_FAILURE_EXIT"
}

stage="startup"
on_err() {
  local rc="$?"
  local line="${BASH_LINENO[0]:-0}"
  trap - ERR
  if [[ "$rc" -eq "$HANDLED_FAILURE_EXIT" ]]; then
    exit "$rc"
  fi
  printf '{"contract":"%s","contractVersion":%s,"status":"fail","code":"UNHANDLED_COMMAND_FAILURE","stage":"%s","line":%s}\n' \
    "$CONTRACT" "$CONTRACT_VERSION" "$stage" "$line" >&2
  exit "$rc"
}
trap on_err ERR

required_env() {
  local key="$1"
  local value
  value="$(printenv "$key" 2>/dev/null || true)"
  [[ -n "$value" ]] || fail "MISSING_${key}"
  printf '%s' "$value"
}

validate_identifier() {
  [[ "$1" =~ ^[A-Za-z0-9_]+$ ]] || fail "IDENTIFIER_INVALID"
}

sql_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"
}

domain_for_schema() {
  case "$1" in
    morro_auth) printf AUTH ;;
    morro_audit) printf AUDIT ;;
    morro_destinations) printf DESTINATIONS ;;
    morro_content) printf CONTENT ;;
    morro_business) printf BUSINESS ;;
    morro_ordering) printf ORDERING ;;
    morro_financial) printf FINANCIAL ;;
    morro_ticketing) printf TICKETING ;;
    morro_notifications) printf NOTIFICATIONS ;;
    morro_affiliates) printf AFFILIATES ;;
    morro_analytics) printf ANALYTICS ;;
    morro_crm) printf CRM ;;
    morro_commerce) printf COMMERCE ;;
    *) fail "UNKNOWN_CANONICAL_SCHEMA" ;;
  esac
}

source_mysql() {
  local domain="$1" database="$2" sql="$3"
  local user password
  user="$(required_env "SOURCE_${domain}_DATABASE_USER")"
  password="$(required_env "SOURCE_${domain}_DATABASE_PASSWORD")"
  MYSQL_PWD="$password" mysql \
    --protocol=tcp --connect-timeout=10 --batch --raw --skip-column-names \
    --host="$SOURCE_HOST" --port="$SOURCE_PORT" --user="$user" \
    "$database" --execute="$sql"
}

restore_mysql() {
  mysql --protocol=socket --batch --raw --skip-column-names \
    --socket="$restore_socket" --user=root --execute="$1"
}

provision_restore_owners() {
  local spec domain database user password escaped
  for spec in \
    AUTH:morro_auth AUDIT:morro_audit DESTINATIONS:morro_destinations \
    CONTENT:morro_content BUSINESS:morro_business ORDERING:morro_ordering \
    FINANCIAL:morro_financial TICKETING:morro_ticketing \
    NOTIFICATIONS:morro_notifications AFFILIATES:morro_affiliates \
    ANALYTICS:morro_analytics CRM:morro_crm COMMERCE:morro_commerce; do
    domain="${spec%%:*}"
    database="${spec#*:}"
    user="$(required_env "SOURCE_${domain}_DATABASE_USER")"
    password="$(required_env "SOURCE_${domain}_DATABASE_PASSWORD")"
    escaped="$(sql_escape "$password")"
    restore_mysql "CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${escaped}'; ALTER USER '${user}'@'%' IDENTIFIED BY '${escaped}'; GRANT ALL PRIVILEGES ON \`${database}\`.* TO '${user}'@'%';"
  done
  restore_mysql "FLUSH PRIVILEGES;"
}

run_restore_readback() {
  local domain key value
  (
    export EXPECTED_SHA="$tool_sha"
    export RENDER_GIT_COMMIT="$tool_sha"
    for domain in AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE; do
      for suffix in NAME USER PASSWORD; do
        key="${domain}_DATABASE_${suffix}"
        value="$(required_env "SOURCE_${key}")"
        export "${key}=${value}"
      done
    done
    MORRO_MYSQL_READBACK_HOST=127.0.0.1 \
    MORRO_MYSQL_READBACK_PORT="$RESTORE_PORT" \
    MORRO_READBACK_MODE=full \
      /usr/local/bin/morro-mysql-readback
  ) >"$WORK_ROOT/restore-readback.log"

  restore_readback_json="$(tail -n 1 "$WORK_ROOT/restore-readback.log")"
  printf '%s\n' "$restore_readback_json" | jq -e '
    .contract == "MORRO-PRODUCTION-MYSQL-READBACK" and
    .status == "pass" and
    .schemaOwners == 13 and
    .crossDomainDenied == 156 and
    .totalTables == 91
  ' >/dev/null || fail "RESTORE_LEAST_PRIVILEGE_READBACK_FAILED"
}

capture_source_tables() {
  local output="$1"
  : >"$output"
  local spec domain schema
  for spec in \
    AUTH:morro_auth AUDIT:morro_audit DESTINATIONS:morro_destinations \
    CONTENT:morro_content BUSINESS:morro_business ORDERING:morro_ordering \
    FINANCIAL:morro_financial TICKETING:morro_ticketing \
    NOTIFICATIONS:morro_notifications AFFILIATES:morro_affiliates \
    ANALYTICS:morro_analytics CRM:morro_crm COMMERCE:morro_commerce; do
    domain="${spec%%:*}"
    schema="${spec#*:}"
    source_mysql "$domain" "$schema" \
      "SELECT TABLE_SCHEMA,TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA='${schema}' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_NAME;" \
      >>"$output"
  done
  LC_ALL=C sort -o "$output" "$output"
}

capture_source_metadata() {
  local suffix="$1"
  local columns="$WORK_ROOT/source-columns-${suffix}.tsv"
  local indexes="$WORK_ROOT/source-indexes-${suffix}.tsv"
  local primary="$WORK_ROOT/source-primary-${suffix}.tsv"
  local foreign="$WORK_ROOT/source-foreign-${suffix}.tsv"
  local triggers="$WORK_ROOT/source-triggers-${suffix}.tsv"
  : >"$columns"; : >"$indexes"; : >"$primary"; : >"$foreign"; : >"$triggers"

  local spec domain schema
  for spec in \
    AUTH:morro_auth AUDIT:morro_audit DESTINATIONS:morro_destinations \
    CONTENT:morro_content BUSINESS:morro_business ORDERING:morro_ordering \
    FINANCIAL:morro_financial TICKETING:morro_ticketing \
    NOTIFICATIONS:morro_notifications AFFILIATES:morro_affiliates \
    ANALYTICS:morro_analytics CRM:morro_crm COMMERCE:morro_commerce; do
    domain="${spec%%:*}"
    schema="${spec#*:}"

    source_mysql "$domain" "$schema" \
      "SELECT TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION,HEX(COLUMN_NAME),HEX(COLUMN_TYPE),IS_NULLABLE,COALESCE(HEX(COLUMN_DEFAULT),'NULL'),HEX(EXTRA),COALESCE(HEX(GENERATION_EXPRESSION),''),COALESCE(HEX(COLLATION_NAME),'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA='${schema}' ORDER BY TABLE_NAME,ORDINAL_POSITION;" >>"$columns"

    source_mysql "$domain" "$schema" \
      "SELECT TABLE_SCHEMA,TABLE_NAME,HEX(INDEX_NAME),NON_UNIQUE,SEQ_IN_INDEX,COALESCE(HEX(COLUMN_NAME),''),COALESCE(COLLATION,''),COALESCE(SUB_PART,0),NULLABLE,INDEX_TYPE,COALESCE(HEX(EXPRESSION),'') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='${schema}' ORDER BY TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;" >>"$indexes"

    source_mysql "$domain" "$schema" \
      "SELECT TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION,HEX(COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA='${schema}' AND CONSTRAINT_NAME='PRIMARY' ORDER BY TABLE_NAME,ORDINAL_POSITION;" >>"$primary"

    source_mysql "$domain" "$schema" \
      "SELECT k.TABLE_SCHEMA,k.TABLE_NAME,HEX(k.CONSTRAINT_NAME),k.ORDINAL_POSITION,HEX(k.COLUMN_NAME),k.REFERENCED_TABLE_SCHEMA,k.REFERENCED_TABLE_NAME,HEX(k.REFERENCED_COLUMN_NAME),r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA='${schema}' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;" >>"$foreign"

    source_mysql "$domain" "$schema" \
      "SELECT TRIGGER_SCHEMA,EVENT_OBJECT_TABLE,HEX(TRIGGER_NAME),ACTION_TIMING,EVENT_MANIPULATION,HEX(ACTION_STATEMENT) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA='${schema}' ORDER BY EVENT_OBJECT_TABLE,TRIGGER_NAME;" >>"$triggers"
  done

  LC_ALL=C sort -o "$columns" "$columns"
  LC_ALL=C sort -o "$indexes" "$indexes"
  LC_ALL=C sort -o "$primary" "$primary"
  LC_ALL=C sort -o "$foreign" "$foreign"
  LC_ALL=C sort -o "$triggers" "$triggers"
}

capture_source_checksums() {
  local output="$1"
  : >"$output"
  local schema table domain checksum
  while IFS=$'\t' read -r schema table _scope; do
    [[ "$schema" == schema ]] && continue
    domain="$(domain_for_schema "$schema")"
    checksum="$(source_mysql "$domain" "$schema" "CHECKSUM TABLE \`${schema}\`.\`${table}\`;" | awk -F '\t' 'NR==1 {print $2}')"
    [[ "$checksum" =~ ^[0-9]+$ ]] || fail "SOURCE_CHECKSUM_UNAVAILABLE"
    printf '%s\t%s\t%s\n' "$schema" "$table" "$checksum" >>"$output"
  done <"$MANIFEST"
  LC_ALL=C sort -o "$output" "$output"
}

capture_source_counts() {
  local output="$1"
  : >"$output"
  local schema table domain count
  while IFS=$'\t' read -r schema table _scope; do
    [[ "$schema" == schema ]] && continue
    domain="$(domain_for_schema "$schema")"
    count="$(source_mysql "$domain" "$schema" "SELECT COUNT(*) FROM \`${schema}\`.\`${table}\`;")"
    [[ "$count" =~ ^[0-9]+$ ]] || fail "SOURCE_ROW_COUNT_INVALID"
    printf '%s\t%s\t%s\n' "$schema" "$table" "$count" >>"$output"
  done <"$MANIFEST"
  LC_ALL=C sort -o "$output" "$output"
}

capture_restore_metadata() {
  restore_mysql "SELECT TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION,HEX(COLUMN_NAME),HEX(COLUMN_TYPE),IS_NULLABLE,COALESCE(HEX(COLUMN_DEFAULT),'NULL'),HEX(EXTRA),COALESCE(HEX(GENERATION_EXPRESSION),''),COALESCE(HEX(COLLATION_NAME),'') FROM information_schema.COLUMNS WHERE TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION;" >"$WORK_ROOT/restore-columns.tsv"
  restore_mysql "SELECT TABLE_SCHEMA,TABLE_NAME,HEX(INDEX_NAME),NON_UNIQUE,SEQ_IN_INDEX,COALESCE(HEX(COLUMN_NAME),''),COALESCE(COLLATION,''),COALESCE(SUB_PART,0),NULLABLE,INDEX_TYPE,COALESCE(HEX(EXPRESSION),'') FROM information_schema.STATISTICS WHERE TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' ORDER BY TABLE_SCHEMA,TABLE_NAME,INDEX_NAME,SEQ_IN_INDEX;" >"$WORK_ROOT/restore-indexes.tsv"
  restore_mysql "SELECT TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION,HEX(COLUMN_NAME) FROM information_schema.KEY_COLUMN_USAGE WHERE TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' AND CONSTRAINT_NAME='PRIMARY' ORDER BY TABLE_SCHEMA,TABLE_NAME,ORDINAL_POSITION;" >"$WORK_ROOT/restore-primary.tsv"
  restore_mysql "SELECT k.TABLE_SCHEMA,k.TABLE_NAME,HEX(k.CONSTRAINT_NAME),k.ORDINAL_POSITION,HEX(k.COLUMN_NAME),k.REFERENCED_TABLE_SCHEMA,k.REFERENCED_TABLE_NAME,HEX(k.REFERENCED_COLUMN_NAME),r.UPDATE_RULE,r.DELETE_RULE FROM information_schema.KEY_COLUMN_USAGE k JOIN information_schema.REFERENTIAL_CONSTRAINTS r ON r.CONSTRAINT_SCHEMA=k.CONSTRAINT_SCHEMA AND r.CONSTRAINT_NAME=k.CONSTRAINT_NAME AND r.TABLE_NAME=k.TABLE_NAME WHERE k.TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' AND k.REFERENCED_TABLE_NAME IS NOT NULL ORDER BY k.TABLE_SCHEMA,k.TABLE_NAME,k.CONSTRAINT_NAME,k.ORDINAL_POSITION;" >"$WORK_ROOT/restore-foreign.tsv"
  restore_mysql "SELECT TRIGGER_SCHEMA,EVENT_OBJECT_TABLE,HEX(TRIGGER_NAME),ACTION_TIMING,EVENT_MANIPULATION,HEX(ACTION_STATEMENT) FROM information_schema.TRIGGERS WHERE TRIGGER_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' ORDER BY TRIGGER_SCHEMA,EVENT_OBJECT_TABLE,TRIGGER_NAME;" >"$WORK_ROOT/restore-triggers.tsv"
  for file in restore-columns restore-indexes restore-primary restore-foreign restore-triggers; do
    LC_ALL=C sort -o "$WORK_ROOT/${file}.tsv" "$WORK_ROOT/${file}.tsv"
  done
}

capture_restore_checksums_and_counts() {
  : >"$restore_checksums"
  : >"$restore_counts"
  local schema table checksum count
  while IFS=$'\t' read -r schema table _scope; do
    [[ "$schema" == schema ]] && continue
    checksum="$(restore_mysql "CHECKSUM TABLE \`${schema}\`.\`${table}\`;" | awk -F '\t' 'NR==1 {print $2}')"
    count="$(restore_mysql "SELECT COUNT(*) FROM \`${schema}\`.\`${table}\`;")"
    [[ "$checksum" =~ ^[0-9]+$ && "$count" =~ ^[0-9]+$ ]] || fail "RESTORE_DATA_PROOF_INVALID"
    printf '%s\t%s\t%s\n' "$schema" "$table" "$checksum" >>"$restore_checksums"
    printf '%s\t%s\t%s\n' "$schema" "$table" "$count" >>"$restore_counts"
  done <"$MANIFEST"
  LC_ALL=C sort -o "$restore_checksums" "$restore_checksums"
  LC_ALL=C sort -o "$restore_counts" "$restore_counts"
}

tool_sha="$(required_env DR_TOOL_SHA)"
source_sha="$(required_env DR_SOURCE_SHA)"
render_git_commit="$(required_env RENDER_GIT_COMMIT)"
dr_worker_service_name="$(required_env DR_WORKER_SERVICE_NAME)"
dr_encryption_key_id="$(required_env DR_ENCRYPTION_KEY_ID)"
required_env DR_ENCRYPTION_SECRET >/dev/null

[[ "$tool_sha" =~ ^[0-9a-f]{40}$ && "$source_sha" =~ ^[0-9a-f]{40}$ && "$render_git_commit" =~ ^[0-9a-f]{40}$ ]] || fail "SHA_INVALID"
[[ "$render_git_commit" == "$tool_sha" ]] || fail "TOOL_SHA_MISMATCH"
[[ "$dr_worker_service_name" == morro-digital-v2-production-mysql-dr-* ]] || fail "DR_WORKER_SERVICE_DENIED"

for command_name in env bash printenv mysql mysqladmin mysqld mysqldump jq openssl sha256sum cmp sort uniq awk sed cut head tail wc date stat rm mkdir chmod gzip base64 seq sleep; do
  command -v "$command_name" >/dev/null 2>&1 || fail "REQUIRED_COMMAND_MISSING"
done

case "$WORK_ROOT" in
  /var/lib/mysql|/var/lib/mysql/*) fail "BACKUP_PATH_FORBIDDEN" ;;
esac

rm -rf "$WORK_ROOT"
mkdir -p "$WORK_ROOT"
chmod 700 "$WORK_ROOT"

dump_file="$WORK_ROOT/production-canonical.sql"
compressed_file="$WORK_ROOT/production-canonical.sql.gz"
encrypted_file="$WORK_ROOT/production-canonical.sql.gz.enc"
expected_tables="$WORK_ROOT/expected-tables.tsv"
source_tables_before="$WORK_ROOT/source-tables-before.tsv"
source_tables_after="$WORK_ROOT/source-tables-after.tsv"
source_checksums_before="$WORK_ROOT/source-checksums-before.tsv"
source_checksums_after="$WORK_ROOT/source-checksums-after.tsv"
source_counts="$WORK_ROOT/source-counts.tsv"
restore_tables="$WORK_ROOT/restore-tables.tsv"
restore_checksums="$WORK_ROOT/restore-checksums.tsv"
restore_counts="$WORK_ROOT/restore-counts.tsv"
restore_root="$WORK_ROOT/restore"
restore_data="$restore_root/data"
restore_socket="$restore_root/mysql.sock"
restore_pid="$restore_root/mysql.pid"
restore_log="$restore_root/mysql.log"
restore_server_pid=""

cleanup() {
  if [[ -n "$restore_server_pid" ]] && kill -0 "$restore_server_pid" >/dev/null 2>&1; then
    kill "$restore_server_pid" >/dev/null 2>&1 || true
    wait "$restore_server_pid" >/dev/null 2>&1 || true
  fi
  rm -rf "$WORK_ROOT"
}
trap cleanup EXIT HUP INT TERM

[[ -f "$MANIFEST" ]] || fail "MANIFEST_MISSING"
[[ "$(head -n 1 "$MANIFEST")" == $'schema\ttable\tscope' ]] || fail "MANIFEST_HEADER_INVALID"
table_count="$(tail -n +2 "$MANIFEST" | sed '/^$/d' | wc -l | awk '{print $1}')"
schema_count="$(tail -n +2 "$MANIFEST" | cut -f1 | sort -u | wc -l | awk '{print $1}')"
duplicate_count="$(tail -n +2 "$MANIFEST" | cut -f1,2 | sort | uniq -d | wc -l | awk '{print $1}')"
invalid_scope_count="$(tail -n +2 "$MANIFEST" | awk -F '\t' '$3 !~ /^(global|destination|tenant|business|destination\+tenant|destination\+business)$/ {n++} END {print n+0}')"
[[ "$table_count" -eq "$EXPECTED_TABLES" && "$schema_count" -eq "$EXPECTED_SCHEMAS" && "$duplicate_count" -eq 0 && "$invalid_scope_count" -eq 0 ]] || fail "MANIFEST_INVALID"
tail -n +2 "$MANIFEST" | cut -f1,2 | LC_ALL=C sort >"$expected_tables"
manifest_sha256="$(sha256sum "$MANIFEST" | awk '{print $1}')"

stage="source-preflight"

for spec in \
  AUTH:morro_auth AUDIT:morro_audit DESTINATIONS:morro_destinations \
  CONTENT:morro_content BUSINESS:morro_business ORDERING:morro_ordering \
  FINANCIAL:morro_financial TICKETING:morro_ticketing \
  NOTIFICATIONS:morro_notifications AFFILIATES:morro_affiliates \
  ANALYTICS:morro_analytics CRM:morro_crm COMMERCE:morro_commerce; do
  domain="${spec%%:*}"
  database="${spec#*:}"
  user="$(required_env "SOURCE_${domain}_DATABASE_USER")"
  required_env "SOURCE_${domain}_DATABASE_PASSWORD" >/dev/null
  validate_identifier "$database"
  validate_identifier "$user"
  [[ "$user" == "$database" ]] || fail "SOURCE_OWNER_IDENTITY_INVALID"
  [[ "$(required_env "SOURCE_${domain}_DATABASE_NAME")" == "$database" ]] || fail "SOURCE_DATABASE_IDENTITY_INVALID"
  [[ "$(source_mysql "$domain" "$database" "SELECT DATABASE();")" == "$database" ]] || fail "SOURCE_OWNER_CONNECT_INVALID"
  [[ "$(source_mysql "$domain" "$database" "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}' AND TABLE_TYPE='BASE TABLE' AND ENGINE <> 'InnoDB';")" == 0 ]] || fail "SOURCE_NON_INNODB_TABLE"
  [[ "$(source_mysql "$domain" "$database" "SELECT COUNT(*) FROM information_schema.ROUTINES WHERE ROUTINE_SCHEMA='${database}';")" == 0 ]] || fail "SOURCE_ROUTINES_REQUIRE_ADMIN_BACKUP"
  [[ "$(source_mysql "$domain" "$database" "SELECT COUNT(*) FROM information_schema.EVENTS WHERE EVENT_SCHEMA='${database}';")" == 0 ]] || fail "SOURCE_EVENTS_REQUIRE_ADMIN_BACKUP"
done

stage="source-inventory"
capture_source_tables "$source_tables_before"
cmp -s "$expected_tables" "$source_tables_before" || fail "SOURCE_TABLE_INVENTORY_MISMATCH"
stage="source-metadata-before"
capture_source_metadata before
capture_source_checksums "$source_checksums_before"

stage="source-backup"
backup_started_epoch="$(date +%s)"
backup_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
: >"$dump_file"

for spec in \
  AUTH:morro_auth AUDIT:morro_audit DESTINATIONS:morro_destinations \
  CONTENT:morro_content BUSINESS:morro_business ORDERING:morro_ordering \
  FINANCIAL:morro_financial TICKETING:morro_ticketing \
  NOTIFICATIONS:morro_notifications AFFILIATES:morro_affiliates \
  ANALYTICS:morro_analytics CRM:morro_crm COMMERCE:morro_commerce; do
  domain="${spec%%:*}"
  database="${spec#*:}"
  user="$(required_env "SOURCE_${domain}_DATABASE_USER")"
  password="$(required_env "SOURCE_${domain}_DATABASE_PASSWORD")"
  MYSQL_PWD="$password" mysqldump \
    --protocol=tcp --host="$SOURCE_HOST" --port="$SOURCE_PORT" --user="$user" \
    --single-transaction --quick --skip-lock-tables --triggers --hex-blob \
    --set-gtid-purged=OFF --no-tablespaces --databases "$database" >>"$dump_file"
done

backup_completed_epoch="$(date +%s)"
backup_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
[[ -s "$dump_file" ]] || fail "BACKUP_EMPTY"

stage="source-stability"
capture_source_tables "$source_tables_after"
capture_source_metadata after
capture_source_checksums "$source_checksums_after"
capture_source_counts "$source_counts"

cmp -s "$source_tables_before" "$source_tables_after" || fail "SOURCE_SCHEMA_CHANGED_DURING_BACKUP"
for kind in columns indexes primary foreign triggers; do
  cmp -s "$WORK_ROOT/source-${kind}-before.tsv" "$WORK_ROOT/source-${kind}-after.tsv" || fail "SOURCE_METADATA_CHANGED_DURING_BACKUP"
done
cmp -s "$source_checksums_before" "$source_checksums_after" || fail "SOURCE_DATA_CHANGED_DURING_BACKUP"

[[ "$(source_mysql DESTINATIONS morro_destinations "SELECT COUNT(*) FROM destinations WHERE destination_id='morro-de-sao-paulo';")" == 1 ]] || fail "SOURCE_CANONICAL_DESTINATION_INVALID"

stage="restore-initialize"
restore_started_epoch="$(date +%s)"
restore_started_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
mkdir -p "$restore_data"
mysqld --no-defaults --initialize-insecure --datadir="$restore_data" --log-error="$restore_log"
mysqld --no-defaults --datadir="$restore_data" --socket="$restore_socket" \
  --port="$RESTORE_PORT" --bind-address=127.0.0.1 --pid-file="$restore_pid" \
  --log-error="$restore_log" --skip-log-bin --performance-schema=OFF \
  --innodb-buffer-pool-size=96M --max-connections=20 --tmp-table-size=8M \
  --max-heap-table-size=8M &
restore_server_pid="$!"

ready=false
for _ in $(seq 1 90); do
  if mysqladmin --protocol=socket --socket="$restore_socket" --user=root ping >/dev/null 2>&1; then
    ready=true
    break
  fi
  kill -0 "$restore_server_pid" >/dev/null 2>&1 || fail "RESTORE_MYSQL_EXITED"
  sleep 1
done
[[ "$ready" == true ]] || fail "RESTORE_MYSQL_NOT_READY"

stage="restore-import"
mysql --protocol=socket --socket="$restore_socket" --user=root <"$dump_file"
provision_restore_owners
stage="restore-readback"
run_restore_readback
restore_completed_epoch="$(date +%s)"
restore_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"

restore_mysql "SELECT TABLE_SCHEMA,TABLE_NAME FROM information_schema.TABLES WHERE TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' AND TABLE_TYPE='BASE TABLE' ORDER BY TABLE_SCHEMA,TABLE_NAME;" >"$restore_tables"
LC_ALL=C sort -o "$restore_tables" "$restore_tables"
cmp -s "$expected_tables" "$restore_tables" || fail "RESTORE_TABLE_INVENTORY_MISMATCH"
[[ "$(restore_mysql "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'morro\\_%' ESCAPE '\\\\';")" == "$EXPECTED_SCHEMAS" ]] || fail "RESTORE_SCHEMA_COUNT_INVALID"

stage="restore-validation"
capture_restore_metadata
capture_restore_checksums_and_counts

for kind in columns indexes primary foreign triggers; do
  cmp -s "$WORK_ROOT/source-${kind}-after.tsv" "$WORK_ROOT/restore-${kind}.tsv" || fail "RESTORE_METADATA_MISMATCH"
done
cmp -s "$source_checksums_after" "$restore_checksums" || fail "RESTORE_CHECKSUM_MISMATCH"
cmp -s "$source_counts" "$restore_counts" || fail "RESTORE_ROW_COUNT_MISMATCH"
[[ "$(restore_mysql "SELECT COUNT(*) FROM morro_destinations.destinations WHERE destination_id='morro-de-sao-paulo';")" == 1 ]] || fail "RESTORE_CANONICAL_DESTINATION_INVALID"

business_tables="$(awk -F '\t' '$1=="morro_business" {n++} END {print n+0}' "$expected_tables")"
financial_tables="$(awk -F '\t' '$1=="morro_financial" {n++} END {print n+0}' "$expected_tables")"
[[ "$business_tables" == 12 && "$financial_tables" == 14 ]] || fail "DOMAIN_TABLE_COUNT_INVALID"

validation_completed_epoch="$(date +%s)"
validation_completed_at="$(date -u +%Y-%m-%dT%H:%M:%SZ)"
plain_sha256="$(sha256sum "$dump_file" | awk '{print $1}')"
plain_bytes="$(stat -c %s "$dump_file")"

stage="encrypt-backup"
gzip -9 -c "$dump_file" >"$compressed_file"
openssl enc -aes-256-cbc -salt -pbkdf2 -iter 200000 -md sha256 \
  -pass env:DR_ENCRYPTION_SECRET -in "$compressed_file" -out "$encrypted_file"

encrypted_sha256="$(sha256sum "$encrypted_file" | awk '{print $1}')"
encrypted_bytes="$(stat -c %s "$encrypted_file")"
restore_schema_owners="$(printf '%s\n' "$restore_readback_json" | jq -r '.schemaOwners')"
restore_cross_domain_denied="$(printf '%s\n' "$restore_readback_json" | jq -r '.crossDomainDenied')"
[[ "$encrypted_bytes" -le "$MAX_ENCRYPTED_BYTES" ]] || fail "ENCRYPTED_BACKUP_TOO_LARGE_FOR_SECURE_LOG_TRANSPORT"

stage="emit-evidence"
payload="$(base64 -w 0 "$encrypted_file")"
payload_length="${#payload}"
payload_total="$(( (payload_length + PAYLOAD_CHUNK_SIZE - 1) / PAYLOAD_CHUNK_SIZE ))"
for ((seq_no=0; seq_no<payload_total; seq_no++)); do
  offset="$((seq_no * PAYLOAD_CHUNK_SIZE))"
  chunk="${payload:offset:PAYLOAD_CHUNK_SIZE}"
  jq -nc --arg contract "$PAYLOAD_CONTRACT" --argjson seq "$((seq_no + 1))" \
    --argjson total "$payload_total" --arg data "$chunk" \
    '{contract:$contract,seq:$seq,total:$total,data:$data}'
done

backup_duration_seconds="$((backup_completed_epoch - backup_started_epoch))"
restore_duration_seconds="$((restore_completed_epoch - restore_started_epoch))"
observed_rto_seconds="$((validation_completed_epoch - restore_started_epoch))"
primary_key_entries="$(wc -l <"$WORK_ROOT/restore-primary.tsv" | awk '{print $1}')"
foreign_key_entries="$(wc -l <"$WORK_ROOT/restore-foreign.tsv" | awk '{print $1}')"
index_entries="$(wc -l <"$WORK_ROOT/restore-indexes.tsv" | awk '{print $1}')"
trigger_entries="$(wc -l <"$WORK_ROOT/restore-triggers.tsv" | awk '{print $1}')"

jq -nc \
  --arg contract "$CONTRACT" --argjson contractVersion "$CONTRACT_VERSION" \
  --arg toolSha "$tool_sha" --arg sourceSha "$source_sha" \
  --arg manifestSha256 "sha256:${manifest_sha256}" \
  --arg backupStartedAt "$backup_started_at" --arg backupCompletedAt "$backup_completed_at" \
  --arg plainSha256 "sha256:${plain_sha256}" --arg encryptedSha256 "sha256:${encrypted_sha256}" \
  --arg encryptionKeyId "$dr_encryption_key_id" \
  --arg restoreStartedAt "$restore_started_at" --arg restoreCompletedAt "$restore_completed_at" \
  --arg validationCompletedAt "$validation_completed_at" \
  --argjson plainBytes "$plain_bytes" --argjson encryptedBytes "$encrypted_bytes" \
  --argjson payloadChunks "$payload_total" --argjson backupDurationSeconds "$backup_duration_seconds" \
  --argjson restoreDurationSeconds "$restore_duration_seconds" --argjson observedRtoSeconds "$observed_rto_seconds" \
  --argjson restoreSchemaOwners "$restore_schema_owners" --argjson restoreCrossDomainDenied "$restore_cross_domain_denied" \
  --argjson primaryKeyEntries "$primary_key_entries" --argjson foreignKeyEntries "$foreign_key_entries" \
  --argjson indexEntries "$index_entries" --argjson triggerEntries "$trigger_entries" \
  '{
    contract:$contract,contractVersion:$contractVersion,status:"pass",
    toolSha:$toolSha,sourceSha:$sourceSha,
    source:{service:"morro-digital-v2-production-mysql",schemaCount:13,totalTables:91,stableDuringBackup:true,allCanonicalTablesInnoDb:true,routines:0,events:0,canonicalDestinationCount:1},
    backup:{format:"mysqldump-logical",consistency:"least-privilege single-transaction per schema plus pre/post checksum and metadata stability",startedAt:$backupStartedAt,completedAt:$backupCompletedAt,durationSeconds:$backupDurationSeconds,plaintextBytes:$plainBytes,plaintextSha256:$plainSha256,encryption:"gzip+AES-256-CBC/PBKDF2-SHA256/200000",encryptionKeyId:$encryptionKeyId,encryptedBytes:$encryptedBytes,encryptedSha256:$encryptedSha256,payloadChunks:$payloadChunks},
    restore:{target:"ephemeral-render-one-off-job-local-mysql-8.4",persistentDisk:false,startedAt:$restoreStartedAt,importCompletedAt:$restoreCompletedAt,validationCompletedAt:$validationCompletedAt,restoreDurationSeconds:$restoreDurationSeconds,observedRtoSeconds:$observedRtoSeconds,schemaCount:13,totalTables:91,businessTables:12,financialTables:14,canonicalDestinationCount:1,rowCountsMatch:true,checksumsMatch:true,columnsMatch:true,primaryKeysMatch:true,indexesMatch:true,foreignKeysMatch:true,triggersMatch:true,leastPrivilegeReadback:true,schemaOwners:$restoreSchemaOwners,crossDomainDenied:$restoreCrossDomainDenied,primaryKeyEntries:$primaryKeyEntries,foreignKeyEntries:$foreignKeyEntries,indexEntries:$indexEntries,triggerEntries:$triggerEntries},
    scopePolicy:{verified:true,manifestSha256:$manifestSha256,canonicalRows:91},
    rpo:{productionMeasured:false,reason:"PRE_CUTOVER_SOURCE_STABLE_DURING_BACKUP"}
  }'
