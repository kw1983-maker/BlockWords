// Vercel serverless proxy for ElevenLabs TTS.
// The API key must never ship to the browser — speech.js calls this endpoint
// and falls back to the Web Speech API when it is missing or fails.
//
// Env (Vercel project settings):
//   ELEVENLABS_API_KEY   required
//   ELEVENLABS_VOICE_ID  optional — default Alice (British educator)
//   ELEVENLABS_MODEL_ID  optional — default eleven_flash_v2_5 (low latency)

'use strict';

const MAX_TEXT = 400;
const RATE_LIMIT = 180;          // requests per window, per IP (school NAT)
const RATE_WINDOW_MS = 60_000;
const CACHE_MAX = 80;

// Alice — clear British educator voice. Override with ELEVENLABS_VOICE_ID.
const DEFAULT_VOICE = 'Xb7hH8MSUJpSbSDYk0k2';
const DEFAULT_MODEL = 'eleven_flash_v2_5';
const OUTPUT_FORMAT = 'mp3_22050_32';

function createTtsHandler(deps = {}) {
  const fetchFn = deps.fetch || globalThis.fetch.bind(globalThis);
  const env = deps.env || process.env;
  const nowFn = deps.now || Date.now;
  const cache = new Map();
  const buckets = new Map();

  function clientIp(req) {
    const fwd = req.headers && (req.headers['x-forwarded-for'] || req.headers['x-real-ip']);
    if (!fwd) return 'local';
    return String(fwd).split(',')[0].trim() || 'local';
  }

  function rateOk(ip) {
    const t = nowFn();
    let b = buckets.get(ip);
    if (!b || t - b.start >= RATE_WINDOW_MS) {
      b = { start: t, n: 0 };
      buckets.set(ip, b);
    }
    b.n += 1;
    return b.n <= RATE_LIMIT;
  }

  function sendJson(res, status, obj) {
    res.statusCode = status;
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.end(JSON.stringify(obj));
  }

  function readText(req) {
    const q = req.query && req.query.text;
    if (q != null && String(q).length) return String(q);
    if (req.url) {
      try {
        const u = new URL(req.url, 'http://localhost');
        const t = u.searchParams.get('text');
        if (t) return t;
      } catch { /* ignore */ }
    }
    const body = req.body;
    if (body && typeof body === 'object' && body.text != null) return String(body.text);
    if (typeof body === 'string' && body) {
      try {
        const parsed = JSON.parse(body);
        if (parsed && parsed.text != null) return String(parsed.text);
      } catch { /* ignore */ }
    }
    return '';
  }

  function cleanText(raw) {
    return String(raw).replace(/[_*#]/g, ' ').replace(/\s+/g, ' ').trim();
  }

  function cacheGet(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    cache.delete(key);
    cache.set(key, hit);
    return hit;
  }

  function cacheSet(key, buf) {
    if (cache.has(key)) cache.delete(key);
    cache.set(key, buf);
    while (cache.size > CACHE_MAX) {
      const oldest = cache.keys().next().value;
      cache.delete(oldest);
    }
  }

  async function synthesise(text) {
    const key = env.ELEVENLABS_API_KEY;
    const voice = env.ELEVENLABS_VOICE_ID || DEFAULT_VOICE;
    const model = env.ELEVENLABS_MODEL_ID || DEFAULT_MODEL;
    const cacheKey = voice + '\n' + model + '\n' + text;
    const cached = cacheGet(cacheKey);
    if (cached) return cached;

    const url = 'https://api.elevenlabs.io/v1/text-to-speech/' +
      encodeURIComponent(voice) + '?output_format=' + OUTPUT_FORMAT;
    const r = await fetchFn(url, {
      method: 'POST',
      headers: {
        'xi-api-key': key,
        'Content-Type': 'application/json',
        'Accept': 'audio/mpeg',
      },
      body: JSON.stringify({
        text,
        model_id: model,
        language_code: 'en',
        apply_text_normalization: 'on',
        voice_settings: {
          stability: 0.65,
          similarity_boost: 0.8,
          style: 0,
          speed: 0.88,
          use_speaker_boost: true,
        },
      }),
    });
    if (!r.ok) {
      const err = new Error('elevenlabs ' + r.status);
      err.status = r.status >= 400 && r.status < 500 ? r.status : 502;
      throw err;
    }
    const buf = Buffer.from(await r.arrayBuffer());
    cacheSet(cacheKey, buf);
    return buf;
  }

  async function handler(req, res) {
    const method = (req.method || 'GET').toUpperCase();
    if (method === 'OPTIONS') {
      res.statusCode = 204;
      res.setHeader('Allow', 'GET, HEAD, POST, OPTIONS');
      res.end();
      return;
    }
    if (method !== 'GET' && method !== 'HEAD' && method !== 'POST') {
      sendJson(res, 405, { error: 'method not allowed' });
      return;
    }

    const configured = !!(env.ELEVENLABS_API_KEY && String(env.ELEVENLABS_API_KEY).trim());
    const text = cleanText(readText(req));

    if (!text) {
      sendJson(res, 200, { ok: true, configured });
      return;
    }

    if (!configured) {
      sendJson(res, 503, { error: 'not configured', configured: false });
      return;
    }
    if (text.length > MAX_TEXT) {
      sendJson(res, 400, { error: 'text too long' });
      return;
    }
    if (!rateOk(clientIp(req))) {
      sendJson(res, 429, { error: 'too many requests' });
      return;
    }

    try {
      const buf = await synthesise(text);
      res.statusCode = 200;
      res.setHeader('Content-Type', 'audio/mpeg');
      res.setHeader('Cache-Control', 'public, s-maxage=86400, stale-while-revalidate=604800');
      if (method === 'HEAD') {
        res.setHeader('Content-Length', String(buf.length));
        res.end();
        return;
      }
      res.end(buf);
    } catch (e) {
      sendJson(res, e.status || 502, { error: 'tts failed' });
    }
  }

  handler.createTtsHandler = createTtsHandler;
  handler._cache = cache;
  handler._buckets = buckets;
  return handler;
}

const handler = createTtsHandler();
module.exports = handler;
module.exports.createTtsHandler = createTtsHandler;
