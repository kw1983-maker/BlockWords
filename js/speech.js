// Text-to-speech. Year 1 and 2 pupils largely cannot read the English in the
// game yet, so every word the game shows, it also says. This is the single
// path for that — nothing else calls speechSynthesis directly.

export const Speech = {
  enabled: true,
  voice: null,
  rate: 0.85,
  supported: typeof window !== 'undefined' && 'speechSynthesis' in window,
  _last: '',
  _lastAt: 0,
};

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

export function initSpeech() {
  if (!Speech.supported) return;
  Speech.voice = pickVoice();
  // Chrome loads its voice list asynchronously.
  window.speechSynthesis.onvoiceschanged = () => { Speech.voice = pickVoice(); };
}

export function say(text, opts = {}) {
  if (!Speech.supported || !Speech.enabled || !text) return;
  const t = String(text).replace(/[_*#]/g, ' ').trim();
  if (!t) return;

  // Selecting a hotbar slot fires a lot; do not stutter the same word.
  const nowMs = performance.now();
  if (!opts.force && t === Speech._last && nowMs - Speech._lastAt < 1200) return;
  Speech._last = t;
  Speech._lastAt = nowMs;

  try {
    if (!opts.queue) window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(t);
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

// Say several phrases in a row with a small gap — used for a quest line plus
// its example sentence.
export function sayLines(lines, opts = {}) {
  if (!Speech.supported || !Speech.enabled) return;
  window.speechSynthesis.cancel();
  lines.filter(Boolean).forEach((line, i) => {
    say(line, Object.assign({}, opts, { queue: true, force: true }));
  });
}

export function cancelSpeech() {
  if (Speech.supported) {
    try { window.speechSynthesis.cancel(); } catch (e) { /* ignore */ }
  }
}

export function setSpeechEnabled(on) {
  Speech.enabled = !!on;
  if (!on) cancelSpeech();
}
