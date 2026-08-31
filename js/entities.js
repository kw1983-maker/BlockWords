// Everything in the world that is not a block: dropped items, the passive
// animals, and the villagers who hand out the English quests.
//
// Mobs are built from boxes, the way the originals are, and use a cut-down
// version of the player's physics: gravity, a ground test, and "turn around if
// something is in the way".

import * as THREE from 'three';
import { B, BLOCKS, WOOL_COLOURS } from './blocks.js';
import { itemIcon, ITEMS } from './items.js';
import { tileUV, atlasCanvas, TILE, COLS, TILE_INDEX } from './atlas.js';
import { mulberry32, hash2 } from './noise.js';
import { CHUNK_Y, villagesNear, villageHouses, heightAt } from './worldgen.js';

// ------------------------------------------------------------- shared assets
const iconTextures = new Map();
function iconTexture(name) {
  if (iconTextures.has(name)) return iconTextures.get(name);
  const t = new THREE.TextureLoader().load(itemIcon(name));
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestFilter;
  iconTextures.set(name, t);
  return t;
}

function box(w, h, d, colour, x, y, z) {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    new THREE.MeshLambertMaterial({ color: colour })
  );
  m.position.set(x, y, z);
  return m;
}

// --------------------------------------------------------------- item drops
export class ItemEntity {
  constructor(x, y, z, item, count) {
    this.item = item;
    this.count = count;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3((Math.random() - 0.5) * 1.6, 2.2, (Math.random() - 0.5) * 1.6);
    this.age = 0;
    this.pickupDelay = 0.4;
    this.dead = false;

    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({
      map: iconTexture(item), sizeAttenuation: true,
    }));
    sprite.scale.set(0.42, 0.42, 0.42);
    this.object = sprite;
  }

  update(dt, world) {
    this.age += dt;
    this.pickupDelay -= dt;
    this.vel.y -= 24 * dt;
    const nx = this.pos.x + this.vel.x * dt;
    const nz = this.pos.z + this.vel.z * dt;
    if (!BLOCKS[world.getBlock(Math.floor(nx), Math.floor(this.pos.y), Math.floor(this.pos.z))].solid) this.pos.x = nx;
    else this.vel.x = 0;
    if (!BLOCKS[world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y), Math.floor(nz))].solid) this.pos.z = nz;
    else this.vel.z = 0;

    this.pos.y += this.vel.y * dt;
    const below = world.getBlock(Math.floor(this.pos.x), Math.floor(this.pos.y - 0.1), Math.floor(this.pos.z));
    if (BLOCKS[below].solid && this.vel.y <= 0) {
      this.pos.y = Math.floor(this.pos.y - 0.1) + 1.12;
      this.vel.y = 0;
      this.vel.x *= 0.7; this.vel.z *= 0.7;
    }
    if (this.pos.y < -5) this.dead = true;
    this.object.position.copy(this.pos);
    this.object.position.y += Math.sin(this.age * 3) * 0.05;
    this.object.material.rotation = 0;
  }
}

