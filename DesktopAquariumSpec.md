# ASCII Reef
## Design Specification
Version 2.0
Ambient ASCII Desktop Aquarium

---

# 1. Product Overview

ASCII Reef is a lightweight, translucent desktop companion that renders a living ASCII aquarium overlay. The aquarium evolves slowly based on ambient computer activity (typing, mouse input, audio playback).

There is:
- No productivity framing
- No required login
- No intrusive UI
- No complex menus
- No gameplay loops beyond collection

Progression is passive, fair, and collection-driven.

Score derives strictly from owned creatures and is displayed in the tank.

The entire aesthetic is pure ASCII (monospaced), no emojis. Unicode allowed if visually consistent and fixed-width safe.

---

# 2. Core Pillars

1. Ambient and Calm
   Slow progression, no urgency.

2. Pure ASCII Identity
   Monospaced rendering only. No emoji art.

3. Fair Randomness
   Incremental pity system limits variance.

4. Collection-Driven Score
   Score recalculated from owned fish. Displayed bottom-left of tank.

5. Lightweight Overlay
   Low CPU, frame capped, translucent, draggable.

---

# 3. Distribution

- Open source under MIT license
- Source hosted on GitHub
- Downloadable binaries on project website
- Releases published via GitHub Releases
- Platforms: Windows (.msi installer) and macOS (.dmg)
- Auto-update via GitHub Releases API (check on launch, notify user, never force)

---

# 4. Technology Stack

## Framework: Tauri 2

- Rust backend for system-level operations (input monitoring, window management, file I/O)
- WebView frontend for rendering (HTML5 Canvas with monospaced font)
- Produces small binaries (~5-10 MB)
- Native transparent window support on both platforms
- Built-in auto-updater via GitHub Releases

## Why Tauri

- Transparent, always-on-top, click-through overlays are first-class Tauri capabilities
- Rust backend handles global input hooks efficiently
- Canvas rendering in WebView is more than sufficient for ASCII art at 24 FPS
- Cross-platform without platform-specific rendering code

## Build and Release

- CI via GitHub Actions
- Build matrix: Windows x64, macOS x64, macOS ARM64
- Tauri's built-in updater for update checks against GitHub Releases
- Signing: Windows code signing optional; macOS requires notarization for Gatekeeper

---

# 5. Platform Requirements

- Windows 10+ (x64)
- macOS 12+ (x64, ARM64)

Overlay window must support:
- Transparent background (Tauri `transparent: true`)
- Always-on-top (`always_on_top: true`)
- Click-through by default (see Section 13 for interaction model)
- Fixed size: 60 columns x 30 rows
- Default pixel size: approximately 480 x 420 pixels (varies with font metrics)
- Frame rate: 24 FPS (fixed, not a range)

---

# 6. Rendering Model

## Font

- Bundled monospaced font: JetBrains Mono or similar
- Loaded as a web font in the WebView
- All glyphs must render at equal width
- Font size: 14px default

## Canvas

- HTML5 Canvas element, sized to grid dimensions
- Each cell is one character wide, one line tall
- All sprites are prebuilt fixed-width strings
- Movement occurs in whole character increments
- Render loop driven by `requestAnimationFrame`, throttled to 24 FPS

## Background

- Fully transparent window
- Canvas background: transparent
- Only glyphs are visible
- Sparse water particles using:
  ```
  ~  .  °  o
  ```
  Randomly placed, slowly drifting, low density (roughly 5-8% of cells)

## Environment Base

Bottom 3 rows of the grid:

```
Row 28: (kelp tops, coral, open water)
Row 29: __________________________
Row 30:   ^   ^    ^   ^    ^   ^
```

Rock line fixed at row 29. Kelp and coral anchored to bottom rows.

---

# 7. Input and Energy System

## Energy Sources

All input monitoring happens in the Rust backend. The frontend never sees raw input.

Typing:
- Global keyboard hook (`SetWindowsHookEx` on Windows, `CGEventTap` on macOS)
- +1 energy per 10 keystrokes (rounded threshold for simplicity)
- Count only. Never store key values, scan codes, or timestamps

Click:
- Global mouse hook (same APIs as keyboard)
- +1 energy per 5 clicks

