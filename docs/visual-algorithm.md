# Visual Layout Algorithm

This document describes the algorithm for displaying photos in the slideshow, including layout decisions, photo selection, and animation sequences.

## First Principles

1. **Visually interesting display** - The primary goal; the collage should be engaging
2. **No empty space** - Screen always filled, regardless of album size
3. **Pattern avoidance** - Top and bottom shelf should feel distinct, not mirrored
4. **No duplicates** (when possible) - With sufficient photos, each slot shows a unique image

---

## Layout Structure

### Screen Composition

The screen is divided into two independent rows called **shelves**:

```
┌─────────────────────────────────────────────────────────┐
│                      TOP SHELF                          │
├─────────────────────────────────────────────────────────┤
│                     BOTTOM SHELF                        │
└─────────────────────────────────────────────────────────┘
```

### Cells

Each shelf is divided horizontally into **cells**. For a 1080p display, there are typically **5 cells** per shelf:

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│  Cell 1 │  Cell 2 │  Cell 3 │  Cell 4 │  Cell 5 │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

Cells are the basic allocation unit for photos.

---

## Cell Configurations

**Implementation:** `www/js/photo-store.mjs:createStackedLandscapes()` (stacked creation), `fillRemainingSpace()` (space management), `makeSpaceForPhoto()` (cell allocation)

A cell can hold photos in different configurations:

### Portrait (1 cell, 1 photo)

```
┌─────────┐
│  ┌───┐  │
│  │   │  │
│  │ P │  │
│  │   │  │
│  └───┘  │
└─────────┘
```

### Stacked Landscapes (1 cell, 2 photos)

Two landscape photos stacked vertically within a single cell:

```
┌─────────┐
│ ┌─────┐ │
│ │ L1  │ │
│ └─────┘ │
│ ┌─────┐ │
│ │ L2  │ │
│ └─────┘ │
└─────────┘
```

### Landscape (2 cells, 1 photo)

```
┌─────────┬─────────┐
│                   │
│         L         │
│                   │
└─────────┴─────────┘
```

### Panorama (3+ cells, 1 photo)

Panoramas span 3 or more cells but **never the entire shelf**. At least 1-2 cells are reserved for other photos:

```
┌─────────┬─────────┬─────────┬─────────┬─────────┐
│                             │  ┌───┐  │  ┌───┐  │
│        PANORAMA             │  │ P │  │  │ P │  │
│                             │  └───┘  │  └───┘  │
└─────────┴─────────┴─────────┴─────────┴─────────┘
```

---

## Configuration Summary

| Config | Cells Used | Photos | Orientation |
|--------|------------|--------|-------------|
| Portrait | 1 | 1 | Portrait |
| Stacked | 1 | 2 | 2 Landscapes |
| Landscape | 2 | 1 | Landscape |
| Panorama | 3+ | 1 | Panoramic (aspect > 2.0) |

### Photo Capacity

A 5-cell shelf can hold anywhere from **1 photo** (panorama) to **10 photos** (all stacked landscapes).

---

## Panorama Behavior

**Implementation:** `www/js/photo-store.mjs:calculatePanoramaColumns()` (column calculation), `www/js/main.js` (pan animation setup)

Panoramas have special handling:

1. **Detection**: Aspect ratio > 2.0
2. **Column calculation**: Based on aspect ratio, clamped to `max(2, min(needed, totalColumns - 1))`
3. **Never full width**: Always leaves room for 1+ portrait
4. **Overflow**: Intentionally exceeds visible container width
5. **Pan animation**: Slowly pans right-to-left and back (10px/sec default)
6. **Position randomization**: Can appear on left or right side of shelf

### Panorama with Other Photos

```
Left position:                      Right position:
┌───────────────────┬─────┬─────┐   ┌─────┬─────┬───────────────────┐
│                   │     │     │   │     │     │                   │
│     PANORAMA      │  P  │  P  │   │  P  │  P  │     PANORAMA      │
│                   │     │     │   │     │     │                   │
└───────────────────┴─────┴─────┘   └─────┴─────┴───────────────────┘
```

---

## Photo Selection Algorithm

**Implementation:** `www/js/photo-store.mjs:selectPhotoToReplace()` (on-screen selection), `selectRandomPhotoFromStore()` (off-screen selection), `selectPhotoForContainer()` (orientation matching)

### Weighting System

Two separate pools with independent weighting:

#### On-Screen Photos
- Weight increases with **display time**
- Older photos have higher eviction priority
- Ensures no photo stays indefinitely

#### Off-Screen Photos
- Weight increases with **time since last shown**
- Photos not shown recently have higher selection priority
- Ensures fair rotation through the album

### Small Album Handling

