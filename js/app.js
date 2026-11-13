// Startup and screen logic: ties the store, the feed, the deck and the screens together.
import { CONFIG } from "./config.js";
import { Store } from "./store.js";
import { PlaceFeed, OverpassSource, SampleSource, FeedError } from "./places.js";
import { lookupZip, haversineMi } from "./geo.js";
import { Deck } from "./deck.js";
import * as ui from "./ui.js";

const $ = (id) => document.getElementById(id);

const store = new Store();
const source =
  CONFIG.dataSource === "sample"
    ? new SampleSource()
    : new OverpassSource({ endpoints: CONFIG.endpoints, timeoutMs: CONFIG.requestTimeoutMs });

const state = {
  area: null, // { zip, lat, lon, city, state, radius, kinds }
  feed: null,
  last: null, // the most recent swipe, for undo
};

const app = $("app");
const deck = new Deck($("deck"), {
  render: ui.renderCard,
  onSwipe,
  onTap: (place) => openDetails(place, "deck"),
});

/* ---- search area ---- */

function areaName(area) {
  return area.zip || "Near me";
}

function setArea(area, { persist = true } = {}) {
  state.area = area;
  state.last = null;
  if (persist) store.setSettings(area);
  $("area-chip").hidden = false;
  $("area-chip-zip").textContent = areaName(area);
  $("area-chip-radius").textContent = `${area.radius} mi`;
  $("area-chip").setAttribute("aria-label", `Search area: ${areaName(area)}, within ${area.radius} miles. Change`);
  $("btn-undo").disabled = true;
  state.feed = new PlaceFeed({
    source,
    store,
    center: { lat: area.lat, lon: area.lon, city: area.city || "" },
    radiusMi: area.radius,
    kinds: area.kinds,
    cacheMs: CONFIG.cacheHours * 3600 * 1000,
  });
  deck.clear();
  route();
  fill();
}

// Checks the form, looks the ZIP up, and switches to the new area.
async function submitArea(values, form, { close = false } = {}) {
  if (!/^\d{5}$/.test(values.zip)) {
    form.setMessage("Enter a 5-digit ZIP code.");
    return;
  }
  form.setBusy(true);
  try {
    const hit = await lookupZip(values.zip);
    if (!hit) {
      form.setMessage("That ZIP code isn't in our list. Check the number and try again.");
      return;
    }
    if (close) ui.closeSheet();
    setArea({ ...hit, radius: values.radius, kinds: values.kinds });
    if (location.hash === "#saved") location.hash = "#discover";
  } catch (err) {
    form.setMessage(
      err && err.code === "not-bundled"
        ? "This preview only knows ZIP codes that start with 9. The live app covers every US ZIP."
        : "The ZIP list didn't load. Check your connection and try again.",
    );
  } finally {
    form.setBusy(false);
  }
}

function locateArea(values, form, { close = false } = {}) {
  if (!navigator.geolocation) {
    form.setMessage("This browser can't share a location. Enter a ZIP code instead.");
    return;
  }
  form.setBusy(true);
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      form.setBusy(false);
      if (close) ui.closeSheet();
      // Rounded to about a city block before it is used for searches.
      setArea({
        zip: "",
        lat: Math.round(pos.coords.latitude * 1000) / 1000,
        lon: Math.round(pos.coords.longitude * 1000) / 1000,
        city: "",
        state: "",
        radius: values.radius,
        kinds: values.kinds,
      });
      if (location.hash === "#saved") location.hash = "#discover";
    },
    () => {
      form.setBusy(false);
      form.setMessage("Location is off or blocked for this site. Enter a ZIP code instead.");
    },
    { enableHighAccuracy: false, timeout: 12000, maximumAge: 300000 },
  );
}

function formValues() {
  const a = state.area;
  return {
    zip: a ? a.zip : CONFIG.exampleZip || "",
    radius: a ? a.radius : CONFIG.defaultRadiusMi,
    kinds: a ? a.kinds : ["food", "shop"],
  };
}

function mountStartForm() {
  $("start-form").replaceChildren(
    ui.areaForm({
      prefix: "start",
      values: formValues(),
      submitLabel: "Start swiping",
      maxRadius: CONFIG.maxRadiusMi,
      allowLocate: CONFIG.allowGeolocation,
      showKinds: false, // first run stays short; the food and shops filter lives in the search sheet
      onSubmit: (values, form) => submitArea(values, form),
      onLocate: (values, form) => locateArea(values, form),
    }),
  );
}

