#!/bin/sh
set -eu

DOMAINS="AUTH AUDIT DESTINATIONS CONTENT BUSINESS ORDERING FINANCIAL TICKETING NOTIFICATIONS AFFILIATES ANALYTICS CRM COMMERCE"
sql_file="/dev/shm/morro-runtime-users.sql"
umask 077
: > "$sql_file"

sql_escape() {
  printf '%s' "$1" | sed -e 's/\\/\\\\/g' -e "s/'/''/g"
}

for domain in $DOMAINS; do
  eval "database=\${${domain}_DATABASE_NAME:-}"
  eval "runtime_user=\${${domain}_RUNTIME_DATABASE_USER:-}"
  eval "runtime_password=\${${domain}_RUNTIME_DATABASE_PASSWORD:-}"

  if [ -z "$database" ] || [ -z "$runtime_user" ] || [ -z "$runtime_password" ]; then
    echo "production-mysql-runtime-users: missing runtime credential material for $domain" >&2
    exit 1
  fi

  case "$database:$runtime_user" in
    *[!A-Za-z0-9_:]*)
      echo "production-mysql-runtime-users: invalid SQL identifier for $domain" >&2
      exit 1
      ;;
  esac

  expected_user="${database}_runtime"
  if [ "$runtime_user" != "$expected_user" ]; then
    echo "production-mysql-runtime-users: unexpected runtime user for $domain" >&2
    exit 1
  fi

  escaped_password="$(sql_escape "$runtime_password")"
  cat >> "$sql_file" <<SQL
CREATE USER IF NOT EXISTS '$runtime_user'@'%' IDENTIFIED BY '$escaped_password';
ALTER USER '$runtime_user'@'%' IDENTIFIED BY '$escaped_password';
REVOKE ALL PRIVILEGES, GRANT OPTION FROM '$runtime_user'@'%';
GRANT SELECT, INSERT, UPDATE, DELETE ON \`$database\`.* TO '$runtime_user'@'%';
SQL
done

chown mysql:mysql "$sql_file"
chmod 0400 "$sql_file"

echo "production-mysql-runtime-users: prepared 13 schema-scoped DML runtime identities"
exec /usr/local/bin/docker-entrypoint.sh "$@" --init-file="$sql_file"
