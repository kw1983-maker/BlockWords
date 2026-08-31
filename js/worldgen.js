// Terrain generation: biomes, heightmap, caves, ore veins, trees and villages.
// Everything here is a pure function of (seed, x, z) so any chunk can be
// rebuilt at any time, in any order, and always comes out identical.

import { B } from './blocks.js';
import { fbm2, fbm3, hash2, hash3, mulberry32 } from './noise.js';

export const CHUNK_X = 16;
export const CHUNK_Y = 128;
export const CHUNK_Z = 16;
export const SEA_LEVEL = 62;
export const CHUNK_VOL = CHUNK_X * CHUNK_Y * CHUNK_Z;

// Column-major so a whole vertical column is contiguous — skylight sweeps and
// height lookups walk y, and this keeps them cache friendly.
export function idx(x, y, z) { return ((x * CHUNK_Z + z) * CHUNK_Y) + y; }

// ------------------------------------------------------------------ biomes
export const BIOMES = {
  ocean:  { name: 'Ocean',  surface: 'sand',        sub: 'sand',      tree: null,     treeChance: 0,     grass: 0,    flower: 0 },
  beach:  { name: 'Beach',  surface: 'sand',        sub: 'sand',      tree: null,     treeChance: 0,     grass: 0,    flower: 0 },
  plains: { name: 'Plains', surface: 'grass_block', sub: 'dirt',      tree: 'oak',    treeChance: 0.006, grass: 0.14, flower: 0.02 },
  forest: { name: 'Forest', surface: 'grass_block', sub: 'dirt',      tree: 'oak',    treeChance: 0.055, grass: 0.18, flower: 0.02 },
  birch:  { name: 'Birch Forest', surface: 'grass_block', sub: 'dirt', tree: 'birch', treeChance: 0.05,  grass: 0.16, flower: 0.03 },
  desert: { name: 'Desert', surface: 'sand',        sub: 'sandstone', tree: 'cactus', treeChance: 0.012, grass: 0,    flower: 0 },
  snowy:  { name: 'Snowy',  surface: 'snow_block',  sub: 'dirt',      tree: 'spruce', treeChance: 0.03,  grass: 0,    flower: 0 },
};

export function heightAt(seed, x, z) {
  const cont = fbm2(seed + 101, x / 420, z / 420, 4);          // continents & oceans
  const hill = fbm2(seed + 202, x / 96, z / 96, 4);            // rolling hills
  const rough = fbm2(seed + 303, x / 26, z / 26, 3);           // small bumps
  const land = 0.5 + 0.5 * cont;                              // 0 at deep sea, 1 inland
  // The +7 bias keeps most of the map walkable land rather than open ocean.
  let h = SEA_LEVEL + 7 + cont * 26 + hill * 11 * land + rough * 2.5;
  return Math.max(2, Math.min(CHUNK_Y - 10, Math.round(h)));
}

export function biomeAt(seed, x, z, h) {
  const height = h === undefined ? heightAt(seed, x, z) : h;
  if (height < SEA_LEVEL - 1) return BIOMES.ocean;
  if (height <= SEA_LEVEL + 1) return BIOMES.beach;
  const temp = fbm2(seed + 404, x / 520, z / 520, 2);
  const humid = fbm2(seed + 505, x / 470, z / 470, 2);
  if (temp < -0.3) return BIOMES.snowy;
  if (temp > 0.28 && humid < 0.05) return BIOMES.desert;
  if (humid > 0.28) return BIOMES.birch;
  if (humid > 0.05) return BIOMES.forest;
  return BIOMES.plains;
}

// Caves: two overlapping "sheets" of 3D noise. Where both are near zero the
// stone is hollowed out, which produces winding tunnels rather than blobs.
function isCave(seed, x, y, z) {
  if (y < 5) return false;
  const a = fbm3(seed + 606, x / 44, y / 22, z / 44, 2);
  if (Math.abs(a) > 0.10) return false;
  const b = fbm3(seed + 707, x / 38, y / 19, z / 38, 2);
  return Math.abs(b) < 0.10;
}

