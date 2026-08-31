// All of the 2D interface: hotbar, hearts and hunger, the inventory / crafting
// / furnace screen, the villager quest dialog, advancement toasts and the F3
// overlay. Game logic lives elsewhere; this module only reads state and calls
// back into it.

import { ITEMS, itemIcon, itemLabel } from './items.js';
import { findRecipe } from './crafting.js';
import { HOTBAR_SIZE } from './inventory.js';
import { say, sayLines } from './speech.js';
import { Sfx } from './audio.js';
import { numberWord } from './words.js';

const $ = (id) => document.getElementById(id);

export const UI = {
  el: {},
  cursor: null,          // stack held by the mouse in the inventory screen
  mode: null,            // null | 'inventory' | 'crafting_table' | 'furnace' | 'chest'
  context: null,         // { craft, furnace, chest }
  hooks: {},             // wired up by main.js
  lastItemName: '',
};

export function initUI(hooks) {
  UI.hooks = hooks || {};
  UI.el = {
    hud: $('hud'), hotbar: $('hotbar'), hearts: $('hearts'), hunger: $('hunger'),
    itemName: $('item-name'), crosshair: $('crosshair'), hint: $('hint-bar'),
    toasts: $('toasts'), debug: $('debug'),
    title: $('title'), loading: $('loading'), progressFill: $('progress-fill'),
    pause: $('pause'), inv: $('inv-screen'), invTitle: $('inv-title'),
    invTop: $('inv-top'), invMain: $('inv-main'), invHotbar: $('inv-hotbar'),
    drag: $('drag-stack'),
    sign: $('sign-screen'), signInput: $('sign-input'), signOk: $('sign-ok'),
    signCancel: $('sign-cancel'), signSuggest: $('sign-suggest'),
    quest: $('quest-screen'), questName: $('quest-name'), questVisual: $('quest-visual'),
    questText: $('quest-text'), questProgress: $('quest-progress'),
    questAccept: $('quest-accept'), questDeliver: $('quest-deliver'),
    questClose: $('quest-close'), questSpeak: $('quest-speak'),
  };

  // Extra layers the CSS expects but that are pure decoration.
  for (const id of ['hurt-flash', 'water-tint']) {
    if (!$(id)) {
      const d = document.createElement('div');
      d.id = id;
      document.body.appendChild(d);
    }
  }
  UI.el.hurt = $('hurt-flash');
  UI.el.water = $('water-tint');

  document.addEventListener('mousemove', (e) => {
    if (!UI.cursor) return;
    UI.el.drag.style.left = e.clientX + 'px';
    UI.el.drag.style.top = e.clientY + 'px';
  });
}

// ------------------------------------------------------------------ pips
function pip(kind, fill) {
  const d = document.createElement('div');
  d.className = 'pip';
  const c = document.createElement('canvas');
  c.width = c.height = 18;
  const g = c.getContext('2d');
  const draw = (colour) => {
    g.fillStyle = colour;
    if (kind === 'heart') {
      g.fillRect(4, 4, 9, 6);
      g.fillRect(5, 10, 7, 2);
      g.fillRect(6, 12, 5, 1);
      g.fillRect(7, 13, 3, 1);
      g.fillRect(8, 14, 1, 1);
      g.clearRect(8, 3, 1, 2);
    } else {
      g.fillRect(3, 5, 12, 6);   // drumstick-ish hunger shank
      g.fillRect(5, 3, 8, 3);
      g.fillRect(6, 11, 6, 3);
      g.fillRect(2, 8, 2, 4);
    }
  };
  draw('#3a3a3a');
  if (fill > 0) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = kind === 'heart' ? '#e03a3a' : '#c8862c';
    g.fillRect(0, 0, 18 * fill, 18);
    g.globalCompositeOperation = 'source-over';
  }
  d.style.backgroundImage = 'url(' + c.toDataURL() + ')';
  return d;
}

