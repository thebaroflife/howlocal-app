// Settings for the single-file preview that runs inside Claude.
// Pages there can't load outside data, so the preview shows made-up sample cards.
// scripts/build-preview.mjs swaps this in for js/config.js.
export const CONFIG = {
  dataSource: "sample",
  endpoints: [],
  requestTimeoutMs: 0,
  cacheHours: 0,
  defaultRadiusMi: 5,
  maxRadiusMi: 50,
  allowGeolocation: false,
  preview: true,
  exampleZip: "90012", // pre-filled on the start screen so the preview is one tap from a working deck
  version: "1.0.0 preview",
};
