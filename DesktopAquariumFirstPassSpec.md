# ASCII Reef  
## Full Design Specification  
Version 1.0  
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

Score derives strictly from owned creatures.

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
   Score recalculated from owned fish.

5. Lightweight Overlay  
   Low CPU, frame capped, translucent, draggable.

---

# 3. Platform Requirements

- Windows
- macOS

Overlay must support:
- Transparent background
- Always-on-top
- Click-through mode
- Dragging while hovering
- Close button visible only on hover
- Frame cap 20–30 FPS

---

# 4. Rendering Model

## Font

- Bundled monospaced font required.
- All glyphs must render at equal width.
- Avoid characters that break alignment across platforms.

## Grid

- Fixed character grid layout.
- All sprites are prebuilt fixed-width strings.
- Movement occurs in whole character increments.

## Background

- Fully transparent window.
- Only glyphs visible.
- Water pattern uses:
  ```
  ~  .  °  o
  ```

## Environment Base

Bottom of tank includes:

```
__________________________
  ^   ^    ^   ^    ^   ^
```

Rock line fixed near bottom.
Kelp and coral anchored to bottom.

---

# 5. Input and Energy System

## Energy Sources

Typing:
- +1 energy per 12 keystrokes

Click:
- +1 energy per 8 clicks

Audio:
- +1 energy per 3 seconds of active playback

Only counts. Never store actual key values.

## Discovery Meter

- Shared meter
- Threshold: 40 energy
- On threshold reached:
  - Trigger Discovery Event
  - Reset meter to 0

No overflow carry in MVP.

Expected cadence:
- Moderate activity: 1 discovery every 5–8 minutes
- Heavy activity: 1 discovery every 3–5 minutes

---

# 6. Rarity System

## Distribution Targets

- Common: 60%
- Uncommon: 25%
- Rare: 10%
- Epic: 4%
- Legendary: 1%

## Roll Order

1. Legendary
2. Epic
3. Rare
4. Uncommon
5. Default Common

Each rarity tier maintains independent pity counter.

## Incremental Pity Mechanic

Example: Rare (target 1/10)

- Start at 1/20
- On miss: numerator += 1
- Cap at 4/20
- On success: reset to 1/20

All pity counters stored in save file.

---

# 7. Score System

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

---

# 8. Tank Display System

## Ownership

Fish are permanently owned once discovered.
Duplicates increase count.

## Display Rules

Tank shows rotating subset of owned fish.

- Hard cap: 12 visible
- Soft target: 9 visible average

## Spawn Cycle

Every 6–10 seconds:
- If visible < 9:
  - Select fish from owned pool
  - Weighted by rarity

Visual weight:

- Common: 6
- Uncommon: 3
- Rare: 1.5
- Epic: 0.5
- Legendary: 0.1

## Lifetime

- 20–40 seconds per fish
- Drift across tank horizontally
- Minor vertical sine offset

## Discovery Burst

On discovery:
- Immediate spawn
- Temporary cap increase to 12
- ASCII ripple:

```
~~~~~((((())))))~~~~~
```

---

# 9. Creature Categories and Movement

## A. Standard Swimmers

- Horizontal drift
- 2-frame tail flick
- Minor vertical oscillation

Example animation:

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

- Constrained to bottom third
- Crawl horizontally
- 2-frame leg tick
- Cannot render below rock line

## C. Floaters

Examples: Jellyfish, Octopus

- Slow vertical oscillation
- Independent tentacle animation
- Lower horizontal speed

## D. Heavy Entities

- Larger width
- Slower
- Render above normal swimmers

---

# 10. Environment Elements

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

Slow 4-second sway loop.

## Coral

```
  _-_
 /   \
 \_-_/
```

Static only.

## Bubble Column

```
  o
   O
    °
```

Ambient.

---

# 11. Creature Roster Structure

Total MVP creatures: 75  
3 Pools: Typing, Click, Audio  
25 each.

Each pool:
- 12 Common
- 6 Uncommon
- 4 Rare
- 2 Epic
- 1 Legendary

All sprites:
- Max width: 18 chars
- Max height: 6 lines
- Width constant across animation frames

Claude may refine ASCII sprites if:
- Silhouette clarity can be improved
- Character economy can be reduced
- Animation can be simplified
- Cross-platform rendering issues occur

---

# 12. Color System

Per-character tinting.

Rarity colors:

- Common: #E0E0E0
- Uncommon: #7FE0FF
- Rare: #4FA3FF
- Epic: #C36BFF
- Legendary: #FFD84F

Environment:
- Kelp: green
- Rock: dark gray
- Coral: muted pink
- Water glyphs: soft blue tint

If per-character tinting causes performance or rendering instability:  
Fallback:
- Monochrome sprites
- Colored rarity text only

---

# 13. Hover Behavior

Default:
- Fully translucent.
- Click-through enabled.

On hover anywhere in tank:
- Slight brightness increase.
- Dragging enabled.
- Close button appears top right:

```
[X]
```

Close button visible only while hovering.

If click-through conflicts with hover detection on macOS:  
Priority:
1. Click-through by default
2. Drag only when click-through temporarily disabled  
Implementation may adjust to satisfy OS constraints.

---

# 14. Save System

File type: `.reef`  
Format: JSON  
Versioned schema.

## Structure

```json
{
  "meta": {},
  "collection": {},
  "progression": {},
  "tank": {}
}
```

Includes:
- Owned fish with counts
- Pity counters
- Energy meters
- Display preferences

Score is not authoritative in file.
Recalculate on load.

## Import

- Validate schema
- Replace current tank
- Preserve pity + meters
- Recalculate score

## Export

- Serialize to file
- Optional ASCII screenshot

---

# 15. Performance Targets

- CPU under 2% idle
- Memory under 150 MB
- Frame cap 20–30 FPS
- No per-frame allocations
- All sprites precomputed in memory

---

# 16. Technical Recommendations

Preferred starting engine: Godot (2D).

If implementation finds:
- macOS accessibility APIs conflict
- Transparent overlay behavior unstable
- Performance insufficient

It may recommend:
- Native Rust + wgpu
- Native macOS + Windows wrappers

Input monitoring:
- Count only
- No keystroke storage
- Clear onboarding permission notice required

Audio:
- Detect playback state only
- No metadata

---

# 17. Explicit Non-Goals

- No productivity metrics
- No achievements
- No UI panels
- No social systems in MVP
- No collision avoidance system
- No physics engine

---

# End of Spec

Implementation may refine ASCII art, animation timing, or engine choice if technical constraints require changes, but must preserve:

- Pure ASCII identity
- Ambient pacing
- Incremental pity system
- Collection-based scoring
- Minimal UI
