// The card stack. Draws the top three cards and turns drags, flicks, taps and button presses into swipes.

const SWIPE_FRACTION = 0.3; // drag past 30% of the card's width to commit
const FLICK_SPEED = 0.55; // pixels per millisecond
const TAP_SLOP = 8; // movement under this many pixels is a tap
const MAX_TILT_DEG = 14;

export class Deck {
  constructor(root, { render, onSwipe, onTap, onChange }) {
    this.root = root;
    this.render = render;
    this.onSwipe = onSwipe;
    this.onTap = onTap;
    this.onChange = onChange || (() => {});
    this.items = []; // places, top card first
    this.nodes = new Map(); // place id -> card element
    this.drag = null;
    this.suppressClick = false;
    root.addEventListener("pointerdown", (e) => this.#down(e));
    root.addEventListener("pointermove", (e) => this.#move(e));
    root.addEventListener("pointerup", (e) => this.#up(e));
    root.addEventListener("pointercancel", (e) => this.#cancel(e));
    // A tap is taken from the browser's own click, which arrives after the touch has fully ended.
    // (Acting on pointerup would open the details sheet and let the click that follows close it.)
    root.addEventListener("click", (e) => this.#click(e));
  }

  #click(e) {
    if (this.suppressClick) {
      this.suppressClick = false;
      return;
    }
    const node = this.#topNode();
    if (node && node.contains(e.target) && this.items[0]) this.onTap(this.items[0]);
  }

  get length() {
    return this.items.length;
  }

  top() {
    return this.items[0] || null;
  }

  clear() {
    this.items = [];
    this.drag = null;
    for (const node of this.nodes.values()) node.remove();
    this.nodes.clear();
    this.onChange();
  }

  append(places) {
    this.items.push(...places);
    this.#sync();
  }

  // Puts a card back on top (used by undo).
  unshift(place) {
    this.items = this.items.filter((p) => p.id !== place.id);
    this.items.unshift(place);
    this.#sync();
  }

  // Swipes the top card from a button or the keyboard.
  swipe(dir) {
    if (!this.items.length || this.drag) return false;
    this.#commit(dir, 0);
    return true;
  }

  #sync() {
    const visible = this.items.slice(0, 3);
    const keep = new Set(visible.map((p) => p.id));
    for (const [id, node] of this.nodes) {
      if (!keep.has(id)) {
        node.remove();
        this.nodes.delete(id);
      }
    }
    visible.forEach((place, i) => {
      let node = this.nodes.get(place.id);
      if (!node) {
        node = this.render(place);
        this.nodes.set(place.id, node);
        this.root.append(node);
      }
      node.dataset.pos = String(i);
      node.style.zIndex = String(10 - i);
      node.toggleAttribute("inert", i !== 0);
      node.setAttribute("aria-hidden", i === 0 ? "false" : "true");
    });
    this.onChange();
  }

  #topNode() {
    const place = this.items[0];
    return place ? this.nodes.get(place.id) : null;
  }

  #down(e) {
    if (this.drag || (e.pointerType === "mouse" && e.button !== 0)) return;
    const node = this.#topNode();
    if (!node || !node.contains(e.target)) return;
    this.drag = {
      id: e.pointerId,
      node,
      x0: e.clientX,
      y0: e.clientY,
      t0: e.timeStamp,
      dx: 0,
      dy: 0,
      vx: 0,
      lastX: e.clientX,
      lastT: e.timeStamp,
      moved: false,
    };
    try {
      node.setPointerCapture(e.pointerId);
    } catch {
      /* capture is a nicety */
    }
  }

  #move(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    d.dx = e.clientX - d.x0;
    d.dy = e.clientY - d.y0;
    if (!d.moved && Math.hypot(d.dx, d.dy) > TAP_SLOP) {
      d.moved = true;
      d.node.classList.add("is-dragging");
    }
    if (!d.moved) return;
    const dt = e.timeStamp - d.lastT;
    if (dt > 0) {
      d.vx = 0.7 * ((e.clientX - d.lastX) / dt) + 0.3 * d.vx;
      d.lastX = e.clientX;
      d.lastT = e.timeStamp;
    }
    this.#pose(d.node, d.dx, d.dy * 0.3);
  }

  #pose(node, dx, dy) {
    const width = node.offsetWidth || 320;
    const pull = Math.min(1, Math.abs(dx) / (width * SWIPE_FRACTION));
    node.style.transform = `translate(${dx}px, ${dy}px) rotate(${(dx / width) * MAX_TILT_DEG}deg)`;
    node.style.setProperty("--save", dx > 0 ? pull.toFixed(3) : "0");
    node.style.setProperty("--pass", dx < 0 ? pull.toFixed(3) : "0");
  }

  #up(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    try {
      d.node.releasePointerCapture(e.pointerId);
    } catch {
      /* already released */
    }
    if (!d.moved) return; // a tap: the click handler takes it from here
    // A mouse drag ends with a click on the card; ignore that one.
    this.suppressClick = true;
    setTimeout(() => {
      this.suppressClick = false;
    }, 350);
    const width = d.node.offsetWidth || 320;
    const far = Math.abs(d.dx) > width * SWIPE_FRACTION;
    const flick = Math.abs(d.vx) > FLICK_SPEED && Math.sign(d.vx) === Math.sign(d.dx) && Math.abs(d.dx) > 24;
    if (far || flick) this.#commit(d.dx > 0 ? "save" : "pass", d.dy * 0.3);
    else this.#settle(d.node);
  }

  #cancel(e) {
    const d = this.drag;
    if (!d || e.pointerId !== d.id) return;
    this.drag = null;
    if (d.moved) this.#settle(d.node);
  }

  #settle(node) {
    node.classList.remove("is-dragging");
    node.classList.add("is-returning");
    node.style.transform = "";
    node.style.setProperty("--save", "0");
    node.style.setProperty("--pass", "0");
    setTimeout(() => node.classList.remove("is-returning"), 320);
  }

  #commit(dir, dy) {
    const place = this.items.shift();
    const node = this.nodes.get(place.id);
    this.nodes.delete(place.id);
    if (node) {
      const sign = dir === "save" ? 1 : -1;
      const travel = (this.root.offsetWidth || 360) * 1.5;
      node.classList.remove("is-dragging", "is-returning");
      node.classList.add("is-leaving");
      node.dataset.pos = "out";
      node.style.zIndex = "20";
      node.style.setProperty(dir === "save" ? "--save" : "--pass", "1");
      node.setAttribute("inert", "");
      // Wait a frame so a button press animates from rest instead of jumping.
      requestAnimationFrame(() => {
        node.style.transform = `translate(${sign * travel}px, ${dy}px) rotate(${sign * 22}deg)`;
        node.style.opacity = "0";
      });
      setTimeout(() => node.remove(), 450);
    }
    this.#sync();
    this.onSwipe(place, dir);
  }
}
