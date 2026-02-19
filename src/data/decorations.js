// ASCII art definitions for achievement-unlocked decorations

export const DECORATIONS = {
  // Animated clam — 2 frames (marine_biologist)
  clam: {
    frames: [
      ["\\__/", "(__)"],
      ["\\  /", "(__)"],
    ],
    color: "clam",
    width: 4,
    height: 2,
  },

  // Shipwreck piece (ocean_explorer)
  shipwreck: {
    art: [
      "  |/ ",
      " /|  ",
      "/===\\",
      "|   |",
    ],
    color: "shipwreck",
    width: 5,
    height: 4,
  },

  // Volcano rock with bubble column (reef_master)
  volcano: {
    art: [
      " /\\",
      "/\\/\\",
    ],
    color: "volcano",
    width: 4,
    height: 2,
  },

  // Golden trident (completionist)
  trident: {
    art: [
      "\\|/",
      " | ",
      " | ",
    ],
    color: "trident",
    width: 3,
    height: 3,
  },

  // Keyboard coral (typist)
  keyboard: {
    art: ["[Q][W][E]"],
    color: "keyboard",
    width: 9,
    height: 1,
  },

  // Cursor arrow (clicker)
  cursor: {
    art: [
      "\\",
      " \\",
      " /",
      "/",
    ],
    color: "cursor",
    width: 2,
    height: 4,
  },

  // Music notes (dj)
  musicNotes: {
    art: ["~n n~"],
    color: "musicNotes",
    width: 5,
    height: 1,
  },

  // Trophy (top_10)
  trophy: {
    art: [
      "\\#/",
      " | ",
      "___",
    ],
    color: "trophy",
    width: 3,
    height: 3,
  },
};

// Surface/sky decorations (air band + surface line)
export const SURFACE_DECORATIONS = {
  boat: {
    frames: [
      ["  /\\  ", " /__\\ ", " |__| "],
      ["  /\\  ", " /__\\ ", " |_~| "],
    ],
    width: 6,
    height: 3,
  },
  jetski: {
    frames: [
      [" _~_ ", "/_|_>", "  ~~ "],
      [" _~_ ", "/_|_>", " ~~~ "],
    ],
    width: 5,
    height: 3,
  },
  gull: {
    frames: [
      ["\\_v_/"],
      ["-v-"],
    ],
    width: 5,
    height: 1,
  },
  tern: {
    frames: [
      ["\\_/_/"],
      ["-^-"],
    ],
    width: 5,
    height: 1,
  },
  flock: {
    frames: [
      ["\\_v_/  -v-  \\_/_/"],
      ["-v-  \\_v_/  -^-"],
    ],
    width: 17,
    height: 1,
  },
};
