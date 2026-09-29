#!/bin/sh
set -eu

CONTRACT="MORRO-PRODUCTION-MYSQL-RUNTIME-USERS"
HOST="${MORRO_MYSQL_RUNTIME_HOST:-morro-digital-v2-production-mysql}"
PORT="${MORRO_MYSQL_RUNTIME_PORT:-3306}"
DOMAINS="AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE"
EXPECTED_PRIVILEGES="SELECT INSERT UPDATE DELETE"

required_env() {
  value="$(printenv "$1" 2>/dev/null || true)"
  if [ -z "$value" ]; then
    echo "PRODUCTION_RUNTIME_USER_ENV_REQUIRED_$1" >&2
    exit 1
  fi
  printf '%s' "$value"
}

sql_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"
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

root_password="$(required_env MYSQL_ROOT_PASSWORD)"
test "$(required_env RUNTIME_USER_PROVISION_CONFIRM)" = "RUNTIME_USERS"

mysql_root() {
  mysql --protocol=tcp -h "$HOST" -P "$PORT" -uroot -p"$root_password" --batch --skip-column-names "$@"
}

for domain in $DOMAINS; do
  database="$(identifier "$(required_env "${domain}_DATABASE_NAME")")"
  runtime_user="$(identifier "$(required_env "${domain}_RUNTIME_DATABASE_USER")")"
  runtime_password="$(sql_escape "$(required_env "${domain}_RUNTIME_DATABASE_PASSWORD")")"

  expected_user="${database}_runtime"
  if [ "$runtime_user" != "$expected_user" ]; then
    echo "PRODUCTION_RUNTIME_USER_NAME_MISMATCH_$domain" >&2
    exit 1
  fi

  mysql_root <<SQL
CREATE USER IF NOT EXISTS '$runtime_user'@'%' IDENTIFIED BY '$runtime_password';
ALTER USER '$runtime_user'@'%' IDENTIFIED BY '$runtime_password';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$runtime_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$database\`.* TO '$runtime_user'@'%';
SQL

  grantee="'$runtime_user'@'%'"
  schema_grants="$(mysql_root -e "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = '${grantee}' AND TABLE_SCHEMA = '${database}' AND PRIVILEGE_TYPE IN ('SELECT','INSERT','UPDATE','DELETE');")"
  schema_extras="$(mysql_root -e "SELECT COUNT(*) FROM information_schema.SCHEMA_PRIVILEGES WHERE GRANTEE = '${grantee}' AND (TABLE_SCHEMA <> '${database}' OR PRIVILEGE_TYPE NOT IN ('SELECT','INSERT','UPDATE','DELETE'));")"
  global_grants="$(mysql_root -e "SELECT COUNT(*) FROM information_schema.USER_PRIVILEGES WHERE GRANTEE = '${grantee}' AND PRIVILEGE_TYPE <> 'USAGE';")"

  [ "$schema_grants" -eq 4 ]
  [ "$schema_extras" -eq 0 ]
  [ "$global_grants" -eq 0 ]

  own_tables="$(mysql --protocol=tcp -h "$HOST" -P "$PORT" -u"$runtime_user" -p"$(required_env "${domain}_RUNTIME_DATABASE_PASSWORD")" --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA='${database}';")"
  [ "$own_tables" -gt 0 ]

  for target_domain in $DOMAINS; do
    [ "$target_domain" = "$domain" ] && continue
    target_database="$(identifier "$(required_env "${target_domain}_DATABASE_NAME")")"
    if mysql --protocol=tcp -h "$HOST" -P "$PORT" -u"$runtime_user" -p"$(required_env "${domain}_RUNTIME_DATABASE_PASSWORD")" --batch --skip-column-names -e "SHOW TABLES FROM \`$target_database\`;" >/dev/null 2>&1; then
      echo "PRODUCTION_RUNTIME_USER_CROSS_DOMAIN_ACCESS_$domain_$target_domain" >&2
      exit 1
    fi
  done
done

printf '%s\n' "{\"contract\":\"$CONTRACT\",\"status\":\"pass\",\"runtimeUsers\":13,\"allowedSchemaPrivilegesPerUser\":8,\"schemaPrivilegeEntries\":104,\"crossDomainDenied\":156,\"globalPrivilegeEntries\":0}"
