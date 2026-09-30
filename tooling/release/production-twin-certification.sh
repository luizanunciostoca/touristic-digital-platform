#!/usr/bin/env bash
set -Eeuo pipefail

umask 077

CONTRACT="MORRO-PRODUCTION-TWIN-CERTIFICATION"
CONTRACT_VERSION=1
IMAGE_REPOSITORY="ghcr.io/luizanunciostoca/morro-digital-v2"
MYSQL_IMAGE="mysql:8.4@sha256:0744ee5ef89ce6ccfa13de3e579fe6b9e27f93dd70da9c06d2c908b1b193fb8d"
MYSQL_ALIAS="morro-digital-v2-production-mysql"
HANDLED_FAILURE_EXIT=86

expected_sha="${EXPECTED_SHA:-}"
image_digest="${IMAGE_DIGEST:-}"
image_run_id="${IMAGE_RUN_ID:-}"
candidate_run_id="${CANDIDATE_RUN_ID:-}"
dr_run_id="${DR_RUN_ID:-}"
dr_secret="${PRODUCTION_MYSQL_DR_ENCRYPTION_KEY_V1:-}"

work_root="/tmp/morro-production-twin-${GITHUB_RUN_ID:-local}"
network="morro-production-twin-${GITHUB_RUN_ID:-local}"
mysql_container="morro-production-twin-mysql-${GITHUB_RUN_ID:-local}"
app_container="morro-production-twin-app-${GITHUB_RUN_ID:-local}"
env_file="$work_root/runtime.env"
sql_file="$work_root/production-sample.sql"
dr_key_file="$work_root/dr-key"
root_password="TwinRoot${GITHUB_RUN_ID:-local}A91f4c7e"

fail() {
  local code="$1"
  jq -nc     --arg contract "$CONTRACT"     --arg code "$code"     '{contract:$contract,contractVersion:1,status:"fail",code:$code}' >&2
  exit "$HANDLED_FAILURE_EXIT"
}

cleanup() {
  docker rm -f "$app_container" "$mysql_container" >/dev/null 2>&1 || true
  docker network rm "$network" >/dev/null 2>&1 || true
  docker logout ghcr.io >/dev/null 2>&1 || true
  rm -rf "$work_root"
}
trap cleanup EXIT HUP INT TERM

[[ "$expected_sha" =~ ^[0-9a-f]{40}$ ]] || fail "EXPECTED_SHA_INVALID"
[[ "$image_digest" =~ ^sha256:[0-9a-f]{64}$ ]] || fail "IMAGE_DIGEST_INVALID"
[[ "$image_run_id" =~ ^[0-9]+$ ]] || fail "IMAGE_RUN_ID_INVALID"
[[ "$candidate_run_id" =~ ^[0-9]+$ ]] || fail "CANDIDATE_RUN_ID_INVALID"
[[ "$dr_run_id" =~ ^[0-9]+$ ]] || fail "DR_RUN_ID_INVALID"
[[ "${#dr_secret}" -ge 32 ]] || fail "DR_DECRYPTION_KEY_INVALID"
[[ "$(git rev-parse HEAD)" == "$expected_sha" ]] || fail "CHECKOUT_SHA_MISMATCH"
[[ "$(git ls-remote origin refs/heads/main | awk '{print $1}')" == "$expected_sha" ]] || fail "MAIN_SHA_MISMATCH"

mkdir -p "$work_root/candidate" "$work_root/release" "$work_root/dr"
printf '%s' "$dr_secret" >"$dr_key_file"
chmod 600 "$dr_key_file"

tree_sha="$(git rev-parse "$expected_sha^{tree}")"
lockfile_digest="sha256:$(sha256sum pnpm-lock.yaml | awk '{print $1}')"

candidate_meta="$(gh run view "$candidate_run_id" --json headSha,status,conclusion)"
jq -e --arg sha "$expected_sha" '
  .headSha == $sha and
  .status == "completed" and
  .conclusion == "success"
' <<<"$candidate_meta" >/dev/null || fail "CANDIDATE_RUN_IDENTITY_INVALID"

gh run download "$candidate_run_id" \
  --name "morro-digital-candidate-$expected_sha" \
  --dir "$work_root/candidate"
