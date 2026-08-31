// A chunk of the world: 16 x 128 x 16 blocks, its light values, and the code
// that turns those bytes into geometry.
//
// Two things happen here and nothing else:
//   computeLight() - skylight columns + torch light, flood-filled
//   buildGeometry() - face culling, ambient occlusion, atlas UVs
// Neither touches the Three.js scene; they return plain buffers that world.js
// hangs on meshes.

import * as THREE from 'three';
import { BLOCKS, B, tileFor } from './blocks.js';
import { tileUV } from './atlas.js';
import { CHUNK_X, CHUNK_Y, CHUNK_Z, CHUNK_VOL, idx } from './worldgen.js';

// How much light a see-through block eats as it passes through.
function opacityOf(id) {
  if (id === B.AIR) return 0;   // air must not dim the sky on the way down
  const b = BLOCKS[id];
  if (b.opaque) return 16;      // blocks light completely
  if (id === B.WATER) return 2;
  if (id === B.ICE) return 1;
  if (b.render === 'cross') return 0;
  return 1;                      // leaves, glass
}

export class Chunk {
  constructor(cx, cz) {
    this.cx = cx;
    this.cz = cz;
    this.data = new Uint8Array(CHUNK_VOL);
    this.sky = new Uint8Array(CHUNK_VOL);
    this.blockLight = new Uint8Array(CHUNK_VOL);
    this.generated = false;
    this.lit = false;
    this.dirty = true;       // needs remesh
    this.lightDirty = true;  // needs relight
    this.mesh = null;        // THREE.Mesh (opaque + cutout)
    this.waterMesh = null;   // THREE.Mesh (transparent)
    this.relights = 0;       // guard against endless neighbour cascades
  }

  get(x, y, z) {
    if (y < 0 || y >= CHUNK_Y) return B.AIR;
    return this.data[idx(x, y, z)];
  }

  set(x, y, z, id) {
    this.data[idx(x, y, z)] = id;
  }
}

// ------------------------------------------------------------------ lighting
// Scratch BFS queue, reused between chunks so lighting allocates nothing.
const queue = new Int32Array(CHUNK_VOL * 8);

export function computeLight(chunk, world) {
  const { data, sky, blockLight } = chunk;
  sky.fill(0);
  blockLight.fill(0);

  // --- skylight: pour 15 down every column until something eats it
  let head = 0, tail = 0;
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      let level = 15;
      for (let y = CHUNK_Y - 1; y >= 0; y--) {
        const k = idx(x, y, z);
        const op = opacityOf(data[k]);
        if (op >= 16) { level = 0; }
        else if (op > 0 && level > 0) { level = Math.max(0, level - op); }
        sky[k] = level;
        if (level > 1) queue[tail++] = k;
      }
    }
  }
  // Seed from neighbouring chunks so light does not stop at a chunk border.
  tail = seedBorders(chunk, world, sky, 'sky', queue, tail);
  spread(chunk, sky, queue, head, tail);

  // --- block light: torches, glowstone, lava-likes
  head = 0; tail = 0;
  for (let k = 0; k < CHUNK_VOL; k++) {
    const l = BLOCKS[data[k]].light;
    if (l > 0) { blockLight[k] = l; queue[tail++] = k; }
  }
  tail = seedBorders(chunk, world, blockLight, 'block', queue, tail);
  spread(chunk, blockLight, queue, 0, tail);

  chunk.lit = true;
}