// --------------------------------------------------------------------- mobs
export const MOB_TYPES = {
  pig: {
    label: 'Pig', hp: 10, w: 0.62, h: 0.9, speed: 1.1,
    drops: [['raw_porkchop', 1, 3]],
    build(colour) {
      const g = new THREE.Group();
      const pink = 0xf0a5ab;
      g.add(box(0.62, 0.62, 1.0, pink, 0, 0.55, 0));            // body
      const head = box(0.5, 0.5, 0.5, pink, 0, 0.68, -0.72);
      g.add(head);
      g.add(box(0.22, 0.16, 0.08, 0xd98d95, 0, 0.62, -0.98));   // snout
      g.add(box(0.08, 0.08, 0.04, 0x21160f, -0.14, 0.78, -0.97));
      g.add(box(0.08, 0.08, 0.04, 0x21160f, 0.14, 0.78, -0.97));
      for (const [dx, dz] of [[-0.2, -0.3], [0.2, -0.3], [-0.2, 0.32], [0.2, 0.32]]) {
        g.add(box(0.2, 0.28, 0.2, 0xd98d95, dx, 0.14, dz));
      }
      return g;
    },
  },
  cow: {
    label: 'Cow', hp: 10, w: 0.7, h: 1.2, speed: 0.9,
    drops: [['raw_beef', 1, 3], ['leather', 0, 2]],
    build() {
      const g = new THREE.Group();
      const brown = 0x4a3a2a, white = 0xe8e4dc;
      g.add(box(0.72, 0.72, 1.2, brown, 0, 0.78, 0));
      g.add(box(0.5, 0.24, 0.5, white, 0.14, 0.9, 0.1));
      g.add(box(0.52, 0.52, 0.5, brown, 0, 1.0, -0.86));
      g.add(box(0.24, 0.2, 0.1, white, 0, 0.88, -1.1));
      g.add(box(0.08, 0.08, 0.04, 0x21160f, -0.15, 1.1, -1.11));
      g.add(box(0.08, 0.08, 0.04, 0x21160f, 0.15, 1.1, -1.11));
      g.add(box(0.1, 0.1, 0.1, 0xd8d0c0, -0.24, 1.24, -0.86));
      g.add(box(0.1, 0.1, 0.1, 0xd8d0c0, 0.24, 1.24, -0.86));
      for (const [dx, dz] of [[-0.24, -0.38], [0.24, -0.38], [-0.24, 0.4], [0.24, 0.4]]) {
        g.add(box(0.22, 0.42, 0.22, brown, dx, 0.21, dz));
      }
      return g;
    },
  },
  sheep: {
    label: 'Sheep', hp: 8, w: 0.62, h: 1.1, speed: 1.0,
    coloured: true,
    drops: [['raw_mutton', 1, 2]],
    build(colour) {
      const g = new THREE.Group();
      const wool = colour === undefined ? 0xf0f0f0 : colour;
      g.add(box(0.72, 0.72, 1.1, wool, 0, 0.76, 0));
      g.add(box(0.4, 0.44, 0.44, 0xd8c8b4, 0, 0.88, -0.76));
      g.add(box(0.44, 0.3, 0.3, wool, 0, 0.98, -0.66));
      g.add(box(0.07, 0.07, 0.04, 0x21160f, -0.11, 0.9, -0.98));
      g.add(box(0.07, 0.07, 0.04, 0x21160f, 0.11, 0.9, -0.98));
      for (const [dx, dz] of [[-0.2, -0.34], [0.2, -0.34], [-0.2, 0.36], [0.2, 0.36]]) {
        g.add(box(0.18, 0.42, 0.18, 0xd8c8b4, dx, 0.21, dz));
      }
      return g;
    },
  },
  chicken: {
    label: 'Chicken', hp: 4, w: 0.4, h: 0.7, speed: 1.2,
    drops: [['raw_chicken', 1, 1], ['feather', 0, 2]],
    build() {
      const g = new THREE.Group();
      const white = 0xf4f4f0;
      g.add(box(0.4, 0.44, 0.5, white, 0, 0.42, 0));
      g.add(box(0.28, 0.3, 0.28, white, 0, 0.72, -0.24));
      g.add(box(0.12, 0.1, 0.12, 0xe8a020, 0, 0.68, -0.42));
      g.add(box(0.1, 0.14, 0.06, 0xd83c3c, 0, 0.88, -0.22));
      g.add(box(0.06, 0.06, 0.03, 0x21160f, -0.09, 0.76, -0.38));
      g.add(box(0.06, 0.06, 0.03, 0x21160f, 0.09, 0.76, -0.38));
      g.add(box(0.06, 0.24, 0.06, 0xe8a020, -0.1, 0.12, 0));
      g.add(box(0.06, 0.24, 0.06, 0xe8a020, 0.1, 0.12, 0));
      return g;
    },
  },
  rabbit: {
    label: 'Rabbit', hp: 3, w: 0.4, h: 0.5, speed: 1.4,
    drops: [['leather', 0, 1]],
    build() {
      const g = new THREE.Group();
      const fur = 0xb59a76;
      g.add(box(0.34, 0.3, 0.5, fur, 0, 0.28, 0));
      g.add(box(0.28, 0.28, 0.28, fur, 0, 0.46, -0.3));
      g.add(box(0.07, 0.24, 0.05, fur, -0.07, 0.68, -0.28));
      g.add(box(0.07, 0.24, 0.05, fur, 0.07, 0.68, -0.28));
      g.add(box(0.06, 0.06, 0.03, 0x2a1a12, -0.09, 0.5, -0.44));
      g.add(box(0.06, 0.06, 0.03, 0x2a1a12, 0.09, 0.5, -0.44));
      g.add(box(0.12, 0.12, 0.12, 0xe8e0d0, 0, 0.3, 0.28));
      for (const [dx, dz] of [[-0.11, -0.14], [0.11, -0.14], [-0.11, 0.16], [0.11, 0.16]]) {
        g.add(box(0.1, 0.16, 0.14, fur, dx, 0.08, dz));
      }
      return g;
    },
  },
  cat: {
    label: 'Cat', hp: 8, w: 0.4, h: 0.6, speed: 1.2,
    drops: [],
    build() {
      const g = new THREE.Group();
      const fur = 0xdcb45a;
      g.add(box(0.32, 0.32, 0.68, fur, 0, 0.34, 0));
      g.add(box(0.3, 0.3, 0.3, fur, 0, 0.5, -0.44));
      g.add(box(0.08, 0.1, 0.04, fur, -0.09, 0.68, -0.44));
      g.add(box(0.08, 0.1, 0.04, fur, 0.09, 0.68, -0.44));
      g.add(box(0.07, 0.07, 0.03, 0x2f8f4f, -0.08, 0.53, -0.6));
      g.add(box(0.07, 0.07, 0.03, 0x2f8f4f, 0.08, 0.53, -0.6));
      g.add(box(0.08, 0.08, 0.34, fur, 0, 0.46, 0.44));
      for (const [dx, dz] of [[-0.1, -0.2], [0.1, -0.2], [-0.1, 0.22], [0.1, 0.22]]) {
        g.add(box(0.1, 0.24, 0.1, fur, dx, 0.12, dz));
      }
      return g;
    },
  },
  wolf: {
    label: 'Dog', hp: 8, w: 0.5, h: 0.8, speed: 1.3,
    drops: [],
    build() {
      const g = new THREE.Group();
      const fur = 0xd8d2c8;
      g.add(box(0.44, 0.44, 0.8, fur, 0, 0.5, 0));
      g.add(box(0.4, 0.4, 0.4, fur, 0, 0.72, -0.52));
      g.add(box(0.16, 0.14, 0.16, 0x3a3a3a, 0, 0.66, -0.74));
      g.add(box(0.1, 0.16, 0.05, fur, -0.13, 0.96, -0.5));
      g.add(box(0.1, 0.16, 0.05, fur, 0.13, 0.96, -0.5));
      g.add(box(0.07, 0.07, 0.03, 0x2a1a12, -0.1, 0.78, -0.72));
      g.add(box(0.07, 0.07, 0.03, 0x2a1a12, 0.1, 0.78, -0.72));
      g.add(box(0.1, 0.1, 0.36, fur, 0, 0.62, 0.5));
      for (const [dx, dz] of [[-0.14, -0.24], [0.14, -0.24], [-0.14, 0.26], [0.14, 0.26]]) {
        g.add(box(0.14, 0.3, 0.14, fur, dx, 0.15, dz));
      }
      return g;
    },
  },
};