When the album has fewer photos than available slots:
- All photos are displayed
- Age-based eviction doesn't apply (no off-screen pool)
- Layout still **evolves over time** via rearrangement
- Photos can swap positions or change configurations

---

## Swap Cycle

**Implementation:** `www/js/main.js:swap_random_photo()` (orchestrates entire swap cycle)

After initial display, photos swap every **10 seconds** (configurable).

### Swap Sequence

1. **Select eviction target**: Choose on-screen photo based on age weighting
2. **Select replacement**: Choose off-screen photo based on recency weighting
3. **Layout decision**: Determine if configuration changes (e.g., landscape → 2 portraits)
4. **Animate**: Execute gravity-based animation on the target shelf only

### Layout Evolution

The layout mutates over time based on incoming photo orientations:

```
Initial:     [P] [P] [  L  ] [P]

After swap:  [P] [  L  ] [P] [P]     ← Landscape moved, portrait added

After swap:  [P] [L1] [P] [P]        ← Landscape became stacked
                [L2]
```

---

## Animation System

**Implementation:** `www/js/main.js:animateSwap()` (orchestrates all three phases), `animatePhaseA()`, `animatePhaseB()`, `animatePhaseC()` (individual phases)

The animation system is physics-based, using the concept of **gravity**.

### Gravity Direction

Each swap randomly selects a gravity direction: **left** or **right**.

- Photos "fall" toward the gravity direction
- New photos enter from the **opposite** edge
- Creates natural, fluid motion

### Animation Phases

#### Phase 1: Crush

The outgoing photo(s) shrink toward the gravity direction:

```
Gravity = RIGHT

Before:     [A] [B] [C] [D] [E]
                     ↑
                  removing C

Crushing:   [A] [B] [→] [D] [E]     ← C shrinks toward right
```

#### Phase 2: Fall

Remaining photos slide toward gravity, gap migrates opposite:

```
After crush: [A] [B] [_] [D] [E]     ← Gap where C was

Falling:     [_] [A] [B] [D] [E]     ← A, B slide right toward gravity
                                       Gap now on left edge
```

#### Phase 3: Enter

New photo slides in from the opposite edge and bounces into place:

```
Entering:    [F] [A] [B] [D] [E]     ← F slides in from left
              ↑
           bounces into place
```

### Complete Animation Sequence (Gravity = Right)

```
Step 0:     [A] [B] [C] [D] [E]     Initial state, removing C

Step 1:     [A] [B] [→] [D] [E]     C crushes toward right edge

Step 2:     [A] [B] [_] [D] [E]     C fully removed, gap exists

Step 3:     [_] [A] [B] [D] [E]     A, B fall right, gap migrates left

Step 4:     [F→][A] [B] [D] [E]     F enters from left

Step 5:     [F] [A] [B] [D] [E]     F bounces, settles in place
```

### Phase Timing

**Current implementation**: Phases are sequential (crush completes, then fall begins)

**Potential optimization**: Overlap phases so neighbors start falling while removal is still crushing, creating more fluid physics.

---

## Multi-Photo Swaps

When replacing multiple photos (e.g., 2 portraits → 1 landscape):

1. All removed photos crush **within their respective frames**
2. Each crushes toward the gravity point simultaneously
3. After crush completes, remaining photos fall
4. New photo(s) enter with independent animations

```
Replacing B and C with landscape L:

Step 0:     [A] [B] [C] [D] [E]     Removing B and C

Step 1:     [A] [→] [→] [D] [E]     B and C crush toward right

Step 2:     [_] [_] [A] [D] [E]     Gap on left (2 cells)

Step 3:     [   L   ] [A] [D] [E]   Landscape L enters from left
```

---

## Stacked Photo Animation

**Implementation:** Future work (Phase 5) - CSS keyframes `slide-in-from-top/bottom` exist, JS integration pending

For stacked landscapes (2 photos in 1 cell), vertical gravity applies:

### Top Shelf Stacked

- Gravity pulls **down**
- New photos enter from **top** of screen
- New photo ends up in **top** position

```
Removing L2 from top shelf:

Before:     [L1]     ← top position
            [L2]     ← bottom position (removing)

Crush:      [L1]
            [↓ ]     ← L2 crushes downward

Fall:       [  ]     ← L1 falls down
            [L1]

Enter:      [L3]     ← L3 enters from top screen edge
            [L1]     ← L3 ends up on top
```

### Bottom Shelf Stacked

- Gravity pulls **up**
- New photos enter from **bottom** of screen
- New photo ends up in **bottom** position

```
Removing L2 from bottom shelf:

Before:     [L1]     ← top position (removing)
            [L2]     ← bottom position

Crush:      [↑ ]     ← L1 crushes upward
            [L2]

Fall:       [L2]     ← L2 falls up
            [  ]

Enter:      [L2]
            [L3]     ← L3 enters from bottom screen edge
```