// ------------------------------------------------------------------ ores
// name, min y, max y, veins per chunk, blob size
const ORES = [
  ['coal_ore', 6, 110, 11, 14],
  ['iron_ore', 4, 68, 8, 9],
  ['gold_ore', 3, 32, 2, 7],
  ['redstone_ore', 3, 20, 3, 7],
  ['diamond_ore', 2, 15, 1, 6],
  ['emerald_ore', 3, 30, 1, 4],
];

function placeOres(seed, cx, cz, data) {
  const rnd = mulberry32((seed ^ Math.imul(cx, 0x9e3779b1) ^ Math.imul(cz, 0x85ebca6b)) >>> 0);
  for (let o = 0; o < ORES.length; o++) {
    const [name, ymin, ymax, veins, size] = ORES[o];
    const id = B[name.toUpperCase()];
    for (let v = 0; v < veins; v++) {
      if (rnd() > 0.85 && v > 0) continue;
      let x = Math.floor(rnd() * CHUNK_X);
      let y = ymin + Math.floor(rnd() * (ymax - ymin));
      let z = Math.floor(rnd() * CHUNK_Z);
      const n = 3 + Math.floor(rnd() * size);
      for (let i = 0; i < n; i++) {
        if (x >= 0 && x < CHUNK_X && z >= 0 && z < CHUNK_Z && y > 1 && y < CHUNK_Y) {
          const k = idx(x, y, z);
          if (data[k] === B.STONE) data[k] = id;
        }
        // random walk so the vein snakes through the rock
        const d = Math.floor(rnd() * 6);
        if (d === 0) x++; else if (d === 1) x--;
        else if (d === 2) y++; else if (d === 3) y--;
        else if (d === 4) z++; else z--;
      }
    }
  }
}

// ------------------------------------------------------------- base terrain
export function generateTerrain(seed, cx, cz, data) {
  const baseX = cx * CHUNK_X, baseZ = cz * CHUNK_Z;
  data.fill(B.AIR);

  for (let lx = 0; lx < CHUNK_X; lx++) {
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      const wx = baseX + lx, wz = baseZ + lz;
      const h = heightAt(seed, wx, wz);
      const biome = biomeAt(seed, wx, wz, h);
      const surfaceId = B[biome.surface.toUpperCase()];
      const subId = B[biome.sub.toUpperCase()];

      for (let y = 0; y <= h; y++) {
        let id;
        if (y === 0) id = B.BEDROCK;
        else if (y <= 2 && hash3(seed, wx, y, wz) < 0.55) id = B.BEDROCK;
        else if (y === h) id = surfaceId;
        else if (y > h - 4) id = subId;
        else id = B.STONE;

        // Underwater columns get sand/gravel instead of grass.
        if (y === h && h < SEA_LEVEL) id = hash2(seed + 9, wx, wz) < 0.25 ? B.GRAVEL : B.SAND;

        if (id !== B.BEDROCK && y < h - 1 && y < SEA_LEVEL - 1 && isCave(seed, wx, y, wz)) {
          id = B.AIR;
        }
        data[idx(lx, y, wz - baseZ)] = id;
      }

      // Fill oceans, lakes and river beds up to sea level.
      for (let y = h + 1; y <= SEA_LEVEL; y++) data[idx(lx, y, lz)] = B.WATER;
    }
  }
  placeOres(seed, cx, cz, data);
}

// --------------------------------------------------------------- features
// Trees, plants and villages can straddle chunk borders, so a chunk asks every
// neighbour within FEATURE_RADIUS to place its features too, and writes are
// clipped to this chunk. Placement is seeded per column, so both chunks agree.
export const FEATURE_RADIUS = 2;

