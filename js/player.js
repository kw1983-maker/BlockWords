// First-person player: movement, voxel collision, swimming, and the survival
// stats (health, hunger, breath). Peaceful rules — nothing hunts you, but you
// can still fall, drown and go hungry.

import * as THREE from 'three';
import { B, BLOCKS } from './blocks.js';

const WIDTH = 0.6, HEIGHT = 1.8, EYE = 1.62;
const HALF = WIDTH / 2;
const GRAVITY = 30;
const JUMP_V = 9.2;
const WALK = 4.4, SPRINT = 6.0, SNEAK = 1.5, SWIM = 3.2;
const MAX_HEALTH = 20, MAX_HUNGER = 20, MAX_AIR = 300;

export class Player {
  constructor(world) {
    this.world = world;
    this.pos = new THREE.Vector3(0, 80, 0);   // feet position
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.pitch = 0;
    this.onGround = false;
    this.inWater = false;
    this.headInWater = false;
    this.sneaking = false;
    this.sprinting = false;
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.air = MAX_AIR;
    this.exhaustion = 0;
    this.fallStart = null;
    this.dead = false;
    this.spawn = new THREE.Vector3(0, 80, 0);
    this.bob = 0;
    this.regenTimer = 0;
    this.starveTimer = 0;
    this.onHurt = null;    // set by main.js for sound + red flash
    this.onDeath = null;
  }

  eye(out = new THREE.Vector3()) {
    return out.set(this.pos.x, this.pos.y + EYE - (this.sneaking ? 0.18 : 0), this.pos.z);
  }

  forward(out = new THREE.Vector3()) {
    return out.set(
      -Math.sin(this.yaw) * Math.cos(this.pitch),
      Math.sin(this.pitch),
      -Math.cos(this.yaw) * Math.cos(this.pitch)
    ).normalize();
  }

  look(dx, dy) {
    this.yaw -= dx;
    this.pitch -= dy;
    const lim = Math.PI / 2 - 0.001;
    this.pitch = Math.max(-lim, Math.min(lim, this.pitch));
  }

  // ------------------------------------------------------------- collision
  solidAt(x, y, z) {
    const id = this.world.getBlock(Math.floor(x), Math.floor(y), Math.floor(z));
    return BLOCKS[id].solid;
  }

  boxHits(px, py, pz) {
    const x0 = Math.floor(px - HALF), x1 = Math.floor(px + HALF);
    const y0 = Math.floor(py), y1 = Math.floor(py + HEIGHT - 0.001);
    const z0 = Math.floor(pz - HALF), z1 = Math.floor(pz + HALF);
    for (let x = x0; x <= x1; x++) {
      for (let y = y0; y <= y1; y++) {
        for (let z = z0; z <= z1; z++) {
          if (BLOCKS[this.world.getBlock(x, y, z)].solid) return true;
        }
      }
    }
    return false;
  }

  groundUnder(px, py, pz) {
    const x0 = Math.floor(px - HALF), x1 = Math.floor(px + HALF);
    const z0 = Math.floor(pz - HALF), z1 = Math.floor(pz + HALF);
    const y = Math.floor(py - 0.08);
    for (let x = x0; x <= x1; x++) {
      for (let z = z0; z <= z1; z++) {
        if (BLOCKS[this.world.getBlock(x, y, z)].solid) return true;
      }
    }
    return false;
  }

  liquidAt(px, py, pz) {
    return this.world.getBlock(Math.floor(px), Math.floor(py), Math.floor(pz)) === B.WATER;
  }