Audio:
- Detect system audio playback state only (Windows: WASAPI `AudioSessionManager`, macOS: `CoreAudio` aggregate device tap)
- +1 energy per 5 seconds of active playback
- No metadata, no volume level, no app identification

### Energy Rate Balance

At moderate activity, approximate energy per minute:
- Typing (60 WPM = 300 chars/min): 30 energy/min
- Clicking (average ~10 clicks/min): 2 energy/min
- Audio (continuous): 12 energy/min

This makes typing the primary driver with audio as a steady supplement, which is the intended feel for a desktop companion used during work.

## Permission Handling

- macOS: Accessibility permission required for input hooks. On first launch, display a native dialog explaining what is monitored and why. If denied, the app runs without input energy — fish can still be granted via a fallback idle discovery (see Section 7.1).
- Windows: No special permissions needed for global hooks.

## 7.1 Idle Fallback

If all input sources are unavailable (permissions denied or no activity for 15+ minutes):
- Grant 1 energy per 30 seconds passively
- This prevents a dead aquarium but is slow enough to incentivize granting permissions

## Discovery Meter

- Single shared meter across all input sources
- Threshold: 40 energy
- On threshold reached:
  - Trigger Discovery Event (see Section 8)
  - Reset meter to 0
  - No overflow carry

Expected cadence:
- Moderate typing + audio: ~1 discovery every 60-90 seconds
- Typing only: ~1 discovery every 80-120 seconds
- Idle fallback only: ~1 discovery every 20 minutes

---

# 8. Rarity System

## Distribution Targets

- Common: 60%
- Uncommon: 25%
- Rare: 10%
- Epic: 4%
- Legendary: 1%

## Roll Mechanic

Roll top-down. For each tier, check against that tier's current probability. On hit, stop. On miss, continue to next tier. If all miss, result is Common.

## Pity Parameters (All Tiers)

Each tier has: base probability, increment per miss, and cap.

| Tier      | Base   | Increment | Cap    | Target |
|-----------|--------|-----------|--------|--------|
| Legendary | 1/200  | +1/200    | 5/200  | ~1%    |
| Epic      | 1/50   | +1/50     | 4/50   | ~4%    |
| Rare      | 1/20   | +1/20     | 4/20   | ~10%   |
| Uncommon  | 1/8    | +1/8      | 4/8    | ~25%   |

On hit: reset that tier's counter to base.
On miss: increment that tier's numerator by 1 (capped).

All pity counters persist in save file.

### Pool Selection

After rarity is determined, select a specific creature:
- Determine which input source contributed the most energy since the last discovery
- Select from that source's creature pool
- Within the pool and rarity tier, pick uniformly at random
- If the creature is already owned, increment its count (duplicates are expected)

---

# 9. Score System

Score is derived only from owned creatures.

```
score = sum(fish_score_value * count)
```

## Score Values

- Common: 10
- Uncommon: 25
- Rare: 75
- Epic: 250
- Legendary: 1500

No passive time-based score.

## Display

Score is rendered bottom-left of the tank in muted text:

```
Score: 1,285
```

Collection progress rendered bottom-right:

```
42/75
```

---

# 10. Tank Display System

## Ownership

Fish are permanently owned once discovered. Duplicates increase count.

## Display Rules

Tank shows rotating subset of owned fish.

- Hard cap: 12 visible simultaneously
- Soft target: 9 visible on average
- Reserved slot: 1 slot always shows the player's rarest owned creature (if they own any Rare+ creature)

## Spawn Cycle

Every 6-10 seconds (randomized):
- If visible count < soft target (9):
  - Select a fish from the owned pool
  - Weighted by display weight (Commons appear more often)

Display weight (probability of being selected for a slot):

- Common: 6
- Uncommon: 3
- Rare: 1.5
- Epic: 0.5
- Legendary: 0.1

The reserved rarest-slot ignores these weights.

## Lifetime

- Each visible fish lives 20-40 seconds (randomized)
- Drifts across tank horizontally (left-to-right or right-to-left, chosen at spawn)
- Minor vertical sine offset (amplitude: 1-2 rows, period: 8-12 seconds)
- On lifetime expiry: fish drifts offscreen, then is removed

## Discovery Burst

On discovery event:
- New creature spawns immediately at center
- Brief ASCII ripple animation (0.5 seconds):

```
~~~~~((((())))))~~~~~
```

