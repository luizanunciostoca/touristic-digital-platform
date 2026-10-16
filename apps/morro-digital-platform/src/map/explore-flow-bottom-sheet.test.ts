import { readFileSync } from "node:fs";
import { compileFunction } from "node:vm";
import ts from "typescript";
import { describe, expect, it } from "vitest";

const source = readFileSync(
  new URL("./explore-flow-bottom-sheet.ts", import.meta.url),
  "utf8",
);
function setup() {
  const listeners = new Map<string, (event: Record<string, unknown>) => void>();
  const captures = new Set<number>();
  const handle = {
    addEventListener(
      type: string,
      callback: (event: Record<string, unknown>) => void,
    ) {
      listeners.set(type, callback);
    },
    setPointerCapture(id: number) {
      captures.add(id);
    },
    hasPointerCapture(id: number) {
      return captures.has(id);
    },
    releasePointerCapture(id: number) {
      captures.delete(id);
    },
  };
  const segment = source.slice(
    source.indexOf("  let dragStartY:"),
    source.indexOf("  const rebuildStateControls"),
  );
  const body = ts.transpileModule(
    `let state = "half"; let activeKind = "tour"; const setState = value => { state = value; }; ${segment}; return { getState: () => state, resetDrag };`,
    { compilerOptions: { target: ts.ScriptTarget.ES2022 } },
  ).outputText;
  const create = compileFunction(body, ["handle"]) as (
    target: typeof handle,
  ) => { getState(): string; resetDrag(): void };
  const controller = create(handle);
  return {
    ...controller,
    captures,
    emit(type: string, properties: Record<string, unknown> = {}) {
      listeners.get(type)?.({
        isPrimary: true,
        button: 0,
        pointerId: 1,
        clientY: 100,
        ...properties,
      });
    },
  };
}
describe("installed flow sheet pointer lifecycle", () => {
  it("moves one state per primary grip gesture and respects limits", () => {
    const s = setup();
    for (let i = 0; i < 3; i++) {
      s.emit("pointerdown");
      s.emit("pointerup", { clientY: -200 });
    }
    expect(s.getState()).toBe("full");
    expect(s.captures.size).toBe(0);
    s.emit("pointerdown");
    s.emit("pointerup", { clientY: 200 });
    expect(s.getState()).toBe("half");
  });
  it("ignores secondary pointers and non-primary buttons", () => {
    const s = setup();
    s.emit("pointerdown", { isPrimary: false });
    s.emit("pointerup", { clientY: 200 });
    s.emit("pointerdown", { button: 2 });
    s.emit("pointerup", { clientY: 200 });
    expect(s.getState()).toBe("half");
  });
  it("does not replace an active pointer or let another pointer cancel it", () => {
    const s = setup();
    s.emit("pointerdown");
    s.emit("pointerdown", { pointerId: 2 });
    s.emit("pointercancel", { pointerId: 2 });
    s.emit("pointerup", { clientY: 200 });
    expect(s.getState()).toBe("peek");
  });
  for (const type of ["pointercancel", "lostpointercapture"])
    it(`clears capture after ${type}`, () => {
      const s = setup();
      s.emit("pointerdown");
      s.emit(type);
      s.emit("pointerup", { clientY: 200 });
      expect(s.getState()).toBe("half");
      expect(s.captures.size).toBe(0);
    });
  it("resets gestures across presentation replacement, hide and destroy", () => {
    const s = setup();
    s.emit("pointerdown");
    s.resetDrag();
    s.emit("pointerup", { clientY: 200 });
    expect(s.getState()).toBe("half");
    expect(source.match(/resetDrag\(\);/gu)?.length).toBeGreaterThanOrEqual(6);
  });
});