  // ------------------------------------------------------------------ update
  update(dt, input) {
    if (this.dead) return;
    dt = Math.min(dt, 0.05); // never let a stutter teleport the player

    this.inWater = this.liquidAt(this.pos.x, this.pos.y + 0.4, this.pos.z);
    this.headInWater = this.liquidAt(this.pos.x, this.pos.y + EYE, this.pos.z);
    this.sneaking = !!input.sneak && this.onGround;
    const canSprint = input.sprint && input.forward > 0 && !this.sneaking && this.hunger > 6;
    this.sprinting = !!canSprint;

    // --- desired horizontal velocity from WASD, rotated by where we look
    let speed = this.sneaking ? SNEAK : this.sprinting ? SPRINT : WALK;
    if (this.inWater) speed = SWIM;
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    let mx = input.strafe * cos - input.forward * sin;
    let mz = -input.strafe * sin - input.forward * cos;
    const len = Math.hypot(mx, mz);
    if (len > 0) { mx = (mx / len) * speed; mz = (mz / len) * speed; }

    // Ground control is snappy; air control deliberately is not.
    const control = this.onGround ? 1 : this.inWater ? 0.5 : 0.16;
    this.vel.x += (mx - this.vel.x) * Math.min(1, control * dt * 18);
    this.vel.z += (mz - this.vel.z) * Math.min(1, control * dt * 18);

    // --- vertical
    if (this.inWater) {
      this.vel.y += (input.jump ? 5.2 : -3.4) * dt * 6;
      this.vel.y = Math.max(-4, Math.min(4.5, this.vel.y));
      this.vel.y *= 0.86;
      this.fallStart = null;
    } else {
      this.vel.y -= GRAVITY * dt;
      if (input.jump && this.onGround) {
        this.vel.y = JUMP_V;
        this.onGround = false;
        this.exhaustion += this.sprinting ? 0.2 : 0.05;
      }
    }

    this.moveAxis(dt);
    this.unstick();
    this.updateStats(dt, len > 0);
  }

  // Last-resort rescue. If the player somehow ends up inside solid blocks they
  // cannot move at all, which to a seven-year-old just looks like the game
  // broke. Lift them out to the nearest free space above.
  unstick() {
    if (!this.boxHits(this.pos.x, this.pos.y, this.pos.z)) { this.stuckFor = 0; return; }
    this.stuckFor = (this.stuckFor || 0) + 1;
    for (let up = 1; up <= 6; up++) {
      if (!this.boxHits(this.pos.x, this.pos.y + up, this.pos.z)) {
        this.pos.y += up;
        this.vel.set(0, 0, 0);
        this.fallStart = null;
        this.stuckFor = 0;
        return;
      }
    }
    // Fully buried: put them back on the surface of this column.
    if (this.stuckFor > 20) {
      const top = this.world.highestBlockAt(Math.floor(this.pos.x), Math.floor(this.pos.z));
      if (top > 0) {
        this.pos.y = top + 1.05;
        this.vel.set(0, 0, 0);
        this.fallStart = null;
        this.stuckFor = 0;
      }
    }
  }

  moveAxis(dt) {
    const startY = this.pos.y;

    // --- horizontal, one axis at a time, with a step-up for 1-block ledges
    for (const axis of ['x', 'z']) {
      const delta = this.vel[axis] * dt;
      if (delta === 0) continue;
      const old = this.pos[axis];
      this.pos[axis] += delta;
      if (this.boxHits(this.pos.x, this.pos.y, this.pos.z)) {
        let stepped = false;
        if (this.onGround || this.inWater) {
          const tryY = this.pos.y + 1.02;
          if (!this.boxHits(this.pos.x, tryY, this.pos.z)) {
            this.pos.y = tryY;
            stepped = true;
          }
        }
        if (!stepped) { this.pos[axis] = old; this.vel[axis] = 0; }
      }
      // Sneaking keeps you on the block you are standing on.
      if (this.sneaking && this.onGround && !this.groundUnder(this.pos.x, this.pos.y, this.pos.z)) {
        this.pos[axis] = old;
        this.vel[axis] = 0;
      }
    }

    // --- vertical
    const dy = this.vel.y * dt;
    this.pos.y += dy;
    if (this.boxHits(this.pos.x, this.pos.y, this.pos.z)) {
      if (dy < 0) {
        this.pos.y = Math.floor(this.pos.y) + 1;   // feet land on top of the block below
        this.land();
      } else {
        // Bumping a ceiling: the head stops just under it. This has to be
        // measured from the HEAD — measuring from the feet pushes the player
        // down through the floor and leaves them stuck inside the terrain.
        this.pos.y = Math.floor(this.pos.y + HEIGHT) - HEIGHT - 0.001;
      }
      this.vel.y = 0;
    }
    this.onGround = this.groundUnder(this.pos.x, this.pos.y, this.pos.z) && this.vel.y <= 0.001;
    if (this.onGround) {
      if (this.vel.y < 0) this.vel.y = 0; // otherwise gravity keeps building while stood still
      this.land();
    }
    else if (this.vel.y < -0.1 && this.fallStart === null && !this.inWater) this.fallStart = startY;

    if (this.pos.y < -8) { this.damage(20, 'the void'); } // safety net
  }

