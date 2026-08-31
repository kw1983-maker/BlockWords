// Boot, game loop and input. This module owns the renderer and wires every
// other module together; it deliberately keeps no world knowledge of its own.

import * as THREE from 'three';
import { B, BLOCKS, breakTime, canHarvest, TIER } from './blocks.js';
import { buildAtlas, atlasCanvas, tileAverage, validateTiles } from './atlas.js';
import { seedFromString, mulberry32 } from './noise.js';
import { CHUNK_X, CHUNK_Z, CHUNK_Y, SEA_LEVEL, biomeAt, findSpawn } from './worldgen.js';
import { makeMaterials, computeLight, buildGeometry } from './chunk.js';
import { World } from './world.js';
import { ITEMS, itemLabel, itemIcon, dropsOf } from './items.js';
import { smeltResult, fuelValue, findRecipe } from './crafting.js';
import { Inventory, SlotSet, HOTBAR_SIZE } from './inventory.js';
import { Player, PLAYER_CONST } from './player.js';
import { Entities, MOB_TYPES } from './entities.js';
import { Sky, DAY_LENGTH } from './sky.js';
import { initAudio, resumeAudio, startMusic, setMusicEnabled, Sfx, materialOf, Audio } from './audio.js';
import { initSpeech, say, sayLines, setSpeechEnabled, Speech } from './speech.js';
import { PACKS, YEARS, packById, packsForYear, defaultPackForYear } from './words.js';
import { QuestSystem, Advancements, validateWords } from './quests.js';
import {
  UI, initUI, renderHotbar, renderBars, announceItem, toast, hint, flashHurt,
  setUnderwater, openInventory, closeInventory, redrawInventory, openQuest,
  closeQuest, questOpen, openSign, signOpen, updateDebug, setDebugVisible, showTitle, showLoading,
  showPause, showHud, anyScreenOpen,
} from './ui.js';
import {
  initSaves, normalizeName, localSaveKey, isCloudEnabled,
  hasCloudSave, loadCloudSave, saveCloudSave,
} from './saves.js';

const state = {
  started: false,
  paused: false,
  seed: 0,
  packId: 'animals',
  year: 1,
  playerName: '',
  renderDistance: 6,
  thirdPerson: 0,   // 0 = first person, 1 = behind, 2 = in front
  debug: false,
  time: 0,
};

let nameCheckTimer = null;

const input = {
  forward: 0, strafe: 0, jump: false, sneak: false, sprint: false,
  keys: new Set(), mining: false, using: false,
};

let renderer, scene, camera, materials, world, player, entities, sky, quests, advancements;
let inventory, craftGrid, furnaces, chests, signs;
let outlineMesh, crackMesh, crackTextures;
let hudScene, hudCamera, heldSprite;
let particles = [];
let clock, fpsTimes = [];
const rand = Math.random;

// ============================================================ bootstrapping
function initRenderer() {
  renderer = new THREE.WebGLRenderer({ antialias: false, powerPreference: 'high-performance' });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
  document.getElementById('game').appendChild(renderer.domElement);

  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(72, window.innerWidth / window.innerHeight, 0.1, 1000);

  // Overlay scene for the item in your hand.
  hudScene = new THREE.Scene();
  hudCamera = new THREE.PerspectiveCamera(50, window.innerWidth / window.innerHeight, 0.01, 10);
  hudCamera.position.set(0, 0, 0);

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    hudCamera.aspect = camera.aspect;
    hudCamera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });
}

function makeAtlasTexture() {
  buildAtlas();
  validateTiles();
  const tex = new THREE.CanvasTexture(atlasCanvas);
  tex.magFilter = THREE.NearestFilter;
  tex.minFilter = THREE.NearestFilter;
  tex.generateMipmaps = false;
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// Ten stages of cracking, drawn the same way the block textures are.
function makeCrackTextures() {
  const out = [];
  for (let stage = 0; stage < 10; stage++) {
    const c = document.createElement('canvas');
    c.width = c.height = 16;
    const g = c.getContext('2d');
    const rnd = mulberry32(1234 + stage);
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 1;
    const lines = 1 + stage;
    for (let i = 0; i < lines; i++) {
      g.beginPath();
      let x = Math.floor(rnd() * 16), y = Math.floor(rnd() * 16);
      g.moveTo(x, y);
      for (let s = 0; s < 3 + stage; s++) {
        x += Math.floor(rnd() * 7) - 3;
        y += Math.floor(rnd() * 7) - 3;
        g.lineTo(x, y);
      }
      g.stroke();
    }
    const t = new THREE.CanvasTexture(c);
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    out.push(t);
  }
  return out;
}

function initHelpers() {
  const box = new THREE.BoxGeometry(1.002, 1.002, 1.002);
  outlineMesh = new THREE.LineSegments(
    new THREE.EdgesGeometry(box),
    new THREE.LineBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.55 })
  );
  outlineMesh.visible = false;
  scene.add(outlineMesh);

  crackTextures = makeCrackTextures();
  crackMesh = new THREE.Mesh(
    new THREE.BoxGeometry(1.01, 1.01, 1.01),
    new THREE.MeshBasicMaterial({ map: crackTextures[0], transparent: true, depthWrite: false })
  );
  crackMesh.visible = false;
  scene.add(crackMesh);

  heldSprite = new THREE.Sprite(new THREE.SpriteMaterial({ transparent: true, depthTest: false }));
  heldSprite.scale.set(0.4, 0.4, 0.4);
  heldSprite.visible = false;
  hudScene.add(heldSprite);
}