function openSettings() {
  const hiddenCount = store.hiddenCount;
  const content = ui.h(
    "div",
    { class: "panel" },
    ui.h("h2", { class: "panel__title", id: "sheet-title", text: "Search area" }),
    ui.areaForm({
      prefix: "area",
      values: formValues(),
      submitLabel: "Update search",
      maxRadius: CONFIG.maxRadiusMi,
      allowLocate: CONFIG.allowGeolocation,
      onSubmit: (values, form) => submitArea(values, form, { close: true }),
      onLocate: (values, form) => locateArea(values, form, { close: true }),
    }),
    ui.h(
      "div",
      { class: "panel__section" },
      ui.h("h3", { class: "panel__sub", text: "Passed places" }),
      ui.h("p", {
        class: "panel__text",
        text:
          hiddenCount === 0
            ? "You haven't passed on any places yet. Places you pass on never come back."
            : `You've passed on ${hiddenCount} ${hiddenCount === 1 ? "place" : "places"}. They stay hidden unless you bring them back.`,
      }),
      hiddenCount
        ? ui.h("button", { class: "btn btn--ghost", type: "button", onclick: resetHidden, text: "Bring back passed places" })
        : null,
    ),
    ui.h(
      "div",
      { class: "panel__section" },
      ui.h("h3", { class: "panel__sub", text: "About" }),
      ui.h("p", {
        class: "panel__text",
        text: CONFIG.preview
          ? "This is a preview with made-up sample listings. The live app shows real independent shops and restaurants."
          : "Listings come from OpenStreetMap contributors. To find places, your search area is sent to OpenStreetMap's public servers. Your saved and passed lists stay on this device.",
      }),
      ui.h("p", { class: "panel__text panel__text--quiet", text: `HowLocal ${CONFIG.version}` }),
    ),
  );
  ui.openSheet(content);
}

async function resetHidden() {
  const count = store.hiddenCount;
  const yes = await ui.confirmSheet({
    title: "Bring back passed places?",
    body: `${count} ${count === 1 ? "place" : "places"} you passed on will show up in your deck again.`,
    confirmLabel: "Bring them back",
  });
  if (!yes) return;
  store.resetHidden();
  store.clearCache();
  ui.toast("Passed places are back in the deck");
  if (state.area) setArea(state.area, { persist: false });
}

/* ---- the deck ---- */

async function fill() {
  const feed = state.feed;
  if (!feed || feed.filling) return;
  feed.filling = true;
  feed.error = null;
  renderDeckState();
  try {
    for (let round = 0; round < 8; round++) {
      const { places, done, stalled } = await feed.take(10);
      if (feed !== state.feed) return; // the search area changed while this was loading
      if (places.length) deck.append(places);
      feed.finished = done;
      feed.paused = stalled;
      if (deck.length >= 4 || done || stalled) break;
    }
  } catch (err) {
    feed.error = err instanceof FeedError ? err.kind : "network";
    feed.errorDetail = err instanceof FeedError ? err.detail : String((err && err.message) || "");
  } finally {
    feed.filling = false;
    if (feed === state.feed) renderDeckState();
  }
}

function renderDeckState() {
  const feed = state.feed;
  const box = $("deck-state");
  const hasCards = deck.length > 0;
  for (const id of ["btn-pass", "btn-save", "btn-info"]) $(id).disabled = !hasCards;
  if (hasCards || !feed) {
    box.hidden = true;
    box.replaceChildren();
    return;
  }
  const area = state.area;
  const span = `${area.radius} ${area.radius === 1 ? "mile" : "miles"}`;
  let message;
  if (feed.filling) {
    message = { title: "Finding local spots", text: `Looking within ${span} of ${area.zip || "you"}.`, busy: true };
  } else if (feed.error) {
    message = {
      title: feed.error === "busy" ? "The map servers are busy" : "Places didn't load",
      text:
        feed.error === "busy"
          ? "Listings come from free public servers that get crowded. Give it a moment and try again."
          : feed.error === "timeout"
            ? "The map servers took too long to answer. Try again in a moment."
            : "Check your connection and try again.",
      note: feed.errorDetail ? `Details: ${feed.errorDetail}` : "",
      actions: [["Try again", () => fill(), "yellow"]],
    };
  } else if (feed.finished) {
    const wider = Math.min(CONFIG.maxRadiusMi, Math.max(area.radius + 1, area.radius * 2));
    const canWiden = area.radius < CONFIG.maxRadiusMi;
    message = {
      title: `That's everything within ${span}`,
      text: canWiden
        ? "You've swiped through every spot we found. Widen your search to see more."
        : "You've swiped through every spot we found. Try a different ZIP code.",
      actions: [
        canWiden ? [`Widen to ${wider} miles`, () => setArea({ ...area, radius: wider }), "yellow"] : null,
        ["Change search", openSettings],
      ].filter(Boolean),
    };
  } else {
    // Several searches in a row turned up nothing new.
    message = {
      title: "Nothing new close by",
      text: "Everything nearby is already saved or passed. Keep looking farther out, or change your search.",
      actions: [
        ["Keep looking", () => { feed.resume(); feed.paused = false; fill(); }, "yellow"],
        ["Change search", openSettings],
      ],
    };
  }
  box.replaceChildren(ui.deckMessage(message));
  box.hidden = false;
}