// Pull light in from the four horizontal neighbours' edge columns.
function seedBorders(chunk, world, arr, kind, q, tail) {
  for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
    const n = world.getChunk(chunk.cx + ox, chunk.cz + oz, false);
    if (!n || !n.lit) continue;
    const nArr = kind === 'sky' ? n.sky : n.blockLight;
    for (let t = 0; t < CHUNK_X; t++) {
      for (let y = 0; y < CHUNK_Y; y++) {
        // local cell on our edge, and the neighbour cell touching it
        let lx, lz, nx, nz;
        if (ox === -1) { lx = 0; lz = t; nx = CHUNK_X - 1; nz = t; }
        else if (ox === 1) { lx = CHUNK_X - 1; lz = t; nx = 0; nz = t; }
        else if (oz === -1) { lx = t; lz = 0; nx = t; nz = CHUNK_Z - 1; }
        else { lx = t; lz = CHUNK_Z - 1; nx = t; nz = 0; }
        const nl = nArr[idx(nx, y, nz)];
        if (nl <= 1) continue;
        const k = idx(lx, y, lz);
        const op = opacityOf(chunk.data[k]);
        if (op >= 16) continue;
        const v = Math.max(0, nl - 1 - (op > 1 ? op - 1 : 0));
        if (v > arr[k]) { arr[k] = v; q[tail++] = k; }
      }
    }
  }
  return tail;
}

// Standard BFS flood fill, losing one level per step (skylight going straight
// down keeps its level, same as the original).
function spread(chunk, arr, q, head, tail) {
  const data = chunk.data;
  while (head < tail) {
    const k = q[head++];
    const level = arr[k];
    if (level <= 1) continue;
    const y = k % CHUNK_Y;
    const xz = (k - y) / CHUNK_Y;
    const z = xz % CHUNK_Z;
    const x = (xz - z) / CHUNK_Z;
    for (let d = 0; d < 6; d++) {
      const nx = x + (d === 0 ? 1 : d === 1 ? -1 : 0);
      const ny = y + (d === 2 ? 1 : d === 3 ? -1 : 0);
      const nz = z + (d === 4 ? 1 : d === 5 ? -1 : 0);
      if (nx < 0 || nz < 0 || nx >= CHUNK_X || nz >= CHUNK_Z || ny < 0 || ny >= CHUNK_Y) continue;
      const nk = idx(nx, ny, nz);
      const op = opacityOf(data[nk]);
      if (op >= 16) continue;
      const cost = 1 + (op > 1 ? op - 1 : 0);
      const v = level - cost;
      if (v > arr[nk]) {
        arr[nk] = v;
        if (tail < q.length) q[tail++] = nk;
      }
    }
  }
}

// ------------------------------------------------------------------ meshing
// Face table (order matches tileFor): 0=+x 1=-x 2=+y 3=-y 4=+z 5=-z
// Each corner is [x, y, z, u, v] in block-local units.
const FACES = [
  { dir: [1, 0, 0], corners: [[1, 1, 1, 0, 1], [1, 0, 1, 0, 0], [1, 1, 0, 1, 1], [1, 0, 0, 1, 0]] },
  { dir: [-1, 0, 0], corners: [[0, 1, 0, 0, 1], [0, 0, 0, 0, 0], [0, 1, 1, 1, 1], [0, 0, 1, 1, 0]] },
  { dir: [0, 1, 0], corners: [[0, 1, 1, 1, 1], [1, 1, 1, 0, 1], [0, 1, 0, 1, 0], [1, 1, 0, 0, 0]] },
  { dir: [0, -1, 0], corners: [[1, 0, 1, 1, 0], [0, 0, 1, 0, 0], [1, 0, 0, 1, 1], [0, 0, 0, 0, 1]] },
  { dir: [0, 0, 1], corners: [[0, 0, 1, 0, 0], [1, 0, 1, 1, 0], [0, 1, 1, 0, 1], [1, 1, 1, 1, 1]] },
  { dir: [0, 0, -1], corners: [[1, 0, 0, 0, 0], [0, 0, 0, 1, 0], [1, 1, 0, 0, 1], [0, 1, 0, 1, 1]] },
];
// Directional face shading — the trick that makes flat-lit voxels readable.
const FACE_SHADE = [0.62, 0.62, 1.0, 0.5, 0.82, 0.82];
const AO_LEVELS = [0.42, 0.62, 0.81, 1.0];

