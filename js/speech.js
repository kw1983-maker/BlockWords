// Text-to-speech. Year 1 and 2 pupils largely cannot read the English in the
// game yet, so every word the game shows, it also says. This is the single
// path for that — nothing else speaks English aloud.
//
// When the game is hosted on Vercel with ELEVENLABS_API_KEY set, utterances
// go through /api/tts (a British educator voice). Otherwise, and on any
// failure, we fall back to the browser's speechSynthesis (preferring en-GB).

export const Speech = {
  enabled: true,
  voice: null,
  rate: 0.85,
  browserOk: typeof window !== 'undefined' && 'speechSynthesis' in window,
  eleven: false,          // true once /api/tts reports it is configured
  engine: 'browser',      // 'elevenlabs' | 'browser' | 'none'
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  _last: '',
  _lastAt: 0,
  _gen: 0,
  _queue: [],
  _playing: false,
  _audio: null,
  _playDone: null,
  _mem: new Map(),        // text -> object URL
  _idb: null,
  _fails: 0,
};

const TTS_PATH = '/api/tts';
const SPEECH_MEM_MAX = 150;
const SPEECH_IDB_NAME = 'blockwords-tts';
const SPEECH_IDB_STORE = 'clips';

// Prefer a British English voice (what Malaysian primary syllabuses model),
// then any English voice, then whatever the browser has.
function pickVoice() {
  if (!Speech.browserOk) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices.length) return null;
  const score = (v) => {
    let s = 0;
    if (/^en[-_]GB/i.test(v.lang)) s += 100;
    else if (/^en[-_]AU|^en[-_]NZ/i.test(v.lang)) s += 70;
    else if (/^en/i.test(v.lang)) s += 50;
    if (/female|zira|hazel|libby|sonia|aria|natural/i.test(v.name)) s += 20;
    if (/google/i.test(v.name)) s += 12;
    if (v.localService) s += 6;
    return s;
  };
  return voices.slice().sort((a, b) => score(b) - score(a))[0] || null;
}

function speechNorm(text) {
  return String(text).replace(/[_*#]/g, ' ').replace(/\s+/g, ' ').trim();
}

function speechRefreshEngine() {
  if (Speech.eleven) Speech.engine = 'elevenlabs';
  else if (Speech.browserOk) Speech.engine = 'browser';
  else Speech.engine = 'none';
  Speech.supported = Speech.engine !== 'none';
}

function speechMemSet(text, url) {
  if (Speech._mem.has(text)) {
    const old = Speech._mem.get(text);
    Speech._mem.delete(text);
    if (old !== url) {
      try { URL.revokeObjectURL(old); } catch (e) { /* ignore */ }
    }
  }
  Speech._mem.set(text, url);
  while (Speech._mem.size > SPEECH_MEM_MAX) {
    const oldest = Speech._mem.keys().next().value;
    const u = Speech._mem.get(oldest);
    Speech._mem.delete(oldest);
    try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ }
  }
}

function speechIdbOpen() {
  if (Speech._idb || typeof indexedDB === 'undefined') return;
  try {
    const req = indexedDB.open(SPEECH_IDB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(SPEECH_IDB_STORE)) db.createObjectStore(SPEECH_IDB_STORE);
    };
    req.onsuccess = () => { Speech._idb = req.result; };
    req.onerror = () => { Speech._idb = null; };
  } catch (e) {
    Speech._idb = null;
  }
}

function speechIdbGet(text) {
  const db = Speech._idb;
  if (!db) return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(SPEECH_IDB_STORE, 'readonly');
      const r = tx.objectStore(SPEECH_IDB_STORE).get(text);
      r.onsuccess = () => resolve(r.result || null);
      r.onerror = () => resolve(null);
    } catch (e) {
      resolve(null);
    }
  });
}

function speechIdbPut(text, blob) {
  const db = Speech._idb;
  if (!db || !blob) return;
  try {
    const tx = db.transaction(SPEECH_IDB_STORE, 'readwrite');
    tx.objectStore(SPEECH_IDB_STORE).put(blob, text);
  } catch (e) { /* ignore */ }
}

async function speechProbe() {
  if (typeof fetch === 'undefined') return;
  const ac = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = setTimeout(() => { if (ac) ac.abort(); }, 1800);
  try {
    const r = await fetch(TTS_PATH, { signal: ac ? ac.signal : undefined });
    if (!r.ok) return;
    const data = await r.json();
    if (data && data.configured) {
      Speech.eleven = true;
      speechRefreshEngine();
    }
  } catch (e) {
    // file://, a local python server, or a missing function — stay on browser TTS.
  } finally {
    clearTimeout(timer);
  }
}

async function speechFetchClip(text) {
  const r = await fetch(TTS_PATH + '?text=' + encodeURIComponent(text));
  if (!r.ok) throw new Error('tts ' + r.status);
  const type = r.headers.get('content-type') || '';
  if (type.indexOf('audio/') !== 0) throw new Error('tts not audio');
  return await r.blob();
}

