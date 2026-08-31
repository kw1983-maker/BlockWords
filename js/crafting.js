// Crafting and smelting. Recipes are data; the matcher handles shaped patterns
// (which can sit anywhere in the grid, like the original) and shapeless ones.

import { ITEMS } from './items.js';

export const PLANKS = ['oak_planks', 'birch_planks'];
export const LOGS = ['oak_log', 'birch_log', 'spruce_log'];

export const RECIPES = [];

function shaped(out, count, pattern, key) { RECIPES.push({ out, count, pattern, key }); }
function shapeless(out, count, ingredients) { RECIPES.push({ out, count, shapeless: ingredients }); }

// --- basics
for (const log of LOGS) shapeless(log === 'birch_log' ? 'birch_planks' : 'oak_planks', 4, [log]);
shaped('stick', 4, ['#', '#'], { '#': PLANKS });
shaped('crafting_table', 1, ['##', '##'], { '#': PLANKS });
shaped('chest', 1, ['###', '# #', '###'], { '#': PLANKS });
shaped('furnace', 1, ['###', '# #', '###'], { '#': ['cobblestone'] });
shaped('torch', 4, ['C', 'S'], { C: ['coal'], S: ['stick'] });
shaped('sign', 3, ['###', '###', ' S '], { '#': PLANKS, S: ['stick'] });
shaped('bookshelf', 1, ['###', 'WWW', '###'], { '#': PLANKS, W: ['wheat'] });
shaped('bread', 1, ['WWW'], { W: ['wheat'] });
shaped('bricks', 1, ['##', '##'], { '#': ['clay_ball'] });

// --- tools: the ladder every Minecraft game climbs
const TOOL_MATS = {
  wooden: PLANKS,
  stone: ['cobblestone'],
  iron: ['iron_ingot'],
  diamond: ['diamond'],
};
for (const mat of Object.keys(TOOL_MATS)) {
  const M = TOOL_MATS[mat];
  const S = ['stick'];
  shaped(mat + '_pickaxe', 1, ['MMM', ' S ', ' S '], { M, S });
  shaped(mat + '_axe', 1, ['MM', 'MS', ' S'], { M, S });
  shaped(mat + '_shovel', 1, ['M', 'S', 'S'], { M, S });
  shaped(mat + '_sword', 1, ['M', 'M', 'S'], { M, S });
}

// ------------------------------------------------------------------ matching
function accepts(keyEntry, name) {
  if (!keyEntry) return false;
  return Array.isArray(keyEntry) ? keyEntry.indexOf(name) >= 0 : keyEntry === name;
}

// Trim the grid down to the smallest box containing items, so a recipe can be
// laid out anywhere in a 3x3.
function bounds(grid, size) {
  let minX = size, minY = size, maxX = -1, maxY = -1;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (!grid[y * size + x]) continue;
      if (x < minX) minX = x;
      if (y < minY) minY = y;
      if (x > maxX) maxX = x;
      if (y > maxY) maxY = y;
    }
  }
  if (maxX < 0) return null;
  return { minX, minY, w: maxX - minX + 1, h: maxY - minY + 1 };
}

function matchShaped(r, grid, size) {
  const b = bounds(grid, size);
  if (!b) return false;
  const ph = r.pattern.length, pw = Math.max(...r.pattern.map((row) => row.length));
  if (pw !== b.w || ph !== b.h) return false;
  for (let y = 0; y < ph; y++) {
    for (let x = 0; x < pw; x++) {
      const ch = r.pattern[y][x] || ' ';
      const cell = grid[(b.minY + y) * size + (b.minX + x)];
      if (ch === ' ') { if (cell) return false; continue; }
      if (!cell || !accepts(r.key[ch], cell.item)) return false;
    }
  }
  return true;
}

function matchShapeless(r, grid) {
  const have = grid.filter(Boolean).map((s) => s.item);
  if (have.length !== r.shapeless.length) return false;
  const pool = have.slice();
  for (const need of r.shapeless) {
    const i = pool.indexOf(need);
    if (i < 0) return false;
    pool.splice(i, 1);
  }
  return true;
}

// grid: array of `size*size` slots, each null or { item, count }
export function findRecipe(grid, size) {
  for (const r of RECIPES) {
    if (r.shapeless ? matchShapeless(r, grid) : matchShaped(r, grid, size)) return r;
  }
  return null;
}

// Every recipe whose ingredients the player could theoretically place — used by
// the recipe helper strip so young players are not left guessing.
export function recipesFor(size) {
  return RECIPES.filter((r) => {
    if (r.shapeless) return true;
    const h = r.pattern.length, w = Math.max(...r.pattern.map((p) => p.length));
    return h <= size && w <= size;
  });
}

// ------------------------------------------------------------------ smelting
export const SMELTING = {
  iron_ore: 'iron_ingot',
  gold_ore: 'gold_ingot',
  sand: 'glass',
  cobblestone: 'stone',
  clay: 'brick_unused',
  raw_porkchop: 'cooked_porkchop',
  raw_beef: 'cooked_beef',
  raw_mutton: 'cooked_mutton',
  raw_chicken: 'cooked_chicken',
};
delete SMELTING.clay; // no brick item — clay stays a building block

export function smeltResult(name) {
  const out = SMELTING[name];
  return out && ITEMS[out] ? out : null;
}

export function fuelValue(name) {
  const d = ITEMS[name];
  return d ? d.fuel : 0;
}
