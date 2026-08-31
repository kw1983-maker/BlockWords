// Inventory model: 9 hotbar slots followed by 27 storage slots, exactly like
// the original. Pure data — the drag-and-drop screen lives in ui.js.

import { ITEMS } from './items.js';

export const HOTBAR_SIZE = 9;
export const INV_SIZE = 36;

export class Inventory {
  constructor(size = INV_SIZE) {
    this.slots = new Array(size).fill(null); // { item, count }
    this.selected = 0;
  }

  stackLimit(name) {
    const d = ITEMS[name];
    return d ? d.stack : 64;
  }

  held() { return this.slots[this.selected]; }

  heldItem() {
    const s = this.slots[this.selected];
    return s ? s.item : null;
  }

  // Fill existing stacks first, then empty slots — hotbar before storage so
  // things you pick up land where you can see them.
  add(name, count = 1) {
    if (!ITEMS[name]) return count;
    const limit = this.stackLimit(name);
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (s && s.item === name && s.count < limit) {
        const take = Math.min(limit - s.count, left);
        s.count += take;
        left -= take;
      }
    }
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      if (this.slots[i]) continue;
      const take = Math.min(limit, left);
      this.slots[i] = { item: name, count: take };
      left -= take;
    }
    return left; // whatever did not fit
  }

  count(name) {
    let n = 0;
    for (const s of this.slots) if (s && s.item === name) n += s.count;
    return n;
  }

  // Counts several items at once, e.g. "any planks".
  countAny(names) {
    let n = 0;
    for (const s of this.slots) if (s && names.indexOf(s.item) >= 0) n += s.count;
    return n;
  }

  remove(name, count = 1) {
    if (this.count(name) < count) return false;
    let left = count;
    for (let i = 0; i < this.slots.length && left > 0; i++) {
      const s = this.slots[i];
      if (!s || s.item !== name) continue;
      const take = Math.min(s.count, left);
      s.count -= take;
      left -= take;
      if (s.count <= 0) this.slots[i] = null;
    }
    return true;
  }

  // Take one item off the held stack (placing a block, eating).
  consumeHeld(n = 1) {
    const s = this.slots[this.selected];
    if (!s) return false;
    s.count -= n;
    if (s.count <= 0) this.slots[this.selected] = null;
    return true;
  }

  isEmpty() { return this.slots.every((s) => !s); }

  serialize() {
    return this.slots.map((s) => (s ? [s.item, s.count] : 0));
  }

  load(arr) {
    if (!Array.isArray(arr)) return;
    this.slots = new Array(INV_SIZE).fill(null);
    arr.forEach((v, i) => {
      if (v && ITEMS[v[0]] && i < INV_SIZE) this.slots[i] = { item: v[0], count: v[1] };
    });
  }
}

// A small container used by the crafting grid, the furnace, and chests.
export class SlotSet {
  constructor(n) { this.slots = new Array(n).fill(null); }
  clearInto(inv) {
    for (let i = 0; i < this.slots.length; i++) {
      const s = this.slots[i];
      if (s) { inv.add(s.item, s.count); this.slots[i] = null; }
    }
  }
}
