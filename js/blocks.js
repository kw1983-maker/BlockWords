// The block registry. Every voxel in the world is one byte — an index into
// BLOCKS. Ids are assigned in registration order, so ALWAYS refer to blocks by
// name through B (B.STONE), never by a hardcoded number.

export const B = {};      // 'STONE' -> id
export const BLOCKS = []; // id -> definition

// Tool tiers. A block only drops its item if the tool tier is >= its `needs`.
export const TIER = { HAND: 0, WOOD: 1, STONE: 2, IRON: 3, DIAMOND: 4 };
export const TIER_SPEED = [1, 2, 4, 6, 8]; // mining speed multiplier per tier

function def(name, o = {}) {
  const id = BLOCKS.length;
  const tiles = typeof o.tiles === 'string'
    ? { top: o.tiles, bottom: o.tiles, side: o.tiles }
    : Object.assign({ top: name, bottom: name, side: name }, o.tiles || {});
  const b = {
    id,
    name,
    label: o.label || name.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
    tiles,
    render: o.render || 'cube',       // cube | cross | liquid
    solid: o.solid !== undefined ? o.solid : true,
    opaque: o.opaque !== undefined ? o.opaque : (o.render || 'cube') === 'cube',
    hardness: o.hardness !== undefined ? o.hardness : 1,
    tool: o.tool || null,             // pickaxe | axe | shovel | null
    needs: o.needs || TIER.HAND,
    light: o.light || 0,
    drops: o.drops !== undefined ? o.drops : name, // item name, null, or special
    interact: o.interact || null,     // crafting_table | furnace | chest | sign
    liquid: o.render === 'liquid',
  };
  BLOCKS.push(b);
  B[name.toUpperCase()] = id;
  return id;
}

// ---- air ----------------------------------------------------------------
def('air', { render: 'cube', solid: false, opaque: false, hardness: 0, drops: null });

// ---- stone family -------------------------------------------------------
def('bedrock', { hardness: -1, drops: null, tool: 'pickaxe' });   // negative = unbreakable
def('stone', { hardness: 1.5, tool: 'pickaxe', needs: TIER.WOOD, drops: 'cobblestone' });
def('cobblestone', { hardness: 2, tool: 'pickaxe', needs: TIER.WOOD });
def('dirt', { hardness: 0.5, tool: 'shovel' });
def('grass_block', {
  label: 'Grass Block', hardness: 0.6, tool: 'shovel', drops: 'dirt',
  tiles: { top: 'grass_top', bottom: 'dirt', side: 'grass_side' },
});
def('dirt_path', {
  label: 'Path', hardness: 0.6, tool: 'shovel', drops: 'dirt',
  tiles: { top: 'path_top', bottom: 'dirt', side: 'path_side' },
});
def('sand', { hardness: 0.5, tool: 'shovel' });
def('sandstone', {
  hardness: 0.8, tool: 'pickaxe', needs: TIER.WOOD,
  tiles: { top: 'sandstone_top', bottom: 'sandstone_top', side: 'sandstone' },
});
def('gravel', { hardness: 0.6, tool: 'shovel' });
def('snow_block', { label: 'Snow', hardness: 0.2, tool: 'shovel', tiles: 'snow' });
def('ice', { hardness: 0.5, tool: 'pickaxe', opaque: false, drops: null });
def('clay', { hardness: 0.6, tool: 'shovel' });

