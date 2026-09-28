#!/bin/sh
set -eu

CONTRACT="MORRO-PRODUCTION-MYSQL-READBACK"
HOST="${MORRO_MYSQL_READBACK_HOST:-morro-digital-v2-production-mysql}"
PORT="${MORRO_MYSQL_READBACK_PORT:-3306}"
DOMAINS="AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE"

fail() {
  printf '%s\n' "$CONTRACT:$1" >&2
  exit 1
}

required_env() {
  value="$(printenv "$1" 2>/dev/null || true)"
  [ -n "$value" ] || fail "MISSING_$1"
  printf '%s' "$value"
}

validate_identifier() {
  name="$1"
  value="$2"
  case "$value" in
    *[!A-Za-z0-9_]*) fail "INVALID_IDENTIFIER_$name" ;;
  esac
}

next_domain() {
  case "$1" in
    AUTH) printf '%s' AUDIT ;;
    AUDIT) printf '%s' DESTINATIONS ;;
    DESTINATIONS) printf '%s' CONTENT ;;
    CONTENT) printf '%s' BUSINESS ;;
    BUSINESS) printf '%s' ORDERING ;;
    ORDERING) printf '%s' FINANCIAL ;;
    FINANCIAL) printf '%s' TICKETING ;;
    TICKETING) printf '%s' NOTIFICATIONS ;;
    NOTIFICATIONS) printf '%s' AFFILIATES ;;
    AFFILIATES) printf '%s' ANALYTICS ;;
    ANALYTICS) printf '%s' CRM ;;
    CRM) printf '%s' COMMERCE ;;
    COMMERCE) printf '%s' AUTH ;;
    *) fail "UNKNOWN_DOMAIN_$1" ;;
  esac
}

query() {
  user="$1"
  password="$2"
  database="$3"
  sql="$4"
  MYSQL_PWD="$password" mysql     --protocol=tcp     --connect-timeout=10     --batch     --skip-column-names     -h "$HOST"     -P "$PORT"     -u "$user"     "$database"     -e "$sql"
}

total_tables=0
owner_count=0
denied_count=0

for domain in $DOMAINS; do
  database="$(required_env "${domain}_DATABASE_NAME")"
  user="$(required_env "${domain}_DATABASE_USER")"
  password="$(required_env "${domain}_DATABASE_PASSWORD")"

  validate_identifier "${domain}_DATABASE_NAME" "$database"
  validate_identifier "${domain}_DATABASE_USER" "$user"

  observed="$(query "$user" "$password" "$database" "SELECT DATABASE();" 2>/dev/null)" ||
    fail "OWN_SCHEMA_CONNECT_FAILED_$domain"
  [ "$observed" = "$database" ] || fail "OWN_SCHEMA_MISMATCH_$domain"

  table_count="$(query "$user" "$password" "$database" "SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = DATABASE();" 2>/dev/null)" ||
    fail "TABLE_COUNT_FAILED_$domain"
  case "$table_count" in
    ''|*[!0-9]*) fail "TABLE_COUNT_INVALID_$domain" ;;
  esac

  target_domain="$(next_domain "$domain")"
  target_database="$(required_env "${target_domain}_DATABASE_NAME")"
  validate_identifier "${target_domain}_DATABASE_NAME" "$target_database"

  if query "$user" "$password" "$target_database" "SELECT DATABASE();" >/dev/null 2>&1; then
    fail "CROSS_DOMAIN_ACCESS_ALLOWED_${domain}_TO_${target_domain}"
  fi

  owner_count=$((owner_count + 1))
  denied_count=$((denied_count + 1))
  total_tables=$((total_tables + table_count))
  printf 'readback:%s:database=%s:tables=%s:cross_domain_denied=true\n'     "$domain" "$database" "$table_count"
done

[ "$owner_count" -eq 13 ] || fail "OWNER_COUNT_INVALID"
[ "$denied_count" -eq 13 ] || fail "DENIAL_COUNT_INVALID"

printf '{"contract":"%s","status":"pass","schemaOwners":%s,"crossDomainDenied":%s,"totalTables":%s}\n'   "$CONTRACT" "$owner_count" "$denied_count" "$total_tables"