// ============================================================== title screen
// The class comes first: it decides which packs are on offer and how the
// villagers speak. Changing it rebuilds the pack list underneath.
function buildYearPicker() {
  const box = document.getElementById('year-picker');
  if (!box) return;
  box.innerHTML = '';
  YEARS.forEach((y) => {
    const b = document.createElement('button');
    b.className = 'pack-btn year-btn' + (y.id === state.year ? ' sel' : '');
    b.innerHTML = '<span class="pack-emoji"></span><span class="pack-word"></span>'
      + '<span class="pack-blurb"></span><span class="pack-book"></span>';
    b.querySelector('.pack-emoji').textContent = y.emoji;
    b.querySelector('.pack-word').textContent = y.label;
    b.querySelector('.pack-blurb').textContent = y.blurb || '';
    b.querySelector('.pack-book').textContent = y.book || '';
    b.onclick = () => {
      state.year = y.id;
      state.packId = defaultPackForYear(y.id);
      [...box.children].forEach((c) => c.classList.remove('sel'));
      b.classList.add('sel');
      buildPackPicker();
      say(y.label);
    };
    box.appendChild(b);
  });
}

function buildPackPicker() {
  const box = document.getElementById('pack-picker');
  box.innerHTML = '';
  const packs = packsForYear(state.year);
  // A year change can leave the old pack selected but off the list.
  if (!packs.some((p) => p.id === state.packId)) state.packId = packs[0].id;
  packs.forEach((p) => {
    const b = document.createElement('button');
    b.className = 'pack-btn' + (p.id === state.packId ? ' sel' : '');
    b.innerHTML = '<span class="pack-emoji"></span><span class="pack-word"></span>'
      + '<span class="pack-blurb"></span><span class="pack-book"></span>';
    b.querySelector('.pack-emoji').textContent = p.emoji;
    b.querySelector('.pack-word').textContent = p.name;
    b.querySelector('.pack-blurb').textContent = p.blurb || '';
    b.querySelector('.pack-book').textContent = p.book || '';
    b.onclick = () => {
      state.packId = p.id;
      [...box.children].forEach((c) => c.classList.remove('sel'));
      b.classList.add('sel');
      say(p.name);
    };
    box.appendChild(b);
  });
}

function getPlayerName() {
  const el = document.getElementById('name-input');
  return el ? el.value.trim() : '';
}