export class Mob {
  constructor(type, x, y, z, seedVal) {
    const def = MOB_TYPES[type];
    this.type = type;
    this.def = def;
    this.hp = def.hp;
    this.pos = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = Math.random() * Math.PI * 2;
    this.target = null;
    this.think = Math.random() * 3;
    this.onGround = false;
    this.dead = false;
    this.hurtFlash = 0;
    this.walkPhase = 0;

    // Sheep come in colours, which is how the colour words get into the world.
    if (def.coloured) {
      const r = mulberry32(seedVal || (Math.random() * 1e9) | 0)();
      const i = r < 0.5 ? 0 : 1 + Math.floor(r * (WOOL_COLOURS.length - 1)) % (WOOL_COLOURS.length - 1);
      this.colourName = WOOL_COLOURS[i][0];
      this.colour = WOOL_COLOURS[i][1];
    }
    this.object = def.build(this.colour);
    this.object.position.copy(this.pos);
  }

  label() {
    if (this.colourName) return this.colourName.charAt(0).toUpperCase() + this.colourName.slice(1) + ' Sheep';
    return this.def.label;
  }

  dropList() {
    const out = [];
    for (const [item, lo, hi] of this.def.drops) {
      const n = lo + Math.floor(Math.random() * (hi - lo + 1));
      if (n > 0) out.push([item, n]);
    }
    if (this.colourName) out.push([this.colourName + '_wool', 1]);
    else if (this.type === 'sheep') out.push(['white_wool', 1]);
    return out;
  }

