// Getting HowLocal onto a phone: which phone this is, the browser's own install prompt,
// and the free-try limit used when the app is shown inside another website.

export function platformOf({ userAgent = "", platform = "", maxTouchPoints = 0 } = {}) {
  if (/iPad|iPhone|iPod/.test(userAgent) || (platform === "MacIntel" && maxTouchPoints > 1)) return "ios";
  if (/Android/i.test(userAgent)) return "android";
  return "desktop";
}

// True when the app was opened from the home screen.
export function isInstalled(win = globalThis) {
  try {
    if (win.navigator && win.navigator.standalone === true) return true;
    return !!(win.matchMedia && win.matchMedia("(display-mode: standalone)").matches);
  } catch {
    return false;
  }
}

// True when the app is shown inside another page (for example oyom.ai/howlocal).
export function isFramed(win = globalThis) {
  try {
    return win.self !== win.top;
  } catch {
    return true;
  }
}

/* ---- the browser's own install prompt (Chrome on Android) ---- */

let deferred = null;

export function watchInstallPrompt(win = globalThis) {
  win.addEventListener("beforeinstallprompt", (e) => {
    e.preventDefault(); // shown from the "Get the app" sheet instead
    deferred = e;
  });
  win.addEventListener("appinstalled", () => {
    deferred = null;
  });
}

export const canPromptInstall = () => !!deferred;

export async function promptInstall() {
  if (!deferred) return false;
  const e = deferred;
  deferred = null;
  e.prompt();
  const choice = await Promise.resolve(e.userChoice).catch(() => null);
  return !!choice && choice.outcome === "accepted";
}

/* ---- free try ---- */

const TRY_KEY = "hl.try";

// Counts swipes made in try mode, kept on this device so a reload doesn't reset it.
export class TryLimit {
  constructor(storage, limit) {
    this.storage = storage;
    this.limit = limit;
    this.used = Math.max(0, Math.floor(Number(storage.get(TRY_KEY)) || 0));
  }

  get left() {
    return Math.max(0, this.limit - this.used);
  }

  get reached() {
    return this.used >= this.limit;
  }

  count() {
    this.used += 1;
    this.storage.set(TRY_KEY, this.used);
  }
}
