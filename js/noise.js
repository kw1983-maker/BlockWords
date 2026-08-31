// Seeded, allocation-free noise. Everything in the world — terrain, biomes,
// caves, ore veins, tree placement — comes from these functions, so the same
// seed always rebuilds exactly the same world.

// Fast 32-bit seeded PRNG (Mulberry32). Returns a function giving 0..1.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Deterministic hash of integer coords -> 0..1. Used for "does a tree grow in
// this column", ore scatter, mob spawn rolls: anything needing a stable random
// per world position without keeping state.
export function hash2(seed, x, y) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 12), 0x297a2d39);
  return ((h ^ (h >>> 15)) >>> 0) / 4294967296;
}

export function hash3(seed, x, y, z) {
  let h = (seed ^ Math.imul(x | 0, 0x27d4eb2d) ^ Math.imul(y | 0, 0x9e3779b1) ^ Math.imul(z | 0, 0x165667b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 15), 0x2c1b3c6d);
  h = Math.imul(h ^ (h >>> 13), 0x297a2d39);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function smooth(t) { return t * t * t * (t * (t * 6 - 15) + 10); } // quintic fade
function lerp(a, b, t) { return a + (b - a) * t; }

// Value noise: smooth, cheap, and plenty for voxel terrain.
export function noise2(seed, x, y) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = smooth(xf), v = smooth(yf);
  const n00 = hash2(seed, xi, yi), n10 = hash2(seed, xi + 1, yi);
  const n01 = hash2(seed, xi, yi + 1), n11 = hash2(seed, xi + 1, yi + 1);
  return lerp(lerp(n00, n10, u), lerp(n01, n11, u), v) * 2 - 1; // -1..1
}

export function noise3(seed, x, y, z) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
  const xf = x - xi, yf = y - yi, zf = z - zi;
  const u = smooth(xf), v = smooth(yf), w = smooth(zf);
  const c = (dx, dy, dz) => hash3(seed, xi + dx, yi + dy, zi + dz);
  const x00 = lerp(c(0, 0, 0), c(1, 0, 0), u), x10 = lerp(c(0, 1, 0), c(1, 1, 0), u);
  const x01 = lerp(c(0, 0, 1), c(1, 0, 1), u), x11 = lerp(c(0, 1, 1), c(1, 1, 1), u);
  return lerp(lerp(x00, x10, v), lerp(x01, x11, v), w) * 2 - 1;
}

// Fractal Brownian motion — stacks octaves of noise for natural-looking relief.
export function fbm2(seed, x, y, octaves = 4, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise2(seed + i * 7919, x * freq, y * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm; // -1..1
}

export function fbm3(seed, x, y, z, octaves = 3, lacunarity = 2, gain = 0.5) {
  let amp = 1, freq = 1, sum = 0, norm = 0;
  for (let i = 0; i < octaves; i++) {
    sum += noise3(seed + i * 6971, x * freq, y * freq, z * freq) * amp;
    norm += amp;
    amp *= gain;
    freq *= lacunarity;
  }
  return sum / norm;
}

// Turn any typed seed ("dinosaurs", "42", "") into a stable 32-bit int.
export function seedFromString(str) {
  if (!str) return (Math.random() * 0xffffffff) >>> 0;
  const n = Number(str);
  if (Number.isFinite(n) && str.trim() !== '') return (n >>> 0) || 1;
  let h = 2166136261 >>> 0;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}