candidate_manifest="$work_root/candidate/release-candidate-manifest.json"
candidate_archive="$work_root/candidate/morro-digital-candidate.tgz"
[[ -s "$candidate_manifest" && -s "$candidate_archive" ]] \
  || fail "CANDIDATE_ARTIFACT_MISSING"
candidate_artifact_digest="$(jq -r '.artifactDigest // empty' "$candidate_manifest")"
computed_candidate_digest="sha256:$(sha256sum "$candidate_archive" | awk '{print $1}')"
[[ "$computed_candidate_digest" == "$candidate_artifact_digest" ]] \
  || fail "CANDIDATE_ARTIFACT_DIGEST_MISMATCH"
jq -e \
  --arg sha "$expected_sha" \
  --arg tree "$tree_sha" \
  --arg lock "$lockfile_digest" \
  --arg artifact "$candidate_artifact_digest" \
  --arg run "$candidate_run_id" '
    .commitSha == $sha and
    .treeSha == $tree and
    .lockfileDigest == $lock and
    .artifactDigest == $artifact and
    (.workflowRun | endswith("/actions/runs/" + $run))
  ' "$candidate_manifest" >/dev/null || fail "CANDIDATE_MANIFEST_IDENTITY_INVALID"

image_meta="$(gh run view "$image_run_id" --json headSha,event,status,conclusion)"
jq -e --arg sha "$expected_sha" '
  .headSha == $sha and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success"
' <<<"$image_meta" >/dev/null || fail "IMAGE_RUN_IDENTITY_INVALID"

gh run download "$image_run_id"   --name "release-provenance-$expected_sha"   --dir "$work_root/release"
provenance="$work_root/release/release-provenance.json"
[[ -s "$provenance" ]] || fail "RELEASE_PROVENANCE_MISSING"
jq -e   --arg sha "$expected_sha"   --arg tree "$tree_sha"   --arg image "$IMAGE_REPOSITORY"   --arg digest "$image_digest"   --arg run "$image_run_id" '
    .source_sha == $sha and
    .tree_sha == $tree and
    .image == $image and
    .digest == $digest and
    (.image_run_id | tostring) == $run
  ' "$provenance" >/dev/null || fail "RELEASE_PROVENANCE_MISMATCH"

dr_meta="$(gh run view "$dr_run_id" --json headSha,event,status,conclusion)"
jq -e --arg sha "$expected_sha" '
  .headSha == $sha and
  .event == "workflow_dispatch" and
  .status == "completed" and
  .conclusion == "success"
' <<<"$dr_meta" >/dev/null || fail "DR_RUN_IDENTITY_INVALID"

gh run download "$dr_run_id"   --name "production-mysql-backup-restore-proof-$dr_run_id"   --dir "$work_root/dr"
mapfile -t dr_evidence_candidates < <(
  find "$work_root/dr" -type f -name 'production-mysql-backup-restore-evidence.json' -print | sort
)
mapfile -t encrypted_candidates < <(
  find "$work_root/dr" -type f -name 'production-mysql-backup.sql.gz.enc' -print | sort
)
[[ "${#dr_evidence_candidates[@]}" -eq 1 ]] || fail "DR_EVIDENCE_AMBIGUOUS"
[[ "${#encrypted_candidates[@]}" -eq 1 ]] || fail "DR_BACKUP_AMBIGUOUS"
dr_evidence="${dr_evidence_candidates[0]}"
encrypted_backup="${encrypted_candidates[0]}"

jq -e   --arg sha "$expected_sha"   --arg run "$dr_run_id" '
    .status == "pass" and
    .result == "PRODUCTION_MYSQL_BACKUP_RESTORE_PROOF = PASS" and
    .runId == $run and
    .toolSha == $sha and
    .sourceSha == $sha and
    .source.schemaCount == 13 and
    .source.totalTables == 91 and
    .source.stableDuringBackup == true and
    .restore.schemaCount == 13 and
    .restore.totalTables == 91 and
    .restore.rowCountsMatch == true and
    .restore.checksumsMatch == true and
    .restore.leastPrivilegeReadback == true
  ' "$dr_evidence" >/dev/null || fail "DR_EVIDENCE_INVALID"

actual_encrypted_sha="sha256:$(sha256sum "$encrypted_backup" | awk '{print $1}')"
expected_encrypted_sha="$(jq -r '.backup.encryptedSha256' "$dr_evidence")"
[[ "$actual_encrypted_sha" == "$expected_encrypted_sha" ]] || fail "DR_ENCRYPTED_SHA_MISMATCH"

