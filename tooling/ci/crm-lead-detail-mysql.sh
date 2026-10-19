#!/usr/bin/env bash
# Dedicated to the GitHub-hosted Lead Detail job; never use on a shared DB host.
set -euo pipefail
name="crm-lead-detail-${GITHUB_RUN_ID:?}-${GITHUB_RUN_ATTEMPT:?}"
[[ "$name" =~ ^crm-lead-detail-[0-9]+-[0-9]+$ ]] || exit 2
bounded() { timeout --kill-after=2s "$@"; }
cleanup() {
  # Anonymous MySQL data volume belongs only to this disposable container.
  local existing
  existing=$(bounded 5s docker ps --all --filter "name=^/${name}$" --format '{{.ID}}') || return $?
  if [[ -n "$existing" ]]; then
    bounded 10s docker rm --force --volumes "$name" >/dev/null || return $?
  fi
}
diagnostics() {
  # Never print full inspect (contains environment/password) or health output.
  bounded 5s docker inspect --format \
    'status={{.State.Status}} health={{if .State.Health}}{{.State.Health.Status}}{{end}} exit={{.State.ExitCode}}' "$name" || true
  bounded 5s docker logs --tail 60 "$name" 2>&1 | sed 's/crm-pass/[REDACTED]/g' || true
}
case "${1:-}" in
  cleanup) cleanup; exit ;;
  diagnostics) diagnostics; exit ;;
  ready)
    while :; do
      health=$(bounded 5s docker inspect --format '{{.State.Health.Status}}' "$name") || {
        probe_rc=$?
        echo "MYSQL_HEALTH_PROBE_FAILED exit=$probe_rc" >&2
        exit "$probe_rc"
      }
      case "$health" in
        unhealthy) echo 'MYSQL_HEALTH_UNHEALTHY' >&2; exit 1 ;;
        healthy)
          result=$(bounded 5s docker exec "$name" sh -c \
            'MYSQL_PWD="$MYSQL_ROOT_PASSWORD" exec mysql --protocol=TCP --host=127.0.0.1 --user=root --database=morro_crm --connect-timeout=3 --batch --skip-column-names --execute="SELECT CONCAT(DATABASE(), CHAR(58), 1)"' 2>/dev/null) || {
            probe_rc=$?
            echo "MYSQL_SQL_PROBE_FAILED exit=$probe_rc" >&2
            result=''
          }
          if [[ "$result" == 'morro_crm:1' ]]; then
            echo 'MYSQL_SQL_READY database=morro_crm'; exit 0
          fi ;;
        starting) ;;
        *) echo 'MYSQL_HEALTH_UNKNOWN' >&2; exit 1 ;;
      esac
      sleep 2
    done ;;
  start) ;;
  *) echo 'usage: crm-lead-detail-mysql.sh start|ready|diagnostics|cleanup' >&2; exit 2 ;;
esac
stage=pull
on_exit() {
  rc=$?
  trap - EXIT INT TERM
  if (( rc != 0 )); then
    echo "MYSQL_START_FAILED stage=$stage exit=$rc" >&2
    diagnostics
    cleanup || echo 'MYSQL_CLEANUP_FAILED: always step must retry' >&2
  fi
  exit "$rc"
}
trap on_exit EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
echo 'MYSQL_STAGE pull budget=120s'
bounded 120s docker pull mysql:8.4
stage=create-start
echo 'MYSQL_STAGE create-start budget=30s'
# Same disposable test password as the existing runtime URL; no shell tracing.
export MYSQL_ROOT_PASSWORD=crm-pass
bounded 30s docker run --detach --pull=never --name "$name" \
  --env MYSQL_ROOT_PASSWORD --env MYSQL_DATABASE=morro_crm \
  --publish 127.0.0.1:3306:3306 \
  --health-cmd='MYSQL_PWD="$MYSQL_ROOT_PASSWORD" mysqladmin ping -h 127.0.0.1 --silent' \
  --health-interval=10s --health-timeout=5s --health-retries=10 \
  mysql:8.4 >/dev/null
stage=readiness
echo 'MYSQL_STAGE readiness budget=90s'
bounded 90s bash "$0" ready
echo 'MYSQL_START_READY'