// Block properties the mesher needs, flattened into typed arrays. Object
// property lookups in the inner loop are the single biggest cost in a voxel
// mesher, so none happen there.
let OPAQUE = null;   // 1 = hides the face behind it
let RENDERT = null;  // 0 = cube, 1 = cross, 2 = liquid
let UVTAB = null;    // [blockId][face] -> u0, v0, u1, v1

// Built after the atlas exists, which is why this is lazy rather than top level.
function ensureTables() {
  if (OPAQUE) return;
  const n = BLOCKS.length;
  OPAQUE = new Uint8Array(n);
  RENDERT = new Uint8Array(n);
  UVTAB = new Float32Array(n * 6 * 4);
  for (let i = 0; i < n; i++) {
    const b = BLOCKS[i];
    OPAQUE[i] = b.opaque ? 1 : 0;
    RENDERT[i] = b.render === 'cross' ? 1 : b.render === 'liquid' ? 2 : 0;
    if (b.name === 'air') continue;
    for (let d = 0; d < 6; d++) {
      const uv = tileUV(tileFor(b, d));
      const o = (i * 6 + d) * 4;
      UVTAB[o] = uv.u0; UVTAB[o + 1] = uv.v0; UVTAB[o + 2] = uv.u1; UVTAB[o + 3] = uv.v1;
    }
  }
}

// One growable set of buffers per render pass, reused between chunks.
function makeBuf() {
  return {
    pos: new Float32Array(1 << 16), uv: new Float32Array(1 << 16),
    lit: new Float32Array(1 << 16), ind: new Uint32Array(1 << 16),
    nPos: 0, nUv: 0, nLit: 0, nInd: 0, nVert: 0,
  };
}
const BUFS = [makeBuf(), makeBuf()]; // 0 = opaque + cutout, 1 = water

function resetBuf(b) { b.nPos = b.nUv = b.nLit = b.nInd = b.nVert = 0; }

function grow(b, verts, inds) {
  if (b.nPos + verts * 3 > b.pos.length) { const a = new Float32Array(b.pos.length * 2); a.set(b.pos); b.pos = a; }
  if (b.nUv + verts * 2 > b.uv.length) { const a = new Float32Array(b.uv.length * 2); a.set(b.uv); b.uv = a; }
  if (b.nLit + verts * 3 > b.lit.length) { const a = new Float32Array(b.lit.length * 2); a.set(b.lit); b.lit = a; }
  if (b.nInd + inds > b.ind.length) { const a = new Uint32Array(b.ind.length * 2); a.set(b.ind); b.ind = a; }
}

function vertexAO(s1, s2, c) {
  if (s1 && s2) return 0;
  return 3 - (s1 + s2 + c);
}

// The mesher works on a padded copy of the chunk plus a one-block skin of its
// neighbours. Copying that skin once costs a fraction of a millisecond and
// turns every neighbour lookup in the inner loop — six per face for culling,
// eight more for ambient occlusion — into a flat array index with no bounds
// check and no cross-chunk branch.
const PW = CHUNK_X + 2, PD = CHUNK_Z + 2, PH = CHUNK_Y + 2;
const PAD_VOL = PW * PD * PH;
const padId = new Uint8Array(PAD_VOL);
const padSky = new Uint8Array(PAD_VOL);
const padBlk = new Uint8Array(PAD_VOL);

// Constant neighbour offsets, in the same order as FACES.
const OFF_X = PD * PH, OFF_Z = PH, OFF_Y = 1;
const FACE_OFF = [OFF_X, -OFF_X, OFF_Y, -OFF_Y, OFF_Z, -OFF_Z];