openssl enc -d -aes-256-cbc -pbkdf2 -iter 200000 -md sha256   -pass file:"$dr_key_file"   -in "$encrypted_backup" | gzip -dc >"$sql_file"
actual_plain_sha="sha256:$(sha256sum "$sql_file" | awk '{print $1}')"
expected_plain_sha="$(jq -r '.backup.plaintextSha256' "$dr_evidence")"
[[ "$actual_plain_sha" == "$expected_plain_sha" ]] || fail "DR_PLAINTEXT_SHA_MISMATCH"

printf '%s' "$GH_TOKEN" | docker login ghcr.io -u "${GITHUB_ACTOR:-github-actions}" --password-stdin >/dev/null
image_path="$IMAGE_REPOSITORY@$image_digest"
docker pull "$image_path" >/dev/null
docker image inspect "$image_path" >/dev/null

docker network create --internal "$network" >/dev/null
docker run -d   --name "$mysql_container"   --network "$network"   --network-alias "$MYSQL_ALIAS"   -e "MYSQL_ROOT_PASSWORD=$root_password"   -e "MYSQL_ROOT_HOST=%"   "$MYSQL_IMAGE" >/dev/null

mysql_ready=false
for _ in $(seq 1 90); do
  if docker exec "$mysql_container" mysqladmin ping     --host=127.0.0.1 --user=root --password="$root_password" --silent >/dev/null 2>&1
  then
    mysql_ready=true
    break
  fi
  sleep 1
done
[[ "$mysql_ready" == true ]] || fail "TWIN_MYSQL_NOT_READY"

docker exec -i "$mysql_container"   mysql --user=root --password="$root_password" <"$sql_file"

schema_count="$(docker exec "$mysql_container" mysql   --user=root --password="$root_password" --batch --skip-column-names   -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME LIKE 'morro\\_%' ESCAPE '\\\\';")"
table_count="$(docker exec "$mysql_container" mysql   --user=root --password="$root_password" --batch --skip-column-names   -e "SELECT COUNT(*) FROM information_schema.TABLES WHERE TABLE_SCHEMA LIKE 'morro\\_%' ESCAPE '\\\\' AND TABLE_TYPE='BASE TABLE';")"
[[ "$schema_count" == "13" && "$table_count" == "91" ]] || fail "TWIN_DATABASE_INVENTORY_INVALID"

