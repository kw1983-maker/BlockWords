// Crops the player has planted, and how far each one has grown. Growth is a
// pure function of how long ago the seed went in, so a field in a chunk that
// was unloaded catches up the moment the player walks back to it.

import { B, BLOCKS, CROP_RIPE } from './blocks.js';

// Seconds per growth stage. Three stages to ripe keeps a harvest inside one
// lesson; water within four blocks speeds it up, as in the original.
export const GROW_STAGE_SECONDS = 40;
const WET_SPEEDUP = 1.5;
const WATER_REACH = 4;

export class Farm {
  constructor(world) {
    this.world = world;
    this.crops = new Map(); // 'x,y,z' -> game time (sky.time) it was planted
    this.tick = 0;
  }

  plant(x, y, z, time) { this.crops.set(x + ',' + y + ',' + z, time); }
  forget(x, y, z) { this.crops.delete(x + ',' + y + ',' + z); }

  update(dt, time) {
    this.tick += dt;
    if (this.tick < 1) return;
    this.tick = 0;
    for (const [k, planted] of this.crops) {
      const [x, y, z] = k.split(',').map(Number);
      if (!this.world.isLoaded(x, z)) continue;
      const id = this.world.getBlock(x, y, z);
      const crop = BLOCKS[id].crop;
      if (!crop) { this.crops.delete(k); continue; } // broken or trampled away
      const rate = this.wet(x, y, z) ? WET_SPEEDUP : 1;
      const stage = Math.min(CROP_RIPE, Math.floor(((time - planted) * rate) / GROW_STAGE_SECONDS));
      if (stage > crop.stage) this.world.setBlock(x, y, z, B[(crop.name + '_' + stage).toUpperCase()]);
      if (stage >= CROP_RIPE) this.crops.delete(k);
    }
  }

  // Water on the farmland's own level, within reach.
  wet(x, y, z) {
    for (let dx = -WATER_REACH; dx <= WATER_REACH; dx++) {
      for (let dz = -WATER_REACH; dz <= WATER_REACH; dz++) {
        if (this.world.getBlock(x + dx, y - 1, z + dz) === B.WATER) return true;
      }
    }
    return false;
  }

  // Debug: ripen everything now.
  ripenAll() {
    for (const k of this.crops.keys()) {
      const [x, y, z] = k.split(',').map(Number);
      const crop = BLOCKS[this.world.getBlock(x, y, z)].crop;
      if (crop) this.world.setBlock(x, y, z, B[(crop.name + '_' + CROP_RIPE).toUpperCase()]);
    }
    const n = this.crops.size;
    this.crops.clear();
    return n;
  }

  serialize() { return [...this.crops]; }
  load(arr) { if (Array.isArray(arr)) this.crops = new Map(arr); }
}
