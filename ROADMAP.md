# BlockWords roadmap

The aim: make BlockWords play as much like Minecraft as possible while it
keeps teaching English. The rule from CLAUDE.md still holds: **no quiz
screens.** Every new mechanic has to bring in new words through something the
player actually does.

## The six steps

| # | Step | Status |
|---|------|--------|
| 1 | Farming, cooking and beds | ✅ Done (commit `28500d5`) |
| 2 | Doors, fences, stairs, slabs, glass panes, plus villager "build" errands | Next |
| 3 | Dyes and weather | |
| 4 | Trading with emeralds, plus village buildings with name signs | |
| 5 | Creative mode, plus Book & Quill | |
| 6 | Armour, more animals, optional "Gentle Night" | |

### 1. Farming, cooking and beds ✅
- **Farming:** hoe → farmland → seeds, carrots and potatoes → 4 growth stages (faster near water) → harvest.
- **Village farm:** each village has a ready-grown field by the well and a bed in every house.
- **Cooking:** baked potato, plus buckets for water and milk.
- **Beds:** set your respawn point and skip the night.
- **English:** *dig, plant, pick*; "Good night!", "Good morning! It is day two."; Year 2 and Year 4 versions of each line.

### 2. Building blocks + "build" errands
- **New blocks:** doors, fences, gates, stairs, slabs, glass panes.
- **English:** the `house` pack (*door, window, stairs, roof, wall*).
- **New errand type:** "Please build me a house with a door and two windows." Teaches adjectives, numbers and prepositions.
- **Technical:** the biggest job on the list, because it needs non-cube shapes in `chunk.js`. The mesher has to stay fast.

### 3. Dyes and weather
- **Dyes:** flowers make dye, dye colours sheep and wool. Mixing gives the colours pack a crafting loop: *red + yellow → orange*.
- **Weather:** rain, snow in cold biomes, thunder. Teaches *sunny, rainy, snowy, windy*, and villagers comment on it.

### 4. Trading + village buildings
- **Trading:** villagers get jobs (farmer, librarian, butcher, fisher) and a trade screen. Teaches jobs vocabulary and shopping language: *How much is it? It's three emeralds.*
- **Buildings:** library, school, bakery, each with a name sign. `visit` errands then give prepositions a real use: *It's next to the school.*

### 5. Creative mode + Book & Quill
- **Creative mode:** fly and build with unlimited blocks. Suits "build what I say" lessons led by the teacher.
- **Book & Quill:** pupils write sentences in the game, and the teacher can read them from the save.

### 6. Armour, more animals, Gentle Night
- **Armour:** clothes vocabulary (*helmet, jacket, trousers, boots*).
- **More animals:** horse, duck, fish, bee, parrot, turtle, polar bear, for the animals and wildlife packs.
- **Gentle Night:** optional, off by default, the teacher switches it on. Slow mobs that never kill you, giving a reason to say *Run! Hide! Build a wall!*

## Other ideas, not scheduled yet
- **Getting around:** fishing rod, boats and minecarts (*by boat, by train*).
- **Water and lava:** buckets of lava, obsidian.
- **Directions:** map and compass (*north/south/east/west*, *turn left/right*).
- **Hover-to-hear:** point at any block or animal and press a key to hear its name.
- **Bedtime diary:** a past-tense recap of the day at bedtime: "Today you mined five stones."
- **Multi-step errands (Year 4):** "First get wood, then make a table, finally make a door."
- **Villager replies:** choose a spoken answer ("Yes, please!" / "No, thank you.").
- **Teacher dashboard:** which words each pupil has completed.
- **Shared class world:** a class world through Firestore.
- **Polish:** block-break cracks already exist; still to add are view bobbing, a respawn screen, falling sand and gravel, and XP shown as "word points".