### Key Constraint

New photos always enter from the **nearest screen edge** to their shelf:
- Top shelf → photos enter from top of screen
- Bottom shelf → photos enter from bottom of screen

This ensures new photos **never cross over the other shelf**.

---

## Cross-Shelf Independence

The two shelves animate independently:

- Each swap targets a **single shelf** (determined by which photo is selected for eviction)
- The other shelf remains static during the animation
- Shelves can have different gravity directions
- This creates visual variety and avoids synchronized patterns

---

## Configuration Parameters

Current configurable values (in `www/js/config.mjs`):

| Parameter | Default | Description |
|-----------|---------|-------------|
| `SWAP_INTERVAL` | 10000ms | Time between swaps |
| `PANORAMA_ASPECT_THRESHOLD` | 2.0 | Aspect ratio for panorama detection |
| `PANORAMA_USE_PROBABILITY` | 0.5 | Chance to use available panorama |
| `PANORAMA_POSITION_LEFT_PROBABILITY` | 0.5 | Chance panorama appears on left |
| `PAN_SPEED_PX_PER_SEC` | 10 | Panorama pan animation speed |
| `SHRINK_ANIMATION_DURATION` | 400ms | Phase A: crush duration |
| `SLIDE_IN_ANIMATION_DURATION` | 800ms | Phase B/C: fall and enter duration |

---

## Album Transitions

**Implementation:** `www/js/main.js:transitionToNextAlbum()` (transition orchestration), `prefetchNextAlbum()` (pre-fetch logic), `www/js/prefetch.mjs` (pure prefetch functions)

While individual photos swap every 10 seconds within the current album, the entire album refreshes every 15 minutes to display a new random batch from a different folder.

### Transition Mechanism

**Old Behavior (pre-Phase 2):** Page reload caused a visible black screen flash during album transitions.

**New Behavior (Phase 2 implemented):** Seamless fade-out/fade-in transition with pre-fetching:

1. **Pre-fetch Phase** (triggered 1 minute before transition):
   - Fetch next album data from `/album/25` endpoint
   - Preload images in background using initial quality (M thumbnails)
   - Create img_box elements (not yet in DOM)
   - Memory guard: skip prefetch if available heap < 100MB
   - AbortController: cancel stale prefetch requests

2. **Transition Phase** (at 15-minute mark):
   - **Fade Out (1s)**: Both shelves fade to opacity 0 simultaneously
   - **Swap**: Clear old photos from DOM, move pre-fetched photos to photo_store
   - **Rebuild**: Call `build_row()` for top and bottom shelves with new album
   - **Update**: Album name display updated (using `.text()` for XSS protection)
   - **Fade In (1s)**: Both shelves fade to opacity 1 with new photos
   - **Resume**: Start new shuffle cycle and background quality upgrades

3. **Fallback Behavior**:
   - If prefetch fails or incomplete: fall back to `location.reload()`
   - If memory insufficient: skip prefetch, use reload
   - If `ALBUM_TRANSITION_ENABLED = false`: always use reload
   - Every 8 transitions: force full reload for memory hygiene

### Design Rationale

**Why fade-out → fade-in instead of cross-fade?**

Albums are thematically cohesive batches representing a specific event or moment. Mixing old and new photos during a cross-fade would break this cohesion. The deliberate fade-out → fade-in sequence creates a clear "chapter break" between albums, signaling to the viewer that a new story is beginning.

**Why both shelves animate together?**

Unlike individual photo swaps (which target a single shelf), album transitions affect the entire display. Animating both shelves together reinforces that this is a different kind of event—a complete refresh rather than an incremental update.

### Configuration

Album transition behavior is controlled by constants in `www/js/config.mjs`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PREFETCH_LEAD_TIME` | 60000ms | Start pre-fetching next album 1 minute before transition |
| `ALBUM_TRANSITION_ENABLED` | `true` | Enable seamless transitions (rollback flag) |
| `ALBUM_TRANSITION_FADE_DURATION` | 1000ms | Fade out/in duration |
| `PREFETCH_MEMORY_THRESHOLD_MB` | 100 | Skip prefetch if available memory below threshold |
| `FORCE_RELOAD_INTERVAL` | 8 | Force full page reload every N transitions |
| `MIN_PHOTOS_FOR_TRANSITION` | 15 | Minimum photos required for seamless transition |

---

## Future Enhancements

1. **Phase overlap**: Start fall animation while crush is still in progress
2. **Independent stacked swaps**: Swap individual photos in stacked cells (currently stacked cells aren't handled independently)
3. **Vertical gravity for stacked**: As described above, not yet implemented
4. **Adaptive timing**: Adjust animation speeds based on device performance