async function speechClipUrl(text) {
  if (Speech._mem.has(text)) return Speech._mem.get(text);
  const stored = await speechIdbGet(text);
  if (stored) {
    const url = URL.createObjectURL(stored);
    speechMemSet(text, url);
    return url;
  }
  const blob = await speechFetchClip(text);
  const url = URL.createObjectURL(blob);
  speechMemSet(text, url);
  speechIdbPut(text, blob);
  return url;
}

function speechPlayBrowser(text, opts) {
  return new Promise((resolve) => {
    if (!Speech.browserOk) { resolve(); return; }
    try {
      const u = new SpeechSynthesisUtterance(text);
      if (Speech.voice) u.voice = Speech.voice;
      u.lang = (Speech.voice && Speech.voice.lang) || 'en-GB';
      u.rate = opts.rate || Speech.rate;
      u.pitch = opts.pitch || 1.05;
      u.volume = opts.volume === undefined ? 1 : opts.volume;
      const done = () => resolve();
      u.onend = done;
      u.onerror = done;
      window.speechSynthesis.speak(u);
    } catch (e) {
      resolve();
    }
  });
}

function speechPlayUrl(url, opts, gen) {
  return new Promise((resolve) => {
    if (gen !== Speech._gen) { resolve(); return; }
    const a = new Audio(url);
    Speech._audio = a;
    Speech._playDone = resolve;
    a.playbackRate = opts.rate ? Math.max(0.5, Math.min(1.5, opts.rate / 0.88)) : 1;
    a.volume = opts.volume === undefined ? 1 : opts.volume;
    const done = () => {
      if (Speech._playDone === resolve) Speech._playDone = null;
      if (Speech._audio === a) Speech._audio = null;
      resolve();
    };
    a.onended = done;
    a.onerror = done;
    const p = a.play();
    if (p && p.catch) p.catch(() => done());
  });
}

async function speechSpeakOne(text, opts, gen) {
  if (gen !== Speech._gen || !Speech.enabled) return;
  if (Speech.eleven) {
    try {
      const url = await speechClipUrl(text);
      if (gen !== Speech._gen || !Speech.enabled) return;
      await speechPlayUrl(url, opts, gen);
      Speech._fails = 0;
      if (opts.onEnd) opts.onEnd();
      return;
    } catch (e) {
      Speech._fails += 1;
      if (Speech._fails >= 3) {
        Speech.eleven = false;
        speechRefreshEngine();
      }
    }
  }
  if (gen !== Speech._gen || !Speech.enabled) return;
  await speechPlayBrowser(text, opts);
  if (opts.onEnd && gen === Speech._gen) opts.onEnd();
}

function speechPump() {
  if (Speech._playing) return;
  const next = Speech._queue.shift();
  if (!next) return;
  if (next.gen !== Speech._gen) {
    speechPump();
    return;
  }
  Speech._playing = true;
  const gen = next.gen;
  const finish = () => {
    if (Speech._gen === gen) Speech._playing = false;
    speechPump();
  };
  speechSpeakOne(next.text, next.opts, gen).then(finish, finish);
}

export function initSpeech() {
  speechRefreshEngine();
  if (Speech.browserOk) {
    Speech.voice = pickVoice();
    window.speechSynthesis.onvoiceschanged = () => { Speech.voice = pickVoice(); };
  }
  speechIdbOpen();
  speechProbe();
}

export function say(text, opts = {}) {
  if (!Speech.enabled || !text) return;
  const t = speechNorm(text);
  if (!t) return;
  if (!Speech.eleven && !Speech.browserOk) return;

  const nowMs = (typeof performance !== 'undefined' && performance.now) ? performance.now() : Date.now();
  if (!opts.force && t === Speech._last && nowMs - Speech._lastAt < 1200) return;
  Speech._last = t;
  Speech._lastAt = nowMs;

  if (!opts.queue) cancelSpeech();
  Speech._queue.push({ text: t, opts, gen: Speech._gen });
  speechPump();
}

export function sayLines(lines, opts = {}) {
  if (!Speech.enabled) return;
  cancelSpeech();
  const list = (lines || []).filter(Boolean);
  list.forEach((line) => {
    say(line, Object.assign({}, opts, { queue: true, force: true }));
  });
}

export function cancelSpeech() {
  Speech._gen += 1;
  Speech._queue.length = 0;
  Speech._playing = false;
  const done = Speech._playDone;
  Speech._playDone = null;
  if (Speech._audio) {
    try {
      Speech._audio.onended = null;
      Speech._audio.onerror = null;
      Speech._audio.pause();
      Speech._audio.src = '';
    } catch (e) { /* ignore */ }
    Speech._audio = null;
  }
  if (done) done();
  if (Speech.browserOk) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
}

export function setSpeechEnabled(on) {
  Speech.enabled = !!on;
  if (!on) cancelSpeech();
}
