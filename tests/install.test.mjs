import test from "node:test";
import assert from "node:assert/strict";
import { platformOf, TryLimit, isInstalled, isFramed } from "../js/install.js";
import { safeStorage } from "../js/store.js";
import { fakeStorage } from "./helpers.mjs";

test("the phone type decides which install steps are shown", () => {
  const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Mobile/15E148 Safari/604.1";
  const pixel = "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Mobile Safari/537.36";
  const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15";
  assert.equal(platformOf({ userAgent: iphone }), "ios");
  assert.equal(platformOf({ userAgent: pixel }), "android");
  assert.equal(platformOf({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 0 }), "desktop");
  assert.equal(platformOf({ userAgent: mac, platform: "MacIntel", maxTouchPoints: 5 }), "ios", "an iPad asks for the desktop site");
});

test("free swipes are counted and the count survives a reload", () => {
  const disk = fakeStorage();
  const one = new TryLimit(safeStorage(disk), 3);
  assert.equal(one.left, 3);
  one.count();
  one.count();
  assert.equal(one.left, 1);
  assert.equal(one.reached, false);
  const again = new TryLimit(safeStorage(disk), 3); // page reloaded
  assert.equal(again.left, 1);
  again.count();
  assert.equal(again.reached, true);
  assert.equal(again.left, 0);
});

test("installed and framed checks never throw", () => {
  assert.equal(isInstalled({ navigator: { standalone: true } }), true);
  assert.equal(isInstalled({ navigator: {}, matchMedia: () => ({ matches: true }) }), true);
  assert.equal(isInstalled({ navigator: {}, matchMedia: () => ({ matches: false }) }), false);
  assert.equal(isInstalled({ navigator: {}, matchMedia: () => { throw new Error("no"); } }), false);
  const self = {};
  assert.equal(isFramed({ self, top: self }), false);
  assert.equal(isFramed({ self, top: {} }), true);
});