function treeAt(seed, wx, wz, h, kind, put) {
  const rnd = mulberry32((seed ^ Math.imul(wx, 374761393) ^ Math.imul(wz, 668265263)) >>> 0);
  if (kind === 'cactus') {
    const n = 2 + Math.floor(rnd() * 2);
    for (let i = 1; i <= n; i++) put(wx, h + i, wz, B.CACTUS);
    return;
  }
  const log = kind === 'birch' ? B.BIRCH_LOG : kind === 'spruce' ? B.SPRUCE_LOG : B.OAK_LOG;
  const leaf = kind === 'birch' ? B.BIRCH_LEAVES : kind === 'spruce' ? B.SPRUCE_LEAVES : B.OAK_LEAVES;

  if (kind === 'spruce') {
    const trunk = 6 + Math.floor(rnd() * 4);
    for (let i = 1; i <= trunk; i++) put(wx, h + i, wz, log);
    for (let layer = 0; layer < 4; layer++) {
      const y = h + trunk - layer * 2;
      const r = layer === 0 ? 0 : Math.min(3, layer);
      for (let dx = -r; dx <= r; dx++) {
        for (let dz = -r; dz <= r; dz++) {
          if (Math.abs(dx) + Math.abs(dz) > r + 1) continue;
          if (dx === 0 && dz === 0 && layer > 0) continue;
          put(wx + dx, y, wz + dz, leaf);
        }
      }
    }
    put(wx, h + trunk + 1, wz, leaf);
    return;
  }

  const trunk = 4 + Math.floor(rnd() * 3);
  for (let i = 1; i <= trunk; i++) put(wx, h + i, wz, log);
  const top = h + trunk;
  for (let dy = -2; dy <= 1; dy++) {
    const r = dy <= -1 ? 2 : 1;
    for (let dx = -r; dx <= r; dx++) {
      for (let dz = -r; dz <= r; dz++) {
        if (dx === 0 && dz === 0 && dy <= 0) continue;
        if (Math.abs(dx) === r && Math.abs(dz) === r && rnd() < 0.6) continue;
        put(wx + dx, top + dy, wz + dz, leaf);
      }
    }
  }
}

// ---------------------------------------------------------------- villages
export const VILLAGE_SPACING = 224; // blocks between village grid cells

// Returns {x, z} of the village anchored to the grid cell containing (wx, wz),
// or null if that cell has no village (wrong biome / too rough / unlucky).
export function villageForCell(seed, gx, gz) {
  if (hash2(seed + 8080, gx, gz) > 0.7) return null;
  const jx = Math.floor(hash2(seed + 8081, gx, gz) * (VILLAGE_SPACING - 80)) + 40;
  const jz = Math.floor(hash2(seed + 8082, gx, gz) * (VILLAGE_SPACING - 80)) + 40;
  const x = gx * VILLAGE_SPACING + jx;
  const z = gz * VILLAGE_SPACING + jz;
  const h = heightAt(seed, x, z);
  const biome = biomeAt(seed, x, z, h);
  if (biome !== BIOMES.plains && biome !== BIOMES.forest && biome !== BIOMES.birch) return null;
  return { x, z, y: h, biome };
}

// Every village within reach of a world position (used by chunk decoration and
// by villager spawning).
export function villagesNear(seed, wx, wz, radius = VILLAGE_SPACING) {
  const out = [];
  const g0x = Math.floor((wx - radius) / VILLAGE_SPACING), g1x = Math.floor((wx + radius) / VILLAGE_SPACING);
  const g0z = Math.floor((wz - radius) / VILLAGE_SPACING), g1z = Math.floor((wz + radius) / VILLAGE_SPACING);
  for (let gx = g0x; gx <= g1x; gx++) {
    for (let gz = g0z; gz <= g1z; gz++) {
      const v = villageForCell(seed, gx, gz);
      if (v) out.push(v);
    }
  }
  return out;
}

// House layouts are deterministic per village so both the terrain pass and the
// villager spawner agree on where the doors are.
export function villageHouses(seed, village) {
  const rnd = mulberry32((seed ^ Math.imul(village.x, 2654435761) ^ Math.imul(village.z, 40503)) >>> 0);
  const count = 3 + Math.floor(rnd() * 4);
  const houses = [];
  for (let i = 0; i < count; i++) {
    const ang = rnd() * Math.PI * 2;
    const dist = 7 + rnd() * 22;
    const x = Math.round(village.x + Math.cos(ang) * dist);
    const z = Math.round(village.z + Math.sin(ang) * dist);
    houses.push({
      x, z,
      y: heightAt(seed, x, z),
      w: 5 + Math.floor(rnd() * 3),
      d: 5 + Math.floor(rnd() * 3),
      birch: rnd() < 0.4,
    });
  }
  return houses;
}

