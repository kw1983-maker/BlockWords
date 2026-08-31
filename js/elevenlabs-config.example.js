// Copy this file to elevenlabs-config.js and add your ElevenLabs API key.
// elevenlabs-config.js is gitignored — never commit real keys to the repo.
//
// Get a key: https://elevenlabs.io → Profile → API Keys
// Browse voices: use the ElevenLabs MCP in Cursor, or the Voice Library on the site.

export const ELEVENLABS_CONFIG = {
  apiKey: 'YOUR_API_KEY',

  // Alice — clear, warm British English. Good for Year 1–4 pupils.
  voiceId: 'Xb7hH8MSUJpSbSDYk0k2',
  voiceName: 'Alice',

  // Fast model for in-game prompts; switch to eleven_multilingual_v2 for richer tone.
  modelId: 'eleven_turbo_v2_5',

  // Slightly expressive, steady pace — less robotic than browser TTS.
  voiceSettings: {
    stability: 0.55,
    similarity_boost: 0.82,
    style: 0.38,
    use_speaker_boost: true,
  },
};