export function renderBars(player) {
  const { hearts, hunger } = UI.el;
  const hp = player.health, fd = player.hunger;
  if (hearts.dataset.hp !== String(hp)) {
    hearts.dataset.hp = String(hp);
    hearts.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      hearts.appendChild(pip('heart', Math.max(0, Math.min(1, hp / 2 - i))));
    }
  }
  if (hunger.dataset.fd !== String(fd)) {
    hunger.dataset.fd = String(fd);
    hunger.innerHTML = '';
    for (let i = 0; i < 10; i++) {
      hunger.appendChild(pip('hunger', Math.max(0, Math.min(1, fd / 2 - i))));
    }
  }
}

// --------------------------------------------------------------- hotbar
function slotEl(stack, extra = '') {
  const d = document.createElement('div');
  d.className = 'slot ' + extra;
  if (stack) {
    const img = document.createElement('img');
    img.src = itemIcon(stack.item);
    img.alt = itemLabel(stack.item);
    d.appendChild(img);
    if (stack.count > 1) {
      const c = document.createElement('span');
      c.className = 'count';
      c.textContent = stack.count;
      d.appendChild(c);
    }
  }
  return d;
}

export function renderHotbar(inv) {
  const bar = UI.el.hotbar;
  bar.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    bar.appendChild(slotEl(inv.slots[i], i === inv.selected ? 'sel' : ''));
  }
}

// The item-name banner the original shows when you change slot — here it is
// also spoken, which is where most of the vocabulary practice comes from.
export function announceItem(inv, speakIt = true) {
  const s = inv.slots[inv.selected];
  const label = s ? itemLabel(s.item) : '';
  UI.el.itemName.textContent = label;
  UI.el.itemName.classList.toggle('show', !!label);
  clearTimeout(UI._nameTimer);
  UI._nameTimer = setTimeout(() => UI.el.itemName.classList.remove('show'), 2200);
  if (label && speakIt) say(label);
  UI.lastItemName = label;
}

// ---------------------------------------------------------------- toasts
export function toast(title, sub, emoji, kind = '') {
  const d = document.createElement('div');
  d.className = 'toast ' + kind;
  d.innerHTML =
    '<span class="toast-emoji"></span>' +
    '<span><span class="toast-title"></span><br><span class="toast-sub"></span></span>';
  d.querySelector('.toast-emoji').textContent = emoji || '⭐';
  d.querySelector('.toast-title').textContent = title;
  d.querySelector('.toast-sub').textContent = sub || '';
  UI.el.toasts.appendChild(d);
  setTimeout(() => { d.style.transition = 'opacity .5s'; d.style.opacity = '0'; }, 5000);
  setTimeout(() => d.remove(), 5600);
}

export function hint(html) {
  if (UI._hint === html) return;   // called every frame; only touch the DOM on a change
  UI._hint = html;
  if (!html) { UI.el.hint.classList.add('hidden'); return; }
  UI.el.hint.innerHTML = html;
  UI.el.hint.classList.remove('hidden');
}

export function flashHurt() {
  UI.el.hurt.style.opacity = '1';
  setTimeout(() => { UI.el.hurt.style.opacity = '0'; }, 120);
}

export function setUnderwater(on) {
  UI.el.water.style.opacity = on ? '1' : '0';
}

// ------------------------------------------------------- inventory screen
function stacksEqual(a, b) { return a && b && a.item === b.item; }

function setCursor(stack) {
  UI.cursor = stack;
  const d = UI.el.drag;
  if (!stack) { d.classList.add('hidden'); d.innerHTML = ''; return; }
  d.classList.remove('hidden');
  d.innerHTML = '<img src="' + itemIcon(stack.item) + '">' +
    (stack.count > 1 ? '<span class="count">' + stack.count + '</span>' : '');
}

