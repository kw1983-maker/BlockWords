// Procedural 16x16 pixel-art texture atlas, drawn to a canvas at load time.
// No image files: every tile is generated in code, then sampled with a NEAREST
// filter so it stays crisp and blocky like the original.

import { BLOCKS, WOOL_COLOURS } from './blocks.js';
import { mulberry32 } from './noise.js';

export const TILE = 16;   // pixels per tile
export const COLS = 8;    // tiles per atlas row

const defs = [];                 // [{ name, draw }]
export const TILE_INDEX = {};    // tile name -> index in the atlas

function tile(name, draw) {
  TILE_INDEX[name] = defs.length;
  defs.push({ name, draw });
}

// ---------------------------------------------------------------- pixel API
// Each draw function gets `p`, a tiny painter over one 16x16 RGBA buffer.
function painter(buf, seed) {
  const rnd = mulberry32(seed);
  const put = (x, y, r, g, b, a) => {
    if (x < 0 || y < 0 || x >= TILE || y >= TILE) return;
    const i = (y * TILE + x) * 4;
    buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = a === undefined ? 255 : a;
  };
  return {
    rnd,
    clear() { buf.fill(0); },
    // Flat fill with per-pixel brightness jitter — the base of most tiles.
    fill(col, jitter = 0, alpha = 255) {
      for (let y = 0; y < TILE; y++) {
        for (let x = 0; x < TILE; x++) {
          const d = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
          put(x, y, col[0] + d, col[1] + d, col[2] + d, alpha);
        }
      }
    },
    set: put,
    rect(x0, y0, w, h, col, jitter = 0, alpha = 255) {
      for (let y = y0; y < y0 + h; y++) {
        for (let x = x0; x < x0 + w; x++) {
          const d = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
          put(x, y, col[0] + d, col[1] + d, col[2] + d, alpha);
        }
      }
    },
    // Random blobs — cobble lumps, ore veins, gravel stones.
    blobs(count, size, col, jitter = 0) {
      for (let i = 0; i < count; i++) {
        const cx = Math.floor(rnd() * TILE), cy = Math.floor(rnd() * TILE);
        const r = size * (0.6 + rnd() * 0.8);
        for (let y = -Math.ceil(r); y <= Math.ceil(r); y++) {
          for (let x = -Math.ceil(r); x <= Math.ceil(r); x++) {
            if (x * x + y * y > r * r) continue;
            const d = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
            put((cx + x + TILE) % TILE, (cy + y + TILE) % TILE, col[0] + d, col[1] + d, col[2] + d, 255);
          }
        }
      }
    },
    speckle(count, col, jitter = 0) {
      for (let i = 0; i < count; i++) {
        const d = jitter ? (rnd() - 0.5) * 2 * jitter : 0;
        put(Math.floor(rnd() * TILE), Math.floor(rnd() * TILE), col[0] + d, col[1] + d, col[2] + d, 255);
      }
    },
    // Punch alpha holes — leaves and other "fancy" cutout textures.
    holes(count) {
      for (let i = 0; i < count; i++) {
        const i2 = (Math.floor(rnd() * TILE) + Math.floor(rnd() * TILE) * TILE) * 4;
        buf[i2 + 3] = 0;
      }
    },
  };
}

// -------------------------------------------------------------- the tiles
const GREY = [125, 125, 125];
const DIRT = [134, 96, 67];
const GRASS = [104, 168, 70];
const SANDC = [219, 207, 163];
const OAK = [162, 130, 78];