: >"$env_file"
printf '%s\n'   "NODE_ENV=production"   "HOST=0.0.0.0"   "PORT=3000"   "RENDER_SERVICE_NAME=morro-digital-v2"   "EXPECTED_SHA=$expected_sha"   "MORRO_RELEASE_SHA=$expected_sha"   "MORRO_RELEASE_VERSION=$expected_sha"   "MORRO_DEPLOYMENT_ID=production-twin-${GITHUB_RUN_ID:-local}"   "MORRO_RELEASE_IMAGE_RUN_ID=$image_run_id"   "MORRO_DATABASE_SCHEMA_MODE=external"   "COMMERCE_FEATURE_ENABLED=true"   "DASHBOARD_AUTH_SECRET=twin-dashboard-auth-secret-0123456789abcdef"   "DASHBOARD_AUTH_ORIGIN=https://twin.morro.invalid"   "DASHBOARD_ADMIN_GLOBAL_BYPASS_CONFIRMED=false"   "DASHBOARD_SESSION_TTL_SECONDS=28800"   "CONTROL_CENTER_SUPPORT_SECRET=twin-control-support-secret-0123456789abcdef"   "CONTROL_CENTER_STEP_UP_SECRET=twin-control-step-up-secret-0123456789abcdef"   "ANALYTICS_FEATURE_ENABLED=true"   "ANALYTICS_RETENTION_DAYS=90"   "NOTIFICATIONS_FEATURE_ENABLED=false"   "TICKETING_FEATURE_ENABLED=false"   "TICKETING_OFFLINE_PROVISIONING_SECRET=twin-ticketing-offline-secret-0123456789abcdef"   "ORDERING_PRICING_CATALOG_JSON={\"version\":\"production-twin-v1\",\"plans\":[{\"id\":\"growth\",\"name\":\"Growth\",\"minorUnits\":5000,\"currency\":\"BRL\"}]}"   "PAYMENTS_DESTINATION_ID=morro-de-sao-paulo"   "PAYMENTS_STATUS_TOKEN_SECRET=twin-payment-status-secret-0123456789abcdef"   "PAYMENTS_HANDOFF_SECRET=twin-payment-handoff-secret-0123456789abcdef"   "PAYMENTS_RETURN_URL_ORIGINS=https://twin.morro.invalid"   "PAYMENTS_PROVIDER_MODE=mercado_pago"   "MERCADO_PAGO_CHECKOUT_MODE=test"   "MERCADO_PAGO_TEST_CREDENTIALS_CONFIRMED=true"   "MERCADO_PAGO_PRODUCTION_CREDENTIALS_CONFIRMED=false"   "MERCADO_PAGO_CHECKOUT_ORIGINS=https://sandbox.mercadopago.com"   "V1_PAYMENT_PROVIDER_API_URL=https://api.mercadopago.com"   "MERCADO_PAGO_ACCESS_TOKEN=TEST-TWIN-ACCESS-TOKEN-0123456789abcdef0123456789"   "MERCADO_PAGO_WEBHOOK_SECRET=twin-webhook-secret-0123456789abcdef"   "VITE_MERCADO_PAGO_PUBLIC_KEY=TEST-TWINPUBLICKEY1234567890"   "PAYMENTS_SUBSCRIPTIONS_ENABLED=false"   "PAYMENTS_WEBHOOK_URL=https://twin.morro.invalid/api/payments/v1/webhooks/sandbox"   "PAYMENTS_WEBHOOK_TOLERANCE_SECONDS=300"   "PAYMENTS_PROVIDER_TIMEOUT_MS=8000"   "PAYMENTS_PROVIDER_MAX_ATTEMPTS=2"   "PAYMENTS_PROVIDER_RETRY_BASE_MS=100"   "PAYMENTS_RUNTIME_REPLICA_COUNT=1"   "PAYMENTS_RATE_LIMIT_DISTRIBUTED_STORE_CONFIGURED=false"   "OPENAI_PROVIDER_HARD_LIMIT_CONFIRMED=false"   >"$env_file"

for spec in   AUTH:AUTH_DATABASE_URL:morro_auth   AUDIT:CONTROL_CENTER_AUDIT_DATABASE_URL:morro_audit   DESTINATIONS:DESTINATIONS_DATABASE_URL:morro_destinations   CONTENT:CONTENT_DATABASE_URL:morro_content   BUSINESS:BUSINESS_DATABASE_URL:morro_business   ORDERING:ORDERING_DATABASE_URL:morro_ordering   FINANCIAL:FINANCIAL_DATABASE_URL:morro_financial   TICKETING:TICKETING_DATABASE_URL:morro_ticketing   NOTIFICATIONS:NOTIFICATIONS_DATABASE_URL:morro_notifications   AFFILIATES:AFFILIATES_DATABASE_URL:morro_affiliates   ANALYTICS:ANALYTICS_DATABASE_URL:morro_analytics   CRM:CRM_DATABASE_URL:morro_crm   COMMERCE:COMMERCE_DATABASE_URL:morro_commerce
do
  domain="${spec%%:*}"
  rest="${spec#*:}"
  env_key="${rest%%:*}"
  schema="${rest#*:}"
  user="${schema}_runtime"
  password="Twin${GITHUB_RUN_ID:-local}${domain}9f4a7c2e"

  docker exec "$mysql_container" mysql     --user=root --password="$root_password"     -e "CREATE USER IF NOT EXISTS '${user}'@'%' IDENTIFIED BY '${password}'; ALTER USER '${user}'@'%' IDENTIFIED BY '${password}'; GRANT SELECT, INSERT, UPDATE, DELETE ON \`${schema}\`.* TO '${user}'@'%';" >/dev/null

  printf '%s=mysql://%s:%s@%s:3306/%s\n'     "$env_key" "$user" "$password" "$MYSQL_ALIAS" "$schema" >>"$env_file"
done

docker exec "$mysql_container" mysql --user=root --password="$root_password"   -e "FLUSH PRIVILEGES;" >/dev/null