// One click handler shared by every ordinary slot: left click moves a whole
// stack, right click splits or places one.
function bindSlot(el, get, set, opts = {}) {
  el.addEventListener('mousedown', (e) => {
    e.preventDefault();
    const cur = UI.cursor;
    const here = get();

    if (opts.output) { // crafting / smelting result: take only
      if (!here) return;
      if (!cur) setCursor({ item: here.item, count: here.count });
      else if (stacksEqual(cur, here)) cur.count += here.count;
      else return;
      if (opts.onTake) opts.onTake();
      Sfx.craft();
      say(itemLabel(here.item));
      setCursor(UI.cursor);
      redrawInventory();
      return;
    }

    const right = e.button === 2;
    if (cur && !here) {
      if (right) {
        set({ item: cur.item, count: 1 });
        cur.count--;
        setCursor(cur.count > 0 ? cur : null);
      } else { set(cur); setCursor(null); }
    } else if (cur && here && stacksEqual(cur, here)) {
      const limit = ITEMS[here.item] ? ITEMS[here.item].stack : 64;
      const move = right ? Math.min(1, limit - here.count) : Math.min(cur.count, limit - here.count);
      here.count += move;
      cur.count -= move;
      set(here);
      setCursor(cur.count > 0 ? cur : null);
    } else if (cur && here) {
      set(cur);
      setCursor(here);
    } else if (here) {
      if (right) {
        const half = Math.ceil(here.count / 2);
        setCursor({ item: here.item, count: half });
        here.count -= half;
        set(here.count > 0 ? here : null);
      } else { setCursor(here); set(null); }
      say(itemLabel(here.item));
    }
    if (opts.onChange) opts.onChange();
    redrawInventory();
  });
  el.addEventListener('contextmenu', (e) => e.preventDefault());
}

export function openInventory(mode, context) {
  UI.mode = mode;
  UI.context = context || {};
  UI.el.inv.classList.remove('hidden');
  Sfx.open();
  redrawInventory();
}

export function closeInventory(inv) {
  // Anything left in the crafting grid or on the cursor goes back to the bag.
  if (UI.context && UI.context.craft) {
    for (let i = 0; i < UI.context.craft.slots.length; i++) {
      const s = UI.context.craft.slots[i];
      if (s) { inv.add(s.item, s.count); UI.context.craft.slots[i] = null; }
    }
  }
  if (UI.cursor) { inv.add(UI.cursor.item, UI.cursor.count); setCursor(null); }
  UI.mode = null;
  UI.context = null;
  UI.el.inv.classList.add('hidden');
}

