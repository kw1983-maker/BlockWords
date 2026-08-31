# 🟩 BlockWords

A **Minecraft clone** that teaches **English to Malaysian primary Year 1, Year 2
and Year 4 pupils**, following the two MOE textbooks: *Super Minds 1* for
Years 1–2 and *Get Smart Plus 4* for Year 4.

It is a real voxel game first: an endless world that generates as you walk,
biomes, caves, ore veins, mining, crafting, tools, a furnace, farm animals,
day and night, and a world you can dig up and build in. The English is carried
by the game's own systems — villagers give spoken errands, every item says its
own name, signs read themselves out — so children learn by playing, not by
answering quiz pop-ups.

**Peaceful rules:** no monsters, nothing explodes, nobody can lose their build.
You can still fall, drown and get hungry, so it still feels like Minecraft.

---

## ▶ How to run

**Double-click `index.html`.** That's it — one self-contained file, no install,
no server, no accounts.

> 📶 **The first run needs internet.** The 3D engine (Three.js) is fetched from a
> CDN. Cloud saves also need internet when Firebase is configured. After that,
> Three.js is cached and starts fast. If you see a warning on the title screen
> about the 3D engine, connect and reload.
>
> 🖱️ Use a desktop or laptop browser (Chrome, Edge or Firefox). Click the screen
> to capture the mouse for looking around; press **Esc** to release it. If mouse
> capture is blocked on a school machine, **click and drag** to look instead —
> that works too.

<details>
<summary>Optional: run it from a local server instead</summary>

```bash
python -m http.server 8000     # then open http://localhost:8000
```
</details>

---

## 💾 Saving your world

Type **your name** on the title screen before you play. The game saves your
world automatically every 30 seconds, and you can also save from the pause menu.

- **Continue saved world** appears when a save exists for the name you typed.
- **Same name on any device** — if cloud saves are set up (see below), pupils can
  pick up where they left off on a different computer.
- **Teacher tip:** ask pupils to use a unique name (e.g. `Ali_Y4`) so two
  children do not share the same save.

Without Firebase configured, saves stay on **this browser only** (local storage).

### Setting up cloud saves (Firebase)

One-time setup for teachers or developers who want cross-device saves:

