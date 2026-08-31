// The item registry. Every block is also an item; on top of those sit the
// things you cannot place — tools, ingots, food. Item icons are drawn in code:
// blocks as little isometric cubes, everything else as pixel art.

import { BLOCKS, B, TIER } from './blocks.js';
import { atlasCanvas, TILE, COLS, TILE_INDEX } from './atlas.js';

export const ITEMS = {}; // name -> definition

function item(name, o = {}) {
  ITEMS[name] = Object.assign({
    name,
    label: name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    stack: 64,
    block: null,
    tool: null,   // { type: 'pickaxe'|'axe'|'shovel'|'sword', tier }
    food: null,   // { hunger, heal }
    fuel: 0,      // smelting ticks this item is worth
  }, o);
  return ITEMS[name];
}

// --- every placeable block is an item -----------------------------------
for (const b of BLOCKS) {
  if (b.name === 'air' || b.name === 'water' || b.name === 'bedrock') continue;
  item(b.name, { label: b.label, block: b.id });
}
ITEMS.oak_log.fuel = 300;
ITEMS.birch_log.fuel = 300;
ITEMS.spruce_log.fuel = 300;
ITEMS.oak_planks.fuel = 300;
ITEMS.birch_planks.fuel = 300;
ITEMS.crafting_table.fuel = 300;

// --- materials ----------------------------------------------------------
item('stick', { label: 'Stick', fuel: 100 });
item('coal', { label: 'Coal', fuel: 1600 });
item('iron_ingot', { label: 'Iron Ingot' });
item('gold_ingot', { label: 'Gold Ingot' });
item('diamond', { label: 'Diamond' });
item('redstone', { label: 'Redstone' });
item('emerald', { label: 'Emerald' });
item('string', { label: 'String' });
item('feather', { label: 'Feather' });
item('leather', { label: 'Leather' });
item('wheat', { label: 'Wheat' });
item('clay_ball', { label: 'Clay Ball' });
item('egg', { label: 'Egg', stack: 16 });

// --- food ---------------------------------------------------------------
item('apple', { label: 'Apple', stack: 64, food: { hunger: 4, heal: 0 } });
item('bread', { label: 'Bread', food: { hunger: 5, heal: 1 } });
item('raw_porkchop', { label: 'Raw Pork', food: { hunger: 3, heal: 0 } });
item('cooked_porkchop', { label: 'Cooked Pork', food: { hunger: 8, heal: 2 } });
item('raw_beef', { label: 'Raw Beef', food: { hunger: 3, heal: 0 } });
item('cooked_beef', { label: 'Steak', food: { hunger: 8, heal: 2 } });
item('raw_mutton', { label: 'Raw Mutton', food: { hunger: 3, heal: 0 } });
item('cooked_mutton', { label: 'Cooked Mutton', food: { hunger: 7, heal: 2 } });
item('raw_chicken', { label: 'Raw Chicken', food: { hunger: 2, heal: 0 } });
item('cooked_chicken', { label: 'Cooked Chicken', food: { hunger: 6, heal: 2 } });

// --- tools --------------------------------------------------------------
const TOOL_TIERS = [
  ['wooden', TIER.WOOD], ['stone', TIER.STONE],
  ['iron', TIER.IRON], ['diamond', TIER.DIAMOND],
];
for (const [mat, tier] of TOOL_TIERS) {
  for (const type of ['pickaxe', 'axe', 'shovel', 'sword']) {
    item(mat + '_' + type, {
      label: mat.charAt(0).toUpperCase() + mat.slice(1) + ' ' + type.charAt(0).toUpperCase() + type.slice(1),
      stack: 1,
      tool: { type, tier },
      fuel: mat === 'wooden' ? 200 : 0,
    });
  }
}

export function itemDef(name) { return ITEMS[name] || null; }
export function itemLabel(name) { return ITEMS[name] ? ITEMS[name].label : name; }

// ------------------------------------------------------------------ icons
const iconCache = new Map();

function tileSrc(tileName) {
  const i = TILE_INDEX[tileName];
  if (i === undefined) return null;
  return { sx: (i % COLS) * TILE, sy: Math.floor(i / COLS) * TILE };
}

