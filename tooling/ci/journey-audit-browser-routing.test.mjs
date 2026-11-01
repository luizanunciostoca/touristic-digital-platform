import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { matchesPath } from "./suite-scheduler.mjs";

const app = "apps/morro-digital-platform/";
const pair = (stem) => [app + stem + ".test.ts", app + stem + ".ts"];
const shell = pair("src/runtime/shell-v1-i18n");
const adapter = pair("src/assistant/assistant-domain-adapter");
const weatherCopy = pair("src/assistant/assistant-weather-copy");
const catalog = pair("src/config/tour-catalog");
const conversation = [
  "dialog-controller.presentation-language.test.ts",
  "dialog-controller.test.ts",
  "dialog-controller.ts",
  "intent-engine.more-info-i18n.test.ts",
  "intent-engine.ts",
].map((file) => "packages/assistant/src/" + file);
const tourImages = [
  "quadriciclo_stop1_base.jpg",
  "quadriciclo_stop2_quarta_quinta_praia.jpg",
  "quadriciclo_stop3_mata_atlantica.jpg",
  "quadriciclo_stop4_mirante_zimbo.jpg",
  "quadriciclo_stop5_garapua.jpg",
  "trilha_gamboa_stop1_fonte_grande.jpg",
  "trilha_gamboa_stop2_porto_cima.jpg",
  "trilha_gamboa_stop3_ponta_pedra.jpg",
  "trilha_gamboa_stop4_paredao_argila.jpg",
  "trilha_gamboa_stop5_gamboa.jpg",
  "volta_ilha_stop1_terceira_praia.jpg",
  "volta_ilha_stop2_garapua.jpg",
  "volta_ilha_stop3_morere.jpg",
  "volta_ilha_stop4_cueira_boipeba.jpg",
  "volta_ilha_stop5_rio_inferno.jpg",
  "volta_ilha_stop6_ostras.jpg",
  "volta_ilha_stop7_cairu.jpg",
  "volta_ilha_stop8_por_do_sol.jpg",
].map((file) => app + "public/images/tours/" + file);
const operatorTest = app + "tooling/ticketing-operator-authorization.test.mjs";
const loginWorkflow = ".github/workflows/auth-login-browser-contract.yml";
const legacyBranch = "feat/fast-safe-continuous-assistant-20260924";
const defaultTypes = ["opened", "synchronize", "reopened"];
const reviewTypes = [...defaultTypes, "ready_for_review", "converted_to_draft"];

// This explicit contract works before the impact associations are integrated.
// It must not derive expected routes from the implementation being admitted.
const contracts = [
  {
    workflow: "assistant-conversation-continuity-browser-contract.yml",
    paths: shell,
    historical: "packages/assistant/src/intent-engine.ts",
    push: legacyBranch,
  },
  {
    workflow: "assistant-input-menu-flow-v1-parity.yml",
    paths: shell,
    historical: "packages/search/src/index.ts",
  },
  {
    workflow: "weather-v1-i18n-browser-parity.yml",
    paths: [...adapter, ...weatherCopy],
    historical: app + "src/weather/weather-widget.ts",
  },
  {
    workflow: "map-tour-browser-regression.yml",
    paths: [...tourImages, catalog[0]],
    historical: catalog[1],
    push: "main",
  },
  {
    workflow: "v1-tour-responsive-browser-regression.yml",
    paths: [...tourImages, ...catalog],
    historical: app + "public/styles.css",
  },
  {
    workflow: "home-discover-manual-conformance.yml",
    paths: [...tourImages, ...catalog, ...shell],
    historical: app + "src/browser-entry.ts",
    types: reviewTypes.slice(0, 4),
  },
  {
    workflow: "navigation-accessibility-baseline.yml",
    paths: [...adapter, ...conversation],
    historical: "packages/navigation/src/index.ts",
  },
  {
    workflow: "navigation-turn-by-turn-parity.yml",
    paths: [...shell, ...conversation],
    historical: "packages/navigation/src/index.ts",
  },
  {
    workflow: "commerce-browser-regression.yml",
    paths: [operatorTest],
    historical: "services/ticketing/src/index.ts",
  },
  {
    workflow: "payments-browser-checkout-contract.yml",
    paths: [operatorTest],
    historical: "services/financial/src/mysql-verified-payment-result-feed.ts",
    push: "main",
  },
  {
    workflow: "affiliates-feature-0010-contract.yml",
    paths: [loginWorkflow],
    historical: "services/affiliates/src/index.ts",
    types: null,
  },
  {
    workflow: "crm-platform-auth-integration-contract.yml",
    paths: [loginWorkflow],
    historical: "services/crm/src/index.ts",
    push: "main",
    types: null,
  },
];

