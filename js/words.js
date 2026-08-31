// ============================================================================
//  THE WORD PACKS — this is the file to edit for a new week's vocabulary.
// ============================================================================
//
// Everything the villagers ask for is generated from this file, so adding a
// word here immediately creates new quests. There are two tables:
//
//   YEARS  — one entry per school year (1, 2, 4). A year decides HOW a villager
//            speaks: the sentence templates, and how many things it asks for.
//   PACKS  — one entry per topic. A pack decides WHAT the villager talks about,
//            and which years it is offered to.
//
// ---------------------------------------------------------------- a word ----
//
//   {
//     word: 'apple',              // the English word, spoken and shown
//     emoji: '🍎',                // the picture children see
//     sentence: 'I have an apple.',   // a model sentence, spoken after the word
//     item: 'apple',              // OPTIONAL: an item they can fetch  (see below)
//     mob: 'pig',                 // OPTIONAL: an animal they can find
//     block: 'oak_planks',        // OPTIONAL: a block they can place
//     one: 'red block',           // OPTIONAL: how to say ONE of them in a sentence
//     many: 'red blocks',         // OPTIONAL: how to say MORE THAN ONE
//     mobColour: 'red',           // OPTIONAL: only that colour of sheep counts
//     uncountable: true,          // OPTIONAL: "how MUCH bread", not "how many"
//     count: [1, 3],              // OPTIONAL: override the year's quantity range,
//                                 //           for things that are slow to collect
//     adj: 'dangerous',           // OPTIONAL: the adjective the comparison uses
//   }
//
// `one` / `many` exist because the word itself is not always the noun you can
// count. "Three reds" is not English; "three red blocks" is. When they are left
// out the word is used directly, with a regular plural.
//
// A word needs at least one of `item`, `mob` or `block` to become a quest — the
// game has to be able to point at the thing. Words with none of those still
// appear in the villager's greeting and on the word list, they just do not get
// their own errand. That is how words like "desert" or "pencil" stay in the
// vocabulary even though the world has nothing to hand over.
//
// Valid `item` names are the item ids in items.js (apple, bread, oak_log,
// red_wool, iron_ingot, wooden_pickaxe, …). Valid `mob` names are the keys of
// MOB_TYPES in entities.js (pig, cow, sheep, chicken, rabbit, cat, wolf).
// Valid `block` names are the block names in blocks.js. validateWords() in
// quests.js warns in the console if any of them is misspelt.
//
// ---------------------------------------------------------------- a pack ----
//
//   {
//     id: 'food', name: 'Food', emoji: '🍎', blurb: 'apple, bread, meat…',
//     years: [1, 2],                        // which classes are offered it
//     book: 'Super Minds 1 · Unit 4',       // where it comes from, shown to the teacher
//     lines: { fetch: [...], find: [...] }, // OPTIONAL: override the year's sentences
//     words: [ … ],
//   }
//
// ------------------------------------------------------------ a sentence ----
//
// Villager sentences are templates, so a teacher can reword them without
// touching any game code. The placeholders are:
//
//   {n}         the number, written as a word   → "three"
//   {what}      the right countable phrase      → "apples" / "red blocks"
//   {one}       one of them                     → "apple"
//   {many}      more than one of them           → "apples"
//   {word}      the word being taught           → "apple"
//   {mob}       the animal to look for          → "red sheep"
//   {block}     the block to place              → "sandstone"
//   {sentence}  the word's model sentence
//   {it}        "it" for one, "them" for more than one
//   {name}      the villager's name
//
// A template that already contains {sentence} is not followed by the model
// sentence a second time.
//
// The books these packs follow:
//   Year 1 & 2 — Super Minds 1 (Cambridge), Starter + Units 1–9
//   Year 4     — Get Smart Plus 4 (MM Publications / KPM 2019), Modules 1–10
// Both PDFs sit in the project root.
//
// After editing this file run:  python build.py
// ============================================================================

// ---------------------------------------------------------------- the years
// Counts are [min, max] inclusive. Year 1 asks for one to three things and
// speaks in short imperatives; Year 4 asks for a real handful and speaks the
// grammar Get Smart Plus 4 actually drills — some/any, how many/how much,
// should, the past simple and comparatives.

