// Enumerate fixed teaching lines for pre-recorded ElevenLabs audio.
// Quest sentences stay live — only words, praise, welcome, etc. are baked in.
// Run: node scripts/enumerate_speech.mjs

import { YEARS, PACKS } from '../js/words.js';

const VILLAGER_NAMES = [
  'Farmer Ana', 'Baker Ben', 'Miner Mia', 'Builder Bo', 'Shepherd Sam',
  'Nurse Nia', 'Fisher Fay', 'Smith Sid', 'Cook Cat', 'Gardener Gus',
];

const ADVANCEMENTS = [
  'You got some wood!', 'You made a crafting table!', 'You made a pickaxe!',
  'You mined some stone!', 'You made a furnace!', 'You made an iron ingot!',
  'You found a diamond!', 'You placed a torch!', 'You talked to a villager!',
  'You finished your first job!', 'You learned five new words!', 'You ate some food!',
  'You went for a swim!', 'You saw the night sky!',
];

function clean(s) {
  return String(s || '').replace(/[_*#]/g, ' ').replace(/\s+/g, ' ').trim();
}

function enumerate() {
  const lines = new Set();
  const add = (s) => { const t = clean(s); if (t) lines.add(t); };

  // Welcome, UI, death
  add('Welcome to Block Words!');
  add('Find a villager and listen to the job.');
  add('Oh no! You fainted. Try again!');
  add('Thank you! Well done!');

  for (const a of ADVANCEMENTS) add(a);
  for (const name of VILLAGER_NAMES) add(name + ' says.');

  for (const year of YEARS) {
    add(year.label);
    for (const praise of year.praise || []) add(praise);
  }

  for (const pack of PACKS) {
    add(pack.name);
    for (const w of pack.words) {
      add(w.word);
      if (w.sentence) add(w.sentence);
    }
  }

  return [...lines].sort();
}

const lines = enumerate();
process.stdout.write(JSON.stringify(lines, null, 2));
