// The English layer. Villagers hand out spoken errands built from the active
// word pack, so understanding the sentence is what lets you finish the job.
// Nothing here interrupts the game with a quiz screen — a quest is a thing you
// go and do in the world.

import { B, BLOCKS } from './blocks.js';
import { ITEMS, itemLabel } from './items.js';
import { MOB_TYPES } from './entities.js';
import { biomeAt, heightAt, SEA_LEVEL } from './worldgen.js';
import {
  numberWord, ordinalWord, plural, packById, countPhrase,
  yearById, packsForYear, fillLine, pickLine, PACKS,
} from './words.js';
import { say, sayLines } from './speech.js';

const VILLAGER_NAMES = [
  'Farmer Ana', 'Baker Ben', 'Miner Mia', 'Builder Bo', 'Shepherd Sam',
  'Nurse Nia', 'Fisher Fay', 'Smith Sid', 'Cook Cat', 'Gardener Gus',
];

let questCounter = 0;

export class QuestSystem {
  constructor(packId, year, entities, player, inventory, world, sky) {
    this.pack = packById(packId);
    this.year = yearById(year);
    this.entities = entities;
    this.player = player;
    this.inventory = inventory;
    this.world = world;
    this.sky = sky;
    this.learned = new Set();      // words the player has completed a quest for
    this.completed = 0;
    this.emeralds = 0;
    this.onToast = null;           // (title, subtitle, emoji) => void
    this.onQuestDone = null;       // (quest) => void
    this.give = null;              // (item, count) => void; drops what will not fit
    this.findCheck = 0;
  }

  // A word can only become a quest if the world can point at the thing it names.
  usableWords() {
    const words = this.pack.words.filter((w) => w.item || w.mob || w.block || w.visit || w.proxyItem);
    if (words.length) return words;
    // Numbers-only packs have nothing of their own, so they borrow objects
    // from another pack in the same year — the counting is the point, but it
    // still has to be counting something the class already knows.
    for (const p of packsForYear(this.year.id)) {
      if (p.id === this.pack.id) continue;
      const borrowed = p.words.filter((w) => w.item);
      if (borrowed.length) return borrowed;
    }
    return packById('food').words.filter((w) => w.item);
  }

  // How many of a thing to ask for. The year sets the range; a word can pin its
  // own, because ten diamonds is a different afternoon from ten apples.
  countFor(word, type) {
    if (type === 'find' || type === 'visit') return 1;
    const range = word.count || (this.year.counts && this.year.counts[type]) || [1, 3];
    const lo = range[0], hi = Math.max(range[0], range[1]);
    return lo + Math.floor(Math.random() * (hi - lo + 1));
  }

  pickWord() {
    const words = this.usableWords();
    // Prefer words not yet learned, so a session covers the whole pack.
    const fresh = words.filter((w) => !this.learned.has(w.word));
    const pool = fresh.length ? fresh : words;
    return pool[Math.floor(Math.random() * pool.length)];
  }

  makeQuest(villager) {
    const w = this.pickWord();
    const id = ++questCounter;
    const kinds = [];
    if ((w.item && ITEMS[w.item]) || (w.proxyItem && ITEMS[w.proxyItem])) kinds.push('fetch');
    if (w.mob && MOB_TYPES[w.mob]) kinds.push('find');
    if (w.block && B[w.block.toUpperCase()] !== undefined) kinds.push('place');
    if (w.visit) kinds.push('visit');
    const type = kinds[Math.floor(Math.random() * kinds.length)] || 'fetch';

    const count = this.countFor(w, type);
    const q = {
      id, type, word: w, count,
      emoji: w.emoji || '❓',
      sentence: w.sentence || '',
      done: false, delivered: false, progress: 0,
    };

    // Everything a sentence template can talk about.
    const vars = {
      n: numberWord(count),
      what: countPhrase(w, count),
      one: w.one || w.word,
      many: w.many || plural(w.one || w.word, 2),
      word: w.word,
      it: count === 1 ? 'it' : 'them',
      sentence: w.sentence || '',
      name: (villager && villager.name) || '',
    };

    // Uncountable words take the "how much" wording where the pack or year has
    // written one; everything else falls back to the plain fetch lines.
    let lineKey = type;
    if (type === 'fetch' && w.uncountable) lineKey = 'fetchU';

    if (type === 'fetch') {
      q.item = w.proxyItem || w.item;
    } else if (type === 'find') {
      q.mob = w.mob;
      q.mobColour = w.mobColour || null;
      // A colour word points at a coloured sheep, which is how the colours get
      // taught: you have to recognise "a red sheep" out in the field.
      const what = q.mobColour ? q.mobColour + ' ' + MOB_TYPES[w.mob].label.toLowerCase() : w.word;
      q.findName = what;
      vars.mob = what;
    } else if (type === 'visit') {
      q.visit = w.visit;
    } else {
      q.block = B[w.block.toUpperCase()];
      q.blockName = w.block;
      q.origin = villager.pos.clone();
      q.baseline = this.countBlocksNear(q.origin, q.block, Infinity);
      vars.block = w.block.replace(/_/g, ' ');
    }

    q.vars = vars;
    const tpl = pickLine(this.pack, this.year, lineKey);
    q.text = fillLine(tpl, vars);
    q.hint = fillLine((this.year.hints && this.year.hints[type]) || '', vars);
    // A template that quotes the model sentence should not have it read out a
    // second time straight afterwards.
    if (tpl.indexOf('{sentence}') !== -1) q.sentence = '';
    return q;
  }