export const YEARS = [
  {
    id: 1,
    label: 'Year 1',
    emoji: '🐣',
    book: 'Super Minds 1 · Starter–Unit 4',
    blurb: 'short sentences, 1–3 things',
    counts: { fetch: [1, 3], place: [1, 3] },
    leadWord: true,          // say the bare word first, so they hear it clean
    lines: {
      fetch: [
        'Bring me {n} {what}, please.',
        'I want {n} {what}.',
        'Have we got any {many}? Bring me {n}, please.',
      ],
      fetchU: [
        'Bring me {n} {what}, please.',
        'I want {n} {what}.',
      ],
      find: [
        'Look! Can you find a {mob}?',
        'I like the {mob}. Go and find a {mob}!',
        'Is there a {mob}? Go and look!',
      ],
      place: [
        'Put {n} {what} next to me.',
        'Look at me. Put {n} {what} here, please.',
      ],
    },
    hints: {
      fetch: 'Find {n} {what}. Then come back to me.',
      find: 'Walk and look. Stand next to the {mob}.',
      place: 'Put {n} {what} on the ground next to me.',
    },
    praise: ['Well done!', 'Very good!', 'Thank you! Good job!'],
  },
  {
    id: 2,
    label: 'Year 2',
    emoji: '🦉',
    book: 'Super Minds 1 · Units 5–9',
    blurb: 'there is / there are, 2–5 things',
    counts: { fetch: [2, 5], place: [2, 6] },
    leadWord: false,
    lines: {
      fetch: [
        'Please bring me {n} {what}. How many {many} have you got?',
        "Let's count together. I need {n} {what}, please.",
        'Have you got {n} {what}? Bring {it} to me, please.',
      ],
      fetchU: [
        'How much {word} have you got? Please bring me {n} {what}.',
        'I need some {word}. Bring me {n} {what}, please.',
      ],
      find: [
        "Where's the {mob}? Go and look for one!",
        'Can you find a {mob}? Come back and tell me.',
        'Is there a {mob} near here? Go and see!',
      ],
      place: [
        'There are no {many} here. Please put {n} {what} next to me.',
        'Where are the {many}? Put {n} {what} here, please.',
        "Let's build together. Put {n} {what} next to me.",
      ],
    },
    hints: {
      fetch: 'Find {n} {what} and bring {it} back to me.',
      find: 'Walk around and look. Stand next to the {mob}.',
      place: 'Put {n} {what} on the ground near me.',
    },
    praise: [
      'Well done! That was very good.',
      'Thank you! You are a good helper.',
      'Great work! Now we have got them all.',
    ],
  },
  {
    id: 4,
    label: 'Year 4',
    emoji: '🚀',
    book: 'Get Smart Plus 4',
    blurb: 'some / any, past simple, 4–10 things',
    counts: { fetch: [4, 10], place: [5, 12] },
    leadWord: false,
    lines: {
      fetch: [
        'I need some {many} for my work. Have you got any? Bring me {n} {what}.',
        "We're going to need {n} {what}. How many {many} have you got?",
        'Could you help me, please? I have to collect {n} {what} before dark.',
        'Yesterday I looked for {many}, but I did not find any. Bring me {n} {what}.',
      ],
      fetchU: [
        'How much {word} do we need? We need {n} {what}. Have you got any?',
        "There isn't any {word} left. Please bring me {n} {what}.",
      ],
      find: [
        '{sentence} Go and find a {mob}, then come back and tell me.',
        'I saw a {mob} near here yesterday. Can you find one?',
        'Why do you like the {mob}? Go and find one, then tell me about it.',
      ],
      place: [
        'People built with {many} a long time ago. Please put {n} {what} here.',
        'We should build something together. Put {n} {what} next to me, please.',
        'How many {many} do we need? {n}, I think. Put them down here.',
      ],
    },
    hints: {
      fetch: 'Collect {n} {what}, then bring {it} back to me.',
      find: 'Search around. Stand next to a {mob} to finish the job.',
      place: 'Place {n} {what} on the ground close to me.',
    },
    praise: [
      'Thank you! You helped me. That was very kind.',
      'Well done! You did a great job.',
      'Excellent! You worked very hard for that.',
    ],
  },
];

// ---------------------------------------------------------------- the packs