// Deliberately bounded YAML reader: unsupported syntax fails the contract.
// No dependency on a transitive YAML package or matches inside job scripts.
function literal(value, key = false) {
  let result;
  if (value.startsWith('"')) {
    result = JSON.parse(value);
    assert.equal(typeof result, "string");
  } else if (value.startsWith("'")) {
    assert.match(value, /^'(?:[^'\r\n]|'')*'$/u);
    result = value.slice(1, -1).replaceAll("''", "'");
  } else {
    assert.match(value, /^[A-Za-z_./][A-Za-z0-9_./*-]*$/u);
    assert.ok(
      key || !/^(?:true|false|null|yes|no|on|off|\.nan|\.inf)$/iu.test(value),
      "ambiguous plain scalar",
    );
    result = value;
  }
  assert.ok(result.length > 0 && !/[\r\n\t]/u.test(result));
  return result;
}

function inlineList(value) {
  assert.ok(
    value.startsWith("[") && value.endsWith("]"),
    "literal list required",
  );
  const inner = value.slice(1, -1).trim();
  const items = [];
  const token =
    /\s*("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z_./][A-Za-z0-9_./*-]*)\s*(,|$)/gy;
  let cursor = 0;
  while (cursor < inner.length) {
    token.lastIndex = cursor;
    const match = token.exec(inner);
    assert.ok(match, "unsupported inline list");
    items.push(literal(match[1]));
    cursor = token.lastIndex;
    assert.ok(match[2] !== "," || cursor < inner.length, "trailing comma");
  }
  assert.ok(items.length > 0, "empty list");
  return items;
}

function mapping(line) {
  const match =
    /^("(?:[^"\\]|\\.)*"|'(?:[^']|'')*'|[A-Za-z_][A-Za-z0-9_-]*): *(.*)$/u.exec(
      line,
    );
  assert.ok(match, "unsupported mapping: " + line);
  return [literal(match[1], true), match[2]];
}

function validateFilters(filters) {
  assert.ok(filters.length > 0 && filters.some((p) => !p.startsWith("!")));
  for (const filter of filters) {
    assert.match(filter, /^!?[A-Za-z0-9_./*-]+$/u, "unsupported glob");
    const pattern = filter.startsWith("!") ? filter.slice(1) : filter;
    assert.ok(
      pattern.split("/").every((part) => !part.includes("**") || part === "**"),
      "unsupported recursive glob",
    );
  }
}

function triggers(source) {
  const lines = source.split(/\r?\n/u);
  const top = [];
  for (const [index, line] of lines.entries()) {
    if (!line.trim() || /^\s*#/u.test(line) || /^[ \t]/u.test(line)) continue;
    const [key, value] = mapping(line);
    top.push({ index, key, value });
  }
  const starts = top.filter(({ key }) => key === "on");
  assert.equal(starts.length, 1, "one top-level on mapping required");
  const start = starts[0];
  assert.equal(start.value, "", "on must be a block mapping");
  const end =
    top.find(({ index }) => index > start.index)?.index ?? lines.length;
  const events = Object.create(null);
  let event;
  let pending;
  for (const line of lines.slice(start.index + 1, end)) {
    if (!line.trim() || /^\s*#/u.test(line)) continue;
    assert.ok(!line.includes("\t"), "tab indentation");
    const indent = line.match(/^ */u)[0].length;
    if (indent === 6) {
      assert.ok(pending && line.startsWith("      - "), "unexpected list item");
      pending.push(literal(line.slice(8)));
      continue;
    }
    assert.ok(indent === 2 || indent === 4, "unsupported indentation");
    const [key, value] = mapping(line.slice(indent));
    pending = undefined;
    if (indent === 2) {
      assert.ok(["pull_request", "push", "workflow_dispatch"].includes(key));
      assert.ok(!Object.hasOwn(events, key), "duplicate event");
      assert.equal(value, "", "event must be a block mapping");
      event = key;
      events[event] = Object.create(null);
    } else {
      assert.ok(
        event && event !== "workflow_dispatch",
        "unexpected event field",
      );
      assert.ok(
        ["paths", "branches"].includes(key) ||
          (event === "pull_request" && key === "types"),
        "unsupported event filter",
      );
      assert.ok(!Object.hasOwn(events[event], key), "duplicate filter");
      events[event][key] = value === "" ? [] : inlineList(value);
      if (value === "") pending = events[event][key];
    }
  }
  assert.ok(Object.keys(events).length > 0, "no events");
  for (const config of Object.values(events)) {
    for (const [key, values] of Object.entries(config)) {
      if (key === "types") {
        assert.ok(values.length > 0);
        for (const value of values) assert.match(value, /^[a-z_]+$/u);
      } else validateFilters(values);
    }
  }
  return events;
}