  land() {
    if (this.fallStart !== null) {
      const dist = this.fallStart - this.pos.y;
      if (dist > 3.5 && !this.inWater) this.damage(Math.floor(dist - 3), 'the fall');
      this.fallStart = null;
    }
  }

  updateStats(dt, moving) {
    // --- breath
    if (this.headInWater) {
      this.air -= dt * 60;
      if (this.air <= 0) { this.air = 0; this.drownTimer = (this.drownTimer || 0) + dt; if (this.drownTimer > 1) { this.drownTimer = 0; this.damage(2, 'the water'); } }
    } else if (this.air < MAX_AIR) {
      this.air = Math.min(MAX_AIR, this.air + dt * 180);
    }

    // --- hunger, driven by how hard you have been working
    if (moving) this.exhaustion += (this.sprinting ? 0.10 : 0.012) * dt * 20;
    if (this.exhaustion >= 4) {
      this.exhaustion -= 4;
      if (this.saturation > 0) this.saturation = Math.max(0, this.saturation - 1);
      else this.hunger = Math.max(0, this.hunger - 1);
    }

    // --- regeneration and (very gentle) starvation
    if (this.hunger >= 18 && this.health < MAX_HEALTH) {
      this.regenTimer += dt;
      if (this.regenTimer > 3.5) { this.regenTimer = 0; this.health = Math.min(MAX_HEALTH, this.health + 1); this.exhaustion += 3; }
    } else this.regenTimer = 0;

    if (this.hunger === 0 && this.health > 6) {
      this.starveTimer += dt;
      if (this.starveTimer > 6) { this.starveTimer = 0; this.damage(1, 'hunger'); }
    }

    this.bob += moving && this.onGround ? dt * (this.sprinting ? 12 : 8) : 0;
  }

  // ------------------------------------------------------------------ stats
  damage(n, cause) {
    if (this.dead || n <= 0) return;
    this.health = Math.max(0, this.health - n);
    if (this.onHurt) this.onHurt(n, cause);
    if (this.health <= 0) {
      this.dead = true;
      if (this.onDeath) this.onDeath(cause);
    }
  }

  heal(n) { this.health = Math.min(MAX_HEALTH, this.health + n); }

  eat(food) {
    if (this.hunger >= MAX_HUNGER) return false;
    this.hunger = Math.min(MAX_HUNGER, this.hunger + food.hunger);
    this.saturation = Math.min(this.hunger, this.saturation + food.hunger * 0.6);
    if (food.heal) this.heal(food.heal);
    return true;
  }

  respawn() {
    this.pos.copy(this.spawn);
    this.vel.set(0, 0, 0);
    this.health = MAX_HEALTH;
    this.hunger = MAX_HUNGER;
    this.saturation = 5;
    this.air = MAX_AIR;
    this.fallStart = null;
    this.dead = false;
  }
}

export const PLAYER_CONST = { WIDTH, HEIGHT, EYE, MAX_HEALTH, MAX_HUNGER, MAX_AIR };
