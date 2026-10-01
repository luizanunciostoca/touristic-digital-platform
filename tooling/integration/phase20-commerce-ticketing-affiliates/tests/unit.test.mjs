import assert from "node:assert/strict";
import test from "node:test";
import {
  assertLaneCContractRegistry,
  laneCContractById,
  laneCContracts,
} from "../contract-registry.mjs";
import {
  InMemoryLaneCMutationStore,
  LaneCMutationCoordinator,
  withBoundedDatabaseRetry,
} from "../safe-mutation.mjs";

function context(overrides = {}) {
  return {
    subject: "affiliate:user-001",
    authState: "active",
    authzVersion: 7,
    role: "editor",
    capabilities: [
      "commerce.transport.reserve",
      "business.reservations.manage",
      "affiliate.self_onboard",
      "affiliate.referral_qr.issue",
    ],
    tenantId: "tenant-morro",
    businessIds: ["biz-morro"],
    destinationIds: ["morro-de-sao-paulo"],
    origin: "https://morro.example",
    expectedOrigin: "https://morro.example",
    csrfToken: "lane-c-csrf-token-0001",
    expectedCsrfToken: "lane-c-csrf-token-0001",
    executionMode: "LOCAL_PROOF",
    nowMs: 1_800_000_000_000,
    ...overrides,
  };
}

const onboarding = {
  contractId: "IF-AFF-002",
  action: "affiliate.self_onboard",
  tenantId: "tenant-morro",
  destinationId: "morro-de-sao-paulo",
  payload: {
    accountType: "person",
    roleCategory: "guide",
    programId: "program-morro",
    acceptedTermsVersion: "terms-v1",
  },
};

test("blocked contract registry remains fail-closed", () => {
  assert.equal(assertLaneCContractRegistry(), true);
  assert.deepEqual(
    laneCContracts.map((entry) => [entry.interfaceId, entry.classification]),
    [
      ["IF-COM-005", "VERSIONED_CONTRACT_REQUIRED"],
      ["IF-COM-006", "NEW_CANONICAL_CAPABILITY_REQUIRED"],
      ["IF-BIZ-010", "VERSIONED_CONTRACT_REQUIRED"],
      ["IF-AFF-002", "VERSIONED_CONTRACT_REQUIRED"],
      ["IF-AFF-006", "VERSIONED_CONTRACT_REQUIRED"],
    ],
  );
  assert.ok(
    laneCContracts.every(
      (entry) =>
        entry.ownerApproved === false &&
        entry.versionedContractApproved === false &&
        entry.runtimeBindingEnabled === false &&
        entry.productionAuthorized === false,
    ),
  );
  assert.equal(laneCContractById("IF-BIZ-010").laneOwnership, "REVALIDATION_ONLY_LANE_B_OWNER");
});

test("PREPARE -> CONFIRM -> EXECUTE is explicit and replay-safe", async () => {
  const store = new InMemoryLaneCMutationStore();
  const coordinator = new LaneCMutationCoordinator({
    store,
    uuid: () => "11111111-1111-4111-8111-111111111111",
  });
  const prepared = await coordinator.prepare(onboarding, context());
  assert.equal(prepared.state, "PREPARED");
  assert.equal(prepared.ownerApproved, false);
  assert.equal(prepared.versionedContractApproved, false);
  await assert.rejects(
    () =>
      coordinator.execute(
        prepared.preparationId,
        "lane_c_idem_001",
        context(),
        async () => ({ status: "IMPOSSIBLE" }),
      ),
    /CONFIRM_REQUIRED/u,
  );

  const confirmed = await coordinator.confirm(prepared.preparationId, context(), "CONFIRM");
  assert.equal(confirmed.state, "CONFIRMED");

  let effects = 0;
  const first = await coordinator.execute(
    prepared.preparationId,
    "lane_c_idem_001",
    context(),
    async (request) => {
      effects += 1;
      assert.equal(request.executionMode, "LOCAL_PROOF");
      assert.equal(request.externalProviderCallsAllowed, false);
      assert.equal(request.financialAuthority, false);
      assert.equal(request.moneyTruthOwner, "Financial");
      assert.equal(request.affiliateAttributionOwner, "Affiliates");
      assert.equal(request.commerceLifecycleOwner, "Commerce");
      assert.equal(request.ticketingLifecycleOwner, "Ticketing");
      return { status: "LOCAL_PROOF_EXECUTED", authority: "NONE" };
    },
  );
  assert.equal(first.replayed, false);

  const replay = await coordinator.execute(
    prepared.preparationId,
    "lane_c_idem_001",
    context(),
    async () => {
      effects += 1;
      return { status: "DUPLICATE" };
    },
  );
  assert.equal(replay.replayed, true);
  assert.equal(effects, 1);
});