function selected(filters, file) {
  let included = false;
  for (const filter of filters) {
    const excluded = filter.startsWith("!");
    if (matchesPath(file, excluded ? filter.slice(1) : filter))
      included = !excluded;
  }
  return included;
}

function routes(
  events,
  name,
  file,
  { branch = "main", action = "synchronize" } = {},
) {
  const config = events[name];
  if (!config) return false;
  if (
    name === "pull_request" &&
    !(config.types ?? defaultTypes).includes(action)
  )
    return false;
  return (
    (!config.branches || selected(config.branches, branch)) &&
    (!config.paths || selected(config.paths, file))
  );
}

test("explicit audit matrix covers 87 PR and 21 existing push/main pairs", () => {
  assert.equal(contracts.length, 12);
  assert.equal(
    contracts.reduce((count, c) => count + c.paths.length, 0),
    87,
  );
  assert.equal(
    contracts
      .filter((c) => c.push === "main")
      .reduce((count, c) => count + c.paths.length, 0),
    21,
  );
});

for (const contract of contracts) {
  const { workflow, paths, historical, push } = contract;
  const source = readFileSync(
    new URL("../../.github/workflows/" + workflow, import.meta.url),
    "utf8",
  );
  const events = triggers(source);
  const self = ".github/workflows/" + workflow;
  const names = push === "main" ? ["pull_request", "push"] : ["pull_request"];
  for (const name of names) {
    for (const file of paths) {
      test(workflow + " / " + name + " routes the exact path " + file, () => {
        assert.ok(
          events[name].paths?.includes(file),
          "missing exact filter: " + file,
        );
        assert.equal(
          routes(events, name, file),
          true,
          "single changed path must trigger",
        );
      });
    }
    test(
      workflow +
        " / " +
        name +
        " preserves self and representative historical routes",
      () => {
        assert.equal(routes(events, name, self), true);
        assert.equal(routes(events, name, historical), true);
        if (contract.types !== null) {
          assert.equal(
            routes(events, name, ".github/actions/ci-bootstrap/action.yml"),
            true,
          );
        }
      },
    );
    test(
      workflow + " / " + name + " exact additions do not broaden aliases",
      () => {
        const previous = events[name].paths.filter(
          (filter) => !paths.includes(filter),
        );
        for (const file of paths) {
          for (const alias of [
            file + ".bak",
            file.replace(/(\.[^/.]+)$/u, "-copy$1"),
            "unrelated/" + file,
          ]) {
            // Existing wildcards may already cover an alias; preserve that result.
            assert.equal(
              selected(events[name].paths, alias),
              selected(previous, alias),
              alias,
            );
          }
        }
      },
    );
  }
  test(
    workflow + " preserves PR actions, manual dispatch and push topology",
    () => {
      assert.deepEqual(
        Object.keys(events.workflow_dispatch ?? { missing: true }),
        [],
      );
      if (contract.types === null)
        assert.equal(Object.hasOwn(events.pull_request, "types"), false);
      else
        assert.deepEqual(
          events.pull_request.types,
          contract.types ?? reviewTypes,
        );
      const expectedTypes =
        contract.types === null
          ? defaultTypes
          : (contract.types ?? reviewTypes);
      for (const action of reviewTypes) {
        assert.equal(
          routes(events, "pull_request", self, { action }),
          expectedTypes.includes(action),
          action,
        );
      }
      assert.equal(
        routes(events, "pull_request", self, { action: "closed" }),
        false,
      );
      if (!push) assert.equal(Object.hasOwn(events, "push"), false);
      else {
        assert.deepEqual(events.push.branches, [push]);
        assert.equal(routes(events, "push", self, { branch: push }), true);
        assert.equal(
          routes(events, "push", self, { branch: "unrelated-branch" }),
          false,
        );
        if (push === legacyBranch) {
          assert.equal(Object.hasOwn(events.push, "paths"), false);
          assert.equal(
            routes(events, "push", "unrelated.txt", { branch: legacyBranch }),
            true,
          );
          assert.equal(routes(events, "push", self, { branch: "main" }), false);
        }
      }
    },
  );
}

const fixture = (lines) =>
  ["on:", ...lines, "jobs:", "  ignored: {}"].join("\n");
const pathFixture = (value) =>
  fixture(["  pull_request:", "    paths:", "      - " + value]);

for (const encoded of ["src/a.ts", "'src/a.ts'", '"src/a.ts"']) {
  test("literal path representation: " + encoded, () => {
    const events = triggers(pathFixture(encoded));
    assert.deepEqual(events.pull_request.paths, ["src/a.ts"]);
    assert.equal(routes(events, "pull_request", "src/a.ts"), true);
    assert.equal(routes(events, "pull_request", "src/a.ts.bak"), false);
  });
}