// Map a 16x16 tile onto a parallelogram, so a flat texture becomes a cube face.
function drawFace(g, tile, ox, oy, ux, uy, vx, vy, shade) {
  const src = tileSrc(tile);
  if (!src) return;
  g.save();
  g.setTransform(ux / TILE, uy / TILE, vx / TILE, vy / TILE, ox, oy);
  g.imageSmoothingEnabled = false;
  g.drawImage(atlasCanvas, src.sx, src.sy, TILE, TILE, 0, 0, TILE, TILE);
  if (shade < 1) {
    g.globalCompositeOperation = 'source-atop';
    g.fillStyle = 'rgba(0,0,0,' + (1 - shade).toFixed(3) + ')';
    g.fillRect(0, 0, TILE, TILE);
  }
  g.restore();
  g.globalCompositeOperation = 'source-over';
}

function blockIcon(bdef) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;

  if (bdef.render === 'cross') { // flowers, torches: show the sprite flat
    const src = tileSrc(bdef.tiles.side);
    if (src) g.drawImage(atlasCanvas, src.sx, src.sy, TILE, TILE, 2, 2, 28, 28);
    return c;
  }
  // Isometric cube: top rhombus, then the two visible side faces.
  drawFace(g, bdef.tiles.top, 2, 11, 14, -8, 14, 8, 1.0);
  drawFace(g, bdef.tiles.side, 2, 11, 14, 8, 0, 12, 0.72);
  drawFace(g, bdef.tiles.side, 16, 19, 14, -8, 0, 12, 0.55);
  return c;
}

// Tiny pixel-art painter for the non-block items.
function pixelIcon(draw) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const g = c.getContext('2d');
  g.imageSmoothingEnabled = false;
  const px = (x, y, col, w = 1, h = 1) => { g.fillStyle = col; g.fillRect(x * 2, y * 2, w * 2, h * 2); };
  draw(px, g);
  return c;
}

const HANDLE = '#8a6a3c';
const TOOL_COLOURS = {
  wooden: ['#a5834f', '#8a6a3c'],
  stone: ['#9b9b9b', '#7a7a7a'],
  iron: ['#d8d8d8', '#a8a8a8'],
  diamond: ['#5decf5', '#38c0cc'],
};

function toolIcon(mat, type) {
  const [light, dark] = TOOL_COLOURS[mat];
  return pixelIcon((px) => {
    for (let i = 0; i < 7; i++) px(4 + i, 11 - i, HANDLE, 1, 1); // diagonal handle
    px(3, 12, '#6e5330', 2, 2);
    if (type === 'pickaxe') {
      px(8, 2, light, 5, 1); px(7, 3, light, 2, 1); px(12, 3, light, 2, 1);
      px(6, 4, dark, 1, 1); px(13, 4, dark, 1, 1); px(9, 3, dark, 3, 1);
    } else if (type === 'axe') {
      px(9, 2, light, 4, 1); px(9, 3, light, 5, 1); px(9, 4, light, 4, 1);
      px(9, 5, dark, 3, 1); px(13, 3, dark, 1, 2);
    } else if (type === 'shovel') {
      px(10, 2, light, 4, 1); px(10, 3, light, 4, 2); px(11, 5, dark, 2, 1);
    } else {
      for (let i = 0; i < 8; i++) px(6 + i, 9 - i, light, 1, 1); // blade
      for (let i = 0; i < 7; i++) px(7 + i, 9 - i, dark, 1, 1);
      px(4, 10, '#5b4426', 4, 1); px(5, 11, '#5b4426', 2, 1);
    }
  });
}