export function redrawInventory() {
  if (!UI.mode) return;
  const ctx = UI.context;
  const inv = ctx.inv;
  UI.el.invTitle.textContent =
    UI.mode === 'crafting_table' ? 'Crafting Table' :
    UI.mode === 'furnace' ? 'Furnace' :
    UI.mode === 'chest' ? 'Chest' : 'Inventory';

  // --- top section
  const top = UI.el.invTop;
  top.innerHTML = '';
  if (UI.mode === 'furnace') {
    const f = ctx.furnace;
    const wrap = document.createElement('div');
    wrap.className = 'furnace-row';
    const col = document.createElement('div');
    const inSlot = slotEl(f.input);
    bindSlot(inSlot, () => f.input, (s) => { f.input = s; });
    const flame = document.createElement('div');
    flame.className = 'fuel-flame' + (f.burn > 0 ? ' lit' : '');
    flame.textContent = '🔥';
    const fuelSlot = slotEl(f.fuel);
    bindSlot(fuelSlot, () => f.fuel, (s) => { f.fuel = s; });
    col.appendChild(inSlot); col.appendChild(flame); col.appendChild(fuelSlot);
    const arrow = document.createElement('div');
    arrow.className = 'furnace-arrow';
    arrow.innerHTML = '<div style="width:' + Math.round((f.cook / f.cookMax) * 100) + '%"></div>';
    const outSlot = slotEl(f.output);
    bindSlot(outSlot, () => f.output, (s) => { f.output = s; }, {
      output: true, onTake: () => { f.output = null; },
    });
    wrap.appendChild(col); wrap.appendChild(arrow); wrap.appendChild(outSlot);
    top.appendChild(wrap);
  } else if (UI.mode === 'chest') {
    const grid = document.createElement('div');
    grid.className = 'inv-grid';
    ctx.chest.slots.forEach((s, i) => {
      const el = slotEl(s);
      bindSlot(el, () => ctx.chest.slots[i], (v) => { ctx.chest.slots[i] = v; });
      grid.appendChild(el);
    });
    top.appendChild(grid);
  } else {
    const size = UI.mode === 'crafting_table' ? 3 : 2;
    const craft = ctx.craft;
    const wrap = document.createElement('div');
    wrap.className = 'craft-wrap';
    const grid = document.createElement('div');
    grid.className = 'craft-grid';
    grid.style.gridTemplateColumns = 'repeat(' + size + ', 52px)';
    for (let i = 0; i < size * size; i++) {
      const el = slotEl(craft.slots[i]);
      bindSlot(el, () => craft.slots[i], (v) => { craft.slots[i] = v; });
      grid.appendChild(el);
    }
    const arrow = document.createElement('div');
    arrow.className = 'craft-arrow';
    arrow.textContent = '➡';
    const recipe = findRecipe(craft.slots, size);
    const result = recipe ? { item: recipe.out, count: recipe.count } : null;
    const outSlot = slotEl(result, 'craft-out');
    if (result) {
      const lbl = document.createElement('span');
      lbl.className = 'slot-label';
      lbl.textContent = itemLabel(recipe.out);
      outSlot.appendChild(lbl);
    }
    bindSlot(outSlot, () => result, () => {}, {
      output: true,
      onTake: () => {
        for (let i = 0; i < craft.slots.length; i++) {
          const s = craft.slots[i];
          if (!s) continue;
          s.count--;
          if (s.count <= 0) craft.slots[i] = null;
        }
        if (UI.hooks.onCraft) UI.hooks.onCraft(recipe.out, recipe.count);
      },
    });
    wrap.appendChild(grid); wrap.appendChild(arrow); wrap.appendChild(outSlot);
    top.appendChild(wrap);
  }

  // --- the player's own 27 + 9 slots
  const main = UI.el.invMain;
  main.innerHTML = '';
  for (let i = HOTBAR_SIZE; i < inv.slots.length; i++) {
    const el = slotEl(inv.slots[i]);
    bindSlot(el, () => inv.slots[i], (v) => { inv.slots[i] = v; });
    main.appendChild(el);
  }
  const hot = UI.el.invHotbar;
  hot.innerHTML = '';
  for (let i = 0; i < HOTBAR_SIZE; i++) {
    const el = slotEl(inv.slots[i], i === inv.selected ? 'sel' : '');
    bindSlot(el, () => inv.slots[i], (v) => { inv.slots[i] = v; });
    hot.appendChild(el);
  }
  renderHotbar(inv);
}