tile('stone', (p) => { p.fill(GREY, 16); p.blobs(3, 2.2, [113, 113, 113], 8); });
tile('cobblestone', (p) => {
  p.fill([90, 90, 90], 6);
  for (let i = 0; i < 7; i++) {
    const x = Math.floor(p.rnd() * 12), y = Math.floor(p.rnd() * 12);
    const w = 3 + Math.floor(p.rnd() * 3), h = 3 + Math.floor(p.rnd() * 3);
    p.rect(x, y, w, h, [138, 138, 138], 14);
  }
});
tile('bedrock', (p) => { p.fill([70, 70, 70], 18); p.blobs(6, 2.5, [40, 40, 40], 12); p.blobs(3, 1.8, [110, 110, 110], 10); });
tile('dirt', (p) => { p.fill(DIRT, 14); p.speckle(24, [110, 78, 52], 8); });
tile('grass_top', (p) => { p.fill(GRASS, 20); p.speckle(30, [86, 150, 58], 10); });
tile('grass_side', (p) => {
  p.fill(DIRT, 14); p.speckle(20, [110, 78, 52], 8);
  p.rect(0, 0, TILE, 3, GRASS, 18);
  for (let x = 0; x < TILE; x++) { // ragged fringe where grass meets dirt
    const d = 3 + Math.floor(p.rnd() * 3);
    for (let y = 3; y < d; y++) p.set(x, y, GRASS[0] - 6, GRASS[1] - 6, GRASS[2] - 6);
  }
});
tile('path_top', (p) => { p.fill([150, 124, 88], 12); p.speckle(20, [128, 104, 72], 8); });
tile('path_side', (p) => { p.fill(DIRT, 12); p.rect(0, 0, TILE, 2, [150, 124, 88], 10); });
tile('sand', (p) => { p.fill(SANDC, 10); p.speckle(18, [204, 190, 146], 6); });
tile('sandstone', (p) => {
  p.fill([216, 203, 155], 8);
  p.rect(0, 2, TILE, 1, [190, 176, 128], 4);
  p.rect(0, 9, TILE, 1, [190, 176, 128], 4);
  p.rect(0, 14, TILE, 1, [190, 176, 128], 4);
});
tile('sandstone_top', (p) => { p.fill([222, 209, 162], 8); p.speckle(14, [198, 184, 138], 5); });
tile('gravel', (p) => { p.fill([124, 118, 114], 16); p.blobs(9, 1.8, [92, 88, 84], 12); p.blobs(5, 1.4, [156, 150, 146], 10); });
tile('snow', (p) => { p.fill([242, 248, 248], 6); p.speckle(12, [226, 234, 238], 4); });
tile('ice', (p) => { p.fill([150, 194, 238], 10, 205); p.speckle(16, [186, 218, 246], 6); });
tile('clay', (p) => { p.fill([160, 166, 179], 10); p.speckle(14, [142, 148, 162], 6); });

// Ores share the stone base so veins read as "something in the rock".
function ore(name, col) {
  tile(name, (p) => {
    p.fill(GREY, 16);
    p.blobs(4, 1.9, col, 14);
  });
}
ore('coal_ore', [34, 34, 34]);
ore('iron_ore', [197, 150, 113]);
ore('gold_ore', [246, 214, 63]);
ore('redstone_ore', [206, 40, 40]);
ore('diamond_ore', [93, 236, 245]);
ore('emerald_ore', [40, 200, 90]);

function logTiles(side, top, bark, core) {
  tile(side, (p) => {
    p.fill(bark, 12);
    for (let x = 0; x < TILE; x += 3) p.rect(x, 0, 1, TILE, [bark[0] - 22, bark[1] - 18, bark[2] - 12], 8);
  });
  tile(top, (p) => {
    p.fill(core, 10);
    for (let r = 6; r > 1; r -= 2) {
      for (let a = 0; a < 64; a++) {
        const t = (a / 64) * Math.PI * 2;
        p.set(8 + Math.round(Math.cos(t) * r), 8 + Math.round(Math.sin(t) * r), core[0] - 26, core[1] - 22, core[2] - 16);
      }
    }
  });
}
logTiles('oak_log', 'log_top', [107, 84, 50], [166, 133, 82]);
logTiles('birch_log', 'birch_log_top', [216, 214, 206], [200, 182, 140]);
logTiles('spruce_log', 'spruce_log_top', [70, 50, 28], [124, 96, 58]);

function planks(name, col) {
  tile(name, (p) => {
    p.fill(col, 12);
    for (let y = 3; y < TILE; y += 4) p.rect(0, y, TILE, 1, [col[0] - 34, col[1] - 30, col[2] - 22], 6);
    p.rect(6, 0, 1, 4, [col[0] - 34, col[1] - 30, col[2] - 22]);
    p.rect(11, 4, 1, 4, [col[0] - 34, col[1] - 30, col[2] - 22]);
    p.rect(3, 8, 1, 4, [col[0] - 34, col[1] - 30, col[2] - 22]);
    p.rect(9, 12, 1, 4, [col[0] - 34, col[1] - 30, col[2] - 22]);
  });
}
planks('oak_planks', OAK);
planks('birch_planks', [196, 180, 132]);

function leaves(name, col) {
  tile(name, (p) => { p.fill(col, 22); p.speckle(30, [col[0] - 22, col[1] - 18, col[2] - 14], 10); p.holes(26); });
}
leaves('oak_leaves', [66, 140, 52]);
leaves('birch_leaves', [128, 167, 85]);
leaves('spruce_leaves', [46, 96, 62]);

