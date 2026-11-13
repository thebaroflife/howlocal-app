// Building blocks for the screen: cards, the details sheet, the area form, sheets and messages.
// Listing text comes from volunteers, so it is always inserted as text, never as HTML.
import { GROUPS, iconSvg } from "./categories.js";
import { formatMiles } from "./geo.js";

const $ = (id) => document.getElementById(id);

/* ---- small DOM helpers ---- */

export function h(tag, attrs = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs || {})) {
    if (value == null || value === false) continue;
    if (key === "class") el.className = value;
    else if (key === "text") el.textContent = value;
    else if (key.startsWith("on")) el.addEventListener(key.slice(2), value);
    else el.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of children.flat()) if (child != null && child !== false) el.append(child);
  return el;
}

const ICONS = {
  heart: "M12 21s-8-4.7-8-10.6A4.6 4.6 0 0 1 12 7.3a4.6 4.6 0 0 1 8 3.1C20 16.3 12 21 12 21z",
  close: "M6 6l12 12M18 6L6 18",
  pin: "M12 21s-6.5-6-6.5-11a6.5 6.5 0 0 1 13 0c0 5-6.5 11-6.5 11zM14 10a2 2 0 1 1-4 0 2 2 0 0 1 4 0z",
  clock: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM12 7v5l3 2",
  globe: "M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18zM3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z",
  phone: "M6.5 3h3l1.5 4.5-2 1.5a12 12 0 0 0 6 6l1.5-2 4.5 1.5v3a2 2 0 0 1-2.2 2A17 17 0 0 1 4.5 5.2 2 2 0 0 1 6.5 3z",
  up: "M6 15l6-6 6 6",
  right: "M9 5l7 7-7 7",
  route: "M21 3L10 14M21 3l-7 18-4-7-7-4z",
  locate: "M12 2v3M12 19v3M2 12h3M19 12h3M17 12a5 5 0 1 1-10 0 5 5 0 0 1 10 0z",
};

export function icon(name, { filled = false } = {}) {
  const span = document.createElement("span");
  span.className = "icon";
  span.innerHTML = `<svg viewBox="0 0 24 24" fill="${filled ? "currentColor" : "none"}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${ICONS[name]}"/></svg>`;
  return span;
}

function tile(group) {
  const span = h("span", { class: "tile" });
  span.innerHTML = iconSvg(group);
  return span;
}

export function awning(stripes, extraClass = "") {
  return h(
    "div",
    { class: `awning ${extraClass}`.trim(), "aria-hidden": "true" },
    Array.from({ length: stripes }, () => h("span")),
  );
}

const hue = (place) => (GROUPS[place.group] || GROUPS.finds).color;

/* ---- hours ---- */

const DAYS = { Mo: "Mon", Tu: "Tue", We: "Wed", Th: "Thu", Fr: "Fri", Sa: "Sat", Su: "Sun", PH: "Holidays" };

function clock(hour, minutes) {
  const suffix = hour % 24 < 12 ? "am" : "pm";
  const h12 = hour % 12 === 0 ? 12 : hour % 12;
  return minutes === "00" ? `${h12}${suffix}` : `${h12}:${minutes}${suffix}`;
}