// ------------------------------------------------------------ quest dialog
export function openQuest(villager, quests) {
  const q = villager.quest;
  if (!q) return;
  const el = UI.el;
  el.quest.classList.remove('hidden');
  el.questName.textContent = villager.name || 'Villager';
  el.questVisual.textContent = q.emoji;

  const have = quests.measure(q, villager);
  const ready = have >= q.count;

  // Highlight the words that carry the meaning.
  let text = q.text;
  const kw = q.word.word;
  text = text.replace(new RegExp('(' + kw + 's?|' + numberWord(q.count) + ')', 'gi'),
    (m) => '<span class="kw">' + m + '</span>');
  el.questText.innerHTML = text;

  if (q.type === 'find') {
    el.questProgress.innerHTML = ready
      ? '<span class="ok">✔ You found it!</span>'
      : 'Go and look for a ' + (q.findName || kw) + '.';
  } else {
    el.questProgress.innerHTML =
      (ready ? '<span class="ok">✔ ' : '') + have + ' / ' + q.count + (ready ? '</span>' : '');
  }

  el.questAccept.classList.toggle('hidden', ready);
  el.questDeliver.classList.toggle('hidden', !ready);
  el.questDeliver.textContent = q.type === 'find' ? 'I found it!' : 'Here you are!';

  quests.speakQuest(q, villager);
  el.questSpeak.onclick = () => quests.speakQuest(q, villager);
  el.questAccept.onclick = () => closeQuest();
  el.questClose.onclick = () => closeQuest();
  el.questDeliver.onclick = () => {
    if (quests.deliver(q, villager)) {
      const rewardText = (q.reward || []).map(([it, n]) => n + ' × ' + itemLabel(it)).join(', ');
      el.questVisual.textContent = '🎉';
      el.questText.innerHTML = 'Thank you! Well done!';
      el.questProgress.innerHTML = '<span class="quest-reward">You got: ' + rewardText + '</span>';
      el.questDeliver.classList.add('hidden');
      el.questAccept.classList.remove('hidden');
      el.questAccept.textContent = 'Bye!';
      sayLines(['Thank you! Well done!', q.word.sentence || '']);
      Sfx.levelUp();
    }
  };
}

export function closeQuest() {
  UI.el.quest.classList.add('hidden');
  UI.el.questAccept.textContent = 'OK!';
  if (UI.hooks.onCloseScreen) UI.hooks.onCloseScreen();
}

export function questOpen() { return !UI.el.quest.classList.contains('hidden'); }

// ------------------------------------------------------------------ signs
// Writing a word on a sign is the one place children type English. The word
// list from the active pack is offered as buttons so a non-reader can still
// take part, and the sign reads itself back aloud.
export function openSign(current, words, onSave) {
  const el = UI.el;
  el.sign.classList.remove('hidden');
  el.signInput.value = current || '';
  el.signSuggest.innerHTML = '';
  (words || []).slice(0, 12).forEach((w) => {
    const b = document.createElement('button');
    b.textContent = (w.emoji ? w.emoji + ' ' : '') + w.word;
    b.onclick = () => { el.signInput.value = w.word; say(w.word); el.signInput.focus(); };
    el.signSuggest.appendChild(b);
  });
  setTimeout(() => el.signInput.focus(), 30);

  const close = () => {
    el.sign.classList.add('hidden');
    if (UI.hooks.onCloseScreen) UI.hooks.onCloseScreen();
  };
  el.signOk.onclick = () => {
    const text = el.signInput.value.trim();
    onSave(text);
    if (text) { Sfx.craft(); say(text, { force: true }); }
    close();
  };
  el.signCancel.onclick = close;
  el.signInput.onkeydown = (e) => {
    e.stopPropagation();
    if (e.key === 'Enter') el.signOk.click();
    if (e.key === 'Escape') close();
  };
}

export function signOpen() { return !UI.el.sign.classList.contains('hidden'); }

// ------------------------------------------------------------------ debug
export function updateDebug(lines) {
  UI.el.debug.textContent = lines.join('\n');
}

export function setDebugVisible(on) {
  UI.el.debug.classList.toggle('hidden', !on);
}

// --------------------------------------------------------------- screens
export function showTitle(on) { UI.el.title.classList.toggle('hidden', !on); }
export function showLoading(on, pct) {
  UI.el.loading.classList.toggle('hidden', !on);
  if (pct !== undefined) UI.el.progressFill.style.width = Math.round(pct * 100) + '%';
}
export function showPause(on) { UI.el.pause.classList.toggle('hidden', !on); }
export function showHud(on) {
  UI.el.hud.classList.toggle('hidden', !on);
  UI.el.crosshair.classList.toggle('hidden', !on);
}
export function anyScreenOpen() {
  return !UI.el.inv.classList.contains('hidden') ||
         !UI.el.quest.classList.contains('hidden') ||
         !UI.el.sign.classList.contains('hidden') ||
         !UI.el.pause.classList.contains('hidden') ||
         !UI.el.title.classList.contains('hidden');
}
