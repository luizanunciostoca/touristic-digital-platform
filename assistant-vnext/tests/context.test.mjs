import test from "node:test";
import assert from "node:assert/strict";
import { AssistantContextAssembler } from "../dist/context/context-assembler.js";
import { FixtureProfileContextProvider } from "../dist/context/profile.js";

test("ContextEnvelope minimizes location and profile when permissions are denied", async () => {
  const clock = { now: () => new Date("2026-09-30T03:00:00.000Z") };
  let seq = 0;
  const ids = { next: (prefix) => prefix + "_" + String(++seq) };
  const provider = new FixtureProfileContextProvider({
    locale: "pt",
    userType: "resident",
    interests: ["gastronomia"],
    preferences: { secret: "never project raw preferences" },
    behavioralHints: ["prefere lugares tranquilos"],
    recentPlaceIds: ["p1"],
    favoritePlaceIds: ["p2"],
    durablePreferenceRefs: ["d1"],
  });
  const assembler = new AssistantContextAssembler(provider, clock, ids);
  const result = await assembler.assemble({
    sessionId: "s1",
    sessionStartedAt: "2026-09-30T02:00:00.000Z",
    conversationId: "c1",
    turnId: "t1",
    inputSource: "keyboard",
    locale: "pt",
    authenticated: false,
    location: {
      latitude: -13.381,
      longitude: -38.913,
      source: "fixture",
      observedAt: "2026-09-30T02:59:00.000Z",
    },
    online: true,
    timezone: "America/Bahia",
    permissionScopes: [],
    locationAllowed: false,
    profileAllowed: false,
    memoryWriteAllowed: false,
    availableCapabilities: [],
  });

  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value.location, null);
  assert.deepEqual(result.value.profile.interests, []);
  assert.equal(result.value.metadata.redactions.includes("location"), true);
  assert.equal(result.value.metadata.redactions.includes("profile"), true);
  assert.equal(result.value.user.userType, "resident");
  assert.match(result.value.metadata.contextFingerprint, /^[a-f0-9]{64}$/u);
});