  hurt(n) {
    this.hp -= n;
    this.hurtFlash = 0.25;
    this.vel.y = Math.max(this.vel.y, 3.5);
    if (this.hp <= 0) this.dead = true;
  }

  update(dt, world) {
    // Chickens lay an egg now and then, exactly as they do in the original.
    if (this.type === 'chicken') {
      this.layTimer = (this.layTimer === undefined ? 25 + Math.random() * 40 : this.layTimer) - dt;
      if (this.layTimer <= 0) { this.layTimer = 35 + Math.random() * 45; this.laidEgg = true; }
    }
    this.think -= dt;
    if (this.think <= 0) { // wander: pick a new heading and hold it a while
      this.think = 2 + Math.random() * 5;
      this.moving = Math.random() < 0.65;
      this.yaw = Math.random() * Math.PI * 2;
    }

    const speed = this.moving ? this.def.speed : 0;
    const dx = -Math.sin(this.yaw) * speed;
    const dz = -Math.cos(this.yaw) * speed;

    this.vel.y -= 26 * dt;
    const w = this.def.w / 2, h = this.def.h;
    const blocked = (px, py, pz) => {
      for (let ox = -w; ox <= w; ox += w * 2) {
        for (let oz = -w; oz <= w; oz += w * 2) {
          for (let oy = 0.1; oy < h; oy += 0.8) {
            if (BLOCKS[world.getBlock(Math.floor(px + ox), Math.floor(py + oy), Math.floor(pz + oz))].solid) return true;
          }
        }
      }
      return false;
    };

    const nx = this.pos.x + dx * dt;
    if (!blocked(nx, this.pos.y, this.pos.z)) this.pos.x = nx;
    else if (this.onGround && !blocked(nx, this.pos.y + 1.05, this.pos.z)) { this.vel.y = 6.5; }
    else this.yaw += 1.7;

    const nz = this.pos.z + dz * dt;
    if (!blocked(this.pos.x, this.pos.y, nz)) this.pos.z = nz;
    else if (this.onGround && !blocked(this.pos.x, this.pos.y + 1.05, nz)) { this.vel.y = 6.5; }
    else this.yaw += 1.7;

    this.pos.y += this.vel.y * dt;
    const feet = Math.floor(this.pos.y - 0.05);
    if (this.vel.y <= 0 && BLOCKS[world.getBlock(Math.floor(this.pos.x), feet, Math.floor(this.pos.z))].solid) {
      this.pos.y = feet + 1;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = false;

    if (this.pos.y < -5) this.dead = true;

    this.walkPhase += speed * dt * 6;
    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    if (this.hurtFlash > 0) this.hurtFlash -= dt;
    const flash = this.hurtFlash > 0;
    this.object.traverse((o) => {
      if (o.material && o.material.emissive) o.material.emissive.setHex(flash ? 0x882222 : 0x000000);
    });
  }
}

// ---------------------------------------------------------------- villagers
export class Villager {
  constructor(x, y, z, id) {
    this.id = id;
    this.pos = new THREE.Vector3(x, y, z);
    this.home = new THREE.Vector3(x, y, z);
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.think = Math.random() * 3;
    this.quest = null;
    this.dead = false;
    this.onGround = false;

    const g = new THREE.Group();
    const robe = 0x6b4a30, skin = 0xc9a07a;
    g.add(box(0.5, 0.9, 0.34, robe, 0, 0.9, 0));       // robe
    g.add(box(0.52, 0.2, 0.36, 0x4a3220, 0, 1.02, 0));  // sash
    g.add(box(0.46, 0.46, 0.42, skin, 0, 1.58, 0));     // head
    g.add(box(0.12, 0.2, 0.16, skin, 0, 1.54, -0.26));  // the famous nose
    g.add(box(0.08, 0.08, 0.04, 0x2a2a3a, -0.13, 1.66, -0.22));
    g.add(box(0.08, 0.08, 0.04, 0x2a2a3a, 0.13, 1.66, -0.22));
    g.add(box(0.12, 0.6, 0.12, robe, -0.3, 0.95, 0));
    g.add(box(0.12, 0.6, 0.12, robe, 0.3, 0.95, 0));
    g.add(box(0.16, 0.5, 0.16, 0x3a2a1c, -0.13, 0.25, 0));
    g.add(box(0.16, 0.5, 0.16, 0x3a2a1c, 0.13, 0.25, 0));
    this.object = g;
    this.object.position.copy(this.pos);

    // A floating "!" so children can spot who to talk to.
    const c = document.createElement('canvas');
    c.width = c.height = 64;
    const ctx = c.getContext('2d');
    ctx.font = 'bold 52px sans-serif';
    ctx.textAlign = 'center';
    ctx.fillStyle = '#ffd23f';
    ctx.strokeStyle = '#3a2a08';
    ctx.lineWidth = 6;
    ctx.strokeText('!', 32, 50);
    ctx.fillText('!', 32, 50);
    const tex = new THREE.CanvasTexture(c);
    this.marker = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false, transparent: true }));
    this.marker.scale.set(0.5, 0.5, 0.5);
    this.marker.position.y = 2.3;
    g.add(this.marker);
  }

  update(dt, world) {
    this.think -= dt;
    if (this.think <= 0) {
      this.think = 3 + Math.random() * 4;
      this.moving = Math.random() < 0.5;
      this.yaw = Math.random() * Math.PI * 2;
    }
    // Villagers potter about but never wander away from their village.
    const away = this.pos.distanceTo(this.home);
    if (away > 12) {
      this.yaw = Math.atan2(this.home.x - this.pos.x, this.home.z - this.pos.z) + Math.PI;
      this.moving = true;
    }
    const speed = this.moving ? 0.9 : 0;
    const dx = -Math.sin(this.yaw) * speed * dt;
    const dz = -Math.cos(this.yaw) * speed * dt;
    const solid = (x, y, z) => BLOCKS[world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z))].solid;

    this.vel.y -= 26 * dt;
    if (!solid(this.pos.x + dx, this.pos.y + 0.2, this.pos.z) && !solid(this.pos.x + dx, this.pos.y + 1.2, this.pos.z)) this.pos.x += dx;
    else if (this.onGround && !solid(this.pos.x + dx, this.pos.y + 1.2, this.pos.z)) this.vel.y = 6.5;
    else this.yaw += 2.1;
    if (!solid(this.pos.x, this.pos.y + 0.2, this.pos.z + dz) && !solid(this.pos.x, this.pos.y + 1.2, this.pos.z + dz)) this.pos.z += dz;
    else if (this.onGround) this.vel.y = Math.max(this.vel.y, 6.5);
    else this.yaw += 2.1;

    this.pos.y += this.vel.y * dt;
    const feet = Math.floor(this.pos.y - 0.05);
    if (this.vel.y <= 0 && solid(this.pos.x, feet, this.pos.z)) {
      this.pos.y = feet + 1;
      this.vel.y = 0;
      this.onGround = true;
    } else this.onGround = false;

    this.object.position.copy(this.pos);
    this.object.rotation.y = this.yaw;
    if (this.marker) this.marker.visible = !!(this.quest && !this.quest.done);
  }
}