function buildHouse(seed, house, put) {
  const { x, z, y, w, d } = house;
  const planks = house.birch ? B.BIRCH_PLANKS : B.OAK_PLANKS;
  const log = house.birch ? B.BIRCH_LOG : B.OAK_LOG;
  const x0 = x - (w >> 1), z0 = z - (d >> 1);
  const wallTop = 4;

  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      put(x0 + dx, y, z0 + dz, planks);                       // floor
      for (let dy = 1; dy <= wallTop; dy++) {                 // clear the inside
        put(x0 + dx, y + dy, z0 + dz, B.AIR);
      }
    }
  }
  for (let dx = 0; dx < w; dx++) {
    for (let dz = 0; dz < d; dz++) {
      const edge = dx === 0 || dz === 0 || dx === w - 1 || dz === d - 1;
      if (!edge) continue;
      const corner = (dx === 0 || dx === w - 1) && (dz === 0 || dz === d - 1);
      for (let dy = 1; dy < wallTop; dy++) {
        const isWindow = !corner && dy === 2 && ((dx + dz) % 3 === 0);
        put(x0 + dx, y + dy, z0 + dz, isWindow ? B.GLASS : (corner ? log : planks));
      }
    }
  }
  // roof
  for (let dx = -1; dx <= w; dx++) {
    for (let dz = -1; dz <= d; dz++) {
      put(x0 + dx, y + wallTop, z0 + dz, log);
    }
  }
  // doorway on the -z wall, plus a lamp inside and a path stub outside
  const doorX = x0 + (w >> 1);
  put(doorX, y + 1, z0, B.AIR);
  put(doorX, y + 2, z0, B.AIR);
  put(doorX, y - 1, z0 - 1, B.DIRT_PATH);
  put(doorX, y, z0 - 1, B.AIR);
  put(x0 + 1, y + wallTop - 1, z0 + 1, B.GLOWSTONE);
  put(x0 + w - 2, y + 1, z0 + d - 2, B.CRAFTING_TABLE);
}

// Is (wx, wz) inside a village footprint? Cheap enough to call per column and
// keeps trees from growing through people's houses.
export function inVillage(seed, wx, wz) {
  for (const v of villagesNear(seed, wx, wz, 64)) {
    if (Math.abs(v.x - wx) <= 3 && Math.abs(v.z - wz) <= 3) return true;
    for (const h of villageHouses(seed, v)) {
      if (Math.abs(h.x - wx) <= (h.w >> 1) + 2 && Math.abs(h.z - wz) <= (h.d >> 1) + 2) return true;
    }
  }
  return false;
}

// Villages reach much further than a tree does, so they are placed once per
// chunk from a wide search rather than by asking every neighbour chunk.
export function decorateVillages(seed, cx, cz, put) {
  const baseX = cx * CHUNK_X, baseZ = cz * CHUNK_Z;
  for (const v of villagesNear(seed, baseX + 8, baseZ + 8, 120)) {
    const houses = villageHouses(seed, v);
    for (const h of houses) buildHouse(seed, h, put);

    const wy = v.y; // a well at the centre
    for (let dx = -1; dx <= 1; dx++) {
      for (let dz = -1; dz <= 1; dz++) put(v.x + dx, wy, v.z + dz, B.COBBLESTONE);
    }
    put(v.x, wy, v.z, B.WATER);

    for (const h of houses) { // paths from the well out to each door
      const steps = Math.max(1, Math.abs(h.x - v.x), Math.abs(h.z - v.z));
      for (let s = 0; s <= steps; s++) {
        const px = Math.round(v.x + ((h.x - v.x) * s) / steps);
        const pz = Math.round(v.z + ((h.z - v.z) * s) / steps);
        put(px, heightAt(seed, px, pz), pz, B.DIRT_PATH);
      }
    }
  }
}