function fillPad(chunk, world) {
  const baseX = chunk.cx * CHUNK_X, baseZ = chunk.cz * CHUNK_Z;

  // Interior: one straight column copy per (x, z).
  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      const src = (x * CHUNK_Z + z) * CHUNK_Y;
      const dst = ((x + 1) * PD + (z + 1)) * PH + 1;
      padId.set(chunk.data.subarray(src, src + CHUNK_Y), dst);
      padSky.set(chunk.sky.subarray(src, src + CHUNK_Y), dst);
      padBlk.set(chunk.blockLight.subarray(src, src + CHUNK_Y), dst);
    }
  }

  // The skin: 68 columns around the edge, taken straight out of whichever
  // neighbouring chunk owns them.
  for (let px = 0; px < PW; px++) {
    for (let pz = 0; pz < PD; pz++) {
      if (px > 0 && px < PW - 1 && pz > 0 && pz < PD - 1) continue;
      const wx = baseX + px - 1, wz = baseZ + pz - 1;
      const dst = (px * PD + pz) * PH + 1;
      const ncx = Math.floor(wx / CHUNK_X), ncz = Math.floor(wz / CHUNK_Z);
      const n = world.getChunk(ncx, ncz, false);
      if (n && n.generated) {
        const src = ((wx - ncx * CHUNK_X) * CHUNK_Z + (wz - ncz * CHUNK_Z)) * CHUNK_Y;
        padId.set(n.data.subarray(src, src + CHUNK_Y), dst);
        if (n.lit) {
          padSky.set(n.sky.subarray(src, src + CHUNK_Y), dst);
          padBlk.set(n.blockLight.subarray(src, src + CHUNK_Y), dst);
        } else {
          padSky.fill(15, dst, dst + CHUNK_Y);
          padBlk.fill(0, dst, dst + CHUNK_Y);
        }
      } else {
        padId.fill(B.AIR, dst, dst + CHUNK_Y);
        padSky.fill(15, dst, dst + CHUNK_Y);
        padBlk.fill(0, dst, dst + CHUNK_Y);
      }
    }
  }

  // Below the world is solid (so nothing draws a floor under bedrock); above it
  // is open sky.
  for (let px = 0; px < PW; px++) {
    for (let pz = 0; pz < PD; pz++) {
      const c = (px * PD + pz) * PH;
      padId[c] = B.BEDROCK; padSky[c] = 0; padBlk[c] = 0;
      padId[c + PH - 1] = B.AIR; padSky[c + PH - 1] = 15; padBlk[c + PH - 1] = 0;
    }
  }
}

