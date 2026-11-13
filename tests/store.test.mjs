import test from "node:test";
import assert from "node:assert/strict";
import { Store, safeStorage } from "../js/store.js";
import { nameKey } from "../js/categories.js";
import { fakeStorage } from "./helpers.mjs";

const place = (id, name, lat = 34.05, lon = -118.25) => ({ id, name, nk: nameKey(name), lat, lon, kind: "food", group: "eat", label: "Restaurant" });

test("saved and passed places survive a reload", () => {
  const disk = fakeStorage();
  const a = new Store(safeStorage(disk));
  a.save(place("n1", "Siam Sunset"));
  a.hide(place("n2", "Blah Burgers"));
  a.setSettings({ zip: "90012", radius: 5 });

  const b = new Store(safeStorage(disk)); // a fresh page load
  assert.equal(b.savedCount, 1);
  assert.equal(b.hiddenCount, 1);
  assert.ok(b.isSeen(place("n1", "Siam Sunset")));
  assert.ok(b.isSeen(place("n2", "Blah Burgers")));
  assert.ok(!b.isSeen(place("n3", "Brand New Spot")));
  assert.deepEqual(b.settings, { zip: "90012", radius: 5 });
  assert.equal(b.savedList()[0].name, "Siam Sunset");
});

test("a passed place is recognized even if the map gives it a new id", () => {
  const s = new Store(safeStorage(fakeStorage()));
  s.hide(place("n10", "Joe's Pizza", 34.05, -118.25));
  // same business re-mapped as a building, a few meters away
  assert.ok(s.isSeen(place("w999", "JOES PIZZA", 34.05004, -118.25003)));
  // another branch with the same name across town is a different place
  assert.ok(!s.isSeen(place("n11", "Joe's Pizza", 34.1, -118.3)));
});

test("undo reverses exactly one swipe", () => {
  const s = new Store(safeStorage(fakeStorage()));
  const p = place("n1", "Siam Sunset");
  const q = place("n2", "Blah Burgers");
  s.save(p);
  s.undo({ type: "save", place: p });
  assert.equal(s.savedCount, 0);
  assert.ok(!s.isSeen(p));
  s.hide(q);
  s.hide(p);
  s.undo({ type: "pass", place: p });
  assert.ok(!s.isSeen(p));
  assert.ok(s.isSeen(q), "the earlier swipe is untouched");
});

test("removing a saved place hides it so it never returns", () => {
  const disk = fakeStorage();
  const s = new Store(safeStorage(disk));
  const p = place("n1", "Siam Sunset");
  s.save(p);
  s.unsave("n1");
  assert.equal(s.savedCount, 0);
  assert.ok(s.isSeen(p));
  assert.ok(new Store(safeStorage(disk)).isSeen(p), "still hidden after reload");
});

test("bringing back passed places keeps saved ones", () => {
  const s = new Store(safeStorage(fakeStorage()));
  s.save(place("n1", "Siam Sunset"));
  s.hide(place("n2", "Blah Burgers"));
  s.resetHidden();
  assert.equal(s.hiddenCount, 0);
  assert.ok(!s.isSeen(place("n2", "Blah Burgers")));
  assert.ok(s.isSeen(place("n1", "Siam Sunset")));
});

test("the saved list is newest first and drops the old distance", () => {
  let t = 1000;
  const s = new Store(safeStorage(fakeStorage()), { now: () => (t += 1) });
  s.save({ ...place("n1", "First"), dist: 2.5 });
  s.save(place("n2", "Second"));
  assert.deepEqual(s.savedList().map((p) => p.name), ["Second", "First"]);
  assert.equal("dist" in s.savedList()[1], false);
});

test("cached listings expire and old entries are cleared out", () => {
  let t = 0;
  const s = new Store(safeStorage(fakeStorage()), { now: () => t });
  s.cacheSet("a", [1, 2, 3]);
  assert.deepEqual(s.cacheGet("a", 1000), [1, 2, 3]);
  t = 2000;
  assert.equal(s.cacheGet("a", 1000), null, "expired");
  for (let i = 0; i < 60; i++) s.cacheSet(`k${i}`, i);
  assert.equal(s.cacheGet("k0", 1e9), null, "oldest entries were evicted");
  assert.equal(s.cacheGet("k59", 1e9), 59);
  s.clearCache();
  assert.equal(s.cacheGet("k59", 1e9), null);
});

test("a full or blocked browser storage never breaks the app", () => {
  // storage that fills up after a little data
  const tight = new Store(safeStorage(fakeStorage({ quota: 600 })));
  for (let i = 0; i < 20; i++) tight.cacheSet(`cell${i}`, "x".repeat(200));
  tight.hide(place("n1", "Blah Burgers"));
  assert.ok(tight.isSeen(place("n1", "Blah Burgers")));

  // storage that refuses everything, like some private-browsing modes
  const blocked = safeStorage({
    getItem() { throw new Error("denied"); },
    setItem() { throw new Error("denied"); },
    removeItem() { throw new Error("denied"); },
  });
  assert.equal(blocked.persistent, false);
  const s = new Store(blocked);
  s.save(place("n2", "Siam Sunset"));
  assert.equal(s.savedCount, 1, "still works for the visit");
});