// Rewrites the map's compact hours ("Mo-Fr 11:00-21:00; Sa 10:00-22:00") into readable lines.
// Anything unusual is shown as written rather than risk getting it wrong.
export function formatHours(raw) {
  const s = String(raw || "").trim();
  if (!s) return [];
  if (s === "24/7") return ["Open 24 hours"];
  if (/[[\]"]|sunrise|sunset|week|easter|\|\||Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec/i.test(s)) return [s];
  return s
    .split(";")
    .map((part) => part.trim())
    .filter(Boolean)
    .map((part) =>
      part
        .replace(/\b(Mo|Tu|We|Th|Fr|Sa|Su|PH)\b/g, (d) => DAYS[d])
        .replace(/(\d{1,2}):(\d{2})/g, (_, hh, mm) => clock(Number(hh), mm))
        .replace(/\s*-\s*/g, "–")
        .replace(/\boff\b/g, "closed")
        .replace(/\s*,\s*/g, ", "),
    );
}

/* ---- links ---- */

export function directionsUrl(place) {
  const dest = `${place.lat},${place.lon}`;
  const apple =
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  return apple
    ? `https://maps.apple.com/?daddr=${dest}&dirflg=d`
    : `https://www.google.com/maps/dir/?api=1&destination=${dest}`;
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

function telHref(phone) {
  const digits = phone.replace(/[^\d+]/g, "");
  return digits.length >= 7 ? `tel:${digits}` : "";
}

function distanceText(place) {
  return Number.isFinite(place.dist) ? `${formatMiles(place.dist)} away` : "";
}

/* ---- the swipe card ---- */

function nameSize(name) {
  const n = [...name].length;
  return n <= 12 ? "s" : n <= 24 ? "m" : n <= 44 ? "l" : "xl";
}

function kindRow(place) {
  return h(
    "div",
    { class: "card__kind" },
    tile(place.group),
    h("span", { class: "card__label", text: place.label }),
    place.sample ? h("span", { class: "sample-tag", text: "Sample" }) : null,
  );
}

export function renderCard(place) {
  const hours = formatHours(place.hours);
  // No photos in the open map data, so each card carries its category's drawing, large and faint.
  const art = h("div", { class: "card__art", "aria-hidden": "true" });
  art.innerHTML = iconSvg(place.group);
  const card = h(
    "article",
    {
      class: "card",
      "aria-label": [place.name, place.label, distanceText(place)].filter(Boolean).join(", "),
    },
    awning(9),
    h("div", { class: "stamp stamp--save", "aria-hidden": "true", text: "SAVE" }),
    h("div", { class: "stamp stamp--pass", "aria-hidden": "true", text: "PASS" }),
    h(
      "div",
      { class: "card__body" },
      art,
      kindRow(place),
      h("h2", { class: `card__name card__name--${nameSize(place.name)}`, text: place.name }),
      h(
        "div",
        { class: "card__where" },
        h("p", { class: "card__dist" }, icon("pin"), h("span", { text: distanceText(place) })),
        place.addr ? h("p", { class: "card__addr", text: place.addr }) : null,
      ),
      place.perks && place.perks.length
        ? h("ul", { class: "perks" }, place.perks.map((perk) => h("li", { text: perk })))
        : null,
    ),
    h(
      "div",
      { class: "card__base" },
      h("span", { class: "card__hours" }, icon("clock"), h("span", { text: hours[0] || "Hours not listed" })),
      h("span", { class: "card__more" }, h("span", { text: "Details" }), icon("up")),
    ),
  );
  card.style.setProperty("--hue", hue(place));
  return card;
}

/* ---- details ---- */

function fact(iconName, label, value) {
  return h("div", { class: "fact" }, h("dt", {}, icon(iconName), h("span", { text: label })), h("dd", {}, value));
}

// mode "deck": Save and Pass buttons. mode "saved": Remove button.
export function renderDetails(place, { mode, onSave, onPass, onRemove }) {
  const hours = formatHours(place.hours);
  const facts = [];
  if (place.addr) facts.push(fact("pin", "Address", h("span", { text: place.addr })));
  if (hours.length) facts.push(fact("clock", "Hours", hours.map((line) => h("span", { class: "fact__line", text: line }))));
  if (place.phone) {
    const href = telHref(place.phone);
    facts.push(fact("phone", "Phone", href ? h("a", { href, text: place.phone }) : h("span", { text: place.phone })));
  }
  if (place.web) {
    facts.push(
      fact("globe", "Website", h("a", { href: place.web, target: "_blank", rel: "noopener noreferrer", text: hostOf(place.web) })),
    );
  }

  const actions = [];
  if (!place.sample) {
    actions.push(
      h(
        "a",
        { class: "btn btn--ink", href: directionsUrl(place), target: "_blank", rel: "noopener noreferrer" },
        icon("route"),
        h("span", { text: "Get directions" }),
      ),
    );
  }
  if (mode === "deck") {
    actions.push(
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn btn--line", type: "button", onclick: onPass, text: "Pass" }),
        h("button", { class: "btn btn--yellow", type: "button", onclick: onSave }, icon("heart", { filled: true }), h("span", { text: "Save" })),
      ),
    );
  } else {
    actions.push(h("button", { class: "btn btn--line", type: "button", onclick: onRemove, text: "Remove from saved" }));
  }

  const source = place.sample
    ? h("p", { class: "details__source", text: "This is a made-up sample listing for the preview, not a real business." })
    : h(
        "p",
        { class: "details__source" },
        h("span", { text: "Listing details come from OpenStreetMap. " }),
        h("a", {
          href: `https://www.openstreetmap.org/${place.osm}`,
          target: "_blank",
          rel: "noopener noreferrer",
          text: "View or fix this listing",
        }),
      );

  const root = h(
    "div",
    { class: "details" },
    awning(9, "awning--sheet"),
    h(
      "div",
      { class: "details__body" },
      kindRow(place),
      h("h2", { class: "details__name", id: "sheet-title", text: place.name }),
      distanceText(place) ? h("p", { class: "details__dist", text: distanceText(place) }) : null,
      facts.length
        ? h("dl", { class: "facts" }, facts)
        : h("p", { class: "details__empty", text: "This listing has no address or hours yet." }),
      place.perks && place.perks.length
        ? h("ul", { class: "perks" }, place.perks.map((perk) => h("li", { text: perk })))
        : null,
      h("div", { class: "details__actions" }, actions),
      source,
    ),
  );
  root.style.setProperty("--hue", hue(place));
  return root;
}

/* ---- saved list ---- */

export function renderSavedRow(place, onOpen) {
  const row = h(
    "button",
    { class: "saved-row", type: "button", onclick: () => onOpen(place) },
    tile(place.group),
    h(
      "span",
      { class: "saved-row__text" },
      h("span", { class: "saved-row__name", text: place.name }),
      h("span", { class: "saved-row__label", text: place.label }),
    ),
    h("span", { class: "saved-row__dist", text: Number.isFinite(place.dist) ? formatMiles(place.dist) : "" }),
    icon("right"),
  );
  row.style.setProperty("--hue", hue(place));
  return row;
}

/* ---- the area form (start screen and search-area sheet) ---- */

const KIND_CHOICES = [
  ["all", "Everything"],
  ["food", "Food & drink"],
  ["shop", "Shops"],
];

const milesLabel = (n) => (Number(n) === 1 ? "1 mile" : `${n} miles`);

export function areaForm({ prefix, values, submitLabel, maxRadius, allowLocate, showKinds = true, onSubmit, onLocate }) {
  const kind = values.kinds.length === 2 ? "all" : values.kinds[0];
  const zip = h("input", {
    id: `${prefix}-zip`,
    class: "zip-input",
    name: "zip",
    type: "text",
    inputmode: "numeric",
    pattern: "[0-9]*",
    maxlength: "5",
    autocomplete: "postal-code",
    placeholder: "ZIP",
    value: values.zip || "",
    "aria-describedby": `${prefix}-zip-msg`,
  });
  const msg = h("p", { class: "field__msg", id: `${prefix}-zip-msg`, role: "alert" });
  const out = h("output", { id: `${prefix}-radius-out`, for: `${prefix}-radius`, text: milesLabel(values.radius) });
  const radius = h("input", {
    id: `${prefix}-radius`,
    name: "radius",
    type: "range",
    min: "1",
    max: String(maxRadius),
    step: "1",
    value: String(values.radius),
  });
  radius.addEventListener("input", () => {
    out.textContent = milesLabel(radius.value);
  });

  const submit = h("button", { class: "btn btn--yellow btn--big", type: "submit", text: submitLabel });
  const locate = allowLocate
    ? h("button", { class: "btn btn--ghost", type: "button", id: `${prefix}-locate` }, icon("locate"), h("span", { text: "Use my location instead" }))
    : null;

  const form = h(
    "form",
    { class: "area-form", novalidate: true },
    h("div", { class: "field" }, h("label", { for: `${prefix}-zip`, text: "ZIP code" }), zip, msg),
    h(
      "div",
      { class: "field" },
      h("div", { class: "field__head" }, h("label", { for: `${prefix}-radius`, text: "How far" }), out),
      radius,
      h("div", { class: "range-ends", "aria-hidden": "true" }, h("span", { text: "1 mi" }), h("span", { text: `${maxRadius} mi` })),
    ),
    showKinds &&
      h(
      "fieldset",
      { class: "field" },
      h("legend", { text: "Show me" }),
      h(
        "div",
        { class: "segmented" },
        KIND_CHOICES.map(([value, label]) => {
          const id = `${prefix}-kind-${value}`;
          return h(
            "span",
            { class: "segmented__item" },
            h("input", { type: "radio", name: `${prefix}-kind`, id, value, checked: value === kind }),
            h("label", { for: id, text: label }),
          );
        }),
      ),
    ),
    submit,
    locate,
  );

  const read = () => {
    const picked = form.querySelector(`input[name="${prefix}-kind"]:checked`);
    const kinds = !picked ? values.kinds : picked.value === "all" ? ["food", "shop"] : [picked.value];
    return { zip: zip.value.trim(), radius: Number(radius.value), kinds };
  };
  const setMessage = (text) => {
    msg.textContent = text || "";
    zip.toggleAttribute("aria-invalid", !!text);
  };
  const setBusy = (busy) => {
    submit.disabled = busy;
    if (locate) locate.disabled = busy;
  };

  zip.addEventListener("input", () => {
    zip.value = zip.value.replace(/\D/g, "").slice(0, 5);
    setMessage("");
  });
  form.addEventListener("submit", (e) => {
    e.preventDefault();
    onSubmit(read(), { setMessage, setBusy });
  });
  if (locate) locate.addEventListener("click", () => onLocate(read(), { setMessage, setBusy }));

  return form;
}

/* ---- sheets ---- */

let sheetToken = 0;
let lastFocus = null;
let pendingConfirm = null;

export function sheetIsOpen() {
  const sheet = $("sheet");
  return !!sheet && !sheet.hidden;
}

export function openSheet(content, { tone = "navy" } = {}) {
  const sheet = $("sheet");
  const scrim = $("scrim");
  sheetToken += 1;
  if (sheet.hidden) lastFocus = document.activeElement;
  const close = h("button", { class: "sheet__close", type: "button", "aria-label": "Close", onclick: () => closeSheet() }, icon("close"));
  sheet.className = `sheet sheet--${tone}`;
  sheet.replaceChildren(close, content);
  sheet.hidden = false;
  scrim.hidden = false;
  sheet.scrollTop = 0;
  requestAnimationFrame(() => {
    sheet.classList.add("is-open");
    scrim.classList.add("is-on");
  });
  sheet.focus({ preventScroll: true });
}

export function closeSheet() {
  const sheet = $("sheet");
  const scrim = $("scrim");
  if (sheet.hidden) return;
  const token = (sheetToken += 1);
  sheet.classList.remove("is-open");
  scrim.classList.remove("is-on");
  if (pendingConfirm) {
    const settle = pendingConfirm;
    pendingConfirm = null;
    settle(false);
  }
  setTimeout(() => {
    if (token !== sheetToken) return; // another sheet opened meanwhile
    sheet.hidden = true;
    scrim.hidden = true;
    sheet.replaceChildren();
  }, 260);
  if (lastFocus && typeof lastFocus.focus === "function") lastFocus.focus({ preventScroll: true });
}

// An in-page confirmation (the browser's own confirm box isn't available everywhere the app runs).
export function confirmSheet({ title, body, confirmLabel, cancelLabel = "Cancel" }) {
  return new Promise((resolve) => {
    const finish = (answer) => {
      pendingConfirm = null;
      resolve(answer);
      closeSheet();
    };
    const content = h(
      "div",
      { class: "panel" },
      h("h2", { class: "panel__title", id: "sheet-title", text: title }),
      h("p", { class: "panel__text", text: body }),
      h(
        "div",
        { class: "btn-row" },
        h("button", { class: "btn btn--ghost", type: "button", onclick: () => finish(false), text: cancelLabel }),
        h("button", { class: "btn btn--yellow", type: "button", onclick: () => finish(true), text: confirmLabel }),
      ),
    );
    openSheet(content);
    pendingConfirm = resolve;
  });
}

// Keeps Tab inside an open sheet and lets Escape close it.
export function bindSheetKeys() {
  $("scrim").addEventListener("click", () => closeSheet());
  document.addEventListener("keydown", (e) => {
    if (!sheetIsOpen()) return;
    if (e.key === "Escape") {
      e.preventDefault();
      closeSheet();
      return;
    }
    if (e.key !== "Tab") return;
    const sheet = $("sheet");
    const items = [...sheet.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), [tabindex="0"]')];
    if (!items.length) return;
    const first = items[0];
    const last = items[items.length - 1];
    if (e.shiftKey && (document.activeElement === first || document.activeElement === sheet)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
}

/* ---- messages ---- */

let toastTimer = 0;

export function toast(text) {
  const el = $("toast");
  el.textContent = text;
  el.classList.add("is-on");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove("is-on"), 2200);
}

export function announce(text) {
  $("announcer").textContent = text;
}

// The block shown in place of the deck: loading, nothing left, or a problem.
export function deckMessage({ title, text, busy = false, actions = [] }) {
  return h(
    "div",
    { class: `deck-msg${busy ? " deck-msg--busy" : ""}` },
    awning(5, "awning--mini"),
    h("h2", { class: "deck-msg__title", text: title }),
    text ? h("p", { class: "deck-msg__text", text }) : null,
    actions.length
      ? h(
          "div",
          { class: "deck-msg__actions" },
          actions.map(([label, onclick, style]) =>
            h("button", { class: `btn btn--${style || "ghost"}`, type: "button", onclick, text: label }),
          ),
        )
      : null,
  );
}