export const PACKS = [
  // ===================================================== Year 1 =============
  {
    id: 'numbers',
    name: 'Numbers',
    emoji: '🔢',
    blurb: 'one, two, three… ten',
    years: [1, 2],
    book: 'Super Minds 1 · Starter',
    // Numbers have no things of their own — they ride along on every other
    // quest as the quantity. This pack simply makes the counting the point.
    numbersOnly: true,
    words: [
      { word: 'one', emoji: '1️⃣', sentence: 'I have one apple.' },
      { word: 'two', emoji: '2️⃣', sentence: 'I have two apples.' },
      { word: 'three', emoji: '3️⃣', sentence: 'I have three apples.' },
      { word: 'four', emoji: '4️⃣', sentence: 'I have four apples.' },
      { word: 'five', emoji: '5️⃣', sentence: 'I have five apples.' },
      { word: 'six', emoji: '6️⃣', sentence: 'I have six apples.' },
      { word: 'seven', emoji: '7️⃣', sentence: 'I have seven apples.' },
      { word: 'eight', emoji: '8️⃣', sentence: 'I have eight apples.' },
      { word: 'nine', emoji: '9️⃣', sentence: 'I have nine apples.' },
      { word: 'ten', emoji: '🔟', sentence: 'I have ten apples.' },
    ],
  },
  {
    id: 'colours',
    name: 'Colours',
    emoji: '🎨',
    blurb: 'red, blue, yellow, green…',
    years: [1, 2],
    book: 'Super Minds 1 · Starter & Unit 7',
    words: [
      { word: 'red', emoji: '🟥', sentence: 'The wool is red.', item: 'red_wool', count: [1, 3], one: 'red block', many: 'red blocks', mob: 'sheep', mobColour: 'red' },
      { word: 'blue', emoji: '🟦', sentence: 'The wool is blue.', item: 'blue_wool', count: [1, 3], one: 'blue block', many: 'blue blocks', mob: 'sheep', mobColour: 'blue' },
      { word: 'yellow', emoji: '🟨', sentence: 'The wool is yellow.', item: 'yellow_wool', count: [1, 3], one: 'yellow block', many: 'yellow blocks', mob: 'sheep', mobColour: 'yellow' },
      { word: 'green', emoji: '🟩', sentence: 'The wool is green.', item: 'green_wool', count: [1, 3], one: 'green block', many: 'green blocks', mob: 'sheep', mobColour: 'green' },
      { word: 'orange', emoji: '🟧', sentence: 'The wool is orange.', item: 'orange_wool', count: [1, 3], one: 'orange block', many: 'orange blocks', mob: 'sheep', mobColour: 'orange' },
      { word: 'purple', emoji: '🟪', sentence: 'The wool is purple.', item: 'purple_wool', count: [1, 3], one: 'purple block', many: 'purple blocks', mob: 'sheep', mobColour: 'purple' },
      { word: 'pink', emoji: '🌸', sentence: 'The wool is pink.', item: 'pink_wool', count: [1, 3], one: 'pink block', many: 'pink blocks', mob: 'sheep', mobColour: 'pink' },
      { word: 'brown', emoji: '🟫', sentence: 'The wool is brown.', item: 'brown_wool', count: [1, 3], one: 'brown block', many: 'brown blocks', mob: 'sheep', mobColour: 'brown' },
      { word: 'black', emoji: '⬛', sentence: 'The wool is black.', item: 'black_wool', count: [1, 3], one: 'black block', many: 'black blocks', mob: 'sheep', mobColour: 'black' },
      { word: 'white', emoji: '⬜', sentence: 'The wool is white.', item: 'white_wool', count: [1, 3], one: 'white block', many: 'white blocks', mob: 'sheep', mobColour: 'white' },
    ],
  },
  {
    id: 'school',
    name: 'At School',
    emoji: '✏️',
    blurb: 'book, table, window, box…',
    years: [1],
    book: 'Super Minds 1 · Unit 1',
    // Unit 1 is really about the question "What's this? It's a (pencil)." The
    // world has no pencils or schoolbags, so the pack carries that grammar on
    // the classroom-ish objects it does have. Pencil and pen stay in the list
    // as spoken words even though no villager can ask for one.
    lines: {
      fetch: [
        "What's this? It's a {one}. Bring me {n} {what}, please.",
        'Is it a {one}? Yes, it is! I want {n} {what}.',
      ],
      place: [
        "It's a {one}. Put {n} {what} next to me, please.",
        'Open your bag. Put {n} {what} here.',
      ],
    },
    words: [
      { word: 'book', emoji: '📖', sentence: "It's a book.", item: 'bookshelf', block: 'bookshelf', one: 'book', many: 'books' },
      { word: 'table', emoji: '🪵', sentence: "It's a table.", item: 'crafting_table', block: 'crafting_table', one: 'table', many: 'tables' },
      { word: 'window', emoji: '🪟', sentence: 'I look out of the window.', item: 'glass', block: 'glass', one: 'window', many: 'windows' },
      { word: 'box', emoji: '📦', sentence: 'My things are in the box.', item: 'chest', block: 'chest', one: 'box', many: 'boxes' },
      { word: 'lamp', emoji: '💡', sentence: 'The lamp is bright.', item: 'torch', block: 'torch', one: 'lamp', many: 'lamps' },
      { word: 'sign', emoji: '🪧', sentence: "What's this? It's a sign.", item: 'sign', block: 'sign' },
      { word: 'pencil', emoji: '✏️', sentence: "It's a pencil." },
      { word: 'pen', emoji: '🖊️', sentence: 'Is it a pen? Yes, it is.' },
    ],
  },
  {
    id: 'animals',
    name: 'Animals',
    emoji: '🐄',
    blurb: 'pig, cow, sheep, chicken…',
    years: [1, 2],
    book: 'Super Minds 1 · Unit 3',
    lines: {
      find: [
        'I like the {mob}. Can you find one?',
        'The {mob} is on the grass. Go and find it!',
        'Is there a {mob} near here? Go and look!',
      ],
    },
    words: [
      { word: 'pig', emoji: '🐷', sentence: 'The pig is pink.', mob: 'pig' },
      { word: 'cow', emoji: '🐮', sentence: 'The cow says moo.', mob: 'cow' },
      { word: 'sheep', emoji: '🐑', sentence: 'The sheep is white.', mob: 'sheep' },
      { word: 'chicken', emoji: '🐔', sentence: 'The chicken is small.', mob: 'chicken' },
      { word: 'rabbit', emoji: '🐰', sentence: 'The rabbit can jump.', mob: 'rabbit' },
      { word: 'cat', emoji: '🐱', sentence: 'The cat is my pet.', mob: 'cat' },
      { word: 'dog', emoji: '🐶', sentence: 'The dog is my friend.', mob: 'wolf' },
      { word: 'feather', emoji: '🪶', sentence: 'A chicken has feathers.', item: 'feather' },
    ],
  },
  {
    id: 'food',
    name: 'Food',
    emoji: '🍎',
    blurb: 'apple, bread, meat, wheat…',
    years: [1, 2],
    book: 'Super Minds 1 · Unit 4',
    words: [
      { word: 'apple', emoji: '🍎', sentence: 'I eat an apple.', item: 'apple' },
      { word: 'bread', emoji: '🍞', sentence: 'I eat bread.', item: 'bread', one: 'loaf of bread', many: 'loaves of bread', uncountable: true },
      { word: 'wheat', emoji: '🌾', sentence: 'Bread is made from wheat.', item: 'wheat', one: 'wheat plant', many: 'wheat plants' },
      { word: 'meat', emoji: '🥩', sentence: 'The cow gives us meat.', item: 'raw_beef', one: 'piece of meat', many: 'pieces of meat', uncountable: true },
      { word: 'chicken', emoji: '🍗', sentence: 'I like cooked chicken.', item: 'cooked_chicken' },
      { word: 'egg', emoji: '🥚', sentence: 'A chicken lays an egg.', item: 'egg' },
      { word: 'sugar cane', emoji: '🎋', sentence: 'Sugar cane grows by the water.', item: 'sugar_cane', one: 'sugar cane', many: 'sugar canes' },
      { word: 'pumpkin', emoji: '🎃', sentence: 'The pumpkin is orange.', item: 'pumpkin' },
    ],
  },

  // ===================================================== Year 2 =============
  {
    id: 'house',
    name: 'My House',
    emoji: '🏠',
    blurb: 'wall, window, door, lamp…',
    years: [2],
    book: 'Super Minds 1 · Unit 6',
    // Unit 6 drills "There's a … / There are … / How many … are there?".
    lines: {
      fetch: [
        "There's a hole in my house! Bring me {n} {what}, please.",
        'How many {many} are there in your bag? I need {n}.',
      ],
      place: [
        "There isn't a {one} here. Please put {n} {what} next to me.",
        'How many {many} are there? Put {n} {what} down and count them.',
      ],
    },
    words: [
      { word: 'wood', emoji: '🪵', sentence: 'The house is made of wood.', item: 'oak_planks', block: 'oak_planks', one: 'wood block', many: 'wood blocks' },
      { word: 'window', emoji: '🪟', sentence: 'I look out of the window.', item: 'glass', block: 'glass' },
      { word: 'wall', emoji: '🧱', sentence: 'The wall is grey.', item: 'cobblestone', block: 'cobblestone', one: 'wall block', many: 'wall blocks' },
      { word: 'box', emoji: '📦', sentence: 'I put my things in the box.', item: 'chest', block: 'chest' },
      { word: 'table', emoji: '🪑', sentence: 'I work at the table.', item: 'crafting_table', block: 'crafting_table' },
      { word: 'lamp', emoji: '💡', sentence: 'The lamp is bright.', item: 'torch', block: 'torch' },
      { word: 'door', emoji: '🚪', sentence: 'Open the door, please.' },
      { word: 'floor', emoji: '⬛', sentence: 'The floor is under my feet.', item: 'stone', block: 'stone', one: 'floor block', many: 'floor blocks' },
    ],
  },
  {
    id: 'nature',
    name: 'Nature',
    emoji: '🌳',
    blurb: 'tree, flower, water, stone…',
    years: [2],
    book: 'Super Minds 1 · Units 5 & 9',
    words: [
      { word: 'tree', emoji: '🌳', sentence: 'The tree is tall.', item: 'oak_log', block: 'oak_log' },
      { word: 'leaf', emoji: '🍃', sentence: 'The leaf is green.', item: 'oak_leaves', block: 'oak_leaves', many: 'leaves' },
      { word: 'flower', emoji: '🌹', sentence: 'The flower is pretty.', item: 'rose', block: 'rose' },
      { word: 'grass', emoji: '🌿', sentence: 'The grass is green.', item: 'grass_block', block: 'grass_block', one: 'grass block', many: 'grass blocks' },
      { word: 'stone', emoji: '🪨', sentence: 'The stone is hard.', item: 'cobblestone', block: 'cobblestone', one: 'stone block', many: 'stone blocks' },
      { word: 'sand', emoji: '🏖️', sentence: 'The sand is soft.', item: 'sand', block: 'sand', one: 'sand block', many: 'sand blocks' },
      { word: 'snow', emoji: '❄️', sentence: 'The snow is cold.', item: 'snow_block', block: 'snow_block', one: 'snow block', many: 'snow blocks' },
      { word: 'coal', emoji: '⚫', sentence: 'Coal is black.', item: 'coal', one: 'piece of coal', many: 'pieces of coal' },
      { word: 'diamond', emoji: '💎', sentence: 'The diamond is blue.', item: 'diamond', count: [1, 2] },
    ],
  },
  {
    id: 'beach',
    name: 'At the Beach',
    emoji: '🏖️',
    blurb: 'sand, sea, sun, shell…',
    years: [2],
    book: 'Super Minds 1 · Unit 9',
    // Unit 9 drills "Where's the …? / Where are the …?", so this pack asks the
    // question and the child answers it by walking there.
    lines: {
      fetch: [
        "Let's go to the beach! Where are the {many}? Bring me {n} {what}.",
        "Where's the {one}? Please bring me {n} {what}.",
      ],
      place: [
        "Let's build a sandcastle. Put {n} {what} next to me.",
        'Where are the {many}? Put {n} {what} here, please.',
      ],
    },
    words: [
      { word: 'sand', emoji: '🏖️', sentence: 'The sand is soft and warm.', item: 'sand', block: 'sand', one: 'sand block', many: 'sand blocks' },
      { word: 'stone', emoji: '🪨', sentence: "Where's the stone? It's on the beach.", item: 'cobblestone', block: 'cobblestone', one: 'stone', many: 'stones' },
      { word: 'cactus', emoji: '🌵', sentence: 'The cactus is green and sharp.', item: 'cactus', block: 'cactus', many: 'cactuses' },
      { word: 'sugar cane', emoji: '🎋', sentence: 'Sugar cane grows by the sea.', item: 'sugar_cane', one: 'sugar cane', many: 'sugar canes' },
      { word: 'glass', emoji: '🫙', sentence: 'The glass is made from sand.', item: 'glass', block: 'glass', count: [2, 4], one: 'glass block', many: 'glass blocks' },
      { word: 'sea', emoji: '🌊', sentence: "Let's swim in the sea!" },
      { word: 'sun', emoji: '☀️', sentence: 'The sun is hot today.' },
      { word: 'shell', emoji: '🐚', sentence: "Where's the shell? It's in the sand." },
      { word: 'boat', emoji: '⛵', sentence: 'The boat is on the water.' },
    ],
  },
  {
    id: 'tools',
    name: 'Tools',
    emoji: '⛏️',
    blurb: 'pickaxe, axe, shovel, sword…',
    years: [2, 4],
    book: 'Super Minds 1 · Unit 8 · Get Smart Plus 4 · Module 9',
    words: [
      { word: 'pickaxe', emoji: '⛏️', sentence: 'I dig stone with a pickaxe.', item: 'wooden_pickaxe', count: [1, 2] },
      { word: 'axe', emoji: '🪓', sentence: 'I cut wood with an axe.', item: 'wooden_axe', count: [1, 2] },
      { word: 'shovel', emoji: '🥄', sentence: 'I dig sand with a shovel.', item: 'wooden_shovel', count: [1, 2] },
      { word: 'sword', emoji: '🗡️', sentence: 'The sword is sharp.', item: 'wooden_sword', count: [1, 2] },
      { word: 'stick', emoji: '🥢', sentence: 'I need two sticks.', item: 'stick' },
      { word: 'iron', emoji: '⚙️', sentence: 'Iron is strong.', item: 'iron_ingot', one: 'iron bar', many: 'iron bars', count: [1, 4] },
      { word: 'torch', emoji: '🔥', sentence: 'The torch makes light.', item: 'torch', block: 'torch' },
    ],
  },

  // ===================================================== Year 4 =============
  {
    id: 'past',
    name: 'In the Past',
    emoji: '🔺',
    blurb: 'gold, pyramid, treasure, tomb…',
    years: [4],
    book: 'Get Smart Plus 4 · Module 3',
    // Module 3 is the past simple, taught through Ancient Egypt. Every line in
    // this pack is a past-tense model the child hears before working.
    lines: {
      fetch: [
        'The Egyptians found {many} in the desert long ago. Bring me {n} {what}.',
        'Yesterday I looked for {many}, but I did not find any. Can you bring me {n} {what}?',
        'Who carried the {many} to the tomb? The workers did. Now bring me {n} {what}.',
      ],
      fetchU: [
        'How much {word} did they find in the tomb? A lot! Bring me {n} {what}.',
      ],
      place: [
        'The Egyptians built pyramids from stone. Please put {n} {what} here.',
        'Long ago, workers carried {many} to the tomb. Put {n} {what} next to me.',
        'They did not use machines. They built it by hand. Put {n} {what} down here.',
      ],
    },
    words: [
      { word: 'pyramid', emoji: '🔺', sentence: 'The Egyptians built a pyramid.', item: 'sandstone', block: 'sandstone', one: 'sandstone block', many: 'sandstone blocks' },
      { word: 'gold', emoji: '🪙', sentence: 'They found gold in the tomb.', item: 'gold_ingot', block: 'gold_ore', one: 'gold bar', many: 'gold bars', count: [1, 4] },
      { word: 'treasure', emoji: '💎', sentence: 'The treasure was very old.', item: 'diamond', one: 'piece of treasure', many: 'pieces of treasure', count: [1, 3] },
      { word: 'tomb', emoji: '⚰️', sentence: 'The king slept in a tomb.', item: 'chest', block: 'chest', one: 'stone box', many: 'stone boxes', count: [1, 3] },
      { word: 'torch', emoji: '🔦', sentence: 'They carried a torch into the dark tomb.', item: 'torch', block: 'torch' },
      { word: 'sand', emoji: '🏜️', sentence: 'The wind covered the tomb with sand.', item: 'sand', block: 'sand', one: 'sand block', many: 'sand blocks' },
      { word: 'stone', emoji: '🪨', sentence: 'They cut the stone with simple tools.', item: 'cobblestone', block: 'cobblestone', one: 'stone block', many: 'stone blocks' },
      { word: 'jewel', emoji: '💚', sentence: 'The queen wore a green jewel.', item: 'emerald', count: [1, 3] },
      { word: 'desert', emoji: '🐫', sentence: 'The desert was hot and dry.' },
      { word: 'mummy', emoji: '🧟', sentence: 'They wrapped the mummy in bandages.' },
    ],
  },
  {
    id: 'eating',
    name: 'Eating Right',
    emoji: '🥗',
    blurb: 'some, any, how many, how much',
    years: [4],
    book: 'Get Smart Plus 4 · Module 5',
    // Module 5 is countable vs uncountable: some/any, how many/how much.
    lines: {
      fetch: [
        'I want to cook a meal. We need some {many}. How many have you got? Bring me {n} {what}.',
        'There are some {many} out there. Please bring me {n} {what}.',
        'You should eat healthy food. Bring me {n} {what} and we can share.',
      ],
      fetchU: [
        "There isn't any {word} in my kitchen. How much do we need? {n} {what}, please.",
        'We need some {word}. Bring me {n} {what}.',
      ],
      place: [
        "Let's set the table here. Put {n} {what} down, please.",
        'How many {many} do we need for the meal? {n}. Put them here.',
      ],
    },
    words: [
      { word: 'apple', emoji: '🍎', sentence: 'There are some apples in the bowl.', item: 'apple', count: [2, 5] },
      { word: 'bread', emoji: '🍞', sentence: "There isn't any bread left.", item: 'bread', count: [2, 5], one: 'loaf of bread', many: 'loaves of bread', uncountable: true },
      { word: 'egg', emoji: '🥚', sentence: 'How many eggs do we need?', item: 'egg', count: [2, 4] },
      { word: 'meat', emoji: '🥩', sentence: 'How much meat do you eat every week?', item: 'raw_beef', count: [2, 5], one: 'piece of meat', many: 'pieces of meat', uncountable: true },
      { word: 'steak', emoji: '🍖', sentence: 'A cooked steak is better than a raw one.', item: 'cooked_beef', count: [2, 4] },
      { word: 'chicken', emoji: '🍗', sentence: 'We have got some cooked chicken.', item: 'cooked_chicken', count: [2, 4], one: 'piece of chicken', many: 'pieces of chicken' },
      { word: 'wheat', emoji: '🌾', sentence: 'How much wheat do we need for bread?', item: 'wheat', count: [3, 6], one: 'bunch of wheat', many: 'bunches of wheat', uncountable: true },
      { word: 'pumpkin', emoji: '🎃', sentence: 'Are there any pumpkins in the garden?', item: 'pumpkin', block: 'pumpkin', count: [1, 3] },
      { word: 'sugar', emoji: '🎋', sentence: 'You should not eat too much sugar.', item: 'sugar_cane', count: [3, 6], one: 'sugar cane', many: 'sugar canes', uncountable: true },
    ],
  },
  {
    id: 'camping',
    name: 'Helping Out',
    emoji: '⛺',
    blurb: 'camping, helping, whose is this?',
    years: [4],
    book: 'Get Smart Plus 4 · Module 7',
    // Module 7 is helping others and possession — whose is this? it's mine.
    lines: {
      fetch: [
        "We're going camping. Whose {one} is this? It isn't mine! Please bring me {n} {what}.",
        'Can you help me pack? I need {n} {what} for the camp.',
        'Everyone can help. Is there anyone with {n} {what}? I need them.',
      ],
      fetchU: [
        'How much {word} do we need for the camp? {n} {what}, I think.',
      ],
      place: [
        "Let's put up the camp here. Please put {n} {what} next to me.",
        'Helping others is good for everyone. Put {n} {what} down here.',
      ],
    },
    words: [
      { word: 'tent', emoji: '⛺', sentence: "Whose tent is this? It's ours.", item: 'white_wool', block: 'white_wool', count: [2, 4], one: 'white wool block', many: 'white wool blocks' },
      { word: 'sleeping bag', emoji: '🛌', sentence: "Whose sleeping bags are these? They're theirs.", item: 'red_wool', block: 'red_wool', count: [1, 3], one: 'red wool block', many: 'red wool blocks' },
      { word: 'torch', emoji: '🔦', sentence: "It's dark. Someone has got a torch.", item: 'torch', block: 'torch' },
      { word: 'wood', emoji: '🪵', sentence: 'We can build a shelter with wood.', item: 'oak_planks', block: 'oak_planks', one: 'wood block', many: 'wood blocks' },
      { word: 'fire', emoji: '🔥', sentence: 'We cook our food on the fire.', item: 'furnace', block: 'furnace', one: 'fire place', many: 'fire places', count: [1, 3] },
      { word: 'rucksack', emoji: '🎒', sentence: "Whose rucksack is this? It's mine.", item: 'chest', block: 'chest', one: 'rucksack', many: 'rucksacks', count: [1, 3] },
      { word: 'firewood', emoji: '🥢', sentence: 'We can help by collecting firewood.', item: 'stick', one: 'stick', many: 'sticks' },
      { word: 'coal', emoji: '⚫', sentence: 'There is no coal left for the fire.', item: 'coal', one: 'piece of coal', many: 'pieces of coal' },
      { word: 'rubbish', emoji: '♻️', sentence: 'Help me take out the rubbish. We can recycle it.' },
    ],
  },
  {
    id: 'wildlife',
    name: 'Amazing Animals',
    emoji: '🐺',
    blurb: 'bigger, faster, more dangerous',
    years: [4],
    book: 'Get Smart Plus 4 · Module 8',
    // Module 8 is comparatives. Each word carries its own comparison, so the
    // villager states it and the child then goes and checks it in the world.
    lines: {
      find: [
        '{sentence} Go and find a {mob}, then come back and tell me.',
        'Which animal is more interesting? {sentence} Find a {mob} and look at it.',
        '{sentence} Can you find one?',
      ],
      fetch: [
        '{sentence} Bring me {n} {what}, please.',
        'I am writing about animals. {sentence} Bring me {n} {what} for my project.',
      ],
    },
    words: [
      { word: 'wolf', emoji: '🐺', adj: 'dangerous', sentence: 'A wolf is more dangerous than a rabbit.', mob: 'wolf', many: 'wolves' },
      { word: 'rabbit', emoji: '🐰', adj: 'fast', sentence: 'A rabbit is faster than a cow.', mob: 'rabbit' },
      { word: 'cow', emoji: '🐮', adj: 'heavy', sentence: 'A cow is heavier than a chicken.', mob: 'cow' },
      { word: 'pig', emoji: '🐷', adj: 'slow', sentence: 'A pig is slower than a wolf.', mob: 'pig' },
      { word: 'sheep', emoji: '🐑', adj: 'quiet', sentence: 'A sheep is quieter than a wolf.', mob: 'sheep' },
      { word: 'chicken', emoji: '🐔', adj: 'small', sentence: 'A chicken is smaller than a cow.', mob: 'chicken' },
      { word: 'cat', emoji: '🐱', adj: 'popular', sentence: 'A cat is more popular than a pig.', mob: 'cat' },
      { word: 'feather', emoji: '🪶', adj: 'light', sentence: 'A feather is lighter than a stone.', item: 'feather', count: [2, 5] },
      { word: 'leather', emoji: '🟤', adj: 'strong', sentence: 'Leather is stronger than paper.', item: 'leather', count: [1, 4], one: 'piece of leather', many: 'pieces of leather', uncountable: true },
    ],
  },
  {
    id: 'materials',
    name: 'Materials',
    emoji: '🧱',
    blurb: 'glass, metal, wood, stone…',
    years: [4],
    book: 'Get Smart Plus 4 · Modules 5 & 10',
    // Materials and safety at home — "What is it made of?" and should/shouldn't.
    lines: {
      fetch: [
        "What is it made of? It's made of {word}. Please bring me {n} {what}.",
        'We can recycle {word} and use it again. Bring me {n} {what}.',
        'You should always work safely. Carefully bring me {n} {what}.',
      ],
      fetchU: [
        'How much {word} have we got? We need {n} {what}.',
      ],
      place: [
        'This wall should be made of {word}. Put {n} {what} here, please.',
        'You should not build with the wrong material. Put {n} {what} next to me.',
      ],
    },
    words: [
      { word: 'glass', emoji: '🫙', sentence: 'The window is made of glass.', item: 'glass', block: 'glass', count: [3, 6], one: 'glass block', many: 'glass blocks' },
      { word: 'metal', emoji: '⚙️', sentence: 'The spoon is made of metal.', item: 'iron_ingot', one: 'iron bar', many: 'iron bars', count: [1, 4] },
      { word: 'wood', emoji: '🪵', sentence: 'The table is made of wood.', item: 'oak_planks', block: 'oak_planks', one: 'wood block', many: 'wood blocks' },
      { word: 'stone', emoji: '🪨', sentence: 'The floor is made of stone.', item: 'stone', block: 'stone', count: [3, 6], one: 'stone block', many: 'stone blocks' },
      { word: 'sandstone', emoji: '🟨', sentence: 'The wall is made of sandstone.', item: 'sandstone', block: 'sandstone', one: 'sandstone block', many: 'sandstone blocks' },
      { word: 'wool', emoji: '🧶', sentence: 'My jumper is made of wool.', item: 'white_wool', block: 'white_wool', count: [2, 4], one: 'wool block', many: 'wool blocks' },
      { word: 'leather', emoji: '🟤', sentence: 'The bag is made of leather.', item: 'leather', count: [1, 4], one: 'piece of leather', many: 'pieces of leather', uncountable: true },
      { word: 'gold', emoji: '🪙', sentence: 'Gold is more expensive than iron.', item: 'gold_ingot', one: 'gold bar', many: 'gold bars', count: [1, 4] },
      { word: 'plastic', emoji: '🧴', sentence: 'We should not throw plastic away.' },
      { word: 'paper', emoji: '📄', sentence: 'Paper is easy to recycle.' },
    ],
  },
];