// ---------------------------------------------------------------- manager
export class Entities {
  constructor(world, scene, seed) {
    this.world = world;
    this.scene = scene;
    this.seed = seed;
    this.items = [];
    this.mobs = [];
    this.villagers = [];
    this.spawnedVillages = new Set();
    this.spawnTimer = 2;
    this.onPickup = null;      // (item, count) => void
    this.onVillagerReady = null; // (villager) => void, so quests.js can attach one
  }

  dropItem(x, y, z, item, count = 1) {
    if (!ITEMS[item]) return;
    const e = new ItemEntity(x, y, z, item, count);
    this.items.push(e);
    this.scene.add(e.object);
  }

  spawnMob(type, x, y, z, seedVal) {
    const m = new Mob(type, x, y, z, seedVal);
    this.mobs.push(m);
    this.scene.add(m.object);
    return m;
  }

  // Villagers appear the first time the player comes near their village.
  ensureVillagers(px, pz) {
    for (const v of villagesNear(this.seed, px, pz, 96)) {
      const key = v.x + ',' + v.z;
      if (this.spawnedVillages.has(key)) continue;
      if (!this.world.isLoaded(v.x, v.z)) continue;
      this.spawnedVillages.add(key);
      const houses = villageHouses(this.seed, v);
      houses.forEach((h, i) => {
        const y = Math.max(h.y + 1, this.world.highestBlockAt(h.x, h.z - 2) + 1);
        const vg = new Villager(h.x + 0.5, y, h.z - 2 + 0.5, key + '#' + i);
        this.villagers.push(vg);
        this.scene.add(vg.object);
        if (this.onVillagerReady) this.onVillagerReady(vg);
      });
    }
  }

