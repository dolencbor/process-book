import assert from "node:assert/strict";
import test from "node:test";
import { pulseSelectionHaptic } from "../src/components/selection-haptics.ts";

test("selection haptics pulse once per settled detent and respect browser availability", () => {
  const navigatorDescriptor = Object.getOwnPropertyDescriptor(globalThis, "navigator");
  const documentDescriptor = Object.getOwnPropertyDescriptor(globalThis, "document");
  const calls = [];
  const browser = { vibrate: duration => { calls.push(duration); return true; }, userActivation: { hasBeenActive: true } };
  const page = { visibilityState: "visible" };
  try {
    Object.defineProperty(globalThis, "navigator", { configurable: true, value: browser });
    Object.defineProperty(globalThis, "document", { configurable: true, value: page });
    pulseSelectionHaptic();
    pulseSelectionHaptic();
    assert.deepEqual(calls, [8]);

    browser.vibrate = undefined;
    pulseSelectionHaptic();
    assert.deepEqual(calls, [8]);
  } finally {
    if (navigatorDescriptor) Object.defineProperty(globalThis, "navigator", navigatorDescriptor);
    else delete globalThis.navigator;
    if (documentDescriptor) Object.defineProperty(globalThis, "document", documentDescriptor);
    else delete globalThis.document;
  }
});