// ---- ores ---------------------------------------------------------------
def('coal_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.WOOD, drops: 'coal' });
def('iron_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.STONE });
def('gold_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.IRON });
def('redstone_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.IRON, drops: 'redstone' });
def('diamond_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.IRON, drops: 'diamond' });
def('emerald_ore', { hardness: 3, tool: 'pickaxe', needs: TIER.IRON, drops: 'emerald' });

// ---- wood ---------------------------------------------------------------
def('oak_log', { hardness: 2, tool: 'axe', tiles: { top: 'log_top', bottom: 'log_top', side: 'oak_log' } });
def('birch_log', { hardness: 2, tool: 'axe', tiles: { top: 'birch_log_top', bottom: 'birch_log_top', side: 'birch_log' } });
def('spruce_log', { hardness: 2, tool: 'axe', tiles: { top: 'spruce_log_top', bottom: 'spruce_log_top', side: 'spruce_log' } });
def('oak_planks', { hardness: 2, tool: 'axe', tiles: 'oak_planks' });
def('birch_planks', { hardness: 2, tool: 'axe', tiles: 'birch_planks' });
def('oak_leaves', { hardness: 0.2, opaque: false, drops: 'apple_chance' });
def('birch_leaves', { hardness: 0.2, opaque: false, drops: null });
def('spruce_leaves', { hardness: 0.2, opaque: false, drops: null });

// ---- plants (X-shaped billboards) ---------------------------------------
def('tall_grass', { label: 'Grass', render: 'cross', solid: false, hardness: 0.05, drops: 'wheat_chance' });
def('rose', { label: 'Red Flower', render: 'cross', solid: false, hardness: 0.05 });
def('dandelion', { label: 'Yellow Flower', render: 'cross', solid: false, hardness: 0.05 });
def('sugar_cane', { render: 'cross', solid: false, hardness: 0.1 });
def('cactus', { hardness: 0.4, opaque: false, tiles: { top: 'cactus_top', bottom: 'cactus_top', side: 'cactus' } });
def('pumpkin', { hardness: 1, tool: 'axe', tiles: { top: 'pumpkin_top', bottom: 'pumpkin_top', side: 'pumpkin' } });

// ---- crafted / utility --------------------------------------------------
def('glass', { hardness: 0.3, opaque: false, drops: null });
def('bricks', { hardness: 2, tool: 'pickaxe', needs: TIER.WOOD });
def('glowstone', { hardness: 0.3, light: 15 });
def('torch', { render: 'cross', solid: false, hardness: 0.05, light: 14 });
def('crafting_table', {
  hardness: 2.5, tool: 'axe', interact: 'crafting_table',
  tiles: { top: 'crafting_top', bottom: 'oak_planks', side: 'crafting_side' },
});
def('furnace', {
  hardness: 3.5, tool: 'pickaxe', needs: TIER.WOOD, interact: 'furnace',
  tiles: { top: 'furnace_top', bottom: 'furnace_top', side: 'furnace_side', front: 'furnace_front' },
});
def('chest', {
  hardness: 2.5, tool: 'axe', interact: 'chest',
  tiles: { top: 'chest_top', bottom: 'chest_top', side: 'chest_side' },
});
def('sign', { render: 'cross', solid: false, hardness: 1, tool: 'axe', interact: 'sign', tiles: 'sign' });
def('bookshelf', { hardness: 1.5, tool: 'axe', tiles: { top: 'oak_planks', bottom: 'oak_planks', side: 'bookshelf' } });

// ---- wool: the colour vocabulary, one block per colour -------------------
export const WOOL_COLOURS = [
  ['white', 0xf0f0f0], ['red', 0xd23f3f], ['orange', 0xe07a24], ['yellow', 0xf2d13c],
  ['green', 0x4caf3f], ['blue', 0x3a6fd8], ['purple', 0x8b46c6], ['pink', 0xf08fc0],
  ['brown', 0x8a5a32], ['black', 0x2b2b2b],
];
for (const pair of WOOL_COLOURS) {
  const colour = pair[0];
  def(colour + '_wool', {
    label: colour.charAt(0).toUpperCase() + colour.slice(1) + ' Wool',
    hardness: 0.8,
  });
}

// ---- liquids ------------------------------------------------------------
def('water', { render: 'liquid', solid: false, opaque: false, hardness: -1, drops: null });

// ---- helpers ------------------------------------------------------------
export const AIR = B.AIR;

export function isOpaque(id) { return BLOCKS[id].opaque; }
export function isSolid(id) { return BLOCKS[id].solid; }
export function isLiquid(id) { return BLOCKS[id].liquid; }
export function blockLight(id) { return BLOCKS[id].light; }

// Faces of a cube share tiles unless a block defines a distinct front face
// (the furnace). dir: 0=+x 1=-x 2=+y 3=-y 4=+z 5=-z
export function tileFor(bdef, dir) {
  if (dir === 2) return bdef.tiles.top;
  if (dir === 3) return bdef.tiles.bottom;
  if (bdef.tiles.front && dir === 4) return bdef.tiles.front;
  return bdef.tiles.side;
}

// Seconds to break a block. Mirrors the shape of Minecraft's formula: the right
// tool speeds you up, the wrong tool is a slog, and a block you cannot harvest
// still breaks but drops nothing.
export function breakTime(id, toolType, tier) {
  const b = BLOCKS[id];
  if (b.hardness < 0) return Infinity;
  if (b.hardness === 0) return 0;
  const right = b.tool && b.tool === toolType;
  const speed = right ? TIER_SPEED[tier] : 1;
  let t = (b.hardness * 1.5) / speed;
  if (!canHarvest(id, toolType, tier)) t = (b.hardness * 5) / speed;
  return Math.max(0.05, t);
}

export function canHarvest(id, toolType, tier) {
  const b = BLOCKS[id];
  if (b.needs === TIER.HAND) return true;
  return b.tool === toolType && tier >= b.needs;
}
