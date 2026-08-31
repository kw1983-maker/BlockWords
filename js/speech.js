// Text-to-speech. Year 1 and 2 pupils largely cannot read the English in the
// game yet, so every word the game shows, it also says. This is the single
// path for that — nothing else calls speechSynthesis directly.
//
// Narrative lines (quests, praise, welcome) play pre-recorded ElevenLabs audio
// from audio/speech/ when available. Falls back to live API, then browser TTS.

import { resumeAudio } from './audio.js';

export const Speech = {
  enabled: true,
  voice: null,
  rate: 0.85,
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  narrative: true,
  _last: '',
  _lastAt: 0,
  _queue: Promise.resolve(),
  _audio: null,
};

const _blobCache = new Map();
const _MAX_CACHE = 48;
let _manifest = null;
let _manifestLoad = null;

function speechKey(text) {
  return String(text).replace(/[_*#]/g, ' ').replace(/\s+/g, ' ').trim().toLowerCase();
}

function elevenLabsReady() {
  return typeof ELEVENLABS_CONFIG !== 'undefined'
    && ELEVENLABS_CONFIG.apiKey
    && ELEVENLABS_CONFIG.apiKey !== 'YOUR_API_KEY'
    && ELEVENLABS_CONFIG.voiceId;
}

function loadSpeechManifest() {
  if (_manifest) return Promise.resolve(_manifest);
  if (_manifestLoad) return _manifestLoad;
  _manifestLoad = fetch('audio/speech/manifest.json')
    .then((r) => (r.ok ? r.json() : null))
    .then((data) => {
      _manifest = (data && data.lines) ? data.lines : {};
      if (Object.keys(_manifest).length) {
        const who = (data && data.voice) ? data.voice : 'pre-recorded';
        console.info('[speech] Narrative voice:', who, '(' + Object.keys(_manifest).length + ' clips)');
      }
      return _manifest;
    })
    .catch(() => {
      _manifest = {};
      return _manifest;
    });
  return _manifestLoad;
}

function prerecordedFile(text) {
  if (!_manifest) return null;
  return _manifest[speechKey(text)] || null;
}

// Prefer a British English voice (what Malaysian primary syllabuses model),
// then any English voice, then whatever the browser has.
function pickVoice() {
  if (!Speech.supported) return null;
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

function stopNarrativeAudio() {
  if (Speech._audio) {
    try {
      Speech._audio.pause();
      Speech._audio.currentTime = 0;
    } catch (e) { /* ignore */ }
    Speech._audio = null;
  }
  Speech._queue = Promise.resolve();
}

async function fetchNarrativeAudio(text) {
  const cfg = ELEVENLABS_CONFIG;
  const cached = _blobCache.get(text);
  if (cached) return cached;

  const res = await fetch(
    'https://api.elevenlabs.io/v1/text-to-speech/' + encodeURIComponent(cfg.voiceId),
    {
      method: 'POST',
      headers: {
        'xi-api-key': cfg.apiKey,
        'Content-Type': 'application/json',
        Accept: 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: cfg.modelId || 'eleven_turbo_v2_5',
        voice_settings: cfg.voiceSettings || {
          stability: 0.55,
          similarity_boost: 0.82,
          style: 0.38,
          use_speaker_boost: true,
        },
      }),
    },
  );
  if (!res.ok) throw new Error('ElevenLabs TTS failed: ' + res.status);
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  if (_blobCache.size >= _MAX_CACHE) {
    const oldest = _blobCache.keys().next().value;
    const oldUrl = _blobCache.get(oldest);
    if (oldUrl) URL.revokeObjectURL(oldUrl);
    _blobCache.delete(oldest);
  }
  _blobCache.set(text, url);
  return url;
}

function queueNarrative(text, opts = {}, wantsLive = true) {
  Speech._queue = Speech._queue.then(async () => {
    if (!Speech.enabled) return;
    try {
      const url = await narrativeAudioUrl(text, wantsLive);
      if (!url) throw new Error('no narrative audio');
      await playNarrativeAudio(url, opts);
    } catch (e) {
      if (!wantsLive) {
        sayBrowser(text, opts);
        return;
      }
      console.warn('[speech] Narrative fallback to browser voice:', e.message || e);
      sayBrowser(text, opts);
    }
  });
}

async function narrativeAudioUrl(text, wantsLive = true) {
  await loadSpeechManifest();
  const file = prerecordedFile(text);
  if (file) return 'audio/speech/' + file;
  if (wantsLive && elevenLabsReady()) return fetchNarrativeAudio(text);
  return null;
}

function playNarrativeAudio(url, opts = {}) {
  return new Promise((resolve) => {
    resumeAudio();
    const audio = new Audio(url);
    Speech._audio = audio;
    audio.volume = opts.volume === undefined ? 1 : opts.volume;
    const done = () => {
      if (Speech._audio === audio) Speech._audio = null;
      resolve();
    };
    audio.onended = () => {
      if (opts.onEnd) opts.onEnd();
      done();
    };
    audio.onerror = done;
    audio.play().catch(done);
  });
}

function sayBrowser(text, opts = {}) {
  if (!Speech.supported) return;
  try {
    if (!opts.queue) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    if (Speech.voice) u.voice = Speech.voice;
    u.lang = (Speech.voice && Speech.voice.lang) || 'en-GB';
    u.rate = opts.rate || Speech.rate;
    u.pitch = opts.pitch || 1.05;
    u.volume = opts.volume === undefined ? 1 : opts.volume;
    if (opts.onEnd) u.onend = opts.onEnd;
    window.speechSynthesis.speak(u);
  } catch (e) {
    // A browser with speech disabled must never take the game down with it.
  }
}

export function initSpeech() {
  loadSpeechManifest();
  if (!Speech.supported) return;
  Speech.voice = pickVoice();
  window.speechSynthesis.onvoiceschanged = () => { Speech.voice = pickVoice(); };
  if (elevenLabsReady() && (!_manifest || !Object.keys(_manifest).length)) {
    console.info('[speech] Live narrative voice:', ELEVENLABS_CONFIG.voiceName || ELEVENLABS_CONFIG.voiceId);
  }
}

export function say(text, opts = {}) {
  if (!Speech.enabled || !text) return;
  const t = String(text).replace(/[_*#]/g, ' ').trim();
  if (!t) return;

  const nowMs = performance.now();
  if (!opts.force && t === Speech._last && nowMs - Speech._lastAt < 1200) return;
  Speech._last = t;
  Speech._lastAt = nowMs;

  const wantsLive = opts.narrative === true
    || (opts.narrative !== false && Speech.narrative && t.length > 28);

  if (wantsLive) {
    if (!opts.queue) cancelSpeech();
    queueNarrative(t, opts, true);
    return;
  }

  // Short labels — pre-recorded vocabulary if available, else browser TTS.
  if (!opts.queue) {
    stopNarrativeAudio();
    window.speechSynthesis.cancel();
  }
  queueNarrative(t, opts, false);
}

export function sayLines(lines, opts = {}) {
  if (!Speech.enabled) return;
  const parts = lines.filter(Boolean).map((line) => String(line).replace(/[_*#]/g, ' ').trim()).filter(Boolean);
  if (!parts.length) return;

  const narrative = opts.narrative !== false && (opts.narrative === true || Speech.narrative);
  if (narrative) {
    cancelSpeech();
    parts.forEach((line, i) => {
      say(line, Object.assign({}, opts, { queue: i > 0, force: true, narrative: true }));
    });
    return;
  }

  if (!Speech.supported) return;
  window.speechSynthesis.cancel();
  parts.forEach((line, i) => {
    say(line, Object.assign({}, opts, { queue: true, force: true, narrative: false }));
  });
}

export function cancelSpeech() {
  stopNarrativeAudio();
  if (Speech.supported) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
}

export function setSpeechEnabled(on) {
  Speech.enabled = !!on;
  if (!on) cancelSpeech();
}