function loadLocalSave(name) {
  try {
    const raw = localStorage.getItem(localSaveKey(name));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}

function saveLocalSave(name, data) {
  try {
    localStorage.setItem(localSaveKey(name), JSON.stringify(data));
    return true;
  } catch (e) {
    console.warn('Could not save locally:', e);
    return false;
  }
}

async function updateContinueButton() {
  const cont = document.getElementById('btn-continue');
  if (!cont) return;
  const name = getPlayerName();
  if (!normalizeName(name)) {
    cont.classList.add('hidden');
    return;
  }
  let exists = !!loadLocalSave(name);
  if (!exists && isCloudEnabled()) exists = await hasCloudSave(name);
  cont.classList.toggle('hidden', !exists);
}

function wireMenus() {
  const nameInput = document.getElementById('name-input');
  const savedName = localStorage.getItem('blockwords.playerName');
  if (savedName && nameInput) nameInput.value = savedName;

  nameInput?.addEventListener('input', () => {
    clearTimeout(nameCheckTimer);
    nameCheckTimer = setTimeout(updateContinueButton, 400);
  });

  document.getElementById('btn-play').onclick = async () => {
    const name = getPlayerName();
    if (!normalizeName(name)) {
      toast('Name needed', 'Type your name so we can save your world.', '✏️');
      nameInput?.focus();
      return;
    }
    state.playerName = name;
    localStorage.setItem('blockwords.playerName', name);
    if (isCloudEnabled() && await hasCloudSave(name)) {
      const display = name.trim();
      toast('Save found', `${display} already has a world — tap Continue instead.`, '💾');
      return;
    }
    if (loadLocalSave(name)) {
      const display = name.trim();
      toast('Save found', `${display} already has a world — tap Continue instead.`, '💾');
      return;
    }
    const seedText = document.getElementById('seed-input').value.trim();
    startGame(seedFromString(seedText), null);
  };

  const cont = document.getElementById('btn-continue');
  cont.onclick = async () => {
    const name = getPlayerName();
    if (!normalizeName(name)) {
      toast('Name needed', 'Type your name to load your saved world.', '✏️');
      nameInput?.focus();
      return;
    }
    state.playerName = name;
    localStorage.setItem('blockwords.playerName', name);
    cont.disabled = true;
    const saved = await loadSaveData(name);
    cont.disabled = false;
    if (!saved) {
      toast('No save', 'No saved world found for that name.', '❓');
      return;
    }
    startGame(saved.seed, saved);
  };

  updateContinueButton();

  const speechBoxes = [document.getElementById('opt-speech'), document.getElementById('opt-speech2')];
  speechBoxes.forEach((cb) => {
    cb.onchange = () => {
      setSpeechEnabled(cb.checked);
      speechBoxes.forEach((o) => { o.checked = cb.checked; });
    };
  });
  document.getElementById('opt-music').onchange = (e) => setMusicEnabled(e.target.checked);
  const dist = document.getElementById('opt-dist');
  dist.oninput = () => {
    state.renderDistance = +dist.value;
    document.getElementById('dist-val').textContent = dist.value;
    if (world) { world.renderDistance = state.renderDistance; sky.setFogDistance(state.renderDistance); }
  };

  document.getElementById('btn-resume').onclick = () => setPaused(false);
  document.getElementById('btn-save').onclick = () => {
    saveGame().then((ok) => {
      toast('Saved', ok ? 'Your world is safe.' : 'Saved on this device only.', '💾');
    });
  };
  document.getElementById('btn-quit').onclick = () => {
    saveGame().then(() => { location.reload(); });
  };
}

// ================================================================= new game
function startGame(seed, saved) {
  if (state.starting || state.started) return;   // a double-click must not build two worlds
  state.starting = true;
  state.seed = seed >>> 0;
  if (saved && saved.year) state.year = saved.year;
  if (saved && saved.packId) state.packId = saved.packId;
  if (saved && saved.playerName) {
    state.playerName = saved.playerName;
    localStorage.setItem('blockwords.playerName', saved.playerName);
    const el = document.getElementById('name-input');
    if (el) el.value = saved.playerName;
  } else {
    const name = getPlayerName();
    if (normalizeName(name)) {
      state.playerName = name;
      localStorage.setItem('blockwords.playerName', name);
    }
  }
  showTitle(false);
  showLoading(true, 0);
  resumeAudio();
  startMusic();

  materials = makeMaterials(makeAtlasTexture());
  world = new World(state.seed, scene, materials);
  world.renderDistance = state.renderDistance;
  if (saved) world.loadDeltas(saved.deltas);

  player = new Player(world);
  inventory = new Inventory();
  craftGrid = new SlotSet(9);
  furnaces = new Map();
  chests = new Map();
  signs = new Map();
  advancements = new Advancements();

  sky = new Sky(scene, materials);
  sky.setFogDistance(state.renderDistance);
  entities = new Entities(world, scene, state.seed);
  quests = new QuestSystem(state.packId, state.year, entities, player, inventory, world);

  wireCallbacks();
  initHelpers();

  const spawn = saved && saved.pos ? { x: saved.pos[0], y: saved.pos[1], z: saved.pos[2] } : findSpawn(state.seed);
  player.pos.set(spawn.x, spawn.y, spawn.z);
  player.spawn.set(spawn.x, spawn.y + 1, spawn.z);
  if (saved) {
    player.yaw = saved.yaw || 0;
    player.pitch = saved.pitch || 0;
    player.health = saved.health !== undefined ? saved.health : 20;
    player.hunger = saved.hunger !== undefined ? saved.hunger : 20;
    inventory.load(saved.inv);
    advancements.load(saved.advancements);
    if (saved.time !== undefined) sky.time = saved.time;
    if (saved.learned) saved.learned.forEach((w) => quests.learned.add(w));
    if (saved.signs) for (const [k, t] of saved.signs) signs.set(k, t);
    if (saved.chests) {
      for (const [k, arr] of saved.chests) {
        const set = new SlotSet(27);
        arr.forEach((v, i) => { if (v && ITEMS[v[0]]) set.slots[i] = { item: v[0], count: v[1] }; });
        chests.set(k, set);
      }
    }
  } else {
    // A gentle starting kit — enough to get going without removing the climb.
    inventory.add('oak_planks', 8);
    inventory.add('bread', 3);
    inventory.add('torch', 6);
  }

  // Warm up a tight radius so the player lands on real ground, then let the
  // rest stream in while they are already playing — the way the original does.
  const fullDistance = state.renderDistance;
  world.renderDistance = Math.min(3, fullDistance);
  let warm = 0;
  const preload = () => {
    world.update(player.pos.x, player.pos.z, 80);
    warm++;
    const pending = world.stats.pending;
    showLoading(true, Math.min(0.97, 1 - pending / 110));
    if (warm < 200 && pending > 0) {
      requestAnimationFrame(preload);
    } else {
      world.renderDistance = fullDistance;
      finishStart(!saved);
    }
  };
  requestAnimationFrame(preload);
}

function finishStart(freshSpawn) {
  // Drop the player onto solid ground now that the terrain really exists.
  if (freshSpawn) {
    const top = world.highestBlockAt(Math.floor(player.pos.x), Math.floor(player.pos.z));
    if (top > 0) {
      player.pos.y = top + 1.1;
      player.spawn.copy(player.pos);
    }
  }
  state.starting = false;
  showLoading(false);
  showHud(true);
  renderHotbar(inventory);
  renderBars(player);
  state.started = true;
  clock = performance.now();
  requestAnimationFrame(loop);

  sayLines(['Welcome to Block Words!', 'Find a villager and listen to the job.'], { narrative: true });
  toast('Welcome!', 'Explore, mine and build. Talk to villagers.', '🌍');
  requestPointerLock();
}

function wireCallbacks() {
  player.onHurt = () => { flashHurt(); Sfx.hurt(); };
  player.onDeath = () => {
    toast('Oh no!', 'You will wake up at your spawn point.', '💫');
    say('Oh no! You fainted. Try again!', { force: true, narrative: true });
    setTimeout(() => { player.respawn(); renderBars(player); }, 1500);
  };

  entities.onPickup = (item, count) => {
    const left = inventory.add(item, count);
    if (left >= count) return false;   // bag full: leave it on the ground
    Sfx.pickup();
    renderHotbar(inventory);
    checkItemAdvancements(item);
    return true;
  };
  entities.onVillagerReady = (v) => quests.assign(v);

  quests.onToast = (t, s, e) => toast(t, s, e, 'quest');
  quests.onQuestDone = (q) => {
    toast(q.praise || 'Well done!', 'You finished: ' + q.text, q.emoji, 'quest');
    renderHotbar(inventory);
    advancements.trigger('quest1');
    if (quests.learned.size >= 5) advancements.trigger('quest5');
  };

  advancements.onEarn = (a) => {
    toast(a.title, a.text, a.emoji);
    Sfx.levelUp();
    say(a.text, { force: true, narrative: true });
  };

  initUI({
    onCraft: (out) => {
      checkItemAdvancements(out);
      if (/_pickaxe$/.test(out)) advancements.trigger('pickaxe');
      if (out === 'crafting_table') advancements.trigger('bench');
      if (out === 'furnace') advancements.trigger('furnace');
      renderHotbar(inventory);
    },
    onCloseScreen: () => requestPointerLock(),
  });
}

function checkItemAdvancements(item) {
  if (/_log$/.test(item)) advancements.trigger('wood');
  if (item === 'cobblestone' || item === 'stone') advancements.trigger('stone');
  if (item === 'iron_ingot') advancements.trigger('iron');
  if (item === 'diamond') advancements.trigger('diamond');
}

// ==================================================================== input
function requestPointerLock() {
  if (!state.started || state.paused || anyScreenOpen()) return;
  const el = renderer.domElement;
  if (document.pointerLockElement !== el && el.requestPointerLock) el.requestPointerLock();
}

function setPaused(on) {
  state.paused = on;
  showPause(on);
  if (!on) requestPointerLock();
  else if (document.exitPointerLock) document.exitPointerLock();
}

function initInput() {
  const canvasClick = () => {
    resumeAudio();
    if (state.started && !state.paused && !anyScreenOpen()) requestPointerLock();
  };
  document.addEventListener('click', (e) => {
    if (e.target.closest('.overlay') || e.target.closest('#hud')) return;
    canvasClick();
  });

  // Pointer lock is the normal path. Some managed school machines block it, so
  // click-and-drag has to work too: dragging looks around, a click that does not
  // drag acts on the world.
  let drag = null;
  const locked = () => document.pointerLockElement === renderer.domElement;

  document.addEventListener('mousemove', (e) => {
    if (!player) return;
    if (locked()) { player.look(e.movementX * 0.0022, e.movementY * 0.0022); return; }
    if (!drag) return;
    drag.dist += Math.abs(e.movementX) + Math.abs(e.movementY);
    if (drag.dist > 6 && drag.button === 0) { input.mining = false; resetMining(); }
    player.look(e.movementX * 0.0022, e.movementY * 0.0022);
  });

  document.addEventListener('mousedown', (e) => {
    if (!state.started || anyScreenOpen() || state.paused) return;
    if (locked()) {
      if (e.button === 0) { input.mining = true; swing(); tryAttack(); }
      if (e.button === 2) { input.using = true; useHeld(); }
      return;
    }
    if (e.target !== renderer.domElement) return;
    drag = { button: e.button, dist: 0 };
    if (e.button === 0) { input.mining = true; swing(); tryAttack(); }
  });

  document.addEventListener('mouseup', (e) => {
    if (drag && !locked()) {
      if (drag.dist <= 6 && drag.button === 2) useHeld();
      drag = null;
    }
    if (e.button === 0) { input.mining = false; resetMining(); }
    if (e.button === 2) input.using = false;
  });
  document.addEventListener('contextmenu', (e) => e.preventDefault());

  document.addEventListener('wheel', (e) => {
    if (!state.started || anyScreenOpen()) return;
    const dir = e.deltaY > 0 ? 1 : -1;
    inventory.selected = (inventory.selected + dir + HOTBAR_SIZE) % HOTBAR_SIZE;
    renderHotbar(inventory);
    announceItem(inventory);
  }, { passive: true });

  document.addEventListener('keydown', (e) => {
    if (e.repeat) return;
    input.keys.add(e.code);
    handleKey(e);
  });
  document.addEventListener('keyup', (e) => input.keys.delete(e.code));
}

function handleKey(e) {
  const code = e.code;
  if (code === 'Escape') {
    if (!UI.el.inv.classList.contains('hidden')) { closeInventory(inventory); requestPointerLock(); }
    else if (questOpen()) closeQuest();
    else if (state.started) setPaused(!state.paused);
    return;
  }
  if (!state.started) return;

  if (code.startsWith('Digit')) {
    const n = +code.slice(5);
    if (n >= 1 && n <= 9) {
      inventory.selected = n - 1;
      renderHotbar(inventory);
      announceItem(inventory);
    }
    return;
  }

  switch (code) {
    case 'KeyE':
      if (!UI.el.inv.classList.contains('hidden')) { closeInventory(inventory); requestPointerLock(); }
      else if (!anyScreenOpen()) {
        if (document.exitPointerLock) document.exitPointerLock();
        openInventory('inventory', { inv: inventory, craft: craftGrid });
      }
      break;
    case 'KeyQ': dropHeld(); break;
    case 'KeyM': {
      const cb = document.getElementById('opt-music');
      cb.checked = !cb.checked;
      setMusicEnabled(cb.checked);
      break;
    }
    case 'F3': e.preventDefault(); state.debug = !state.debug; setDebugVisible(state.debug); break;
    case 'F5': e.preventDefault(); state.thirdPerson = (state.thirdPerson + 1) % 3; break;
    case 'KeyR': if (e.ctrlKey) return; break;
    default: break;
  }
}

function readMovement() {
  const k = input.keys;
  input.forward = (k.has('KeyW') ? 1 : 0) - (k.has('KeyS') ? 1 : 0);
  input.strafe = (k.has('KeyD') ? 1 : 0) - (k.has('KeyA') ? 1 : 0);
  input.jump = k.has('Space');
  input.sneak = k.has('ShiftLeft') || k.has('ShiftRight');
  input.sprint = k.has('ControlLeft') || k.has('ControlRight');
  if (anyScreenOpen() || state.paused) {
    input.forward = input.strafe = 0;
    input.jump = input.sneak = input.sprint = false;
  }
}

// ================================================================== mining
const mining = { target: null, progress: 0, total: 0, soundTimer: 0 };

function resetMining() {
  mining.target = null;
  mining.progress = 0;
  if (crackMesh) crackMesh.visible = false;
}

function heldTool() {
  const name = inventory.heldItem();
  const d = name ? ITEMS[name] : null;
  return d && d.tool ? d.tool : { type: null, tier: TIER.HAND };
}

function currentTarget() {
  const origin = player.eye();
  const dir = player.forward();
  return world.raycast(origin, dir, 5);
}

function updateMining(dt) {
  const hit = currentTarget();
  outlineMesh.visible = !!hit;
  if (hit) outlineMesh.position.set(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5);

  if (!input.mining || !hit) { resetMining(); return; }
  const id = hit.id;
  if (id === B.AIR || BLOCKS[id].hardness < 0) { resetMining(); return; }

  const key = hit.x + ',' + hit.y + ',' + hit.z;
  if (mining.target !== key) {
    mining.target = key;
    mining.progress = 0;
    const tool = heldTool();
    mining.total = breakTime(id, tool.type, tool.tier);
  }
  mining.progress += dt;

  mining.soundTimer -= dt;
  if (mining.soundTimer <= 0) {
    mining.soundTimer = 0.22;
    Sfx.dig(materialOf(BLOCKS[id].name));
    swing();
  }

  const frac = Math.min(1, mining.progress / mining.total);
  crackMesh.visible = frac > 0.02;
  crackMesh.position.copy(outlineMesh.position);
  crackMesh.material.map = crackTextures[Math.min(9, Math.floor(frac * 10))];
  crackMesh.material.needsUpdate = true;

  if (frac >= 1) breakBlock(hit);
}

function breakBlock(hit) {
  const id = hit.id;
  const bdef = BLOCKS[id];
  const tool = heldTool();
  world.setBlock(hit.x, hit.y, hit.z, B.AIR);

  if (canHarvest(id, tool.type, tool.tier)) {
    const drop = dropsOf(id, rand);
    if (drop) entities.dropItem(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, drop, 1);
  }
  Sfx.break_(materialOf(bdef.name));
  spawnParticles(hit.x + 0.5, hit.y + 0.5, hit.z + 0.5, bdef);

  // Plants and torches cannot float: knock down anything resting on top.
  const above = world.getBlock(hit.x, hit.y + 1, hit.z);
  if (above !== B.AIR && BLOCKS[above].render === 'cross') {
    const d2 = dropsOf(above, rand);
    world.setBlock(hit.x, hit.y + 1, hit.z, B.AIR);
    if (d2) entities.dropItem(hit.x + 0.5, hit.y + 1.5, hit.z + 0.5, d2, 1);
  }
  resetMining();
}

function tryAttack() {
  if (anyScreenOpen()) return;
  const origin = player.eye();
  const dir = player.forward();
  const mob = entities.mobHit(origin, dir, 3.2);
  if (!mob) return;
  const held = inventory.heldItem();
  const d = held ? ITEMS[held] : null;
  const dmg = d && d.tool && d.tool.type === 'sword' ? 3 + d.tool.tier : 1;
  mob.hurt(dmg);
  Sfx.hitMob();
  say(mob.label());
}

// ================================================================= placing
function useHeld() {
  if (anyScreenOpen() || state.paused) return;

  // Talking to a villager comes first — it is the point of the game.
  const villager = entities.nearestVillager(player.pos, 4.2);
  if (villager && villager.quest) {
    const eye = player.eye();
    const toV = villager.pos.clone().sub(eye).normalize();
    if (toV.dot(player.forward()) > 0.55) {
      if (document.exitPointerLock) document.exitPointerLock();
      Sfx.villager();
      advancements.trigger('friend');
      openQuest(villager, quests);
      return;
    }
  }

  const hit = currentTarget();
  if (hit) {
    const bdef = BLOCKS[hit.id];
    if (bdef.interact) { openBlockScreen(bdef.interact, hit); return; }
  }

  const held = inventory.held();
  if (!held) return;
  const def = ITEMS[held.item];

  if (def.food) {
    if (player.eat(def.food)) {
      inventory.consumeHeld(1);
      Sfx.eat();
      advancements.trigger('eat');
      renderHotbar(inventory);
      renderBars(player);
      say('Yum! ' + def.label);
    }
    return;
  }

  if (def.block !== null && hit) {
    const nx = hit.x + hit.face[0], ny = hit.y + hit.face[1], nz = hit.z + hit.face[2];
    const existing = world.getBlock(nx, ny, nz);
    if (existing !== B.AIR && existing !== B.WATER && BLOCKS[existing].solid) return;
    if (blockIntersectsPlayer(nx, ny, nz) && BLOCKS[def.block].solid) return;
    world.setBlock(nx, ny, nz, def.block);
    inventory.consumeHeld(1);
    Sfx.place(materialOf(BLOCKS[def.block].name));
    if (def.block === B.TORCH) advancements.trigger('torch');
    renderHotbar(inventory);
  }
}

function blockIntersectsPlayer(x, y, z) {
  const p = player.pos;
  const hw = PLAYER_CONST.WIDTH / 2;
  return (x + 1 > p.x - hw && x < p.x + hw &&
          y + 1 > p.y && y < p.y + PLAYER_CONST.HEIGHT &&
          z + 1 > p.z - hw && z < p.z + hw);
}

function openBlockScreen(kind, hit) {
  if (document.exitPointerLock) document.exitPointerLock();
  const key = hit.x + ',' + hit.y + ',' + hit.z;
  if (kind === 'crafting_table') {
    openInventory('crafting_table', { inv: inventory, craft: craftGrid });
  } else if (kind === 'furnace') {
    if (!furnaces.has(key)) furnaces.set(key, { input: null, fuel: null, output: null, burn: 0, burnMax: 1, cook: 0, cookMax: 8 });
    openInventory('furnace', { inv: inventory, furnace: furnaces.get(key) });
  } else if (kind === 'chest') {
    if (!chests.has(key)) chests.set(key, new SlotSet(27));
    openInventory('chest', { inv: inventory, chest: chests.get(key) });
  } else if (kind === 'sign') {
    openSign(signs.get(key) || '', quests.pack.words, (text) => {
      if (text) signs.set(key, text); else signs.delete(key);
    });
  }
}

function dropHeld() {
  const held = inventory.held();
  if (!held) return;
  const dir = player.forward();
  const e = player.eye();
  entities.dropItem(e.x + dir.x, e.y + dir.y, e.z + dir.z, held.item, 1);
  inventory.consumeHeld(1);
  renderHotbar(inventory);
}

// ================================================================ furnaces
function tickFurnaces(dt) {
  for (const f of furnaces.values()) {
    const result = f.input ? smeltResult(f.input.item) : null;

    if (f.burn > 0) f.burn -= dt;
    if (f.burn <= 0 && result && f.fuel) {
      const v = fuelValue(f.fuel.item);
      if (v > 0 && (!f.output || (f.output.item === result && f.output.count < 64))) {
        // Fuel values are in the original's units; /25 turns them into seconds,
        // so one coal smelts eight items and planks smelt one and a half.
        f.burnMax = v / 25;
        f.burn = f.burnMax;
        f.fuel.count--;
        if (f.fuel.count <= 0) f.fuel = null;
      }
    }

    if (f.burn > 0 && result && (!f.output || (f.output.item === result && f.output.count < 64))) {
      f.cook += dt;
      if (f.cook >= f.cookMax) {
        f.cook = 0;
        f.input.count--;
        if (f.input.count <= 0) f.input = null;
        if (f.output) f.output.count++;
        else f.output = { item: result, count: 1 };
        checkItemAdvancements(result);
      }
    } else {
      f.cook = Math.max(0, f.cook - dt * 2);
    }
  }
  if (UI.mode === 'furnace') redrawInventory();
}

// =============================================================== particles
const particlePool = [];
function spawnParticles(x, y, z, bdef) {
  const colour = tileAverage(bdef.tiles.side);
  for (let i = 0; i < 7; i++) {
    let p = particlePool.pop();
    if (!p) {
      p = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), new THREE.MeshBasicMaterial());
      p.userData.vel = new THREE.Vector3();
    }
    p.material.color.setHex(colour);
    p.position.set(x + (rand() - 0.5) * 0.6, y + (rand() - 0.5) * 0.6, z + (rand() - 0.5) * 0.6);
    p.userData.vel.set((rand() - 0.5) * 3, rand() * 3.5, (rand() - 0.5) * 3);
    p.userData.life = 0.7;
    p.visible = true;
    scene.add(p);
    particles.push(p);
  }
}

