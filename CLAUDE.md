# CLAUDE.md

Guidance for Claude Code (claude.ai/code) when working in this repository.

## What this is

**BlockWords** — a Minecraft clone (endless chunked voxel world, biomes, caves,
ores, mining, crafting, furnace, passive mobs, day/night, peaceful survival)
that teaches English to Malaysian primary **Year 1, Year 2 and Year 4** pupils.
The teaching rides on the game's own systems: villager quests, spoken item
names, signs, advancements. There are deliberately **no quiz screens**.

The class is chosen on the title screen and drives everything: which word packs
are offered, how the villagers phrase an errand, and how many things they ask
for. Content is taken from the two MOE textbooks kept in the repo root —
`super_minds_y1_y2 student_s_book.pdf` (Super Minds 1, Years 1–2) and
`Get Smart Plus 4 Student's Book.pdf` (Year 4). Both are scanned images, so they
have to be rendered to PNG (PyMuPDF) and read as pictures, not text-extracted.

Pure browser game: no install, no custom server. Three.js comes from a CDN;
Firebase Firestore (optional) handles cloud saves. Every texture, sound and
piece of music is generated in code at runtime.

## Running

**Simplest:** double-click `index.html` — a single self-contained file that runs
from `file://`.

**When editing modules directly**, serve over HTTP:
```bash
python -m http.server 8000
```

## Build

`index.html` is **generated** — never edit it by hand. The source of truth is
`js/*.js` + `css/style.css` + `build/template.html`.

```bash
python build.py
```

`build.py` strips `import`/`export` (single- and multi-line), concatenates every
module in dependency order into one inline `<script type="module">`, and inlines
the CSS. **Every module ends up in one shared scope**, so:

- Use **named imports only** — `import * as ns from './x.js'` breaks the bundle,
  because the namespace object does not survive stripping.
- Top-level names must be unique across all modules.

Build order (defined in `build.py`):
`noise → blocks → atlas → worldgen → chunk → world → items → crafting →
inventory → player → entities → sky → audio → speech → words → quests → ui →
firebase-config (optional) → saves → main`

## Architecture

**`js/noise.js`** — seeded PRNG, integer hashes, value noise and fbm. Everything
about the world is a pure function of `(seed, x, z)`, so any chunk rebuilds
identically in any order.

**`js/blocks.js`** — the block registry. `B.STONE` → id, `BLOCKS[id]` → definition
(`tiles`, `render`, `solid`, `opaque`, `hardness`, `tool`, `needs`, `light`,
`drops`, `interact`). `breakTime()` and `canHarvest()` implement the mining
formula. **Never hardcode numeric block ids.**

**`js/atlas.js`** — the 16×16 pixel-art texture atlas, drawn to a canvas at load
time. `tileUV(name)` gives the atlas rectangle; `validateTiles()` warns if a
block references a tile that was never painted.

**`js/worldgen.js`** — heightmap, biomes, caves, ore veins, trees, villages.
Chunk constants (`CHUNK_X/Y/Z`, `SEA_LEVEL`, `idx()`) live here. Plants are
placed from a 3×3 chunk neighbourhood (they overhang borders); villages are
placed once per chunk from a wide search, because they reach much further.

**`js/chunk.js`** — chunk storage, lighting and meshing. Nothing here touches the
Three.js scene; it returns geometry. Two things happen:
- `computeLight()` — skylight columns plus torch light, flood-filled, seeded from
  neighbouring chunks so light does not stop at a border.
- `buildGeometry()` — face culling, vertex ambient occlusion, atlas UVs. It works
  on a **padded 18×130×18 copy** of the chunk plus a one-block skin of its
  neighbours, so every inner-loop lookup is a flat array index. Block properties
  are flattened into `OPAQUE` / `RENDERT` / `UVTAB` typed arrays for the same
  reason. This is the hot path — it went from ~45 ms to ~2 ms per chunk by
  removing bounds checks, closures and object lookups from it. Keep it that way.

`makeMaterials()` builds the one shader the world uses. Vertex light is stored
per-vertex as `(skylight, blocklight, ao × faceShade)`; the day/night cycle only
moves the `uDaylight` uniform, so **dusk never triggers a remesh**.

**`js/world.js`** — the chunk manager: streams chunks in and out around the
player within a per-frame time budget, `getBlock`/`setBlock`, DDA `raycast()`,
and player edits stored as per-chunk **deltas** so saves stay small on an endless
world. A chunk is only lit and meshed once its four neighbours are generated.

**`js/items.js`** — item registry (every block plus tools, ingots, food). Icons
are drawn in code: blocks as isometric cubes composed from atlas tiles, the rest
as pixel art. `dropsOf()` handles the special drops (`apple_chance`,
`wheat_chance`).

**`js/crafting.js`** — shaped and shapeless recipes, matched anywhere in the grid,
plus the smelting table.

**`js/inventory.js`** — 9 hotbar + 27 storage slots, stacking, `SlotSet` for
crafting grids, furnaces and chests.

**`js/player.js`** — first-person controller: AABB collision against the voxel
grid, gravity, jump, sneak (will not walk off ledges), sprint, swimming, step-up,
plus health, hunger, breath and fall damage.