export function buildGeometry(chunk, world) {
  ensureTables();
  fillPad(chunk, world);
  const data = chunk.data;

  resetBuf(BUFS[0]);
  resetBuf(BUFS[1]);

  for (let x = 0; x < CHUNK_X; x++) {
    for (let z = 0; z < CHUNK_Z; z++) {
      const col = (x * CHUNK_Z + z) * CHUNK_Y;
      // Skip the empty sky above this column entirely.
      let top = -1;
      for (let y = CHUNK_Y - 1; y >= 0; y--) {
        if (data[col + y] !== B.AIR) { top = y; break; }
      }
      const pcol = ((x + 1) * PD + (z + 1)) * PH + 1;

      for (let y = 0; y <= top; y++) {
        const pi = pcol + y;
        const id = padId[pi];
        if (id === B.AIR) continue;
        const rt = RENDERT[id];
        const buf = rt === 2 ? BUFS[1] : BUFS[0];

        if (rt === 1) { emitCross(buf, x, y, z, id, padSky[pi] / 15, padBlk[pi] / 15); continue; }

        const selfOpaque = OPAQUE[id];
        for (let d = 0; d < 6; d++) {
          const ni = pi + FACE_OFF[d];
          const nid = padId[ni];
          if (OPAQUE[nid]) continue;                 // hidden by a solid neighbour
          if (nid === id && !selfOpaque) continue;   // glass/water/ice merge with themselves

          const f = FACES[d];
          const uo = (id * 6 + d) * 4;
          const u0 = UVTAB[uo], v0 = UVTAB[uo + 1], u1 = UVTAB[uo + 2], v1 = UVTAB[uo + 3];
          const skyL = padSky[ni] / 15;
          const blkL = padBlk[ni] / 15;
          const shade = FACE_SHADE[d];

          // The eight blocks ringing this face, in the face's own plane,
          // gathered once and shared by all four corners.
          let s10 = 0, sm10 = 0, s01 = 0, s0m1 = 0, s11 = 0, s1m1 = 0, sm11 = 0, sm1m1 = 0;
          if (rt === 0) {
            let oa, ob;
            if (d < 2) { oa = OFF_Y; ob = OFF_Z; }        // normal along x
            else if (d < 4) { oa = OFF_X; ob = OFF_Z; }   // normal along y
            else { oa = OFF_X; ob = OFF_Y; }              // normal along z
            s10 = OPAQUE[padId[ni + oa]]; sm10 = OPAQUE[padId[ni - oa]];
            s01 = OPAQUE[padId[ni + ob]]; s0m1 = OPAQUE[padId[ni - ob]];
            s11 = OPAQUE[padId[ni + oa + ob]]; s1m1 = OPAQUE[padId[ni + oa - ob]];
            sm11 = OPAQUE[padId[ni - oa + ob]]; sm1m1 = OPAQUE[padId[ni - oa - ob]];
          }

          grow(buf, 4, 6);
          const base = buf.nVert;
          for (let c = 0; c < 4; c++) {
            const corner = f.corners[c];
            const vx = corner[0], vy = corner[1], vz = corner[2];
            // water sits just below a full block, like the original
            const yOff = (rt === 2 && d === 2 && vy === 1) ? -0.12 : 0;
            buf.pos[buf.nPos++] = x + vx;
            buf.pos[buf.nPos++] = y + vy + yOff;
            buf.pos[buf.nPos++] = z + vz;
            buf.uv[buf.nUv++] = u0 + corner[3] * (u1 - u0);
            buf.uv[buf.nUv++] = v0 + corner[4] * (v1 - v0);

            let ao = 3;
            if (rt === 0) {
              const a = d < 2 ? vy : vx;
              const b = d < 4 ? vz : vy;
              const e1 = a === 1 ? s10 : sm10;
              const e2 = b === 1 ? s01 : s0m1;
              const cn = a === 1 ? (b === 1 ? s11 : s1m1) : (b === 1 ? sm11 : sm1m1);
              ao = vertexAO(e1, e2, cn);
            }
            buf.lit[buf.nLit++] = skyL;
            buf.lit[buf.nLit++] = blkL;
            buf.lit[buf.nLit++] = AO_LEVELS[ao] * shade;
            buf.nVert++;
          }
          buf.ind[buf.nInd++] = base; buf.ind[buf.nInd++] = base + 1; buf.ind[buf.nInd++] = base + 2;
          buf.ind[buf.nInd++] = base + 2; buf.ind[buf.nInd++] = base + 1; buf.ind[buf.nInd++] = base + 3;
        }
      }
    }
  }

  return {
    opaque: BUFS[0].nVert ? finishGeometry(BUFS[0]) : null,
    water: BUFS[1].nVert ? finishGeometry(BUFS[1]) : null,
  };
}

// Plants, torches and signs: two crossed quads, drawn from both sides.
const CROSS_QUADS = [
  [[0.146, 0.146], [0.854, 0.854]],
  [[0.854, 0.146], [0.146, 0.854]],
];