function updateParticles(dt) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.userData.life -= dt;
    p.userData.vel.y -= 22 * dt;
    p.position.addScaledVector(p.userData.vel, dt);
    if (p.userData.life <= 0) {
      scene.remove(p);
      particles.splice(i, 1);
      particlePool.push(p);
    }
  }
}

// ============================================================== view model
let swingT = 0;
function swing() { swingT = 0.28; }

function updateHeldItem(dt) {
  const held = inventory.heldItem();
  if (!held) { heldSprite.visible = false; return; }
  if (heldSprite.userData.item !== held) {
    heldSprite.userData.item = held;
    const t = new THREE.TextureLoader().load(itemIcon(held));
    t.magFilter = THREE.NearestFilter;
    t.minFilter = THREE.NearestFilter;
    heldSprite.material.map = t;
    heldSprite.material.needsUpdate = true;
  }
  heldSprite.visible = state.thirdPerson === 0;
  if (swingT > 0) swingT -= dt;
  const s = Math.max(0, swingT / 0.28);
  const bob = Math.sin(player.bob) * 0.012;
  heldSprite.position.set(0.78, -0.55 + bob - s * 0.22, -1.6);
  heldSprite.material.rotation = -0.25 + s * 0.9;
}

// ================================================================ footsteps
let stepDist = 0, lastPos = new THREE.Vector3();
function updateFootsteps(dt) {
  const moved = player.pos.distanceTo(lastPos);
  lastPos.copy(player.pos);
  if (!player.onGround) { stepDist = 0; return; }
  stepDist += moved;
  if (stepDist > 2.2) {
    stepDist = 0;
    const under = world.getBlock(Math.floor(player.pos.x), Math.floor(player.pos.y - 0.2), Math.floor(player.pos.z));
    if (under !== B.AIR) Sfx.step(materialOf(BLOCKS[under].name));
  }
}