const PIXEL_ICONS = {
  stick: (px) => { for (let i = 0; i < 9; i++) px(5 + i, 12 - i, HANDLE); px(5, 12, '#6e5330'); },
  coal: (px) => { px(5, 6, '#222', 6, 5); px(4, 7, '#222', 8, 3); px(6, 7, '#444', 2, 1); },
  iron_ingot: (px) => { px(3, 8, '#cfcfcf', 10, 4); px(4, 7, '#e8e8e8', 8, 1); px(3, 11, '#9a9a9a', 10, 1); },
  gold_ingot: (px) => { px(3, 8, '#f2c93c', 10, 4); px(4, 7, '#ffe680', 8, 1); px(3, 11, '#c49a15', 10, 1); },
  diamond: (px) => { px(6, 5, '#5decf5', 4, 1); px(5, 6, '#7ef4fa', 6, 3); px(6, 9, '#38c0cc', 4, 2); px(7, 11, '#38c0cc', 2, 1); },
  emerald: (px) => { px(6, 5, '#3ddc6a', 4, 1); px(5, 6, '#63f08c', 6, 3); px(6, 9, '#22a84c', 4, 2); },
  redstone: (px) => { px(5, 6, '#e02a2a', 2, 2); px(9, 5, '#ff4a4a', 2, 2); px(7, 9, '#c01c1c', 2, 2); px(4, 10, '#ff4a4a', 2, 2); },
  string: (px) => { for (let i = 0; i < 10; i++) px(4 + i, 5 + (i % 3), '#e8e8e8'); },
  feather: (px) => { px(9, 3, '#fff', 2, 3); px(8, 5, '#fff', 4, 3); px(7, 8, '#eee', 4, 2); px(6, 10, '#ddd', 2, 3); },
  leather: (px) => { px(4, 5, '#a06a3c', 8, 7); px(5, 6, '#bb8250', 6, 4); },
  wheat: (px) => { px(7, 4, '#e0c060', 2, 9); px(5, 6, '#e0c060', 2, 2); px(9, 6, '#e0c060', 2, 2); px(5, 9, '#e0c060', 2, 2); px(9, 9, '#e0c060', 2, 2); },
  clay_ball: (px) => { px(5, 6, '#a6acbb', 6, 5); px(6, 5, '#b9c0cd', 4, 1); },
  egg: (px) => { px(6, 4, '#f6efe0', 4, 1); px(5, 5, '#f6efe0', 6, 5); px(6, 10, '#e2d8c4', 4, 1); px(6, 6, '#fffdf6', 2, 2); },
  apple: (px) => { px(5, 5, '#d8342f', 6, 6); px(4, 6, '#d8342f', 8, 4); px(6, 4, '#7a4b22', 1, 2); px(7, 3, '#4f9e3a', 3, 1); px(6, 6, '#f06a5f', 2, 2); },
  bread: (px) => { px(3, 6, '#c58a3d', 10, 5); px(4, 5, '#d8a055', 8, 1); px(5, 7, '#a86e2a', 1, 2); px(8, 7, '#a86e2a', 1, 2); },
};
function meatIcon(raw, colA, colB) {
  return (px) => {
    px(4, 5, raw ? colA : colB, 8, 6);
    px(5, 4, raw ? colA : colB, 6, 1);
    px(6, 6, raw ? '#f3a0a0' : '#8a4a22', 3, 2);
    px(11, 9, '#efe6d0', 2, 2); // bone
  };
}
PIXEL_ICONS.raw_porkchop = meatIcon(true, '#f0a0a8', '#a05a3a');
PIXEL_ICONS.cooked_porkchop = meatIcon(false, '#f0a0a8', '#b06a34');
PIXEL_ICONS.raw_beef = meatIcon(true, '#e07070', '#8a4020');
PIXEL_ICONS.cooked_beef = meatIcon(false, '#e07070', '#8a4a24');
PIXEL_ICONS.raw_mutton = meatIcon(true, '#f0aab0', '#a86040');
PIXEL_ICONS.cooked_mutton = meatIcon(false, '#f0aab0', '#b07040');
PIXEL_ICONS.raw_chicken = meatIcon(true, '#f2ccb0', '#c08a50');
PIXEL_ICONS.cooked_chicken = meatIcon(false, '#f2ccb0', '#c89050');

export function itemIcon(name) {
  if (iconCache.has(name)) return iconCache.get(name);
  const d = ITEMS[name];
  let c;
  if (!d) {
    c = pixelIcon((px) => px(4, 4, '#f0f', 8, 8));
  } else if (d.block !== null) {
    c = blockIcon(BLOCKS[d.block]);
  } else if (d.tool) {
    c = toolIcon(name.split('_')[0], d.tool.type);
  } else if (PIXEL_ICONS[name]) {
    c = pixelIcon(PIXEL_ICONS[name]);
  } else {
    c = pixelIcon((px) => px(5, 5, '#cccccc', 6, 6));
  }
  const url = c.toDataURL();
  iconCache.set(name, url);
  return url;
}

// What a block gives you when it breaks. `apple_chance` is the oak-leaf rule:
// most leaves give nothing, now and then one drops an apple.
export function dropsOf(blockId, rand) {
  const d = BLOCKS[blockId].drops;
  if (!d) return null;
  if (d === 'apple_chance') return rand() < 0.06 ? 'apple' : null;
  if (d === 'wheat_chance') return rand() < 0.3 ? 'wheat' : null;
  return ITEMS[d] ? d : null;
}
