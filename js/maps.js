// Real street maps for cards and the details sheet.
// Map tiles come from OpenFreeMap (free, no key) and are drawn with MapLibre (vendor/maplibre).
// Cards get a still picture of the block around each place, taken from one hidden map, so only one
// map is ever running for the deck. If the map service can't be reached, cards keep their plain look.
import { CONFIG } from "./config.js";

export const MAP_CREDIT = "Map: OpenFreeMap, © OpenStreetMap";
const CARD_ZOOM = 16.4;
const MAX_PICTURES = 80;

let libPromise = null;
let shooterPromise = null;
let queue = Promise.resolve();
const pictures = new Map(); // "lat,lon" -> promise of a picture URL

export const mapsOn = () => !!CONFIG.mapStyle && typeof document !== "undefined";

function loadLib() {
  if (!libPromise) {
    if (!document.querySelector('link[data-maplibre]')) {
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${CONFIG.mapLib}/maplibre-gl.css`;
      css.dataset.maplibre = "";
      document.head.append(css);
    }
    const url = new URL(`${CONFIG.mapLib}/maplibre-gl.mjs`, document.baseURI).href;
    libPromise = import(/* webpackIgnore: true */ url).catch((err) => {
      libPromise = null;
      throw err;
    });
  }
  return libPromise;
}

function waitFor(map, event, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`map ${event} timed out`)), ms);
    map.once(event, () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

// One hidden map that moves from place to place to take each card's picture.
function shooter() {
  if (!shooterPromise) {
    shooterPromise = (async () => {
      const gl = await loadLib();
      const box = document.createElement("div");
      box.setAttribute("aria-hidden", "true");
      box.style.cssText = "position:fixed;left:-10000px;top:0;width:430px;height:320px;pointer-events:none;";
      document.body.append(box);
      const map = new gl.Map({
        container: box,
        style: CONFIG.mapStyle,
        center: [-118.24, 34.05],
        zoom: CARD_ZOOM,
        interactive: false,
        attributionControl: false,
        preserveDrawingBuffer: true,
        fadeDuration: 0,
        pixelRatio: 2,
      });
      map.on("error", () => {}); // a missing tile isn't worth a console error; a failed load times out below
      await waitFor(map, "load", 15000);
      return map;
    })().catch((err) => {
      shooterPromise = null;
      throw err;
    });
  }
  return shooterPromise;
}

// A picture of the block around a point, as a data URL. Pictures are taken one at a time.
export function mapPicture(lat, lon) {
  const key = `${lat.toFixed(5)},${lon.toFixed(5)}`;
  if (pictures.has(key)) return pictures.get(key);
  const job = (queue = queue
    .catch(() => {})
    .then(async () => {
      const map = await shooter();
      map.jumpTo({ center: [lon, lat], zoom: CARD_ZOOM });
      await waitFor(map, "idle", 10000);
      return map.getCanvas().toDataURL("image/jpeg", 0.84);
    }));
  pictures.set(key, job);
  job.catch(() => pictures.delete(key));
  if (pictures.size > MAX_PICTURES) pictures.delete(pictures.keys().next().value);
  return job;
}

// A map people can move around, with a pin on the place. Returns a function that removes it.
export function liveMap(container, place) {
  let map = null;
  let gone = false;
  loadLib()
    .then((gl) => {
      if (gone) return;
      map = new gl.Map({
        container,
        style: CONFIG.mapStyle,
        center: [place.lon, place.lat],
        zoom: 16,
        attributionControl: { compact: true },
        cooperativeGestures: false,
        dragRotate: false,
        pitchWithRotate: false,
      });
      map.touchZoomRotate.disableRotation();
      new gl.Marker({ color: "#FEC300" }).setLngLat([place.lon, place.lat]).addTo(map);
      map.on("error", () => {});
      // Keep the map credit as the small (i) button until someone taps it.
      map.once("load", () => {
        const credit = container.querySelector(".maplibregl-ctrl-attrib");
        if (credit) credit.classList.remove("maplibregl-compact-show");
      });
    })
    .catch(() => container.classList.add("is-off"));
  return () => {
    gone = true;
    if (map) map.remove();
  };
}