auth_hash="$(docker run --rm --network none "$image_path" node --input-type=module -e   "import('./services/auth/dist/credentials.js').then(m=>console.log(m.hashPassword('production twin password',Buffer.alloc(16,7))))")"
users_json="$(jq -nc --arg hash "$auth_hash" '[{id:"production-twin-owner",email:"production-twin@example.invalid",passwordHash:$hash,role:"BUSINESS_OWNER",businessIds:["production-twin"]}]')"
printf 'DASHBOARD_USERS_JSON=%s\n' "$users_json" >>"$env_file"

docker run --rm   --network "$network"   --env-file "$env_file"   "$image_path"   node apps/morro-digital-platform/tooling/production-runtime-database-predeploy.mjs   >"$work_root/runtime-predeploy.json"
jq -e '
  .contract == "MORRO-PRODUCTION-RUNTIME-DATABASE-PREDEPLOY" and
  .status == "pass" and
  .domainCount == 13 and
  .totalTables == 91 and
  .schemaMode == "external"
' "$work_root/runtime-predeploy.json" >/dev/null || fail "TWIN_RUNTIME_PREDEPLOY_INVALID"

docker run --rm   --network "$network"   --env-file "$env_file"   "$image_path"   node apps/morro-digital-platform/tooling/payments-migrate.mjs   >"$work_root/payments-predeploy.json"
jq -e '
  .contract == "PAYMENTS-PREDEPLOY" and
  .status == "pass" and
  .checkoutMode == "test" and
  .productionAuthorized == false and
  .productionCredentialsConfirmed == false and
  .subscriptionsEnabled == false
' "$work_root/payments-predeploy.json" >/dev/null || fail "TWIN_PAYMENT_BOUNDARY_INVALID"

start_app() {
  docker run -d \
    --name "$app_container" \
    --network "$network" \
    --env-file "$env_file" \
    "$image_path" >/dev/null
}

container_request() {
  local method="$1"
  local path="$2"
  local payload="${3:-}"
  docker exec "$app_container" \
    node --input-type=module -e '
      const [method, path, payload] = process.argv.slice(1);
      const options = {
        method,
        headers: {
          Accept: "*/*",
          Origin: "http://127.0.0.1:3000",
          "Cache-Control": "no-cache",
        },
      };
      if (method !== "GET") {
        options.headers["Content-Type"] = "application/json";
        options.body = payload;
      }
      try {
        const response = await fetch("http://127.0.0.1:3000" + path, options);
        const body = await response.text();
        process.stdout.write(JSON.stringify({ status: response.status, body }));
      } catch {
        process.exitCode = 2;
      }
    ' "$method" "$path" "$payload"
}

capture_request() {
  local method="$1"
  local path="$2"
  local output="$3"
  local payload="${4:-}"
  local response
  response="$(container_request "$method" "$path" "$payload")" || return 1
  jq -e '.status >= 200 and .status < 600 and (.body | type == "string")' \
    <<<"$response" >/dev/null || return 1
  jq -r '.body' <<<"$response" >"$output"
  jq -r '.status' <<<"$response"
}

wait_app() {
  local ready=false
  local status=""
  for _ in $(seq 1 90); do
    if status="$(capture_request GET /healthz "$work_root/healthz.json" 2>/dev/null)" &&
      [[ "$status" == "200" ]]
    then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    docker logs "$app_container" >&2 || true
    cat "$work_root/healthz.json" >&2 2>/dev/null || true
    fail "TWIN_APP_HEALTH_TIMEOUT"
  fi

  ready=false
  for _ in $(seq 1 90); do
    if status="$(capture_request GET /readyz "$work_root/readyz.json" 2>/dev/null)" &&
      [[ "$status" == "200" ]]
    then
      ready=true
      break
    fi
    sleep 1
  done
  if [[ "$ready" != true ]]; then
    docker logs "$app_container" >&2 || true
    cat "$work_root/readyz.json" >&2 2>/dev/null || true
    fail "TWIN_APP_READINESS_TIMEOUT"
  fi

  jq -e '
    .readiness == "ready" and
    .status == "healthy" and
    ([.checks[] | select(.status != "pass")] | length) == 0 and
    ([.checks[] | select(.name == "commerce-runtime" and .status == "pass")] | length) == 1
  ' "$work_root/readyz.json" >/dev/null || fail "TWIN_APP_READINESS_DEGRADED"
}

post_event() {
  local output="$1"
  local payload
  payload="$(cat "$work_root/event.json")"
  capture_request POST /api/analytics/v1/events "$output" "$payload"
}