  // Any other line the game speaks, from COMMON_LINES or the year's overrides —
  // never concatenated English.
  line(key, vars) {
    return fillLine(pickLine(this.pack, this.year, key), vars || {});
  }

  // Swap the class mid-session. Used by the debug console and by nothing else —
  // the year is normally chosen once on the title screen.
  setYear(year) {
    this.year = yearById(year);
    for (const v of this.entities.villagers) this.assign(v);
    return this.year;
  }

  assign(villager) {
    if (!villager.name) {
      villager.name = VILLAGER_NAMES[Math.abs(hashString(villager.id)) % VILLAGER_NAMES.length];
    }
    villager.quest = this.makeQuest(villager);
    return villager.quest;
  }

  // How far along the errand is, right now.
  measure(q, villager) {
    if (!q) return 0;
    if (q.type === 'fetch') return Math.min(q.count, this.inventory.count(q.item));
    if (q.type === 'find' || q.type === 'visit') return q.progress;
    if (q.type === 'place') {
      // Only blocks added since the errand began count — a village built of
      // planks must not finish "place three planks" on its own.
      const n = this.countBlocksNear(q.origin, q.block, q.baseline + q.count);
      return Math.max(0, Math.min(q.count, n - q.baseline));
    }
    return 0;
  }

  countBlocksNear(o, block, stopAt) {
    let n = 0;
    const cx = Math.floor(o.x), cy = Math.floor(o.y), cz = Math.floor(o.z);
    for (let x = cx - 6; x <= cx + 6; x++) {
      for (let z = cz - 6; z <= cz + 6; z++) {
        for (let y = cy - 3; y <= cy + 5; y++) {
          if (this.world.getBlock(x, y, z) === block && ++n >= stopAt) return n;
        }
      }
    }
    return n;
  }

  ready(q, villager) { return this.measure(q, villager) >= q.count; }

  // Speak the errand. Children hear the instruction, then a model sentence.
  // Year 1 gets the target word on its own first, so it lands clean before it
  // is buried inside a sentence.
  speakQuest(q, villager) {
    const who = villager && villager.name ? villager.name + ' says.' : '';
    const lead = this.year.leadWord ? q.word.word : '';
    sayLines([who, lead, q.text, q.sentence], { narrative: true });
  }

  // What the villager says when the job is done, in this class's English.
  praiseLine() {
    const list = this.year.praise || ['Well done!'];
    return list[Math.floor(Math.random() * list.length)];
  }