test("origin, CSRF, capability, auth, tenant, destination and business scopes fail closed", async () => {
  const cases = [
    [context({ subject: "" }), /AUTH_REQUIRED/u],
    [context({ authState: "revoked" }), /AUTH_REVOKED/u],
    [context({ role: "viewer" }), /READ_ONLY_ROLE/u],
    [context({ capabilities: [] }), /CAPABILITY_DENIED/u],
    [context({ origin: "https://evil.invalid" }), /ORIGIN_DENIED/u],
    [context({ csrfToken: "" }), /INVALID_CSRF/u],
    [context({ tenantId: "tenant-other" }), /WRONG_TENANT/u],
    [context({ destinationIds: ["itacare"] }), /WRONG_DESTINATION/u],
  ];
  for (const [ctx, expected] of cases) {
    const coordinator = new LaneCMutationCoordinator({
      store: new InMemoryLaneCMutationStore(),
    });
    await assert.rejects(() => coordinator.prepare(onboarding, ctx), expected);
  }

  const coordinator = new LaneCMutationCoordinator({
    store: new InMemoryLaneCMutationStore(),
  });
  await assert.rejects(
    () =>
      coordinator.prepare(
        {
          contractId: "IF-BIZ-010",
          action: "business.reservations.manage",
          tenantId: "tenant-morro",
          destinationId: "morro-de-sao-paulo",
          businessId: "biz-other",
          payload: { reservationId: "reservation-001" },
        },
        context(),
      ),
    /WRONG_BUSINESS/u,
  );
});

test("stale authorization is rejected after prepare", async () => {
  const coordinator = new LaneCMutationCoordinator({
    store: new InMemoryLaneCMutationStore(),
    uuid: () => "22222222-2222-4222-8222-222222222222",
  });
  const prepared = await coordinator.prepare(onboarding, context());
  await assert.rejects(
    () => coordinator.confirm(prepared.preparationId, context({ authzVersion: 8 })),
    /STALE_AUTHORIZATION/u,
  );
});

test("runtime binding remains disabled even after confirmation", async () => {
  const coordinator = new LaneCMutationCoordinator({
    store: new InMemoryLaneCMutationStore(),
    uuid: () => "33333333-3333-4333-8333-333333333333",
  });
  const prepared = await coordinator.prepare(onboarding, context());
  await coordinator.confirm(prepared.preparationId, context());
  await assert.rejects(
    () =>
      coordinator.execute(
        prepared.preparationId,
        "lane_c_runtime_001",
        context({ executionMode: "RUNTIME" }),
        async () => ({ status: "NO" }),
      ),
    /RUNTIME_BINDING_NOT_APPROVED/u,
  );
});

test("same key with changed semantics is rejected", async () => {
  const store = new InMemoryLaneCMutationStore();
  let n = 0;
  const coordinator = new LaneCMutationCoordinator({
    store,
    uuid: () => "44444444-4444-4444-8444-" + String(++n).padStart(12, "0"),
  });

  const first = await coordinator.prepare(onboarding, context());
  await coordinator.confirm(first.preparationId, context());
  await coordinator.execute(
    first.preparationId,
    "lane_c_conflict_001",
    context(),
    async () => ({ status: "FIRST", authority: "NONE" }),
  );

  const second = await coordinator.prepare(
    {
      ...onboarding,
      payload: { ...onboarding.payload, roleCategory: "hotel" },
    },
    context(),
  );
  await coordinator.confirm(second.preparationId, context());
  await assert.rejects(
    () =>
      coordinator.execute(
        second.preparationId,
        "lane_c_conflict_001",
        context(),
        async () => ({ status: "SECOND" }),
      ),
    /IDEMPOTENCY_CONFLICT/u,
  );
});

