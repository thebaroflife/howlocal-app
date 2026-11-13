// Settings for the single-file preview that runs inside Claude.
// It carries made-up sample cards instead of the real listing files.
// scripts/build-preview.mjs swaps this in for js/config.js.
export const CONFIG = {
  dataSource: "sample",
  placesPath: "",
  defaultRadiusMi: 5,
  maxRadiusMi: 50,
  allowGeolocation: false,
  preview: true,
  exampleZip: "90012", // pre-filled on the start screen so the preview is one tap from a working deck
  version: "1.1.0 preview",
};
