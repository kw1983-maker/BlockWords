#!/usr/bin/env node
'use strict';

const assert = require('assert');
const { createTtsHandler } = require('../api/tts.js');

function mockReq(method, extra = {}) {
  return {
    method,
    query: extra.query || {},
    body: extra.body,
    headers: extra.headers || {},
    url: extra.url || '/api/tts',
  };
}

function mockRes() {
  const r = {
    statusCode: 200,
    headers: {},
    body: null,
    ended: false,
    setHeader(k, v) { r.headers[k.toLowerCase()] = v; },
    end(data) { r.body = data === undefined ? r.body : data; r.ended = true; },
  };
  return r;
}

async function run(handler, req) {
  const res = mockRes();
  await handler(req, res);
  return res;
}

async function main() {
  let n = 0;
  const pass = (name) => { n += 1; console.log('  ok  ' + name); };

  {
    const h = createTtsHandler({ env: {}, fetch: async () => { throw new Error('no fetch'); } });
    const res = await run(h, mockReq('GET'));
    assert.strictEqual(res.statusCode, 200);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.configured, false);
    assert.strictEqual(body.ok, true);
    pass('GET without key reports configured:false');
  }

  {
    const h = createTtsHandler({ env: {}, fetch: async () => { throw new Error('no fetch'); } });
    const res = await run(h, mockReq('GET', { query: { text: 'hello' } }));
    assert.strictEqual(res.statusCode, 503);
    const body = JSON.parse(res.body);
    assert.strictEqual(body.configured, false);
    pass('GET with text and no key is 503');
  }

  {
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'test-key' },
      fetch: async () => { throw new Error('no fetch'); },
    });
    const res = await run(h, mockReq('GET'));
    const body = JSON.parse(res.body);
    assert.strictEqual(body.configured, true);
    pass('GET with key reports configured:true without calling ElevenLabs');
  }

  {
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'test-key' },
      fetch: async () => { throw new Error('no fetch'); },
    });
    const res = await run(h, mockReq('PUT', { query: { text: 'hi' } }));
    assert.strictEqual(res.statusCode, 405);
    pass('PUT is 405');
  }

  {
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'test-key' },
      fetch: async () => { throw new Error('no fetch'); },
    });
    const long = 'a'.repeat(401);
    const res = await run(h, mockReq('POST', { body: { text: long } }));
    assert.strictEqual(res.statusCode, 400);
    pass('text over 400 chars is 400');
  }

  {
    let called = 0;
    let lastUrl = '';
    let lastBody = null;
    const audio = Buffer.from('ID3fake-mp3');
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'secret-key', ELEVENLABS_VOICE_ID: 'voice-1' },
      fetch: async (url, opts) => {
        called += 1;
        lastUrl = url;
        lastBody = JSON.parse(opts.body);
        assert.strictEqual(opts.headers['xi-api-key'], 'secret-key');
        return {
          ok: true,
          arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
        };
      },
    });
    const res = await run(h, mockReq('POST', { body: { text: '  Bring me *three* apples.  ' } }));
    assert.strictEqual(res.statusCode, 200);
    assert.strictEqual(res.headers['content-type'], 'audio/mpeg');
    assert.ok(String(res.headers['cache-control']).includes('s-maxage'));
    assert.ok(lastUrl.includes('/v1/text-to-speech/voice-1'));
    assert.ok(lastUrl.includes('output_format=mp3_22050_32'));
    assert.strictEqual(lastBody.text, 'Bring me three apples.');
    assert.strictEqual(lastBody.model_id, 'eleven_flash_v2_5');
    assert.strictEqual(lastBody.language_code, 'en');
    assert.strictEqual(called, 1);

    const res2 = await run(h, mockReq('GET', { query: { text: 'Bring me three apples.' } }));
    assert.strictEqual(res2.statusCode, 200);
    assert.strictEqual(called, 1, 'second identical phrase must hit the memory cache');
    pass('POST synthesises, sanitises, and caches');
  }

  {
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'test-key' },
      fetch: async () => ({ ok: false, status: 401 }),
    });
    const res = await run(h, mockReq('POST', { body: { text: 'hello' } }));
    assert.strictEqual(res.statusCode, 401);
    pass('ElevenLabs 401 is forwarded as 401');
  }

  {
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'test-key' },
      fetch: async () => { throw new Error('network'); },
    });
    const res = await run(h, mockReq('POST', { body: { text: 'hello' } }));
    assert.strictEqual(res.statusCode, 502);
    pass('network failure is 502');
  }

  {
    let called = 0;
    const audio = Buffer.from('mp3');
    const h = createTtsHandler({
      env: { ELEVENLABS_API_KEY: 'k' },
      now: () => 1000,
      fetch: async () => {
        called += 1;
        return {
          ok: true,
          arrayBuffer: async () => audio.buffer.slice(audio.byteOffset, audio.byteOffset + audio.byteLength),
        };
      },
    });
    for (let i = 0; i < 181; i++) {
      await run(h, mockReq('GET', {
        query: { text: 'word-' + i },
        headers: { 'x-forwarded-for': '10.0.0.9' },
      }));
    }
    const last = await run(h, mockReq('GET', {
      query: { text: 'word-overflow' },
      headers: { 'x-forwarded-for': '10.0.0.9' },
    }));
    assert.strictEqual(last.statusCode, 429);
    assert.ok(called <= 180);
    pass('rate limit returns 429');
  }

  {
    const h = createTtsHandler({ env: {}, fetch: async () => { throw new Error('no'); } });
    const res = await run(h, mockReq('OPTIONS'));
    assert.strictEqual(res.statusCode, 204);
    pass('OPTIONS is 204');
  }

  console.log('\n' + n + ' tests passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