  deliver(q, villager) {
    if (!this.ready(q, villager)) return false;
    if (q.type === 'fetch') this.inventory.remove(q.item, q.count);

    q.done = true;
    q.delivered = true;
    this.completed++;
    this.learned.add(q.word.word);

    // Reward: emeralds always, plus something practical now and then.
    const reward = [];
    const gems = 1 + Math.floor(Math.random() * 2);
    reward.push(['emerald', gems]);
    this.emeralds += gems;
    const extras = [
      ['bread', 2], ['torch', 4], ['apple', 2], ['oak_planks', 6],
      ['iron_ingot', 1], ['coal', 3], ['cooked_beef', 1],
    ];
    if (Math.random() < 0.7) {
      const e = extras[Math.floor(Math.random() * extras.length)];
      reward.push(e);
    }
    for (const [item, n] of reward) {
      if (this.give) this.give(item, n); else this.inventory.add(item, n);
    }
    q.reward = reward;
    q.praise = this.praiseLine();
    q.ordinal = ordinalWord(this.completed);

    if (this.onQuestDone) this.onQuestDone(q, villager, reward);
    // Give them a new errand to come back for.
    setTimeout(() => { if (villager) this.assign(villager); }, 1200);
    return true;
  }

  // "Find a cow" and "visit the sea" complete by standing in the right place.
  update(dt) {
    this.findCheck -= dt;
    if (this.findCheck > 0) return;
    this.findCheck = 0.4;
    const p = this.player.pos;
    this.entities.wanted = this.wantedMobs();
    for (const v of this.entities.villagers) {
      const q = v.quest;
      if (!q || q.done) continue;

      if (q.type === 'find' && q.progress < 1) {
        for (const m of this.entities.mobs) {
          if (m.type !== q.mob) continue;
          if (q.mobColour && m.colourName !== q.mobColour) continue;
          if (m.pos.distanceTo(p) < 4.5) {
            q.progress = 1;
            this.announceDone(q, v, 'found');
            break;
          }
        }
      }

      if (q.type === 'visit' && q.progress < 1 && checkVisit(q.visit, this.player, this.world, this.sky, this.entities)) {
        q.progress = 1;
        this.announceDone(q, v, 'visited');
      }
    }
  }

  // "You found a red sheep! Go back to Farmer Ana." — toast and voice.
  announceDone(q, v, key) {
    const vars = Object.assign({}, q.vars, { mob: q.findName || q.word.word });
    const done = this.line(key, vars);
    const back = this.line('goBack', { name: v.name || 'the villager' });
    if (this.onToast) this.onToast(done, back, q.emoji);
    sayLines([done, q.word.sentence, back], { narrative: true });
  }

  // Animals an open errand depends on — "find a red sheep" or "bring red wool"
  // — so the spawner can make sure one is somewhere nearby.
  wantedMobs() {
    const out = [];
    for (const v of this.entities.villagers) {
      const q = v.quest;
      if (!q || q.done) continue;
      if (q.type === 'find' && q.progress < 1) out.push({ type: q.mob, colour: q.mobColour });
      const wool = q.type === 'fetch' && /^(\w+)_wool$/.exec(q.item);
      if (wool) out.push({ type: 'sheep', colour: wool[1] });
    }
    return out;
  }

  wordList() {
    return this.pack.words.map((w) => ({
      word: w.word, emoji: w.emoji, learned: this.learned.has(w.word),
    }));
  }
}

// Mirrors validateTiles() in atlas.js: shout in the console if a pack points at
// an item, mob or block that does not exist, or forgets which years it is for.
// Cheap, runs once at boot, and saves a teacher a very confusing afternoon.
export function validateWords() {
  const bad = [];
  for (const pack of PACKS) {
    if (!pack.years || !pack.years.length) bad.push(pack.id + ': no `years`');
    for (const w of pack.words) {
      if (w.item && !ITEMS[w.item]) bad.push(pack.id + '/' + w.word + ': no such item "' + w.item + '"');
      if (w.proxyItem && !ITEMS[w.proxyItem]) bad.push(pack.id + '/' + w.word + ': no such proxy item "' + w.proxyItem + '"');
      if (w.mob && !MOB_TYPES[w.mob]) bad.push(pack.id + '/' + w.word + ': no such mob "' + w.mob + '"');
      if (w.block && B[w.block.toUpperCase()] === undefined) {
        bad.push(pack.id + '/' + w.word + ': no such block "' + w.block + '"');
      }
    }
    if (!pack.numbersOnly && !pack.words.some((w) => w.item || w.mob || w.block || w.visit || w.proxyItem)) {
      bad.push(pack.id + ': no word can become a quest');
    }
  }
  if (bad.length) console.warn('[words] ' + bad.length + ' problem(s):\n  ' + bad.join('\n  '));
  return bad;
}