// Number words, used to write quantities out in full so children read "three
// apples", not "3 apples". Year 4 asks for more than ten, so this runs to
// twenty.
export const NUMBER_WORDS = [
  'zero', 'one', 'two', 'three', 'four', 'five',
  'six', 'seven', 'eight', 'nine', 'ten',
  'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen',
  'sixteen', 'seventeen', 'eighteen', 'nineteen', 'twenty',
];

// Ordinals — Get Smart Plus 4 Module 4 teaches 1st–31st. Used when a villager
// counts up the jobs a child has finished.
export const ORDINAL_WORDS = [
  'zeroth', 'first', 'second', 'third', 'fourth', 'fifth',
  'sixth', 'seventh', 'eighth', 'ninth', 'tenth',
  'eleventh', 'twelfth',
];

export function numberWord(n) {
  return NUMBER_WORDS[n] || String(n);
}

export function ordinalWord(n) {
  return ORDINAL_WORDS[n] || (String(n) + 'th');
}

// How to name n of a word in a sentence. Words carry `one` / `many` when the
// word itself is not the countable noun.
export function countPhrase(w, n) {
  if (n === 1) return w.one || w.word;
  return w.many || plural(w.one || w.word, n);
}

export function packById(id) {
  return PACKS.find((p) => p.id === id) || PACKS[0];
}