// Trees and plants only ever reach a couple of blocks past their own column,
// so a 3x3 chunk neighbourhood covers every one that can poke into this chunk.
export function decoratePlants(seed, cx, cz, put) {
  const baseX = cx * CHUNK_X, baseZ = cz * CHUNK_Z;
  for (let lx = 0; lx < CHUNK_X; lx++) {
    for (let lz = 0; lz < CHUNK_Z; lz++) {
      const wx = baseX + lx, wz = baseZ + lz;
      const h = heightAt(seed, wx, wz);
      if (h <= SEA_LEVEL) {
        if (h === SEA_LEVEL && hash2(seed + 31, wx, wz) < 0.07) { // cane at the water's edge
          const n = 1 + Math.floor(hash2(seed + 32, wx, wz) * 3);
          for (let i = 1; i <= n; i++) put(wx, h + i, wz, B.SUGAR_CANE);
        }
        continue;
      }
      const r = hash2(seed + 41, wx, wz);
      const biome = biomeAt(seed, wx, wz, h);
      if (r > biome.treeChance + biome.grass + biome.flower && r < 0.997) continue;
      if (inVillage(seed, wx, wz)) continue;
      if (biome.tree && r < biome.treeChance) {
        treeAt(seed, wx, wz, h, biome.tree, put);
      } else if (r < biome.treeChance + biome.grass) {
        put(wx, h + 1, wz, B.TALL_GRASS);
      } else if (r < biome.treeChance + biome.grass + biome.flower) {
        put(wx, h + 1, wz, hash2(seed + 42, wx, wz) < 0.5 ? B.ROSE : B.DANDELION);
      } else if (biome === BIOMES.plains && r > 0.997) {
        put(wx, h + 1, wz, B.PUMPKIN);
      }
    }
  }
}

// Fully generate one chunk: terrain, then every feature that reaches into it.
export function generateChunk(seed, cx, cz, data) {
  generateTerrain(seed, cx, cz, data);
  const baseX = cx * CHUNK_X, baseZ = cz * CHUNK_Z;
  const put = (wx, wy, wz, id) => {
    const lx = wx - baseX, lz = wz - baseZ;
    if (lx < 0 || lz < 0 || lx >= CHUNK_X || lz >= CHUNK_Z || wy < 0 || wy >= CHUNK_Y) return;
    const k = idx(lx, wy, lz);
    // Features never carve through terrain except where they mean to
    // (house interiors pass B.AIR explicitly).
    const cur = data[k];
    if (id === B.AIR || cur === B.AIR || cur === B.WATER || cur === B.TALL_GRASS) data[k] = id;
  };
  decorateVillages(seed, cx, cz, put);
  for (let dx = -1; dx <= 1; dx++) {
    for (let dz = -1; dz <= 1; dz++) decoratePlants(seed, cx + dx, cz + dz, put);
  }
}

// Where the player starts. A village is the whole point of the English layer,
// so spawn beside the nearest one; only fall back to "any decent land" if this
// corner of the world happens not to have one.
export function findSpawn(seed) {
  let best = null, bestD = Infinity;
  for (let gx = -2; gx <= 2; gx++) {
    for (let gz = -2; gz <= 2; gz++) {
      const v = villageForCell(seed, gx, gz);
      if (!v) continue;
      const d = v.x * v.x + v.z * v.z;
      if (d < bestD) { bestD = d; best = v; }
    }
  }
  if (best) {
    // Stand just outside the village, on the first solid, dry column.
    for (let r = 14; r < 40; r += 2) {
      for (let a = 0; a < 16; a++) {
        const ang = (a / 16) * Math.PI * 2;
        const x = Math.round(best.x + Math.cos(ang) * r);
        const z = Math.round(best.z + Math.sin(ang) * r);
        const h = heightAt(seed, x, z);
        if (h > SEA_LEVEL + 1) return { x: x + 0.5, y: h + 2.2, z: z + 0.5, village: best };
      }
    }
  }
  // No village nearby: find open land with land all around it, so nobody
  // starts the lesson marooned on a one-block island.
  for (let r = 0; r < 600; r += 6) {
    for (let a = 0; a < 16; a++) {
      const ang = (a / 16) * Math.PI * 2;
      const x = Math.round(Math.cos(ang) * r);
      const z = Math.round(Math.sin(ang) * r);
      const h = heightAt(seed, x, z);
      if (h <= SEA_LEVEL + 1) continue;
      let solid = true;
      for (let k = 0; k < 8 && solid; k++) {
        const t = (k / 8) * Math.PI * 2;
        if (heightAt(seed, x + Math.round(Math.cos(t) * 7), z + Math.round(Math.sin(t) * 7)) <= SEA_LEVEL) solid = false;
      }
      if (solid) return { x: x + 0.5, y: h + 2.2, z: z + 0.5, village: null };
    }
  }
  return { x: 0.5, y: SEA_LEVEL + 8, z: 0.5, village: null };
}