1. Create a project at [Firebase Console](https://console.firebase.google.com).
2. Add a **Web app** and copy the config values.
3. Copy `js/firebase-config.example.js` to `js/firebase-config.js` and paste
   your values in.
4. Create a **Firestore** database, then deploy the security rules:
   ```bash
   npm install -g firebase-tools
   firebase login
   firebase deploy --only firestore:rules
   ```
5. Rebuild: `python build.py`

For **Vercel** (recommended for hosting), add the same values as environment
variables in your project settings, then redeploy:

`FIREBASE_API_KEY`, `FIREBASE_AUTH_DOMAIN`, `FIREBASE_PROJECT_ID`,
`FIREBASE_STORAGE_BUCKET`, `FIREBASE_MESSAGING_SENDER_ID`, `FIREBASE_APP_ID`

The build step writes `js/firebase-config.js` automatically from those variables.

### High-quality voices (ElevenLabs)

The game uses the browser's built-in voice by default. For a clearer British
English voice (recommended in a classroom), add these in the Vercel project
settings and redeploy:

| Variable | Required | What it is |
| --- | --- | --- |
| `ELEVENLABS_API_KEY` | yes | API key from [elevenlabs.io](https://elevenlabs.io) |
| `ELEVENLABS_VOICE_ID` | no | Defaults to **Alice** (`Xb7hH8MSUJpSbSDYk0k2`), a British educator voice |
| `ELEVENLABS_MODEL_ID` | no | Defaults to `eleven_flash_v2_5` (fast enough for item names) |

The key stays on the server. The game calls `/api/tts` and **falls back to the
browser voice** if the key is missing, the quota runs out, or you open
`index.html` from a file. Spoken phrases are cached in the browser so the same
word is not billed twice in a session.

---

## 🚀 Deploy on Vercel

The game is a static site. Vercel runs `python build.py` on each deploy and
serves `index.html`.

1. Import the GitHub repo at [vercel.com/new](https://vercel.com/new) — choose
   **kw1983-maker/BlockWords**.
2. Leave the build settings as detected from [`vercel.json`](vercel.json):
   - **Build command:** `python build.py`
   - **Output directory:** `.`
3. (Optional) Add the Firebase environment variables above for cloud saves.
4. Deploy — pupils get a URL like `https://blockwords.vercel.app`.

Every push to `main` triggers a new deployment automatically once the GitHub
repo is connected in the Vercel project settings.

**Live site:** https://blockwords.vercel.app

## 🎮 Controls

| Key | Action |
| --- | --- |
| **W A S D** | Move |
| **Mouse** | Look around |
| **Space** | Jump / swim up |
| **Shift** | Sneak — you will not walk off an edge |
| **Ctrl** | Sprint |
| **Left-click (hold)** | ⛏️ Mine the block you are looking at |
| **Right-click** | 🧱 Place a block · use a table/furnace/chest · **talk to a villager** |
| **1 – 9 / scroll** | Choose a hotbar slot (and hear its English name) |
| **E** | Open inventory & crafting |
| **Q** | Drop the held item |
| **F5** | Change camera view |
| **F3** | Debug info (coordinates, biome, fps) |
| **Esc** | Pause menu |

---

## 📚 How the English works

There are no quizzes. Four things do the teaching, and all four are spoken aloud
because the younger pupils cannot yet read them.

1. **Villager errands — the main event.**
   You start next to a village. Villagers with a **!** above their head give a
   job, said out loud with a picture:
   *"Please bring me **three red blocks**."* · *"Can you find a **brown sheep**?"* ·
   *"Please put **two boxes** next to me."*
   Understanding the sentence **is** the puzzle. Finishing one pays emeralds,
   food and tools, so the English feeds straight back into playing.

2. **Every item says its name.** Change hotbar slot and the game shows and speaks
   *"Iron Pickaxe"*, *"Oak Planks"*, *"Apple"*. That is hundreds of quiet
   repetitions in a session, with the object right there in your hand.

3. **Signs.** Craft a sign, place it, and write a word on it — with the week's
   word list offered as buttons for children who cannot spell it yet. Look at a
   sign and it reads itself aloud.

4. **Advancements.** *"Getting Wood"*, *"Time to Mine!"*, *"Good Listener"* — pop
   up and are spoken, in the simplest English that still names what you did.

Sound can be turned off any time: **Read English aloud** on the title screen or
in the pause menu.

### Choosing a class

The first thing on the title screen is **which class you are in** — Year 1,
Year 2 or Year 4. It is not just a filter on the word list: it changes how the
villagers speak and how much they ask for.

| | Year 1 | Year 2 | Year 4 |
| --- | --- | --- | --- |
| Book | Super Minds 1, Starter–Unit 4 | Super Minds 1, Units 5–9 | Get Smart Plus 4 |
| How many | 1–3 | 2–5 | 4–10 |
| Grammar | short imperatives, *What's this? It's a…* | *There's a / There are… · How many … are there? · Where's the…?* | *some / any · how many / how much · past simple · comparatives · should* |
| A villager says | *"Bring me three apples, please."* | *"Please bring me four apples. How many apples have you got?"* | *"I need some apples for my work. Have you got any? Bring me seven apples."* |

Year 1 also hears the target word on its own before the sentence, so it lands
clean. Year 1's packs stay on the Year 2 menu as revision.

### The word packs

Pick one on the title screen. It re-targets every villager errand in the game.
Each pack says which textbook unit it comes from.

**Year 1** — *Super Minds 1, Starter–Unit 4*

| Pack | Unit | Teaches |
| --- | --- | --- |
| 🔢 **Numbers** | Starter | one … ten — every errand becomes a counting task |
| 🎨 **Colours** | Starter & U7 | red, blue, yellow, green, orange, purple, pink, brown, black, white |
| ✏️ **At School** | Unit 1 | book, table, window, box, lamp, sign, pencil, pen |
| 🐄 **Animals** | Unit 3 | pig, cow, sheep, chicken, rabbit, cat, dog, feather |
| 🍎 **Food** | Unit 4 | apple, bread, wheat, meat, chicken, egg, sugar cane, pumpkin |

**Year 2** — *Super Minds 1, Units 5–9* (plus all five Year 1 packs)

| Pack | Unit | Teaches |
| --- | --- | --- |
| 🏠 **My House** | Unit 6 | wood, window, wall, box, table, lamp, door, floor |
| 🌳 **Nature** | Units 5 & 9 | tree, leaf, flower, grass, stone, sand, snow, coal, diamond |
| 🏖️ **At the Beach** | Unit 9 | sand, stone, cactus, sugar cane, glass, sea, sun, shell, boat |
| ⛏️ **Tools** | Unit 8 | pickaxe, axe, shovel, sword, stick, iron, torch |

**Year 4** — *Get Smart Plus 4*

| Pack | Module | Teaches |
| --- | --- | --- |
| 🔺 **In the Past** | Module 3 | pyramid, gold, treasure, tomb, torch, sand, stone, jewel, desert, mummy — all in the **past simple** |
| 🥗 **Eating Right** | Module 5 | apple, bread, egg, meat, steak, chicken, wheat, pumpkin, sugar — **some/any, how many/how much** |
| ⛺ **Helping Out** | Module 7 | tent, sleeping bag, torch, wood, fire, rucksack, firewood, coal, rubbish — **whose is this? it's mine** |
| 🐺 **Amazing Animals** | Module 8 | wolf, rabbit, cow, pig, sheep, chicken, cat, feather, leather — **comparatives** |
| 🧱 **Materials** | Modules 5 & 10 | glass, metal, wood, stone, sandstone, wool, leather, gold, plastic, paper — **what is it made of? / should** |
| ⛏️ **Tools** | Module 9 | pickaxe, axe, shovel, sword, stick, iron, torch |

Colours are taught twice over: coloured wool you fetch, **and** coloured sheep
you have to spot in the field.

---

## ✍️ Changing the words for this week's lesson

Everything the villagers say is generated from one file:
[`js/words.js`](js/words.js). Add a word to any pack and new errands appear.

```js
{
  word: 'apple',                 // the word, shown and spoken
  emoji: '🍎',                    // the picture children see
  sentence: 'I eat an apple.',   // a model sentence, spoken after the word
  item: 'apple',                 // something they can fetch
  mob: 'pig',                    // OR an animal they can find
  block: 'oak_planks',           // OR a block they can place
  one: 'loaf of bread',          // optional: how to say one of them
  many: 'loaves of bread',       // optional: how to say more than one
  uncountable: true,             // optional: "how much bread", not "how many"
  count: [1, 3],                 // optional: cap the quantity for slow things
}
```

A word needs at least one of `item`, `mob` or `block` — the game has to be able
to point at the thing. `one` / `many` exist because the word is not always the
countable noun: "three reds" is not English, "three red blocks" is.

Each **pack** says which classes it belongs to and where it comes from:

```js
{
  id: 'eating', name: 'Eating Right', emoji: '🥗',
  years: [4],                              // shown to Year 4 only
  book: 'Get Smart Plus 4 · Module 5',     // printed under the pack button
  lines: { fetch: [ ... ] },               // optional: this pack's own sentences
  words: [ ... ],
}
```

The sentences villagers speak are **templates**, so you can reword them without
touching any game code. `{n}` is the number, `{what}` the countable phrase,
`{many}` the plural, `{word}` the word itself, `{mob}` the animal, `{it}`
it/them, `{sentence}` the model sentence. Year-wide templates live in `YEARS`
at the top of the file; a pack can override them with its own `lines`.

If a pack points at an item, animal or block that does not exist, the browser
console says so at start-up — nothing fails silently.

Then rebuild the playable file:

```bash
python build.py
```

---

## 🛠️ Editing the game

`index.html` is **generated**. The readable source is `js/*.js` + `css/style.css`;
run `python build.py` after any change. See [`CLAUDE.md`](CLAUDE.md) for the
architecture.

```
index.html      GENERATED self-contained game — double-click to play
build.py        Bundles js/ + css/ into index.html (run after edits)
js/words.js     ← THE FILE TEACHERS EDIT
js/…            engine: worldgen, chunks, lighting, entities, crafting, UI
```

Nothing is downloaded except Three.js and (optionally) Firebase: every texture,
sound effect and piece of music is generated in code at load time, so there are
no assets to ship and nothing is copied from the original game.

### Textbook PDFs

The MOE textbooks (`super_minds_y1_y2 student_s_book.pdf` and
`Get Smart Plus 4 Student's Book.pdf`) are **reference material** for teachers
editing `js/words.js`. They are not included in the git repository — keep your
own copies locally.
