#!/bin/sh
set -eu

CONTRACT="MORRO-PRODUCTION-MYSQL-RUNTIME-USERS"
HOST="${MORRO_MYSQL_RUNTIME_HOST:-morro-digital-v2-production-mysql}"
PORT="${MORRO_MYSQL_RUNTIME_PORT:-3306}"
DOMAINS="AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE"

required_env() {
  value="$(printenv "$1" 2>/dev/null || true)"
  if [ -z "$value" ]; then
    echo "PRODUCTION_RUNTIME_USER_ENV_REQUIRED_$1" >&2
    exit 1
  fi
  printf '%s' "$value"
}

identifier() {
  value="$1"
  case "$value" in
    *[!A-Za-z0-9_]*|'')
      echo "PRODUCTION_RUNTIME_USER_IDENTIFIER_INVALID" >&2
      exit 1
      ;;
  esac
  printf '%s' "$value"
}

denied_count=0
schema_privilege_entries=0

for domain in $DOMAINS; do
  database="$(identifier "$(required_env "${domain}_DATABASE_NAME")")"
  runtime_user="$(identifier "$(required_env "${domain}_RUNTIME_DATABASE_USER")")"
  runtime_password="$(required_env "${domain}_RUNTIME_DATABASE_PASSWORD")"

  expected_user="${database}_runtime"
  if [ "$runtime_user" != "$expected_user" ]; then
    echo "PRODUCTION_RUNTIME_USER_NAME_MISMATCH_$domain" >&2
    exit 1
  fi

  mysql_runtime() {
    mysql --protocol=tcp -h "$HOST" -P "$PORT" -u"$runtime_user" -p"$runtime_password" --batch --skip-column-names "$@"
  }

  identity="$(mysql_runtime "$database" -e "SELECT CONCAT(DATABASE(), ':', SUBSTRING_INDEX(CURRENT_USER(), '@', 1));")"
  [ "$identity" = "${database}:${runtime_user}" ]

  schema_grants="$(mysql_runtime "$database" -e "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = CONCAT(CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', 1), CHAR(39), '@', CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', -1), CHAR(39)) AND TABLE_SCHEMA = DATABASE() AND PRIVILEGE_TYPE IN ('SELECT','INSERT','UPDATE','DELETE');")"
  schema_extras="$(mysql_runtime "$database" -e "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = CONCAT(CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', 1), CHAR(39), '@', CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', -1), CHAR(39)) AND (TABLE_SCHEMA <> DATABASE() OR PRIVILEGE_TYPE NOT IN ('SELECT','INSERT','UPDATE','DELETE'));")"
  global_grants="$(mysql_runtime "$database" -e "SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = CONCAT(CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', 1), CHAR(39), '@', CHAR(39), SUBSTRING_INDEX(CURRENT_USER(), '@', -1), CHAR(39)) AND PRIVILEGE_TYPE <> 'USAGE';")"

  [ "$schema_grants" -eq 4 ]
  [ "$schema_extras" -eq 0 ]
  [ "$global_grants" -eq 0 ]
  schema_privilege_entries=$((schema_privilege_entries + schema_grants))

  own_tables="$(mysql_runtime "$database" -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA=DATABASE();")"
  [ "$own_tables" -gt 0 ]

  for target_domain in $DOMAINS; do
    [ "$target_domain" = "$domain" ] && continue
    target_database="$(identifier "$(required_env "${target_domain}_DATABASE_NAME")")"
    if mysql_runtime "$database" -e "SHOW TABLES FROM \`$target_database\`;" >/dev/null 2>&1; then
      echo "PRODUCTION_RUNTIME_USER_CROSS_DOMAIN_ACCESS_${domain}_${target_domain}" >&2
      exit 1
    fi
    denied_count=$((denied_count + 1))
  done
done

[ "$schema_privilege_entries" -eq 52 ]
[ "$denied_count" -eq 156 ]

printf '%s\n' "{\"contract\":\"$CONTRACT\",\"status\":\"pass\",\"runtimeUsers\":13,\"allowedSchemaPrivilegesPerUser\":4,\"schemaPrivilegeEntries\":52,\"crossDomainDenied\":156,\"globalPrivilegeEntries\":0}"