let wasInWater = false;
function updateWater() {
  if (player.inWater && !wasInWater) { Sfx.splash(); advancements.trigger('swim'); }
  wasInWater = player.inWater;
  setUnderwater(player.headInWater);
}

// ================================================================ the loop
function updateCamera() {
  const eye = player.eye();
  camera.rotation.order = 'YXZ';
  camera.rotation.y = player.yaw;
  camera.rotation.x = player.pitch;
  if (state.thirdPerson === 0) {
    camera.position.copy(eye);
  } else {
    const back = state.thirdPerson === 1 ? 4 : -4;
    const dir = player.forward();
    camera.position.copy(eye).addScaledVector(dir, -back);
    if (state.thirdPerson === 2) camera.rotation.y = player.yaw + Math.PI;
  }
  camera.fov = 72 + (player.sprinting ? 6 : 0);
  camera.updateProjectionMatrix();
}

function loop(t) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (t - clock) / 1000) || 0;
  clock = t;
  fpsTimes.push(t);
  while (fpsTimes.length && fpsTimes[0] < t - 1000) fpsTimes.shift();

  if (state.started && !state.paused) {
    readMovement();
    player.update(dt, input);
    world.update(player.pos.x, player.pos.z, 5);
    entities.update(dt, player);
    quests.update(dt);
    sky.update(dt, camera, renderer);
    tickFurnaces(dt);
    updateMining(dt);
    updateParticles(dt);
    updateFootsteps(dt);
    updateWater();
    updateHeldItem(dt);
    renderBars(player);
    updateHints();
    if (sky.daylight < 0.35) advancements.trigger('night');
    state.time += dt;
    if (state.time > 30) { state.time = 0; saveGame(); }
  }

  updateCamera();
  renderer.clear();
  renderer.render(scene, camera);
  renderer.clearDepth();
  renderer.render(hudScene, hudCamera);

  if (state.debug) drawDebug();
}