export function yearById(id) {
  return YEARS.find((y) => y.id === Number(id)) || YEARS[0];
}

// The packs a class is offered. Year 1 packs stay on the Year 2 list as
// revision; that is what `years: [1, 2]` means.
export function packsForYear(id) {
  const y = Number(id);
  const list = PACKS.filter((p) => (p.years || [1]).indexOf(y) !== -1);
  return list.length ? list : PACKS;
}

export function defaultPackForYear(id) {
  const y = Number(id);
  const list = packsForYear(y);
  // Numbers has no things of its own, so it is a poor thing to open on; and a
  // pack whose home year is this one beats one borrowed as revision.
  const real = list.filter((p) => !p.numbersOnly);
  const home = real.filter((p) => (p.years || [])[0] === y);
  return (home[0] || real[0] || list[0]).id;
}

// Fill a sentence template. Unknown placeholders are dropped rather than left
// on screen as {curly} noise, and the spacing is tidied up afterwards.
export function fillLine(tpl, vars) {
  return String(tpl || '')
    .replace(/\{(\w+)\}/g, (m, k) => (vars[k] === undefined || vars[k] === null ? '' : String(vars[k])))
    .replace(/\s+/g, ' ')
    .replace(/ ([.,!?])/g, '$1')
    .trim()
    // A placeholder can land at the start of a sentence ("How many? Six, I
    // think."), so capitalise there rather than making every template avoid it.
    .replace(/(^|[.!?]\s+)([a-z])/g, (m, lead, c) => lead + c.toUpperCase());
}