**`js/entities.js`** — dropped items, passive mobs (`MOB_TYPES`: pig, cow, sheep,
chicken, rabbit, cat, wolf) built from boxes, and villagers. Sheep carry a
colour, which is how the colour vocabulary gets into the world. `Entities`
manages spawning, updating and despawning.

**`js/sky.js`** — day/night: sky colour, fog, sun, moon, stars, clouds, and the
`uDaylight` uniform.

**`js/audio.js`** — synthesised WebAudio effects and ambient music. No audio
files. `materialOf(blockName)` maps a block onto its sound group.

**`js/speech.js`** — the **only** path to text-to-speech. Prefers an en-GB voice,
slows the rate, and debounces repeats.

**`js/words.js`** — ← **the file teachers edit.** Two tables: `YEARS` (one entry
per class: sentence templates, quantity ranges, praise lines) and `PACKS` (one
per topic, tagged with the `years` it is offered to and the `book` it comes
from). Villager sentences are placeholder templates — `{n}`, `{what}`, `{one}`,
`{many}`, `{word}`, `{mob}`, `{it}`, `{sentence}` — filled by `fillLine()`; a
pack may override its year's templates with its own `lines`. See the header
comment in the file for the full schema. Helpers: `yearById`, `packsForYear`,
`defaultPackForYear`, `pickLine`, `fillLine`, `countPhrase`, `numberWord`
(now to twenty), `ordinalWord`.

**`js/quests.js`** — generates villager errands from the active pack **and the
active year** (`fetch`, `find`, `place`), measures progress, pays rewards, and
holds the advancements. `QuestSystem(packId, year, entities, player, inventory,
world)`; `countFor()` picks the quantity (year range, overridden by a word's own
`count`), `makeQuest()` fills a template rather than concatenating English, and
`validateWords()` warns at boot about any pack pointing at a nonexistent item,
mob or block.

**`js/ui.js`** — all 2D interface: HUD, hotbar, hearts/hunger, the
inventory/crafting/furnace/chest screen with drag-and-drop, the quest dialog, the
sign editor, toasts and the F3 overlay.

**`js/saves.js`** — cloud persistence via Firestore (optional). Students enter a
name on the title screen; saves are keyed by `normalizeName(name)` in the
`saves` collection. `initSaves()` connects when `js/firebase-config.js` exists;
otherwise the game uses `localStorage` only (`blockwords.save.{name}`).
`saveCloudSave` / `loadCloudSave` wrap the existing save payload; `main.js`
dual-writes to local cache and cloud.

**`js/main.js`** — bootstrap, game loop, input, mining/placing, furnace ticking,
particles, save/load, and `window.MC`.

## Key contracts

- Block ids come from `B`; item names are strings keyed into `ITEMS`.
- `World.get/setBlock` are the only block accessors; `setBlock` marks the chunk
  and its neighbours dirty and records a save delta.
- `Speech.say()` / `say()` is the only speech path; it cancels the previous
  utterance so prompts never overlap.
- A word only becomes a quest if it has an `item`, `mob` or `block` — the game
  has to be able to point at the thing.
- Villagers never speak concatenated English. Every sentence comes from a
  template in `YEARS` or a pack's `lines`, filled by `fillLine()`, so a teacher
  can reword the game without touching code.
- A pack must carry `years`; `state.year` is saved with the world, so a Year 4
  save keeps speaking Year 4 English after *Continue*.
- `one` / `many` on a word exist because the word is not always the countable
  noun ("three reds" ✗, "three red blocks" ✓).
- Saves require a student name on the title screen. Cloud saves need
  `firebase-config.js`; without it, only per-browser `localStorage` works.

## Debug console

`window.MC` exposes live state and helpers for browser testing:

```js
MC.tp(x, y, z)          MC.give('diamond', 5)     MC.setTime(0.5)
MC.setYear(4)           MC.setPack('eating')      MC.PACKS / MC.YEARS
MC.talk(0, 'fetch')     MC.completeQuest()        MC.findVillager()
MC.craft(['oak_log'], 2)                          MC.smelt('iron_ore')
MC.mineAt(x, y, z)      MC.profile()   // ms to generate/light/mesh one chunk
MC.save()               MC.fps()
```

Note when testing in an automated browser: background tabs are throttled to
1 rAF/second, so drive streaming by hand with `MC.world.update(px, pz, 30)` in a
loop rather than trusting the frame rate.

## Adding content

- **Words** — edit `js/words.js`, then `python build.py`. A new pack needs
  `years` and `book`; check the console for `validateWords()` warnings.
- **Years** — add an entry to `YEARS` in `js/words.js`; the title-screen picker
  builds itself from that table.
- **Blocks** — `def()` in `js/blocks.js` plus a matching `tile()` in
  `js/atlas.js`; `validateTiles()` catches a mismatch.
- **Recipes** — `shaped()` / `shapeless()` in `js/crafting.js`.
- **Animals** — add to `MOB_TYPES` in `js/entities.js` and to the spawn table in
  `maybeSpawnAnimals`.