tile('tall_grass', (p) => {
  p.clear();
  for (let i = 0; i < 7; i++) {
    const x = 1 + Math.floor(p.rnd() * 14);
    const h = 6 + Math.floor(p.rnd() * 8);
    for (let y = TILE - 1; y > TILE - h; y--) {
      p.set(x + Math.round(Math.sin(y * 0.5) * 0.6), y, 88, 152, 56, 255);
    }
  }
});
tile('rose', (p) => {
  p.clear();
  p.rect(7, 8, 2, 8, [70, 130, 50]);
  p.rect(5, 10, 2, 2, [70, 130, 50]);
  p.rect(5, 3, 6, 5, [200, 50, 50], 18);
  p.rect(6, 2, 4, 1, [170, 36, 36]);
});
tile('dandelion', (p) => {
  p.clear();
  p.rect(7, 8, 2, 8, [70, 130, 50]);
  p.rect(9, 11, 2, 2, [70, 130, 50]);
  p.rect(5, 3, 6, 5, [240, 214, 60], 16);
  p.rect(6, 2, 4, 1, [214, 184, 40]);
});
tile('sugar_cane', (p) => {
  p.clear();
  p.rect(6, 0, 4, TILE, [148, 200, 118], 12);
  for (let y = 3; y < TILE; y += 5) p.rect(6, y, 4, 1, [120, 172, 92]);
});
tile('cactus', (p) => {
  p.fill([86, 132, 62], 12);
  p.rect(0, 0, 1, TILE, [62, 100, 44]);
  p.rect(15, 0, 1, TILE, [62, 100, 44]);
  for (let y = 2; y < TILE; y += 5) { p.set(4, y, 200, 210, 170); p.set(11, y + 2, 200, 210, 170); }
});
tile('cactus_top', (p) => { p.fill([102, 150, 72], 12); p.blobs(3, 2, [78, 122, 54], 8); });
tile('pumpkin', (p) => {
  p.fill([214, 122, 22], 14);
  for (let x = 2; x < TILE; x += 4) p.rect(x, 0, 1, TILE, [176, 96, 14], 6);
});
tile('pumpkin_top', (p) => { p.fill([196, 112, 20], 12); p.rect(6, 6, 4, 4, [124, 96, 40]); });

tile('glass', (p) => {
  p.clear();
  p.rect(0, 0, TILE, 1, [214, 236, 240], 0, 210);
  p.rect(0, 15, TILE, 1, [214, 236, 240], 0, 210);
  p.rect(0, 0, 1, TILE, [214, 236, 240], 0, 210);
  p.rect(15, 0, 1, TILE, [214, 236, 240], 0, 210);
  p.rect(2, 2, 4, 1, [255, 255, 255], 0, 120);
  p.rect(2, 3, 1, 3, [255, 255, 255], 0, 120);
});
tile('bricks', (p) => {
  p.fill([150, 148, 142], 4); // mortar
  for (let row = 0; row < 4; row++) {
    const off = row % 2 ? 4 : 0;
    for (let c = -1; c < 3; c++) p.rect(off + c * 8 + 1, row * 4 + 1, 6, 3, [156, 82, 62], 12);
  }
});
tile('glowstone', (p) => { p.fill([196, 158, 82], 14); p.blobs(6, 1.8, [248, 226, 140], 12); });
tile('torch', (p) => {
  p.clear();
  p.rect(7, 6, 2, 10, [128, 96, 54], 8);
  p.rect(7, 4, 2, 2, [255, 220, 90]);
  p.rect(6, 5, 1, 1, [255, 168, 40]);
  p.rect(9, 5, 1, 1, [255, 168, 40]);
});
tile('crafting_top', (p) => {
  p.fill([154, 118, 70], 10);
  p.rect(0, 5, TILE, 1, [96, 72, 40]);
  p.rect(0, 10, TILE, 1, [96, 72, 40]);
  p.rect(5, 0, 1, TILE, [96, 72, 40]);
  p.rect(10, 0, 1, TILE, [96, 72, 40]);
});
tile('crafting_side', (p) => {
  p.fill(OAK, 12);
  p.rect(0, 3, TILE, 1, [110, 84, 48]);
  p.rect(2, 6, 5, 4, [128, 100, 58]);
  p.rect(9, 8, 5, 5, [128, 100, 58]);
});
tile('furnace_top', (p) => { p.fill([108, 108, 108], 12); p.rect(4, 4, 8, 8, [86, 86, 86], 8); });
tile('furnace_side', (p) => { p.fill([108, 108, 108], 12); p.speckle(16, [90, 90, 90], 6); });
tile('furnace_front', (p) => {
  p.fill([108, 108, 108], 12);
  p.rect(3, 6, 10, 7, [48, 48, 48]);
  p.rect(4, 10, 8, 3, [70, 70, 70]);
  for (let x = 4; x < 12; x += 2) p.rect(x, 7, 1, 3, [96, 96, 96]);
});
tile('chest_top', (p) => { p.fill([150, 108, 56], 10); p.rect(0, 0, TILE, 1, [104, 74, 36]); p.rect(0, 15, TILE, 1, [104, 74, 36]); });
tile('chest_side', (p) => {
  p.fill([150, 108, 56], 10);
  p.rect(0, 4, TILE, 1, [104, 74, 36]);
  p.rect(6, 4, 4, 4, [70, 70, 74]);
  p.rect(7, 5, 2, 2, [212, 190, 90]);
});
tile('sign', (p) => {
  p.clear();
  p.rect(1, 1, 14, 9, OAK, 10);
  p.rect(1, 1, 14, 1, [126, 100, 58]);
  p.rect(3, 4, 10, 1, [96, 74, 42]);
  p.rect(3, 6, 7, 1, [96, 74, 42]);
  p.rect(7, 10, 2, 6, [126, 100, 58]);
});
tile('bookshelf', (p) => {
  p.fill(OAK, 10);
  p.rect(0, 0, TILE, 2, [126, 100, 58]);
  p.rect(0, 14, TILE, 2, [126, 100, 58]);
  const books = [[172, 60, 60], [70, 100, 180], [200, 172, 60], [80, 150, 80], [140, 80, 170]];
  for (let band = 0; band < 2; band++) {
    for (let x = 0; x < TILE; x += 3) {
      const c = books[Math.floor(p.rnd() * books.length)];
      p.rect(x, 2 + band * 6, 2, 6, c, 12);
    }
  }
});
for (const pair of WOOL_COLOURS) {
  const rgb = [(pair[1] >> 16) & 255, (pair[1] >> 8) & 255, pair[1] & 255];
  tile(pair[0] + '_wool', (p) => { p.fill(rgb, 12); p.speckle(26, [rgb[0] - 16, rgb[1] - 16, rgb[2] - 16], 8); });
}
tile('water', (p) => {
  p.fill([50, 96, 200], 14, 190);
  p.speckle(20, [80, 130, 226], 10);
});