// A pack may override the year's sentences for a quest type; otherwise the
// year's own list is used. `fetchU` (uncountable) falls back to `fetch`.
export function linesFor(pack, year, type) {
  const packLines = pack && pack.lines;
  const list = (packLines && packLines[type]) || (year && year.lines && year.lines[type]);
  if (!list && type === 'fetchU') return linesFor(pack, year, 'fetch');
  return list || [];
}

export function pickLine(pack, year, type) {
  const list = linesFor(pack, year, type);
  if (!list.length) return '';
  return list[Math.floor(Math.random() * list.length)];
}

// Plural for the simple, regular cases these packs use.
export function plural(word, n) {
  if (n === 1) return word;
  if (/(s|sh|ch|x|z)$/.test(word)) return word + 'es';
  if (/[^aeiou]y$/.test(word)) return word.slice(0, -1) + 'ies';
  if (word === 'sheep' || word === 'bread' || word === 'wheat' || word === 'meat' ||
      word === 'wood' || word === 'sand' || word === 'snow' || word === 'grass' ||
      word === 'iron' || word === 'coal' || word === 'water' || word === 'gold' ||
      word === 'metal' || word === 'plastic' || word === 'paper' || word === 'wool' ||
      word === 'leather' || word === 'treasure' || word === 'sugar') return word;
  return word + 's';
}