function hashString(s) {
  let h = 0;
  for (let i = 0; i < String(s).length; i++) h = (h * 31 + String(s).charCodeAt(i)) | 0;
  return h;
}

function nearWater(world, x, y, z, r) {
  for (let dx = -r; dx <= r; dx++) {
    for (let dy = -1; dy <= 2; dy++) {
      for (let dz = -r; dz <= r; dz++) {
        if (world.getBlock(x + dx, y + dy, z + dz) === B.WATER) return true;
      }
    }
  }
  return false;
}

function checkVisit(kind, player, world, sky, entities) {
  const px = Math.floor(player.pos.x);
  const py = Math.floor(player.pos.y);
  const pz = Math.floor(player.pos.z);
  const seed = world.seed;
  const h = heightAt(seed, px, pz);

  switch (kind) {
    case 'sea':
      return world.getBlock(px, py, pz) === B.WATER
        || world.getBlock(px, py - 1, pz) === B.WATER
        || nearWater(world, px, py, pz, 2);
    case 'sun':
      return sky && sky.daylight > 0.55
        && world.getBlock(px, py + 1, pz) === B.AIR
        && py > SEA_LEVEL + 2;
    case 'shell':
      return world.getBlock(px, py - 1, pz) === B.SAND && nearWater(world, px, py, pz, 5);
    case 'desert':
      return biomeAt(seed, px, pz, h).name === 'Desert';
    case 'village':
      for (const v of entities.villagers) {
        if (v.pos.distanceTo(player.pos) < 10) return true;
      }
      return false;
    case 'grass':
      return world.getBlock(px, py - 1, pz) === B.GRASS_BLOCK;
    case 'water':
      return nearWater(world, px, py, pz, 4);
    default:
      return false;
  }
}

// ------------------------------------------------------------- advancements
// Minecraft-style pop-ups, written in the simplest English that still names
// what you did — and spoken, so they double as reading practice.
export const ADVANCEMENTS = [
  { id: 'wood', title: 'Getting Wood', text: 'You got some wood!', emoji: '🪵' },
  { id: 'bench', title: 'Benchmarking', text: 'You made a crafting table!', emoji: '🛠️' },
  { id: 'pickaxe', title: 'Time to Mine!', text: 'You made a pickaxe!', emoji: '⛏️' },
  { id: 'stone', title: 'Stone Age', text: 'You mined some stone!', emoji: '🪨' },
  { id: 'furnace', title: 'Hot Topic', text: 'You made a furnace!', emoji: '🔥' },
  { id: 'iron', title: 'Acquire Hardware', text: 'You made an iron ingot!', emoji: '⚙️' },
  { id: 'diamond', title: 'Diamonds!', text: 'You found a diamond!', emoji: '💎' },
  { id: 'torch', title: 'Let There Be Light', text: 'You placed a torch!', emoji: '🔦' },
  { id: 'friend', title: 'A New Friend', text: 'You talked to a villager!', emoji: '🧑‍🌾' },
  { id: 'quest1', title: 'Good Listener', text: 'You finished your first job!', emoji: '⭐' },
  { id: 'quest5', title: 'Word Collector', text: 'You learned five new words!', emoji: '📚' },
  { id: 'eat', title: 'Time for Lunch', text: 'You ate some food!', emoji: '🍎' },
  { id: 'swim', title: 'Making a Splash', text: 'You went for a swim!', emoji: '🌊' },
  { id: 'night', title: 'Good Night', text: 'You saw the night sky!', emoji: '🌙' },
  { id: 'farmer', title: 'Seed Planter', text: 'You planted a seed!', emoji: '🌱' },
  { id: 'harvest', title: 'Farmer', text: 'You grew your own food!', emoji: '🌾' },
  { id: 'sleep', title: 'Sweet Dreams', text: 'You slept in a bed!', emoji: '🛏️' },
];

export class Advancements {
  constructor() {
    this.earned = new Set();
    this.onEarn = null; // (advancement) => void
  }

  trigger(id) {
    if (this.earned.has(id)) return false;
    const a = ADVANCEMENTS.find((x) => x.id === id);
    if (!a) return false;
    this.earned.add(id);
    if (this.onEarn) this.onEarn(a);
    return true;
  }

  serialize() { return [...this.earned]; }
  load(arr) { if (Array.isArray(arr)) this.earned = new Set(arr); }
}