- Rarity color flash on the new creature
- Temporary cap increase to 12 for 30 seconds

---

# 11. Creature Categories and Movement

## A. Standard Swimmers

- Horizontal drift: 1-3 columns per second
- 2-frame animation, alternating every 0.5 seconds
- Minor vertical oscillation

Example:

Frame 1:
```
><(((°>
```

Frame 2:
```
><((<°>
```

## B. Bottom Dwellers

Examples: Crabs, Clams

- Constrained to rows 25-28 (above rock line)
- Crawl horizontally: 0.5-1 columns per second
- 2-frame leg animation
- Cannot render on or below rock line (row 29+)

## C. Floaters

Examples: Jellyfish, Octopus

- Slow vertical oscillation (amplitude: 3-5 rows, period: 6-10 seconds)
- Independent tentacle animation (2-3 frames)
- Horizontal speed: 0.5-1 columns per second

## D. Heavy Entities

- Width: 10-18 characters
- Speed: 0.5 columns per second max
- Render layer: above normal swimmers (drawn last)

---

# 12. Environment Elements

## Kelp (animated)

Frame 1:
```
   |
  /|
 / |
/  |
```

Frame 2:
```
   |
   |\
   | \
   |  \
```

4-second sway loop (2 seconds per frame).

Placement: 2-4 kelp stalks along the bottom, spaced at least 8 columns apart.

## Coral

```
  _-_
 /   \
 \_-_/
```

Static. Placement: 1-3 coral pieces along the bottom, non-overlapping with kelp.

## Bubble Column

```
  o
   O
    °
```

1-2 bubble columns, rising slowly (1 row per second). Loop from bottom to top.

---

# 13. Creature Roster Structure

Total MVP creatures: 75
3 Pools: Typing, Click, Audio
25 creatures each.

Each pool:
- 12 Common
- 6 Uncommon
- 4 Rare
- 2 Epic
- 1 Legendary

All sprites:
- Max width: 18 characters
- Max height: 6 rows
- Width must be constant across all animation frames for a given creature
- 2 animation frames minimum, 3 maximum

### Representative Creatures (to validate rendering constraints)

**Common - Typing Pool: Small Fish**
```
Frame 1: ><(((°>
Frame 2: ><((<°>
```
Width: 7, Height: 1, Category: Standard Swimmer

**Uncommon - Click Pool: Pufferfish**
```
Frame 1:  <°)))><
Frame 2: <(°)))><
```
Width: 8, Height: 1, Category: Standard Swimmer

**Rare - Audio Pool: Jellyfish**
```
Frame 1:    Frame 2:
 ,---.      ,---.
(     )    (     )
 \|||/      \|~|/
  |||        |~|
```
Width: 7, Height: 4, Category: Floater

**Epic - Typing Pool: Anglerfish**
```
Frame 1:         Frame 2:
    *                *
    |                |
><((°==>        ><(<°==>
```
Width: 10, Height: 3, Category: Heavy Entity

**Legendary - Audio Pool: Whale**
```
Frame 1:
    .------.
>==|°       }==>
    '------'
Frame 2:
    .------.
>==|°       )==>
    '------'
```
Width: 18, Height: 3, Category: Heavy Entity

Full creature roster to be defined in a separate `creatures.json` data file.

---

# 14. Color System

Per-character tinting via Canvas `fillStyle`.

Rarity colors (applied to creature glyphs):

- Common: #E0E0E0 (light gray)
- Uncommon: #7FE0FF (cyan)
- Rare: #4FA3FF (blue)
- Epic: #C36BFF (purple)
- Legendary: #FFD84F (gold)

Environment colors:
- Kelp: #4CAF50 (green)
- Rock line: #616161 (dark gray)
- Coral: #E0A0A0 (muted pink)
- Water glyphs: #2196F3 at 30% opacity (soft blue)
- Bubbles: #90CAF9 (light blue)
- Score/collection text: #9E9E9E (muted gray)

Since rendering is Canvas-based, per-character color is trivial and has no performance concern.

---

# 15. Window Interaction Model

The overlay needs to be unobtrusive by default but interactable when wanted.

## Default State

- Window is always-on-top and transparent
- Click-through enabled: all mouse events pass to windows below
- No visible chrome, borders, or controls

## Interaction Toggle