test("affiliate payload and result cannot mint financial authority", async () => {
  const coordinator = new LaneCMutationCoordinator({
    store: new InMemoryLaneCMutationStore(),
    uuid: () => "55555555-5555-4555-8555-555555555555",
  });

  await assert.rejects(
    () =>
      coordinator.prepare(
        { ...onboarding, payload: { nested: { commissionMinor: 5000 } } },
        context(),
      ),
    /AFFILIATE_FINANCIAL_AUTHORITY_FORBIDDEN/u,
  );

  const prepared = await coordinator.prepare(onboarding, context());
  await coordinator.confirm(prepared.preparationId, context());
  await assert.rejects(
    () =>
      coordinator.execute(
        prepared.preparationId,
        "lane_c_authority_001",
        context(),
        async () => ({ payout: { status: "created" } }),
      ),
    /RESULT_AUTHORITY_ESCALATION_FORBIDDEN/u,
  );
});

test("IF-COM-006 remains blocked until a canonical lodging capability exists", async () => {
  const coordinator = new LaneCMutationCoordinator({
    store: new InMemoryLaneCMutationStore(),
  });
  await assert.rejects(
    () =>
      coordinator.prepare(
        {
          contractId: "IF-COM-006",
          action: "lodging.reserve",
          tenantId: "tenant-morro",
          destinationId: "morro-de-sao-paulo",
          payload: { roomId: "room-001" },
        },
        context({
          capabilities: [...context().capabilities, "commerce.lodging.reserve"],
        }),
      ),
    /NEW_CANONICAL_CAPABILITY_REQUIRED/u,
  );
});

test("bounded database retry retries only bounded transient failures", async () => {
  let attempts = 0;
  const value = await withBoundedDatabaseRetry(
    async () => {
      attempts += 1;
      if (attempts < 3) {
        const error = new Error("deadlock");
        error.code = "ER_LOCK_DEADLOCK";
        throw error;
      }
      return "ok";
    },
    { maxAttempts: 3 },
  );
  assert.equal(value, "ok");
  assert.equal(attempts, 3);

  let semanticAttempts = 0;
  await assert.rejects(
    () =>
      withBoundedDatabaseRetry(async () => {
        semanticAttempts += 1;
        throw new Error("WRONG_DESTINATION");
      }),
    /WRONG_DESTINATION/u,
  );
  assert.equal(semanticAttempts, 1);
});

test("concurrent duplicate execution permits exactly one local proof effect", async () => {
  const store = new InMemoryLaneCMutationStore();
  const coordinator = new LaneCMutationCoordinator({
    store,
    uuid: () => "66666666-6666-4666-8666-666666666666",
  });
  const prepared = await coordinator.prepare(onboarding, context());
  await coordinator.confirm(prepared.preparationId, context());

  let effects = 0;
  const attempts = await Promise.allSettled(
    Array.from({ length: 12 }, () =>
      coordinator.execute(
        prepared.preparationId,
        "lane_c_concurrent_001",
        context(),
        async () => {
          effects += 1;
          await new Promise((resolve) => setTimeout(resolve, 25));
          return { status: "ONCE", authority: "NONE" };
        },
      ),
    ),
  );

  assert.equal(effects, 1);
  assert.ok(attempts.some((entry) => entry.status === "fulfilled"));
  assert.ok(
    attempts.every(
      (entry) =>
        entry.status === "fulfilled" ||
        (entry.reason instanceof Error && /IDEMPOTENCY_IN_FLIGHT/u.test(entry.reason.message)),
    ),
  );
});