// A single line of guidance, driven by what is actually in front of the player.
function updateHints() {
  if (anyScreenOpen()) { hint(null); return; }
  const v = entities.nearestVillager(player.pos, 4.2);
  if (v && v.quest) {
    hint('Right-click to talk to <b>' + (v.name || 'the villager') + '</b>');
    return;
  }
  const hit = currentTarget();
  if (hit) {
    const bd = BLOCKS[hit.id];
    if (bd.interact === 'sign') {
      const text = signs.get(hit.x + ',' + hit.y + ',' + hit.z);
      if (text) { hint('“<b>' + text + '</b>”'); say(text); }
      else hint('Right-click the <b>sign</b> to write a word');
      return;
    }
    if (bd.interact === 'crafting_table') { hint('Right-click the <b>Crafting Table</b>'); return; }
    if (bd.interact === 'furnace') { hint('Right-click the <b>Furnace</b>'); return; }
    if (bd.interact === 'chest') { hint('Right-click the <b>Chest</b>'); return; }
  }
  hint(null);
}

function drawDebug() {
  const p = player.pos;
  const biome = biomeAt(state.seed, Math.floor(p.x), Math.floor(p.z));
  const dirs = ['south', 'west', 'north', 'east'];
  const facing = dirs[Math.round(((player.yaw % (Math.PI * 2)) + Math.PI * 2) / (Math.PI / 2)) % 4];
  updateDebug([
    'BlockWords  ' + fpsTimes.length + ' fps',
    'xyz  ' + p.x.toFixed(1) + ' / ' + p.y.toFixed(1) + ' / ' + p.z.toFixed(1),
    'chunk ' + Math.floor(p.x / CHUNK_X) + ', ' + Math.floor(p.z / CHUNK_Z),
    'biome ' + biome.name + '   facing ' + facing,
    'time  ' + sky.clock() + '   light ' + sky.daylight.toFixed(2),
    'chunks ' + world.chunks.size + '  pending ' + world.stats.pending,
    'entities ' + entities.mobs.length + ' mobs, ' + entities.items.length + ' items, ' +
      entities.villagers.length + ' villagers',
    'words learned ' + quests.learned.size + '/' + quests.pack.words.length,
  ]);
}