Since true hover detection is impossible when click-through is enabled (the OS never delivers mouse events to the window), use a **system tray icon** as the interaction anchor:

- System tray icon: ASCII fish icon `><>`
- Left-click tray icon: toggle click-through on/off
- When click-through is disabled:
  - Window becomes draggable (title bar drag region across top 2 rows)
  - Close button `[X]` appears top-right
  - Slight background tint (rgba(0,0,0,0.05)) to indicate interactive mode
  - Click anywhere outside the tank to re-enable click-through

## Tray Menu (right-click)

- "Drag Mode" (toggle)
- "Collection" (opens collection view — see Section 15.1)
- "Reset Position" (moves tank to default corner)
- "Quit"

## 15.1 Collection View

Right-clicking tray > "Collection" opens a small secondary window (not overlay):
- Grid of all 75 creatures
- Owned creatures shown with ASCII art and name
- Unowned shown as `???`
- Rarity color applied to names
- Count shown for duplicates
- Score total at top

This is the only traditional UI window in the app.

---

# 16. First-Run Experience

1. App launches for the first time
2. Tank overlay appears in bottom-right corner of primary monitor with:
   - Rock line and environment elements only
  - A single text line centered: `Passively unlock fish every time you Click, Tap, or Listen to anything. Nothing is logged. Score is sent with no identifying information.`
3. On macOS: native Accessibility permission dialog appears with explanation:
   "ASCII Reef counts your keystrokes and clicks to grow your aquarium. No input content is ever recorded or stored."
4. After first 40 energy accumulated (first discovery):
   - Text line fades
   - Discovery burst animation plays
   - First creature appears
5. Subsequent launches: tank loads from save file, creatures begin spawning immediately

---

# 17. Save System

## Location

- Windows: `%APPDATA%/ascii-reef/save.reef`
- macOS: `~/Library/Application Support/ascii-reef/save.reef`

Created automatically on first discovery. Auto-saved every 60 seconds and on quit.

## File Format

Extension: `.reef`
Format: JSON with schema version

```json
{
  "version": 2,
  "meta": {
    "created": "2026-02-16T00:00:00Z",
    "lastSaved": "2026-02-16T12:00:00Z",
    "appVersion": "1.0.0"
  },
  "collection": {
    "fish_id": { "count": 3, "firstSeen": "2026-02-16T01:00:00Z" }
  },
  "progression": {
    "energy": 23,
    "totalDiscoveries": 42,
    "pity": {
      "legendary": 3,
      "epic": 1,
      "rare": 0,
      "uncommon": 2
    }
  },
  "display": {
    "position": [1200, 600],
    "opacity": 1.0
  }
}
```

Score is not stored — always recalculated from `collection` on load.

## Corruption Recovery

- Before writing, write to `save.reef.tmp`, then rename (atomic write)
- Keep one backup: `save.reef.bak` (previous save)
- On load failure: attempt `save.reef.bak`, then start fresh with warning

## Import/Export

- Export: copy save file to user-chosen location via file dialog
- Import: validate schema version, replace current save, recalculate score

---

# 18. Performance Targets

- CPU: under 2% at idle, under 5% during discovery burst
- Memory: under 80 MB (Tauri is lighter than Electron)
- Frame rate: 24 FPS fixed (via `requestAnimationFrame` + timestamp gating)
- No per-frame allocations in render loop (pre-allocate sprite buffers)
- All sprites precomputed as string arrays at startup

---

# 19. Explicit Non-Goals (MVP)

- No productivity metrics
- No achievements or badges
- No settings UI (MVP — settings come in v2)
- No social systems, sharing, or leaderboards
- No collision avoidance between fish
- No physics engine
- No sound effects or audio output
- No Linux support (MVP — community can contribute)
- No localization

---

# 20. Future Considerations (Post-MVP)

These are not commitments. They are ideas worth preserving.

- Seasonal event creatures
- Tank themes / biomes
- Settings panel (opacity, position lock, input source toggles)
- Linux support via community contribution
- Export tank as ASCII art image
- Creature detail view (lore text, discovery date)

---

# End of Spec

Implementation may refine ASCII art, animation timing, or specific API calls if technical constraints require changes, but must preserve:

- Pure ASCII identity
- Ambient pacing
- Incremental pity system
- Collection-based scoring
- Minimal UI
- Open source ethos