function emitCross(buf, x, y, z, id, skyL, blkL) {
  const uo = id * 6 * 4;
  const u0 = UVTAB[uo], v0 = UVTAB[uo + 1], u1 = UVTAB[uo + 2], v1 = UVTAB[uo + 3];
  for (const q of CROSS_QUADS) {
    for (let side = 0; side < 2; side++) {
      grow(buf, 4, 6);
      const base = buf.nVert;
      const p0 = side ? q[1] : q[0], p1 = side ? q[0] : q[1];
      const corners = [
        [p0[0], 0, p0[1], 0, 0], [p1[0], 0, p1[1], 1, 0],
        [p0[0], 1, p0[1], 0, 1], [p1[0], 1, p1[1], 1, 1],
      ];
      for (const c of corners) {
        buf.pos[buf.nPos++] = x + c[0]; buf.pos[buf.nPos++] = y + c[1]; buf.pos[buf.nPos++] = z + c[2];
        buf.uv[buf.nUv++] = u0 + c[3] * (u1 - u0);
        buf.uv[buf.nUv++] = v0 + c[4] * (v1 - v0);
        buf.lit[buf.nLit++] = skyL; buf.lit[buf.nLit++] = blkL; buf.lit[buf.nLit++] = 1.0;
        buf.nVert++;
      }
      buf.ind[buf.nInd++] = base; buf.ind[buf.nInd++] = base + 1; buf.ind[buf.nInd++] = base + 2;
      buf.ind[buf.nInd++] = base + 2; buf.ind[buf.nInd++] = base + 1; buf.ind[buf.nInd++] = base + 3;
    }
  }
}

function finishGeometry(b) {
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(b.pos.slice(0, b.nPos), 3));
  g.setAttribute('uv', new THREE.BufferAttribute(b.uv.slice(0, b.nUv), 2));
  g.setAttribute('alight', new THREE.BufferAttribute(b.lit.slice(0, b.nLit), 3));
  g.setIndex(new THREE.BufferAttribute(b.ind.slice(0, b.nInd), 1));
  g.computeBoundingSphere();
  return g;
}

// ----------------------------------------------------------------- materials
// One shader for the whole world. Vertex light is stored per-vertex as
// (skylight, blocklight, ao*faceShade); the day/night cycle only has to move
// the uDaylight uniform, so dusk never triggers a remesh.
const VERT = `
attribute vec3 alight;
varying vec2 vUv;
varying vec3 vLight;
varying float vFogDepth;
void main() {
  vUv = uv;
  vLight = alight;
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vFogDepth = -mv.z;
  gl_Position = projectionMatrix * mv;
}`;

const FRAG = `
uniform sampler2D map;
uniform float uDaylight;
uniform vec3 uFogColor;
uniform float uFogNear;
uniform float uFogFar;
uniform float uAlphaTest;
uniform float uOpacity;
varying vec2 vUv;
varying vec3 vLight;
varying float vFogDepth;
void main() {
  vec4 tex = texture2D(map, vUv);
  if (tex.a < uAlphaTest) discard;
  float level = max(vLight.x * uDaylight, vLight.y);
  // A floor of 0.14 rather than near-black: caves must still feel dark and
  // worth a torch, but a Year 1 pupil should never be looking at a blank screen.
  float shade = 0.14 + 0.86 * pow(level, 1.3);
  vec3 col = tex.rgb * shade * vLight.z;
  float fogFactor = smoothstep(uFogNear, uFogFar, vFogDepth);
  col = mix(col, uFogColor, fogFactor);
  gl_FragColor = vec4(col, tex.a * uOpacity);
}`;

export function makeMaterials(texture) {
  const shared = {
    map: { value: texture },
    uDaylight: { value: 1 },
    uFogColor: { value: new THREE.Color(0x87ceeb) },
    uFogNear: { value: 40 },
    uFogFar: { value: 130 },
  };
  const solid = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uAlphaTest: { value: 0.5 }, uOpacity: { value: 1 } }),
    vertexShader: VERT, fragmentShader: FRAG,
  });
  const water = new THREE.ShaderMaterial({
    uniforms: Object.assign({}, shared, { uAlphaTest: { value: 0.02 }, uOpacity: { value: 0.78 } }),
    vertexShader: VERT, fragmentShader: FRAG,
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
  });
  // Keep one handle on the uniforms both materials share.
  const sync = (name, value) => {
    solid.uniforms[name].value = value;
    water.uniforms[name].value = value;
  };
  return { solid, water, sync };
}