start_app
wait_app
health_status="$(capture_request GET /healthz "$work_root/healthz.json")"
[[ "$health_status" == "200" ]] || fail "TWIN_APP_HEALTH_INVALID"
expected_deployment_id="production-twin-${GITHUB_RUN_ID:-local}"
jq -e \
  --arg sha "$expected_sha" \
  --arg version "$expected_sha" \
  --arg deployment "$expected_deployment_id" \
  --arg imageRun "$image_run_id" '
    .status == "live" and
    .release.sha == $sha and
    .release.version == $version and
    .release.deploymentId == $deployment and
    .release.imageRunId == $imageRun
  ' "$work_root/healthz.json" >/dev/null || fail "TWIN_RELEASE_IDENTITY_INVALID"
frontend_status="$(capture_request GET / "$work_root/frontend.html")"
[[ "$frontend_status" == "200" ]] || fail "TWIN_FRONTEND_HTTP_FAILED"
[[ -s "$work_root/frontend.html" ]] || fail "TWIN_FRONTEND_EMPTY"

event_id="production-twin-${GITHUB_RUN_ID:-local}"
event_time="$(date -u +%Y-%m-%dT%H:%M:%S.000Z)"
jq -n   --arg eventId "$event_id"   --arg occurredAt "$event_time"   '{
    schemaVersion:"1",
    eventId:$eventId,
    name:"session_started",
    occurredAt:$occurredAt,
    sessionId:("session-" + $eventId),
    destinationId:"morro-de-sao-paulo",
    locale:"pt-BR",
    source:"production-twin",
    attributes:{entryPoint:"production_twin",returningVisitor:false}
  }' >"$work_root/event.json"

write_status="$(post_event "$work_root/write.json")"
if [[ "$write_status" != "201" ]]; then
  write_error="$(jq -r '.error // "UNKNOWN"' "$work_root/write.json" 2>/dev/null || printf 'INVALID_RESPONSE')"
  jq -nc --arg status "$write_status" --arg code "$write_error"     '{contract:"MORRO-PRODUCTION-TWIN-PROBE",probe:"analytics-write",status:$status,code:$code}' >&2
  fail "TWIN_API_WRITE_FAILED"
fi
jq -e '.data.status == "stored" and (.data.eventId | length > 0)'   "$work_root/write.json" >/dev/null || fail "TWIN_API_WRITE_EVIDENCE_INVALID"

readback_status="$(post_event "$work_root/readback.json")"
[[ "$readback_status" == "200" ]] || fail "TWIN_API_READBACK_FAILED"
jq -e '.data.status == "replayed"' "$work_root/readback.json" >/dev/null   || fail "TWIN_API_READBACK_EVIDENCE_INVALID"

reload_http_status="$(capture_request GET / "$work_root/reload.html")"
[[ "$reload_http_status" == "200" ]] || fail "TWIN_RELOAD_HTTP_FAILED"
reload_status="$(post_event "$work_root/reload-readback.json")"
[[ "$reload_status" == "200" ]] || fail "TWIN_RELOAD_READBACK_FAILED"
jq -e '.data.status == "replayed"' "$work_root/reload-readback.json" >/dev/null   || fail "TWIN_RELOAD_EVIDENCE_INVALID"

new_session_status="$(post_event "$work_root/new-session-readback.json")"
[[ "$new_session_status" == "200" ]] || fail "TWIN_NEW_SESSION_READBACK_FAILED"
jq -e '.data.status == "replayed"' "$work_root/new-session-readback.json" >/dev/null   || fail "TWIN_NEW_SESSION_EVIDENCE_INVALID"

db_rows="$(docker exec "$mysql_container" mysql   --user=root --password="$root_password" --batch --skip-column-names   morro_analytics   -e "SELECT COUNT(*) FROM analytics_events WHERE event_id='${event_id}';")"
[[ "$db_rows" == "1" ]] || fail "TWIN_DATABASE_READBACK_INVALID"

docker rm -f "$app_container" >/dev/null
start_app
wait_app
redeploy_status="$(post_event "$work_root/redeploy-readback.json")"
[[ "$redeploy_status" == "200" ]] || fail "TWIN_REDEPLOY_READBACK_FAILED"
jq -e '.data.status == "replayed"' "$work_root/redeploy-readback.json" >/dev/null   || fail "TWIN_REDEPLOY_EVIDENCE_INVALID"