// ================================================================== saving
function buildSavePayload() {
  return {
    playerName: state.playerName,
    seed: state.seed,
    packId: state.packId,
    year: state.year,
    pos: [player.pos.x, player.pos.y, player.pos.z],
    yaw: player.yaw, pitch: player.pitch,
    health: player.health, hunger: player.hunger,
    inv: inventory.serialize(),
    time: sky.time,
    deltas: world.serializeDeltas(),
    advancements: advancements.serialize(),
    learned: [...quests.learned],
    signs: [...signs],
    chests: [...chests].map(([k, c]) => [k, c.slots.map((x) => (x ? [x.item, x.count] : 0))]),
  };
}

async function saveGame() {
  if (!state.started) return false;
  const name = state.playerName || getPlayerName();
  if (!normalizeName(name)) return false;
  state.playerName = name;
  try {
    const data = buildSavePayload();
    saveLocalSave(name, data);
    if (isCloudEnabled()) return await saveCloudSave(name, data);
    return true;
  } catch (e) {
    console.warn('Could not save:', e);
    return false;
  }
}

async function loadSaveData(name) {
  const n = name || getPlayerName();
  if (!normalizeName(n)) return null;
  let data = null;
  if (isCloudEnabled()) data = await loadCloudSave(n);
  if (!data) data = loadLocalSave(n);
  if (data && data.playerName) {
    const el = document.getElementById('name-input');
    if (el) el.value = data.playerName;
    localStorage.setItem('blockwords.playerName', data.playerName);
  }
  return data;
}

