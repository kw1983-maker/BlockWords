// The chunk manager: streams chunks in and out around the player, keeps their
// light and geometry up to date within a per-frame time budget, answers block
// queries, and stores player edits as deltas so saves stay tiny on an endless
// world.

import * as THREE from 'three';
import { B, BLOCKS } from './blocks.js';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, idx, generateChunk } from './worldgen.js';
import { Chunk, computeLight, buildGeometry } from './chunk.js';

const key = (cx, cz) => cx + ',' + cz;

export class World {
  constructor(seed, scene, materials) {
    this.seed = seed;
    this.scene = scene;
    this.materials = materials;
    this.chunks = new Map();      // 'cx,cz' -> Chunk
    this.deltas = new Map();      // 'cx,cz' -> Map(localIndex -> blockId)
    this.renderDistance = 6;
    this.group = new THREE.Group();
    this.group.matrixAutoUpdate = false;
    scene.add(this.group);
    this.stats = { generated: 0, meshed: 0, pending: 0 };
  }

  // ------------------------------------------------------------- chunk access
  getChunk(cx, cz, create = false) {
    const k = key(cx, cz);
    let c = this.chunks.get(k);
    if (!c && create) {
      c = new Chunk(cx, cz);
      this.chunks.set(k, c);
    }
    return c || null;
  }

