// Every sound in the game is synthesised in the browser with WebAudio — there
// are no audio files to download, and nothing here is copied from the original.

let ctx = null;
let master = null;
let musicGain = null;
let noiseBuffer = null;
let started = false;

export const Audio = {
  enabled: true,
  musicEnabled: true,
};

export function initAudio() {
  if (ctx) return ctx;
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  ctx = new AC();
  master = ctx.createGain();
  master.gain.value = 0.55;
  master.connect(ctx.destination);
  musicGain = ctx.createGain();
  musicGain.gain.value = 0.0;
  musicGain.connect(master);

  // One second of white noise, reused for every "crunchy" sound.
  noiseBuffer = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuffer.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function resumeAudio() {
  if (!ctx) initAudio();
  if (ctx && ctx.state === 'suspended') ctx.resume();
}

function now() { return ctx ? ctx.currentTime : 0; }

function tone(freq, dur, type = 'sine', vol = 0.2, slideTo = null, delay = 0) {
  if (!ctx || !Audio.enabled) return;
  const t = now() + delay;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + Math.min(0.02, dur * 0.3));
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g); g.connect(master);
  o.start(t); o.stop(t + dur + 0.02);
}

function noise(dur, vol = 0.2, filterFreq = 1200, q = 1, delay = 0, type = 'bandpass') {
  if (!ctx || !Audio.enabled) return;
  const t = now() + delay;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.value = filterFreq;
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(f); f.connect(g); g.connect(master);
  src.start(t); src.stop(t + dur + 0.02);
}

// Different materials have to *sound* different or mining feels flat.
const MATERIAL_SOUND = {
  grass: { f: 900, q: 0.7, vol: 0.16, dur: 0.09 },
  dirt: { f: 700, q: 0.8, vol: 0.16, dur: 0.09 },
  sand: { f: 1600, q: 0.5, vol: 0.13, dur: 0.11 },
  stone: { f: 2200, q: 3.0, vol: 0.15, dur: 0.06 },
  wood: { f: 1100, q: 4.0, vol: 0.16, dur: 0.07 },
  wool: { f: 500, q: 0.6, vol: 0.13, dur: 0.10 },
  glass: { f: 4200, q: 6.0, vol: 0.14, dur: 0.09 },
  plant: { f: 1500, q: 1.2, vol: 0.10, dur: 0.06 },
  snow: { f: 1300, q: 0.6, vol: 0.10, dur: 0.09 },
};

// Map a block name onto one of those material groups.
export function materialOf(blockName) {
  if (/grass_block|dirt_path/.test(blockName)) return 'grass';
  if (/dirt|clay|gravel/.test(blockName)) return 'dirt';
  if (/sand/.test(blockName)) return 'sand';
  if (/log|planks|crafting|chest|sign|bookshelf/.test(blockName)) return 'wood';
  if (/wool/.test(blockName)) return 'wool';
  if (/glass|ice/.test(blockName)) return 'glass';
  if (/leaves|grass|rose|dandelion|cane|cactus|pumpkin/.test(blockName)) return 'plant';
  if (/snow/.test(blockName)) return 'snow';
  return 'stone';
}

export const Sfx = {
  dig(mat) {
    const m = MATERIAL_SOUND[mat] || MATERIAL_SOUND.stone;
    noise(m.dur, m.vol * 0.7, m.f * (0.85 + Math.random() * 0.3), m.q);
  },
  break_(mat) {
    const m = MATERIAL_SOUND[mat] || MATERIAL_SOUND.stone;
    noise(m.dur * 2.2, m.vol * 1.3, m.f, m.q);
    noise(m.dur * 1.4, m.vol * 0.8, m.f * 0.6, m.q, 0.03);
  },
  place(mat) {
    const m = MATERIAL_SOUND[mat] || MATERIAL_SOUND.stone;
    noise(m.dur * 1.4, m.vol, m.f * 0.9, m.q);
  },
  step(mat) {
    const m = MATERIAL_SOUND[mat] || MATERIAL_SOUND.stone;
    noise(0.055, m.vol * 0.35, m.f * (0.7 + Math.random() * 0.4), m.q * 0.6);
  },
  pickup() { tone(880, 0.07, 'square', 0.09); tone(1320, 0.08, 'square', 0.07, null, 0.05); },
  craft() { tone(660, 0.08, 'triangle', 0.12); tone(880, 0.1, 'triangle', 0.12, null, 0.07); },
  hurt() { tone(180, 0.22, 'sawtooth', 0.16, 90); },
  eat() { noise(0.09, 0.12, 600, 1); noise(0.09, 0.1, 500, 1, 0.13); },
  splash() { noise(0.4, 0.18, 900, 0.4, 0, 'lowpass'); },
  levelUp() { [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.22, 'triangle', 0.13, null, i * 0.09)); },
  correct() { [659, 880].forEach((f, i) => tone(f, 0.18, 'sine', 0.15, null, i * 0.1)); },
  wrong() { tone(300, 0.2, 'sine', 0.12, 220); },
  open() { tone(420, 0.07, 'square', 0.07); },
  villager() { tone(240 + Math.random() * 60, 0.14, 'sawtooth', 0.09, 180); },
  mob(type) {
    if (type === 'pig') { tone(300, 0.13, 'sawtooth', 0.1, 210); }
    else if (type === 'cow') { tone(160, 0.45, 'sawtooth', 0.1, 130); }
    else if (type === 'sheep') { tone(420, 0.3, 'square', 0.07, 380); }
    else { tone(900, 0.07, 'square', 0.07, 1200); tone(1100, 0.06, 'square', 0.05, null, 0.09); }
  },
  hitMob() { noise(0.08, 0.2, 400, 1); },
};

// ------------------------------------------------------------------- music
// A slow, unobtrusive pad plus occasional pentatonic notes. Original, generated
// live, and quiet enough to leave under a teacher's voice.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16];
let musicTimer = null;

export function startMusic() {
  if (!ctx || musicTimer) return;
  musicGain.gain.setTargetAtTime(Audio.musicEnabled ? 0.16 : 0, now(), 1.5);

  const playNote = () => {
    if (!ctx || !Audio.musicEnabled) return;
    const root = 220;
    const semi = SCALE[Math.floor(Math.random() * SCALE.length)];
    const f = root * Math.pow(2, semi / 12);
    const t = now();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.09, t + 0.5);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 3.2);
    o.connect(g); g.connect(musicGain);
    o.start(t); o.stop(t + 3.4);

    // a soft fifth underneath
    const o2 = ctx.createOscillator();
    const g2 = ctx.createGain();
    o2.type = 'triangle';
    o2.frequency.value = f * 0.5 * 1.5;
    g2.gain.setValueAtTime(0.0001, t);
    g2.gain.exponentialRampToValueAtTime(0.05, t + 0.9);
    g2.gain.exponentialRampToValueAtTime(0.0001, t + 4.0);
    o2.connect(g2); g2.connect(musicGain);
    o2.start(t); o2.stop(t + 4.2);
  };

  musicTimer = setInterval(() => {
    if (Math.random() < 0.75) playNote();
  }, 2600);
  started = true;
}

export function setMusicEnabled(on) {
  Audio.musicEnabled = on;
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(on ? 0.16 : 0, now(), 0.8);
}

export function stopMusic() {
  if (musicTimer) { clearInterval(musicTimer); musicTimer = null; }
  if (musicGain && ctx) musicGain.gain.setTargetAtTime(0, now(), 0.5);
}