function onSwipe(place, dir) {
  if (dir === "save") store.save(place);
  else store.hide(place);
  if (state.feed) state.feed.swiped(place);
  state.last = { type: dir, place };
  $("btn-undo").disabled = false;
  updateCounts();
  ui.announce(dir === "save" ? `Saved ${place.name}` : `Passed on ${place.name}`);
  try {
    if (navigator.vibrate) navigator.vibrate(8);
  } catch {
    /* no haptics here */
  }
  renderDeckState();
  if (deck.length < 4) fill();
}

function undo() {
  const action = state.last;
  if (!action) return;
  store.undo(action);
  if (state.feed) state.feed.unswiped(action.place);
  state.last = null;
  $("btn-undo").disabled = true;
  deck.unshift(action.place);
  updateCounts();
  renderDeckState();
  ui.announce(`Brought back ${action.place.name}`);
}

/* ---- details and saved ---- */

function openDetails(place, mode) {
  ui.openSheet(
    ui.renderDetails(place, {
      mode,
      onSave: () => {
        ui.closeSheet();
        if (deck.top() && deck.top().id === place.id) deck.swipe("save");
      },
      onPass: () => {
        ui.closeSheet();
        if (deck.top() && deck.top().id === place.id) deck.swipe("pass");
      },
      onRemove: () => {
        store.unsave(place.id);
        ui.closeSheet();
        ui.toast(`Removed ${place.name}`);
        updateCounts();
        renderSaved();
      },
    }),
    { tone: "paper" },
  );
}

function renderSaved() {
  const list = $("saved-list");
  const area = state.area;
  const places = store.savedList().map((p) => ({
    ...p,
    dist: area ? haversineMi(area.lat, area.lon, p.lat, p.lon) : NaN,
  }));
  $("saved-summary").textContent =
    places.length === 0 ? "" : `${places.length} ${places.length === 1 ? "place" : "places"} to try`;
  if (!places.length) {
    list.replaceChildren(
      ui.h(
        "div",
        { class: "saved-empty" },
        ui.h("p", { class: "saved-empty__title", text: "Nothing saved yet" }),
        ui.h("p", { class: "saved-empty__text", text: "Swipe right on a place you want to try and it lands here." }),
        ui.h("a", { class: "btn btn--yellow", href: "#discover", text: "Start swiping" }),
      ),
    );
    return;
  }
  list.replaceChildren(...places.map((p) => ui.renderSavedRow(p, (place) => openDetails(place, "saved"))));
}

function updateCounts() {
  const n = store.savedCount;
  const badge = $("saved-count");
  badge.textContent = n ? String(n) : "";
  badge.hidden = !n;
}

/* ---- screens ---- */

function route() {
  const wantsSaved = location.hash === "#saved";
  const view = !state.area ? "start" : wantsSaved ? "saved" : "discover";
  app.dataset.view = view;
  $("view-start").hidden = view !== "start";
  $("view-swipe").hidden = view !== "discover";
  $("view-saved").hidden = view !== "saved";
  for (const [id, name] of [["tab-discover", "discover"], ["tab-saved", "saved"]]) {
    if (view === name) $(id).setAttribute("aria-current", "page");
    else $(id).removeAttribute("aria-current");
  }
  if (view === "saved") renderSaved();
}

function init() {
  if (CONFIG.preview) {
    $("preview-note").hidden = false;
    $("start-credit").textContent = "This preview uses made-up sample listings. The live app shows real places.";
  }
  ui.bindSheetKeys();
  mountStartForm();
  updateCounts();

  $("area-chip").addEventListener("click", openSettings);
  $("btn-save").addEventListener("click", () => deck.swipe("save"));
  $("btn-pass").addEventListener("click", () => deck.swipe("pass"));
  $("btn-undo").addEventListener("click", undo);
  $("btn-info").addEventListener("click", () => deck.top() && openDetails(deck.top(), "deck"));
  window.addEventListener("hashchange", route);
  document.addEventListener("keydown", (e) => {
    if (ui.sheetIsOpen() || app.dataset.view !== "discover") return;
    if (e.target instanceof HTMLElement && /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) return;
    if (e.key === "ArrowRight") deck.swipe("save");
    else if (e.key === "ArrowLeft") deck.swipe("pass");
  });

  const saved = store.settings;
  if (saved && Number.isFinite(saved.lat) && Number.isFinite(saved.lon) && Array.isArray(saved.kinds)) {
    setArea(saved, { persist: false });
  } else {
    route();
  }

  if (!store.persistent) ui.toast("This browser won't keep your lists after you close the tab");
}

init();