  // Generate a chunk's blocks and re-apply any edits the player made in it.
  generate(chunk) {
    generateChunk(this.seed, chunk.cx, chunk.cz, chunk.data);
    const d = this.deltas.get(key(chunk.cx, chunk.cz));
    if (d) for (const [k, id] of d) chunk.data[k] = id;
    chunk.generated = true;
    chunk.lightDirty = true;
    chunk.dirty = true;
    this.stats.generated++;
    // Faces along the shared border may now be hidden or exposed.
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.getChunk(chunk.cx + ox, chunk.cz + oz, false);
      if (n) { n.dirty = true; n.lightDirty = true; }
    }
    return chunk;
  }

  // Force a chunk to exist and be generated. Used by worldgen-adjacent queries
  // (spawn search, villager spawning) that must not wait for streaming.
  ensure(cx, cz) {
    const c = this.getChunk(cx, cz, true);
    if (!c.generated) this.generate(c);
    return c;
  }

  // ------------------------------------------------------------- block access
  getBlock(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_Y) return B.AIR;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return B.AIR;
    return c.data[idx(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)];
  }

  getSky(wx, wy, wz) {
    if (wy >= CHUNK_Y) return 15;
    if (wy < 0) return 0;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.lit) return 15;
    return c.sky[idx(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)];
  }

  getBlockLight(wx, wy, wz) {
    if (wy < 0 || wy >= CHUNK_Y) return 0;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.lit) return 0;
    return c.blockLight[idx(wx - cx * CHUNK_X, wy, wz - cz * CHUNK_Z)];
  }

  // Light level a creature/particle at this position sees — used for spawning
  // rules and for tinting entities so they darken at night like the terrain.
  lightAt(wx, wy, wz, daylight = 1) {
    const s = this.getSky(wx, wy, wz) / 15;
    const b = this.getBlockLight(wx, wy, wz) / 15;
    return Math.max(s * daylight, b);
  }

  setBlock(wx, wy, wz, id, record = true) {
    if (wy < 0 || wy >= CHUNK_Y) return false;
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.getChunk(cx, cz, false);
    if (!c || !c.generated) return false;
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    const k = idx(lx, wy, lz);
    if (c.data[k] === id) return false;
    c.data[k] = id;

    if (record) {
      const kk = key(cx, cz);
      let d = this.deltas.get(kk);
      if (!d) { d = new Map(); this.deltas.set(kk, d); }
      d.set(k, id);
    }

    c.dirty = true;
    c.lightDirty = true;
    // Anything within a block of a border, or any light change at all, can
    // affect the neighbouring chunk's faces and lighting.
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.getChunk(cx + ox, cz + oz, false);
      if (!n) continue;
      n.lightDirty = true;
      const touching = (ox === -1 && lx === 0) || (ox === 1 && lx === CHUNK_X - 1) ||
                       (oz === -1 && lz === 0) || (oz === 1 && lz === CHUNK_Z - 1);
      if (touching) n.dirty = true;
    }
    return true;
  }

  highestBlockAt(wx, wz) {
    const cx = Math.floor(wx / CHUNK_X), cz = Math.floor(wz / CHUNK_Z);
    const c = this.chunks.get(key(cx, cz));
    if (!c || !c.generated) return -1;
    const lx = wx - cx * CHUNK_X, lz = wz - cz * CHUNK_Z;
    for (let y = CHUNK_Y - 1; y >= 0; y--) {
      const id = c.data[idx(lx, y, lz)];
      if (id !== B.AIR && id !== B.WATER) return y;
    }
    return -1;
  }

  isLoaded(wx, wz) {
    const c = this.chunks.get(key(Math.floor(wx / CHUNK_X), Math.floor(wz / CHUNK_Z)));
    return !!(c && c.generated);
  }

  // ------------------------------------------------------------------ raycast
  // Amanatides & Woo voxel traversal — exact, and never steps past a block.
  raycast(origin, dir, maxDist = 5, includeLiquid = false) {
    let x = Math.floor(origin.x), y = Math.floor(origin.y), z = Math.floor(origin.z);
    const stepX = dir.x > 0 ? 1 : -1, stepY = dir.y > 0 ? 1 : -1, stepZ = dir.z > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / (dir.x || 1e-9));
    const tDeltaY = Math.abs(1 / (dir.y || 1e-9));
    const tDeltaZ = Math.abs(1 / (dir.z || 1e-9));
    const distX = stepX > 0 ? x + 1 - origin.x : origin.x - x;
    const distY = stepY > 0 ? y + 1 - origin.y : origin.y - y;
    const distZ = stepZ > 0 ? z + 1 - origin.z : origin.z - z;
    let tMaxX = tDeltaX * distX, tMaxY = tDeltaY * distY, tMaxZ = tDeltaZ * distZ;
    let face = [0, 0, 0];
    let t = 0;

    while (t <= maxDist) {
      const id = this.getBlock(x, y, z);
      if (id !== B.AIR && (includeLiquid || id !== B.WATER)) {
        return { x, y, z, id, face, distance: t };
      }
      if (tMaxX < tMaxY && tMaxX < tMaxZ) {
        x += stepX; t = tMaxX; tMaxX += tDeltaX; face = [-stepX, 0, 0];
      } else if (tMaxY < tMaxZ) {
        y += stepY; t = tMaxY; tMaxY += tDeltaY; face = [0, -stepY, 0];
      } else {
        z += stepZ; t = tMaxZ; tMaxZ += tDeltaZ; face = [0, 0, -stepZ];
      }
    }
    return null;
  }

  // ------------------------------------------------------------- streaming
  neighboursGenerated(c) {
    for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
      const n = this.chunks.get(key(c.cx + ox, c.cz + oz));
      if (!n || !n.generated) return false;
    }
    return true;
  }

  // One slice of world-building work. Returns the number of chunks still
  // waiting, so the loading screen can show progress.
  update(px, pz, budgetMs = 6) {
    const pcx = Math.floor(px / CHUNK_X), pcz = Math.floor(pz / CHUNK_Z);
    const R = this.renderDistance;
    const start = performance.now();

    // Nearest-first list of everything that should exist right now.
    const wanted = [];
    for (let dx = -R; dx <= R; dx++) {
      for (let dz = -R; dz <= R; dz++) {
        const d2 = dx * dx + dz * dz;
        if (d2 > R * R) continue;
        wanted.push([d2, pcx + dx, pcz + dz]);
      }
    }
    wanted.sort((a, b) => a[0] - b[0]);

    let pending = 0;
    // Pass 1: generate blocks.
    for (const [, cx, cz] of wanted) {
      const c = this.getChunk(cx, cz, true);
      if (c.generated) continue;
      pending++;
      if (performance.now() - start < budgetMs * 0.6) this.generate(c);
    }
    // Pass 2: light, then mesh — only once the neighbours exist, so seams and
    // edge lighting are right the first time.
    for (const [, cx, cz] of wanted) {
      const c = this.chunks.get(key(cx, cz));
      if (!c || !c.generated) continue;
      if (!this.neighboursGenerated(c)) continue;
      if (c.lightDirty) {
        pending++;
        if (performance.now() - start >= budgetMs) continue;
        computeLight(c, this);
        c.lightDirty = false;
        c.dirty = true;
      }
      if (c.dirty && c.lit) {
        pending++;
        if (performance.now() - start >= budgetMs) continue;
        this.remesh(c);
      }
    }

    this.unloadFar(pcx, pcz, R + 3);
    this.stats.pending = pending;
    return pending;
  }

  remesh(chunk) {
    const geo = buildGeometry(chunk, this);
    const px = chunk.cx * CHUNK_X, pz = chunk.cz * CHUNK_Z;

    if (chunk.mesh) { this.group.remove(chunk.mesh); chunk.mesh.geometry.dispose(); chunk.mesh = null; }
    if (chunk.waterMesh) { this.group.remove(chunk.waterMesh); chunk.waterMesh.geometry.dispose(); chunk.waterMesh = null; }

    if (geo.opaque) {
      const m = new THREE.Mesh(geo.opaque, this.materials.solid);
      m.position.set(px, 0, pz);
      m.frustumCulled = true;
      this.group.add(m);
      chunk.mesh = m;
    }
    if (geo.water) {
      const m = new THREE.Mesh(geo.water, this.materials.water);
      m.position.set(px, 0, pz);
      m.renderOrder = 1;
      this.group.add(m);
      chunk.waterMesh = m;
    }
    chunk.dirty = false;
    this.stats.meshed++;
  }

  unloadFar(pcx, pcz, maxR) {
    const r2 = maxR * maxR;
    for (const [k, c] of this.chunks) {
      const dx = c.cx - pcx, dz = c.cz - pcz;
      if (dx * dx + dz * dz <= r2) continue;
      if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
      if (c.waterMesh) { this.group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
      this.chunks.delete(k);
    }
  }

  // ------------------------------------------------------------------- saving
  serializeDeltas() {
    const out = {};
    for (const [k, map] of this.deltas) {
      const arr = new Array(map.size * 2);
      let i = 0;
      for (const [ci, id] of map) { arr[i++] = ci; arr[i++] = id; }
      out[k] = arr;
    }
    return out;
  }

  loadDeltas(obj) {
    this.deltas.clear();
    if (!obj) return;
    for (const k of Object.keys(obj)) {
      const arr = obj[k];
      const m = new Map();
      for (let i = 0; i < arr.length; i += 2) m.set(arr[i], arr[i + 1]);
      this.deltas.set(k, m);
    }
  }

  clear() {
    for (const [, c] of this.chunks) {
      if (c.mesh) { this.group.remove(c.mesh); c.mesh.geometry.dispose(); }
      if (c.waterMesh) { this.group.remove(c.waterMesh); c.waterMesh.geometry.dispose(); }
    }
    this.chunks.clear();
  }
}