// -------------------------------------------------------------- build it
export const ROWS = Math.ceil(defs.length / COLS);
export const ATLAS_W = COLS * TILE;
export const ATLAS_H = ROWS * TILE;

export const atlasCanvas = document.createElement('canvas');
atlasCanvas.width = ATLAS_W;
atlasCanvas.height = ATLAS_H;

export function buildAtlas() {
  const ctx = atlasCanvas.getContext('2d');
  ctx.clearRect(0, 0, ATLAS_W, ATLAS_H);
  defs.forEach((d, i) => {
    const img = ctx.createImageData(TILE, TILE);
    let seed = 0;
    for (let k = 0; k < d.name.length; k++) seed = (seed * 31 + d.name.charCodeAt(k)) >>> 0;
    const p = painter(img.data, seed || 1);
    p.fill([255, 0, 255], 0); // magenta = a tile that forgot to paint itself
    d.draw(p);
    ctx.putImageData(img, (i % COLS) * TILE, Math.floor(i / COLS) * TILE);
  });
  return atlasCanvas;
}

// UV rectangle for a tile name, inset slightly so neighbouring tiles never
// bleed in along a face edge.
const EPS = 0.0001;
export function tileUV(name) {
  const i = TILE_INDEX[name];
  if (i === undefined) { console.warn('unknown tile', name); return { u0: 0, v0: 0, u1: 1, v1: 1 }; }
  const cx = i % COLS, cy = Math.floor(i / COLS);
  return {
    u0: cx / COLS + EPS,
    u1: (cx + 1) / COLS - EPS,
    // canvas y grows downward, texture v grows upward
    v0: 1 - (cy + 1) / ROWS + EPS,
    v1: 1 - cy / ROWS - EPS,
  };
}

// Average colour of a tile — used for particles and map-ish UI dots.
const avgCache = {};
export function tileAverage(name) {
  if (avgCache[name]) return avgCache[name];
  const i = TILE_INDEX[name] || 0;
  const ctx = atlasCanvas.getContext('2d');
  const d = ctx.getImageData((i % COLS) * TILE, Math.floor(i / COLS) * TILE, TILE, TILE).data;
  let r = 0, g = 0, b = 0, n = 0;
  for (let k = 0; k < d.length; k += 4) {
    if (d[k + 3] < 128) continue;
    r += d[k]; g += d[k + 1]; b += d[k + 2]; n++;
  }
  n = n || 1;
  const c = ((r / n) << 16) | ((g / n) << 8) | (b / n);
  avgCache[name] = c;
  return c;
}

// Sanity check: every tile a block references must exist in the atlas.
export function validateTiles() {
  const missing = new Set();
  for (const b of BLOCKS) {
    if (b.name === 'air') continue;
    for (const key of ['top', 'bottom', 'side', 'front']) {
      const t = b.tiles[key];
      if (t && TILE_INDEX[t] === undefined) missing.add(b.name + '.' + key + ' -> ' + t);
    }
  }
  if (missing.size) console.warn('Missing atlas tiles:', [...missing]);
  return missing;
}