// ==================================================================== boot
function boot() {
  initRenderer();
  initSpeech();
  initAudio();
  initSaves();
  initInput();
  buildYearPicker();
  buildPackPicker();
  validateWords();
  wireMenus();
  initUI({});
  showHud(false);

  // Debug/verification handle. Everything the tests need is reachable here.
  window.MC = {
    state, get world() { return world; }, get player() { return player; },
    get entities() { return entities; }, get inventory() { return inventory; },
    get quests() { return quests; }, get sky() { return sky; },
    THREE, B, BLOCKS, ITEMS,
    get furnaces() { return furnaces; },
    tp(x, y, z) { player.pos.set(x, y, z); player.vel.set(0, 0, 0); },
    give(item, n = 1) { inventory.add(item, n); renderHotbar(inventory); },
    setTime(p) { sky.setPhase(p); },
    PACKS, YEARS,
    get year() { return quests ? quests.year : null; },
    // Swap the class without restarting: MC.setYear(4)
    setYear(n) { state.year = Number(n); return quests.setYear(n); },
    // Swap the word pack without restarting: MC.setPack('eating')
    setPack(id) {
      state.packId = id;
      quests.pack = packById(id);
      for (const v of entities.villagers) quests.assign(v);
      return quests.pack;
    },
    findVillager() {
      const v = entities.villagers[0];
      if (v) this.tp(v.pos.x, v.pos.y + 1, v.pos.z + 2);
      return v;
    },
    completeQuest() {
      const v = entities.villagers.find((x) => x.quest);
      if (!v) return null;
      const q = v.quest;
      if (q.type === 'fetch') inventory.add(q.item, q.count);
      if (q.type === 'find') q.progress = 1;
      return q;
    },
    save: saveGame,
    fps() { return fpsTimes.length; },
    get signs() { return signs; },
    // Try a recipe without opening the UI: MC.craft(['oak_log'], 2)
    craft(grid, size) {
      const slots = new Array(size * size).fill(null);
      grid.forEach((it, i) => { if (it) slots[i] = { item: it, count: 1 }; });
      return findRecipe(slots, size);
    },
    smelt(name) { return smeltResult(name); },
    tickFurnaces(dt) { tickFurnaces(dt); },
    // Open the quest dialog without walking there, for scripted checks.
    talk(i = 0, forceType) {
      const v = entities.villagers[i];
      if (!v) return null;
      if (forceType) {
        for (let n = 0; n < 60; n++) {
          const q = quests.makeQuest(v);
          if (q.type === forceType) { v.quest = q; break; }
        }
      }
      if (!v.quest) quests.assign(v);
      openQuest(v, quests);
      return v.quest;
    },
    mineAt(x, y, z) {
      const id = world.getBlock(x, y, z);
      if (id === B.AIR) return null;
      breakBlock({ x, y, z, id, face: [0, 1, 0] });
      return BLOCKS[id].name;
    },
    // Timing for one fresh chunk, so the streaming budget can be tuned.
    profile(offset = 40) {
      const cx = Math.floor(player.pos.x / CHUNK_X) + offset;
      const cz = Math.floor(player.pos.z / CHUNK_Z) + offset;
      for (const [ox, oz] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) world.ensure(cx + ox, cz + oz);
      const c = world.getChunk(cx, cz, true);
      let t0 = performance.now(); world.generate(c); const gen = performance.now() - t0;
      t0 = performance.now(); computeLight(c, world); const light = performance.now() - t0;
      t0 = performance.now(); buildGeometry(c, world); const mesh = performance.now() - t0;
      return { gen: +gen.toFixed(1), light: +light.toFixed(1), mesh: +mesh.toFixed(1) };
    },
  };
}

boot();