test("inline quoted lists, CRLF, comments and quoted keys are unambiguous", () => {
  const source = fixture([
    "  # Only event filters count.",
    "  'pull_request':",
    '    "types": [opened, \'synchronize\', "reopened"]',
    "    branches: ['main']",
    "    paths: [\"src/a.ts\", 'src/b.ts', src/c.ts]",
  ])
    .replaceAll("\n", "\r\n")
    .replace("on:", '"on":');
  const events = triggers(source);
  for (const file of ["src/a.ts", "src/b.ts", "src/c.ts"])
    assert.equal(routes(events, "pull_request", file), true);
  assert.equal(
    routes(events, "pull_request", "src/a.ts", { branch: "other" }),
    false,
  );
  assert.equal(
    routes(events, "pull_request", "src/a.ts", { action: "closed" }),
    false,
  );
  assert.equal(literal("'it''s'"), "it's");
  assert.equal(literal('"a\\"b"'), 'a"b');
  assert.deepEqual(inlineList("[\"with,comma\", 'single,comma']"), [
    "with,comma",
    "single,comma",
  ]);
});

test("ordered exclusions and reinclusions preserve glob semantics", () => {
  const events = triggers(
    fixture([
      "  pull_request:",
      "    paths:",
      "      - 'src/**'",
      "      - '!src/private/**'",
      "      - 'src/private/public.ts'",
    ]),
  );
  assert.equal(routes(events, "pull_request", "src/a.ts"), true);
  assert.equal(routes(events, "pull_request", "src/private/a.ts"), false);
  assert.equal(routes(events, "pull_request", "src/private/public.ts"), true);
  assert.equal(routes(events, "pull_request", "other/a.ts"), false);
});

test("paths in jobs cannot masquerade as trigger filters", () => {
  const source = [
    "on:",
    "  pull_request:",
    "jobs:",
    "  pull_request:",
    "    paths:",
    "      - src/a.ts",
  ].join("\n");
  assert.equal(triggers(source).pull_request.paths, undefined);
});

const ambiguous = {
  "missing on": "jobs:\n  pull_request:\n    paths:\n      - src/a.ts",
  "duplicate on": pathFixture("src/a.ts") + '\n"on":\n  push:',
  "flow on": "on: [pull_request]\njobs:",
  "flow event": fixture(["  pull_request: {paths: [src/a.ts]}"]),
  "duplicate event": fixture(["  pull_request:", "  'pull_request':"]),
  "duplicate filter": fixture([
    "  pull_request:",
    "    paths: [src/a.ts]",
    '    "paths": [src/b.ts]',
  ]),
  "unknown event": fixture(["  pull_request_target:"]),
  "unsupported paths-ignore": fixture([
    "  pull_request:",
    "    paths-ignore: [docs/a.md]",
  ]),
  "unsupported branches-ignore": fixture([
    "  push:",
    "    branches-ignore: [main]",
  ]),
  "unsupported tags": fixture(["  push:", "    tags: [release]"]),
  "manual dispatch inputs": fixture(["  workflow_dispatch:", "    inputs:"]),
  tabs: fixture(["\tpull_request:"]),
  "odd indentation": fixture(["   pull_request:"]),
  "nested mapping": fixture([
    "  pull_request:",
    "    paths:",
    "      include: src/a.ts",
  ]),
  "empty paths": fixture(["  pull_request:", "    paths:"]),
  "empty inline paths": fixture(["  pull_request:", "    paths: []"]),
  "negative only": pathFixture("'!src/**'"),
  alias: pathFixture("*paths"),
  anchor: pathFixture("&path src/a.ts"),
  tag: pathFixture("!!str src/a.ts"),
  "merge key": fixture(["  pull_request:", "    <<: *defaults"]),
  "unclosed single quote": pathFixture("'src/a.ts"),
  "unclosed double quote": pathFixture('"src/a.ts'),
  "inline comment": pathFixture("src/a.ts # unsupported"),
  "trailing scalar": pathFixture('"src/a.ts" extra'),
  "typed scalar": pathFixture("true"),
  expression: pathFixture("'src/" + "$" + "{{ matrix.file }}'"),
  "unsupported glob": pathFixture("'src/a?.ts'"),
  "unsupported recursive glob": pathFixture("'src/a**.ts'"),
  "trailing comma": fixture(["  pull_request:", "    paths: [src/a.ts,]"]),
  "multiline scalar": pathFixture("|") + "\n        src/a.ts",
  "document boundary": "---\n" + pathFixture("src/a.ts"),
};
for (const [name, source] of Object.entries(ambiguous)) {
  test("trigger reader fails closed: " + name, () =>
    assert.throws(() => triggers(source)),
  );
}