  // Keep a modest, steady population of animals around the player.
  maybeSpawnAnimals(px, py, pz, dt) {
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    this.spawnTimer = 3;
    const near = this.mobs.filter((m) => Math.abs(m.pos.x - px) < 60 && Math.abs(m.pos.z - pz) < 60);
    if (near.length >= 14) return;
    const types = ['pig', 'cow', 'sheep', 'sheep', 'chicken', 'rabbit', 'cat', 'wolf'];
    for (let tries = 0; tries < 8; tries++) {
      const ang = Math.random() * Math.PI * 2;
      const dist = 18 + Math.random() * 34;
      const x = Math.floor(px + Math.cos(ang) * dist);
      const z = Math.floor(pz + Math.sin(ang) * dist);
      if (!this.world.isLoaded(x, z)) continue;
      const top = this.world.highestBlockAt(x, z);
      if (top < 0) continue;
      const ground = this.world.getBlock(x, top, z);
      if (ground !== B.GRASS_BLOCK && ground !== B.SNOW_BLOCK) continue;
      if (this.world.getBlock(x, top + 1, z) !== B.AIR) continue;
      const type = types[Math.floor(Math.random() * types.length)];
      this.spawnMob(type, x + 0.5, top + 1, z + 0.5, (Math.random() * 1e9) | 0);
      return;
    }
  }

  update(dt, player) {
    const p = player.pos;

    for (let i = this.items.length - 1; i >= 0; i--) {
      const e = this.items[i];
      e.update(dt, this.world);
      const d = e.pos.distanceTo(p);
      if (e.pickupDelay <= 0 && d < 1.4) {
        if (this.onPickup && this.onPickup(e.item, e.count) !== false) e.dead = true;
      }
      if (d > 140) e.dead = true;
      if (e.dead) { this.scene.remove(e.object); this.items.splice(i, 1); }
    }

    for (let i = this.mobs.length - 1; i >= 0; i--) {
      const m = this.mobs[i];
      const d = Math.abs(m.pos.x - p.x) + Math.abs(m.pos.z - p.z);
      if (d < 120) m.update(dt, this.world);
      if (m.laidEgg) { m.laidEgg = false; this.dropItem(m.pos.x, m.pos.y + 0.3, m.pos.z, 'egg', 1); }
      if (m.dead) {
        for (const [item, n] of m.dropList()) this.dropItem(m.pos.x, m.pos.y + 0.5, m.pos.z, item, n);
        this.scene.remove(m.object);
        this.mobs.splice(i, 1);
      } else if (d > 150) {
        this.scene.remove(m.object);
        this.mobs.splice(i, 1);
      }
    }

    for (const v of this.villagers) {
      if (Math.abs(v.pos.x - p.x) + Math.abs(v.pos.z - p.z) < 90) v.update(dt, this.world);
    }

    this.ensureVillagers(p.x, p.z);
    this.maybeSpawnAnimals(p.x, p.y, p.z, dt);
  }

  // Nearest mob the player is looking at, for hitting things with a sword.
  mobHit(origin, dir, maxDist = 3.2) {
    let best = null, bestT = maxDist;
    for (const m of this.mobs) {
      const toM = m.pos.clone().sub(origin);
      toM.y += m.def.h * 0.5;
      const t = toM.dot(dir);
      if (t < 0 || t > bestT) continue;
      const perp = toM.clone().sub(dir.clone().multiplyScalar(t)).length();
      if (perp > m.def.w + 0.35) continue;
      best = m; bestT = t;
    }
    return best;
  }

  nearestVillager(pos, maxDist = 4) {
    let best = null, bestD = maxDist;
    for (const v of this.villagers) {
      const d = v.pos.distanceTo(pos);
      if (d < bestD) { best = v; bestD = d; }
    }
    return best;
  }
}