db_rows_after_redeploy="$(docker exec "$mysql_container" mysql   --user=root --password="$root_password" --batch --skip-column-names   morro_analytics   -e "SELECT COUNT(*) FROM analytics_events WHERE event_id='${event_id}';")"
[[ "$db_rows_after_redeploy" == "1" ]] || fail "TWIN_REDEPLOY_DATABASE_READBACK_INVALID"

jq -n   --arg expectedSha "$expected_sha"   --arg treeSha "$tree_sha"   --arg imageRepository "$IMAGE_REPOSITORY"   --arg imageDigest "$image_digest"   --arg imageRunId "$image_run_id"   --arg candidateRunId "$candidate_run_id"   --arg candidateArtifactDigest "$candidate_artifact_digest"   --arg lockfileDigest "$lockfile_digest"   --arg drRunId "$dr_run_id"   --arg drEncryptedSha "$actual_encrypted_sha"   --arg drPlainSha "$actual_plain_sha"   --arg mysqlImage "$MYSQL_IMAGE"   --arg eventId "$event_id"   --argjson runtimePredeploy "$(cat "$work_root/runtime-predeploy.json")"   --argjson paymentsPredeploy "$(cat "$work_root/payments-predeploy.json")"   '{
    contract:"MORRO-PRODUCTION-TWIN-CERTIFICATION",
    contractVersion:1,
    status:"pass",
    expectedSha:$expectedSha,
    treeSha:$treeSha,
    candidate:{
      runId:$candidateRunId,
      artifactDigest:$candidateArtifactDigest,
      lockfileDigest:$lockfileDigest
    },
    image:{
      repository:$imageRepository,
      digest:$imageDigest,
      runId:$imageRunId,
      immutable:true
    },
    productionSample:{
      source:"encrypted-production-dr-artifact",
      drRunId:$drRunId,
      encryptedSha256:$drEncryptedSha,
      plaintextSha256:$drPlainSha,
      schemaCount:13,
      totalTables:91
    },
    twin:{
      mysqlImage:$mysqlImage,
      isolatedDockerNetwork:true,
      noEgress:true,
      authHelperNetwork:"none",
      runtimeProbe:"docker-exec-loopback",
      syntheticReleaseIdentity:true,
      healthyReadiness:true,
      productionHostnameAlias:true,
      frontendHttp:true,
      backendApi:"/api/analytics/v1/events",
      runtimePredeploy:$runtimePredeploy,
      paymentsPredeploy:$paymentsPredeploy
    },
    persistence:{
      probeEventId:$eventId,
      write:"stored",
      readback:"replayed",
      reloadReadback:"replayed",
      newSessionReadback:"replayed",
      redeployReadback:"replayed",
      databaseRows:1,
      databaseRowsAfterRedeploy:1,
      survivedRedeploy:true
    },
    safety:{
      productionMutation:false,
      renderMutation:false,
      railwayTouched:false,
      paymentsMode:"test",
      productionCredentialsConfirmed:false,
      subscriptionsEnabled:false,
      plaintextUploaded:false
    },
    result:"PRODUCTION_TWIN_CERTIFICATION = PASS"
  }' > production-twin-certification-evidence.json

jq -e '
  .status == "pass" and
  (.candidate.artifactDigest | test("^sha256:[0-9a-f]{64}$")) and
  (.candidate.lockfileDigest | test("^sha256:[0-9a-f]{64}$")) and
  .image.immutable == true and
  .twin.noEgress == true and
  .twin.authHelperNetwork == "none" and
  .twin.runtimeProbe == "docker-exec-loopback" and
  .twin.syntheticReleaseIdentity == true and
  .twin.healthyReadiness == true and
  .twin.runtimePredeploy.status == "pass" and
  .twin.paymentsPredeploy.checkoutMode == "test" and
  .persistence.survivedRedeploy == true and
  .safety.productionMutation == false and
  .safety.renderMutation == false and
  .safety.railwayTouched == false and
  .safety.productionCredentialsConfirmed == false and
  .safety.subscriptionsEnabled == false and
  .safety.plaintextUploaded == false
' production-twin-certification-evidence.json >/dev/null || fail "TWIN_EVIDENCE_INVALID"

cat production-twin-certification-evidence.json
