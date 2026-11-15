# Visual Layout Algorithm

This document describes the algorithm for displaying photos in the slideshow, including layout decisions, photo selection, and animation sequences.

## First Principles

1. **Visually interesting display** - The primary goal; the collage should be engaging
2. **No empty space** - Screen always filled, regardless of album size
3. **Pattern avoidance** - Top and bottom shelf should feel distinct, not mirrored
4. **No duplicates** (when possible) - With sufficient photos, each slot shows a unique image

---

## Display Modes

**Implementation:** `www/js/album-mode.mjs` (`resolveAlbumMode`, `getAlbumDuration`, `singlePanoramaPlan`, `minPhotosForMode`, `qualityForAlbum`, `getPrefetchLeadTime`), `www/js/filmstrip.mjs` (`computeFilmstripLayout`, `heroCountFor`, `nextOrder`, `groupPortraits`), `www/js/backdrop.mjs` (`backdropSize`, `createBackdropController`), `www/js/main.js` (`gridRenderer`, `singleRenderer`, `tinyRenderer`, `startAlbum()`, `rotateHero()`)

Every album is shown in one of three modes. The mode comes from the album's photo count and changes its layout, its swap behavior, its play time and its image quality. This section is a client-neutral spec: each rule gives its inputs, the formula or decision table, the config keys with their defaults (`www/js/config.mjs`) and the edge cases. The unit tests `test/unit/album-mode.test.mjs`, `test/unit/filmstrip.test.mjs` and `test/unit/backdrop.test.mjs` are the reference cases for the pure rules. Times are in milliseconds unless stated.

### Classification

Inputs: `serverCount`, the number of photos in the album response, and `loadedCount`, the number that loaded.

| Photos (`count`) | Mode |
|------------------|------|
| 0 | none: there is no album to show |
| 1 | `single` |
| 2 to `TINY_ALBUM_MAX` (10) | `tiny` |
| more than `TINY_ALBUM_MAX` | `grid` |

Decision for an album:

1. If `serverCount` classifies as `grid`, the mode is `grid`, even when only the first batch loaded.
2. Otherwise classify `loadedCount`. A 2-10 photo album where only one photo loaded therefore plays as `single`, and with none loaded there is no mode.

The default of 10 matches the grid's 2 rows x 5 columns = 10 slots, which would clone photos at that size.

### Play Time

| Mode | Play time |
|------|-----------|
| `grid` | `ALBUM_DURATION_MS` = 900000 (15 min) |
| `single` | `SINGLE_PHOTO_DURATION_MS` = 90000, or the panorama round trip below |
| `tiny` | `min(max(TINY_MIN_DURATION_MS, loadedCount x TINY_HERO_INTERVAL_MS x TINY_HERO_LAPS), ALBUM_DURATION_MS)`, with `TINY_MIN_DURATION_MS` = 120000, `TINY_HERO_INTERVAL_MS` = 20000 and `TINY_HERO_LAPS` = 1 |

At the defaults a tiny album of 2 to 6 photos plays 120000 (the floor wins, so 6 rotations), and one of 7 to 10 photos plays 140000 to 200000: each photo is the hero once (`TINY_HERO_LAPS` = 1). The end-of-album check runs on a tick, so a tiny album can overrun its end by up to one `TINY_HERO_INTERVAL_MS`.

The show timer ticks every `TINY_HERO_INTERVAL_MS` (20 s) in a tiny album and every `SWAP_INTERVAL` (10 s) in the others (`tickInterval(mode)`). The grid swap rate is unchanged, and a single photo has no rotation.

**Single-photo panorama.** A single photo whose aspect is above `PANORAMA_ASPECT_THRESHOLD` (2.0) and whose width at the hero height (H x aspect) is wider than the hero layer (W) pans. With `base` = `SINGLE_PHOTO_DURATION_MS`:

- the speed that makes one sweep take half of `base` is `wanted = (H x aspect - W) / (base / 2000)` px/s;
- `speed = min(wanted, SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC)` (40);
- one sweep takes `(H x aspect - W) / speed` seconds, and a round trip is two sweeps;
- play time = `min(max(base, round trip), ALBUM_DURATION_MS)`.

Example at 1920 x 1080: a 3:1 panorama overflows by 1320 px, so `wanted` is 29.3 px/s, under the cap, and it plays 90000. A 6:1 panorama overflows by 4560 px, so `wanted` is 101 px/s, capped at 40; a sweep takes 114 s and it plays 228000. A panorama that fits the width stays contain-fit and plays `base`. See [Single-photo panorama](#single-photo-panorama) for the pan itself.

### Prefetch and Transitions

The next album is prefetched once `lead` before the end, with `lead = min(PREFETCH_LEAD_TIME, play time - tick interval)`, where the tick interval is `TINY_HERO_INTERVAL_MS` for a tiny album and `SWAP_INTERVAL` otherwise. At the defaults that is 60000 for every mode, since 90 s and 100 s both exceed it.

| Next album's mode | Prefetch quality | Photos needed to transition seamlessly |
|-------------------|------------------|----------------------------------------|
| `single` | `FINAL_QUALITY` (XL) | 1 |
| `tiny` | `FINAL_QUALITY` (XL) | 1 |
| `grid` | `INITIAL_QUALITY` (M); upgraded after the swap-in | `min(MIN_PHOTOS_FOR_TRANSITION, serverCount)`, which is 15 at the defaults |

With fewer photos than needed, or an incomplete prefetch, the page reloads. The full rules are in [Album Transitions](#album-transitions).

### Single Photo: Fit and Backdrop

Inputs: the photo's aspect `a`, the hero layer W x H (CSS px) and `HERO_MARGIN_PX`.

- **Layer.** Single mode insets the viewport by `HERO_MARGIN_PX` (0) on every side. Tiny mode uses the full viewport.
- **Fit.** Contain: the whole photo, aspect kept, centred. A panorama is the exception (see above).
- **Backdrop.** A copy of the same loaded photo, drawn once and cached on the photo's box:
  - long edge `BACKDROP_SIZE_PX` (64); the short edge keeps the aspect and is at least 1 px;
  - filter `blur(BACKDROP_BLUR_PX px) brightness(BACKDROP_BRIGHTNESS) saturate(1.2)` (the saturation is fixed in code): blur 4 px, brightness 0.55;
  - shown stretched to cover the layer, behind the photo; two layers crossfade over `BACKDROP_FADE_MS` (800), changing opacity only;
  - without canvas `filter` support, the copy is drawn unfiltered and a black overlay at opacity `1 - BACKDROP_BRIGHTNESS` does the darkening;
  - `BACKDROP_ENABLED` = false, or a failed copy, gives a solid `#111` fill with no overlay.
- **Entrance** (not in album transitions). The backdrop crossfades first. Then the photo fades in over `SLIDE_IN_ANIMATION_DURATION` (800) and, if full animation is on, scales from 0.98 to 1. Full animation is off when `ENABLE_SHRINK_ANIMATION` is false or the user prefers reduced motion. In an album transition the content is already faded out, so there is no entrance; the fade-in waits for the backdrop.

The original-file upgrade for the single hero is described in [Single-photo panorama](#single-photo-panorama) (Original upgrade).

### Tiny Album: Filmstrip Geometry

Inputs: the viewport W x H, the hero's aspect and the strip's aspects in conveyor order. Pure geometry: `www/js/filmstrip.mjs`. Every rect is in integer px, and the unit tests assert that the hero and cells lie inside the viewport, that the hero and strip never overlap, and that the strip is centred.

1. **Position.** A hero with aspect below 1.0 (portrait) puts the strip on the `right`; otherwise it goes `below`.
2. **Strip and hero area.**
   - `below`: the strip is full width and `round(H x FILMSTRIP_HEIGHT_PCT / 100)` high (20%), at the bottom. The hero area is full width and `H - strip height - FILMSTRIP_GAP_PX` high.
   - `right`: the strip is full height and `round(W x FILMSTRIP_WIDTH_PCT / 100)` wide (16%), at the right edge. The hero area is `W - strip width - gap` wide and full height.
3. **Hero.** Contain-fit inside the hero area, rounded, centred.
   - **Pair of heroes.** Two portraits can share the hero area. The conveyor's first two photos form a pair when `TINY_PAIR_PORTRAITS` is on and both have aspect below 1.0 (same test as step 1); a portrait with a landscape never pairs.
   - **Fit test.** The pair's area is the `right` hero area, or the whole viewport when the album has exactly two photos (no strip). `pairH = min(area height, (area width - gap) / (a1 + a2))`. Each photo's single height is its contain-fit height in the same area. The pair is shown only if `pairH` is at least `TINY_PAIR_MIN_SCALE` (0.9) of both single heights; otherwise the hero is single.
   - **Layout.** The strip is on the right (none for exactly two photos). Both photos have height `pairH` (floored), widths `round(a x pairH)`, and `FILMSTRIP_GAP_PX` between them; the group is centred in the area. Integer px.
   - **Numbers.** At 1920x1080 the hero area is 1605x1080: two 2:3 photos give `pairH` 1080 (1448 px wide, 90% of the area), so they pair. At 1024x768 the area is 852x768 and two 2:3 photos fit at about 0.82 of their single height, so the hero stays single.
4. **Cells.** Each cell's length along the strip is a factor times the strip's cross size:
   - `below`: `min(a, FILMSTRIP_MAX_CELL_ASPECT)` times the strip height, where `a` is the cell's aspect;
   - `right`: `min(1 / a, FILMSTRIP_MAX_CELL_ASPECT)` times the strip width.

   Cells are separated by `FILMSTRIP_GAP_PX` (8) and centred along the strip. When they fit, they keep the strip's cross size. When they do not, every cell is scaled by one factor: `cross = floor((along - gaps) / sum of factors)`, and the cells are centred across the strip. The cap limits a very wide or tall cell to `FILMSTRIP_MAX_CELL_ASPECT` (2.0) times the strip size on its long axis.
5. **Empty strip.** With no cells, the strip has zero size on the bottom edge (`below`) or the right edge (`right`) and the hero area is the whole viewport. A tiny album has no cells only as a static pair (two portraits, see Conveyor and Timing) or for the moment before it collapses to single.

### Tiny Album: Conveyor and Timing

- **Order.** The order is the heroes first (one photo, or two for a pair), then the strip. Every `TINY_HERO_INTERVAL_MS` tick (20 s) rotates it left by the number of heroes shown, `k` (1 or 2): `new = old[k:] + old[:k]`. The next one or two photos become the heroes (the hero count is decided again for the new order, step 3) and the old heroes join the end of the strip. A pair leaves as a unit. Since the order rotates by exactly the photos shown, each photo is a hero once per lap of N photos shown, where N is the photo count.
- **Grouping.** With `TINY_PAIR_PORTRAITS` on, the album is reordered once when it loads (`groupPortraits`): portraits in adjacent pairs, one landscape between pairs while landscapes last, extra landscapes at the end, and a lone leftover portrait right after the last pair. Pairing is then decided greedily at each rotation from the cyclic order. In an album with an odd number of portraits and too few landscapes to separate them, the last portrait pairs with the first one across the end of the lap, so which photos pair changes from lap to lap; each photo is still shown equally often.
- **Start.** The album starts at a random hero unit: walk the grouped order with the same greedy pairing (`heroUnitStarts`) to get the index where each unit (single or pair) starts, and pick one of those at random. Starting at any other index could split a planned pair.
- **Static pair.** An album of exactly two portraits that pass the fit test is one pair over the whole viewport with no strip. It doesn't rotate for its whole play time.
- **Skipped ticks.** A rotation is skipped when the previous animation is still running or a new hero has not loaded. The album's play time does not change.
- **Rotation (full animation).** The new heroes grow from their cells to their hero rects over `SLIDE_IN_ANIMATION_DURATION` (800), on top. The strip moves, and the old heroes shrink into the end cells after the new ones have grown, so the hero area is always covered. A photo that is a hero both before and after (the lap-boundary pairing above) moves to its new hero rect with the old heroes, above them. The backdrop crossfades to the new left hero.
- **Relocation.** If the new heroes' strip side differs from the current one (a portrait hero or a pair puts it on the right, a single landscape below), the strip and the album name fade out over `TINY_RELOCATE_FADE_OUT_MS` (250), relay out, and fade in over `TINY_RELOCATE_FADE_IN_MS` (400).
- **Reduced motion or `ENABLE_SHRINK_ANIMATION` = false.** The new heroes crossfade in over the old ones (which stay in place until then) over `SLIDE_IN_ANIMATION_DURATION`, and the strip reorders instantly with no relocation fade.
- **Entrance.** The backdrop (from the left hero) comes up first. The heroes then fade in together over 800 ms, and each cell fades in (and, with full animation, slides in) starting at `SLIDE_IN_ANIMATION_DURATION + i x FILL_STAGGER_DELAY` (100) and taking 800 ms.
- **Resize.** The layout, including the hero count, is recomputed without animation, so a pair can become a single hero (its second photo moves to the front of the strip) or the reverse. During an animation the resize waits until the animation ends.

Single and tiny albums run the [Hero Watchdog](#hero-watchdog-single-and-tiny-albums), not the grid watchdog.

### Edge Cases

| Case | Result |
|------|--------|
| No photos loaded at a transition | Page reloads (once the server answers, see Safe reload) |
| No photos loaded at startup | Staging retries with backoff (`STAGE_RETRY_BASE_MS`, `STAGE_RETRY_MAX_MS`) |
| Tiny album with one of N photos loaded | Plays as `single` with that photo |
| Hero fails to load (single) | Reloaded once; a second failure, or no original path, ends the album early |
| Hero fails to load (tiny) | Rotates away at once; it then fails as a cell |
| One photo of a pair fails to load (tiny) | The pair rotates away at once as a unit; the failed photo then fails as a cell, the other stays in the album |
| One photo of a static pair fails to load | It leaves the album; the other is relaid out alone and the album then switches to single |
| Filmstrip cell fails to load (tiny) | Removed; the strip relays out without animation |
| Tiny album down to one photo | Single renderer, no fade; the backdrop stays up |
| Hero aspect below 1.0 | Strip on the right |
| Hero aspect of exactly 1.0 | Strip below (only aspects below 1.0 are portrait) |
| Two portraits at the conveyor front | Shown as a pair (step 3) if the fit test passes; the conveyor then rotates by two. Exactly two portraits in the album: a static pair over the full viewport, no strip, no rotation |
| Pair does not fit (for example two 2:3 photos at 1024x768) | Single hero; the first portrait is shown alone and the second stays in the strip |
| Resize changes the hero count | Relaid out without animation with the new count: the second photo of a pair moves to the front of the strip, or the first strip photo joins the hero as a pair |
| Original over the size caps, or its size unknown | Stays at XL |

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

### Single-photo panorama

A one-photo album whose photo is a panorama (aspect > `PANORAMA_ASPECT_THRESHOLD`) and whose height-bound width exceeds the hero area fills the hero height (minus `HERO_MARGIN_PX`) and pans with the same `panorama-pan` keyframes (transform only, no rAF), starting after the entrance animation. A panorama that fits the width stays contain-fit.

**Original upgrade (single mode only).** The XL thumbnail (about 1280 px) is soft when stretched across a 1080p screen, so with `HERO_USE_ORIGINAL` on and `shouldUseOriginal()` true (single mode, screen width x devicePixelRatio above `HERO_ORIGINAL_MIN_SCREEN_PX`), the renderer loads the original file in a detached `Image` after the entrance, awaits `img.decode()` (off the main thread, bounded by `IMAGE_PRELOAD_TIMEOUT`), then swaps the hero `src` in place and sets quality-level `original`. The XL stays on screen until then, so there is no blank frame. The original has the same aspect, so layout and a running panorama pan are untouched. The size is checked before the request: the album JSON carries each original's `Bytes`, `Width` and `Height` (read server-side from the file header, never decoded), and `originalAllowed()` skips the original unless `Bytes <= HERO_ORIGINAL_MAX_BYTES` and `Width * Height <= HERO_ORIGINAL_MAX_PIXELS`; missing fields skip it too (fail safe), so a huge scan is never downloaded. After the decode `originalFitsBudget()` re-checks the pixels as a second line of defence. A load or decode failure, a timeout, an original over either cap, a watchdog recovery in progress, or teardown (the render token changes) all keep the XL and drop the `Image`; a failed original is never flagged for watchdog recovery. Tiny albums stay at XL (up to 10 decoded originals could be about 1 GB).

`singlePanoramaPlan()` in `www/js/album-mode.mjs` (built on `panPlan()`, which the grid also uses) picks the pan: one sweep takes half of `SINGLE_PHOTO_DURATION_MS`, but never faster than `SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC`. If the cap leaves the sweep unfinished, `getAlbumDuration()` stretches that album's play time to one round trip, capped at `ALBUM_DURATION_MS`.

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

Albums of `TINY_ALBUM_MAX` (10) or fewer photos no longer use the grid: they use the tiny layout (see [Display Modes](#display-modes)). The rules below are for grid albums, which can still hold fewer loaded photos than slots (for example when some photos fail to load). In that case:
- All photos are displayed
- Age-based eviction doesn't apply (no off-screen pool)
- Layout still **evolves over time** via rearrangement
- Photos can swap positions or change configurations

---

## Swap Cycle

**Implementation:** `www/js/main.js:swap_random_photo()` (orchestrates entire swap cycle)

After initial display, photos swap every **10 seconds** (`SWAP_INTERVAL`, configurable). This applies to grid albums. A tiny album rotates its hero every `TINY_HERO_INTERVAL_MS` (20 s) instead, and a single photo does not swap (see [Display Modes](#display-modes)).

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
| `SWAP_INTERVAL` | 10000ms | Time between grid photo swaps |
| `TINY_HERO_INTERVAL_MS` | 20000ms | Time each photo stays the hero in a tiny album |
| `DIAG_INTERVAL_MS` | 60000ms | On-device diagnostics report interval and frame-timing window (only with server `DIAG_ENABLED`; see README) |
| `DIAG_ERROR_MIN_GAP_MS` | 5000ms | Minimum gap between immediate diagnostics error reports |
| `PANORAMA_ASPECT_THRESHOLD` | 2.0 | Aspect ratio for panorama detection |
| `PANORAMA_USE_PROBABILITY` | 0.5 | Chance to use available panorama |
| `PANORAMA_POSITION_LEFT_PROBABILITY` | 0.5 | Chance panorama appears on left |
| `PAN_SPEED_PX_PER_SEC` | 10 | Panorama pan animation speed |
| `SINGLE_PANORAMA_MAX_PAN_PX_PER_SEC` | 40 | Fastest pan of a single-photo panorama (px/s) |
| `HERO_USE_ORIGINAL` | true | Single-photo hero upgrades from XL to the original file |
| `HERO_ORIGINAL_MIN_SCREEN_PX` | 1600 | Upgrade only when screen width x devicePixelRatio is above this (px) |
| `HERO_ORIGINAL_MAX_PIXELS` | 24000000 | Never request an original with more pixels than this (stay at XL) |
| `HERO_ORIGINAL_MAX_BYTES` | 26214400 | Never request an original bigger than this many bytes (25 MB; stay at XL) |
| `ALBUM_DURATION_MS` | 900000ms | Grid album play time; the cap for tiny and single-panorama play time ([Display Modes](#display-modes)) |
| `SINGLE_PHOTO_DURATION_MS` | 90000ms | Single-photo album play time (longer for a slow-panning panorama) |
| `TINY_ALBUM_MAX` | 10 | Albums of 2 to this many photos are tiny; more is grid |
| `TINY_MIN_DURATION_MS` | 120000ms | Floor for tiny album play time |
| `TINY_HERO_LAPS` | 1 | Full rotations a tiny album gets; sets its play time when above the floor |
| `HERO_MARGIN_PX` | 0 | Safe margin around a single-photo hero (tiny albums use the full viewport) |
| `FILMSTRIP_HEIGHT_PCT` | 20 | Tiny album: strip height below the hero (% of viewport height) |
| `FILMSTRIP_WIDTH_PCT` | 16 | Tiny album: strip width beside a portrait hero (% of viewport width) |
| `FILMSTRIP_GAP_PX` | 8 | Gap between filmstrip cells, and between strip and hero (px) |
| `FILMSTRIP_MAX_CELL_ASPECT` | 2.0 | Cap on a cell's long axis, as a multiple of the strip size |
| `TINY_PAIR_PORTRAITS` | true | Tiny album: show two portraits side by side as the hero (strip on the side) |
| `TINY_PAIR_MIN_SCALE` | 0.9 | Pair only if each photo keeps at least this fraction of its single-hero height |
| `TINY_RELOCATE_FADE_OUT_MS` | 250 | Tiny album: the strip fades out before a rotation that moves it (below to right) |
| `TINY_RELOCATE_FADE_IN_MS` | 400 | ...then fades back in at its new side |
| `BACKDROP_ENABLED` | true | Blurred backdrop behind contain-fit photos (false: solid `#111`) |
| `BACKDROP_SIZE_PX` | 64 | Long edge of the downscaled backdrop copy (px) |
| `BACKDROP_BLUR_PX` | 4 | Blur radius of the backdrop copy (px) |
| `BACKDROP_BRIGHTNESS` | 0.55 | Backdrop darkening (1 = unchanged) |
| `BACKDROP_FADE_MS` | 800 | Backdrop crossfade duration (ms) |
| `FILL_RIGHT_TO_LEFT_PROBABILITY` | 0.5 | Probability to fill a grid row right to left |
| `INTER_ROW_DIFFER_PROBABILITY` | 0.7 | Probability to prefer a different pattern from the other grid row |
| `SHRINK_ANIMATION_DURATION` | 400ms | Phase A: crush duration |
| `SLIDE_IN_ANIMATION_DURATION` | 800ms | Phase B/C: fall and enter duration |
| `UPGRADE_BATCH_SIZE` | 5 | Photos per quality-upgrade batch |
| `UPGRADE_DELAY_MS` | 100ms | Delay between quality-upgrade batches |
| `UPGRADE_MAX_SWEEPS` | 3 | Extra upgrade scans after the first pass, for photos it missed (mid-swap, clones) |
| `ORIENTATION_MATCH_PROBABILITY` | 0.7 | Probability to match a photo's orientation to its container |
| `STACKED_LANDSCAPES_PROBABILITY` | 0.3 | Probability for stacked landscapes in 1-column slots |
| `PHASE_OVERLAP_DELAY` | 200ms | Delay before Phase C starts while Phase B animates |
| `FILL_STAGGER_DELAY` | 100ms | Stagger delay between fill-photo slide-in animations |
| `ENABLE_SHRINK_ANIMATION` | true | Set to false for low-powered devices (photos vanish instantly instead of shrinking) |
| `IMAGE_PRELOAD_TIMEOUT` | 30000ms | Timeout for image preloading |
| `PROGRESSIVE_LOADING_ENABLED` | true | Enable two-stage progressive loading |
| `INITIAL_BATCH_SIZE` | 15 | Photos to load in the first batch (fast display) |
| `INITIAL_QUALITY` | `'M'` | Initial thumbnail quality for grid albums (M = medium) |
| `FINAL_QUALITY` | `'XL'` | Final thumbnail quality after the upgrade; single and tiny albums load at this quality up front |
| `LOAD_BATCH_SIZE` | 5 | Photos per batch during initial load |
| `DEBUG_PROGRESSIVE_LOADING` | false | Enable console logging for progressive loading |

---

## Quality Upgrades (grid albums)

**Implementation:** `www/js/main.js:upgradePhotosInBatches()`

Grid albums load at `INITIAL_QUALITY` (M) and upgrade to `FINAL_QUALITY` (XL) in one background pass. Single and tiny albums load at final quality up front and never run it.

- **Scope**: boxes in `#photo_store`, `#top_row` and `#bottom_row`, so photos already on screen are upgraded too. The hero stage is not scanned.
- **Animations**: an upgrade never sets `src` during a swap animation. `animateSwap` calls `pauseUpgrades()`/`resumeUpgrades()`; an upgrade waits for the resume before it preloads and again before it sets `src`, instead of skipping.
- **Sweeps**: after the batches, the pass rescans (up to `UPGRADE_MAX_SWEEPS` times) for boxes it could not see, such as a photo that was inside a detached photo div mid-swap, or a clone.
- **Generation**: each pass and each album teardown bumps `upgradeGeneration`; a pass whose generation is stale, or a box no longer in the document, stops upgrading.
- **Clones**: `clonePhotoFromPage` copies `original-file-path` and `quality-level`, so clones upgrade like originals.
- **Load**: batches of `UPGRADE_BATCH_SIZE` with `UPGRADE_DELAY_MS` between, so at most 5 XL decodes run at once.

---

## Album Transitions

**Implementation:** `www/js/main.js:transitionToNextAlbum()` (transition orchestration), `prefetchNextAlbum()` (pre-fetch logic), `www/js/prefetch.mjs` (pure prefetch functions)

While individual photos swap every 10 seconds within the current album, the entire album refreshes to display a new random batch from a different folder. The play time depends on the mode: `ALBUM_DURATION_MS` (15 minutes) for grid albums, `SINGLE_PHOTO_DURATION_MS` (90 seconds; longer for a slow-panning single panorama, see [Single-photo panorama](#single-photo-panorama)) for single-photo albums, and a computed time for tiny albums (2 minutes at the defaults). The formulas are in [Display Modes](#display-modes). Because the shorter modes end sooner, they reach `FORCE_RELOAD_INTERVAL` sooner in wall-clock time.

### Transition Mechanism

**Old Behavior (pre-Phase 2):** Page reload caused a visible black screen flash during album transitions.

**New Behavior (Phase 2 implemented):** Seamless fade-out/fade-in transition with pre-fetching:

1. **Pre-fetch Phase** (triggered `min(PREFETCH_LEAD_TIME, play time - tick interval)` before the end: 1 minute at the defaults, for every mode):
   - Fetch next album data from `/album/35` endpoint
   - Preload images in background at the next album's quality: `FINAL_QUALITY` (XL) for single and tiny albums, `INITIAL_QUALITY` (M thumbnails) for grid albums
   - Create img_box elements (not yet in DOM)
   - Memory guard: skip prefetch if available heap < 100MB
   - AbortController: cancel stale prefetch requests

2. **Transition Phase** (when the current album's play time is up):
   - **Fade Out (1s)**: Both shelves fade to opacity 0 simultaneously
   - **Swap**: Clear old photos from DOM, move pre-fetched photos to photo_store
   - **Rebuild**: Call `build_row(row, skipAnimation=true)` — skips the row's own fade animations (parent already faded out)
   - **Update**: Album name display updated (using `.text()` for XSS protection)
   - **Ready**: Wait for the new album's renderer (a single photo's backdrop), at most `TRANSITION_READY_TIMEOUT_MS`
   - **Fade In (1s)**: Both shelves fade to opacity 1 with new photos
   - **Resume**: Start new shuffle cycle and background quality upgrades (the teardown has already stopped the old album's upgrade pass)

3. **Fallback Behavior**:
   - If prefetch fails or incomplete: fall back to `location.reload()`
   - If fewer photos loaded than the next album's mode needs (`minPhotosForMode` in `www/js/album-mode.mjs`: 1 for single and tiny albums, `min(MIN_PHOTOS_FOR_TRANSITION, album size)` for grid): use reload
   - If memory insufficient: skip prefetch, use reload
   - If `ALBUM_TRANSITION_ENABLED = false`: always use reload
   - Every 8 transitions: force full reload for memory hygiene

4. **Safe reload** (`www/js/safe-reload.mjs`): every reload in `main.js` goes through `safeReload()`. The display has no keyboard, and a reload into a dead server (a deploy restart, a NAS reboot) strands it on Chrome's error page. So `safeReload()` first sends `HEAD /` (same origin, `cache: 'no-store'`, aborted after `RELOAD_PROBE_TIMEOUT_MS`) and reloads only on a 2xx. A network error, a timeout or a 5xx defers the reload: the current page keeps running (the album past its end keeps ticking and retries its transition), and the probe repeats after `RELOAD_RETRY_BASE_MS`, doubling to `RELOAD_RETRY_MAX_MS`. One request is pending at a time. If a seamless transition succeeds while a reload waits, the reload is cancelled. The one exception is a render that throws mid-transition: the old album is already torn down, so its timers stop and the reload waits for the server. The routine reload is a JS timer (`PAGE_RELOAD_MS`, 20 min), not the meta refresh: a meta refresh cannot probe first, so `index.html` keeps one at 2 h only as a last resort for when JS has died.
### Design Rationale

**Why fade-out → fade-in instead of cross-fade?**

Albums are thematically cohesive batches representing a specific event or moment. Mixing old and new photos during a cross-fade would break this cohesion. The deliberate fade-out → fade-in sequence creates a clear "chapter break" between albums, signaling to the viewer that a new story is beginning.

**Why both shelves animate together?**

Unlike individual photo swaps (which target a single shelf), album transitions affect the entire display. Animating both shelves together reinforces that this is a different kind of event—a complete refresh rather than an incremental update.

### Configuration

Album transition behavior is controlled by constants in `www/js/config.mjs`:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `PREFETCH_LEAD_TIME` | 60000ms | Start pre-fetching the next album this long before the current one ends (clamped to play time minus the tick interval, see [Display Modes](#display-modes)) |
| `ALBUM_TRANSITION_ENABLED` | `true` | Enable seamless transitions (rollback flag) |
| `ALBUM_TRANSITION_FADE_DURATION` | 1000ms | Fade out/in duration |
| `TRANSITION_READY_TIMEOUT_MS` | 5000ms | Max wait for the new album's backdrop before fading in anyway |
| `STAGE_RETRY_BASE_MS` | 5000ms | First retry delay after a failed initial load; doubles each failure |
| `STAGE_RETRY_MAX_MS` | 60000ms | Cap for the initial-load retry backoff |
| `PREFETCH_MEMORY_THRESHOLD_MB` | 100 | Skip prefetch if available memory below threshold |
| `PAGE_RELOAD_MS` | 1200000ms | Reload the page this long after load, even mid-album (through the safe reload) |
| `RELOAD_PROBE_TIMEOUT_MS` | 5000ms | A reload first probes the server with `HEAD /`; the probe gives up after this long |
| `RELOAD_RETRY_BASE_MS` | 5000ms | Server not answering 2xx: first retry delay; doubles each failure |
| `RELOAD_RETRY_MAX_MS` | 60000ms | Cap for the reload retry backoff |
| `FORCE_RELOAD_INTERVAL` | 8 | Force full page reload every N transitions |
| `MIN_PHOTOS_FOR_TRANSITION` | 15 | Grid albums: photos loaded for a seamless transition (the whole album if it has fewer); single and tiny albums need 1 (`minPhotosForMode`) |

---

## Watchdog and Recovery System

**Implementation:** `www/js/main.js:startAnimationWatchdog()`

The grid watchdog runs every 3 seconds to monitor and recover from three failure scenarios that can cause empty/invisible cells to persist after photo swaps.

### Failure Scenarios

#### 1. Failed Image Loads

When an image fails to load (network error, missing file, etc.):

- **Trigger:** Image `onerror` event in `createImgBox()`
- **Detection:** Cell marked with `needs-recovery` timestamp
- **Recovery:** Cell is swapped for a new photo from the store
- **Timing:** 500ms grace period before recovery (allows time for browser retry)
- **Implementation:** `.one()` handler fires only once, preventing handler accumulation

```javascript
// In createImgBox()
$img.one('error', function() {
    var $photo = $(this).closest('.photo');
    if ($photo.length && $photo.parents('#top_row, #bottom_row').length) {
        $photo.data('needs-recovery', Date.now());
    } else if ($(this).closest('#hero_stage').length) {
        // Hero watchdog (below): the flag goes on the img_box
        $(this).closest('.img_box').data('needs-recovery', Date.now());
    }
});

// In watchdog
if (needsRecovery && (now - needsRecovery) > WATCHDOG_LOAD_ERROR_DELAY_MS) {
    // Swap this cell for a new photo
    _.delay(swapSinglePhoto, WATCHDOG_SWAP_DEFER_MS);
}
```

#### 2. Missing or Broken Images

When a cell has no `<img>` element or an empty `src` attribute (e.g., after a broken animation chain or DOM manipulation error):

- **Trigger:** DOM inspection in watchdog loop
- **Detection:** Cell with no `img` child, or `img` with empty/missing `src`, tracked via `empty-since` timestamp
- **Recovery:** Cell is marked as oldest (`display_time = 0`) and a swap is deferred
- **Threshold:** Same calculated threshold as stuck-invisible cells

```javascript
var $img = $photo.find('img');
if ($img.length === 0 || (!$img.attr('src') || $img.attr('src') === '')) {
    if (now - emptyStuckSince > STUCK_THRESHOLD_MS) {
        $photo.data('display_time', 0);
        _.delay(swapSinglePhoto, WATCHDOG_SWAP_DEFER_MS);
    }
}
```

#### 3. Stuck-Invisible Cells

When CSS animation state becomes inconsistent (opacity:0 or visibility:hidden persisting after animation should have completed):

- **Trigger:** CSS inspection in watchdog loop
- **Detection:** Cell with `visibility: hidden` or `opacity < 0.01` for longer than the calculated threshold
- **Recovery:** Strip all animation classes (CSS `animation-fill-mode: forwards` overrides inline styles), then clear inline CSS and custom properties to restore visibility
- **Threshold:** Calculated from animation configuration (not hardcoded)

```javascript
// stuckThresholdMs(cfg) in www/js/watchdog.mjs (5 = most fill photos one swap staggers in)
var maxAnimationTime = (5 - 1) * FILL_STAGGER_DELAY + SLIDE_IN_ANIMATION_DURATION;
var STUCK_THRESHOLD_MS = maxAnimationTime + WATCHDOG_STUCK_GRACE_PERIOD_MS;

// Later in watchdog
if (isHidden || isOpaque) {
    if (now - stuckSince > STUCK_THRESHOLD_MS) {
        // Strip animation classes first (they override inline styles via fill-mode)
        $photo.removeClass(ANIMATION_CLASSES.join(' '));
        $photo.css({
            visibility: 'visible', opacity: '', transform: '',
            'animation-delay': '', animation: ''
        });
        el.style.removeProperty('--gravity-offset');
        el.style.removeProperty('--bounce-sign');
    }
}
```

### Hero Watchdog (single and tiny albums)

**Implementation:** `www/js/main.js:startHeroWatchdog()`, `checkSingleHero()`, `checkTiny()`; pure checks in `www/js/watchdog.mjs`

Single and tiny albums have no grid cells, so their renderers start the hero watchdog instead of the grid one. It runs every `WATCHDOG_INTERVAL_MS` over the img_boxes in `#hero_stage` and uses the same stuck threshold. The `createImgBox()` error handler sets `needs-recovery` on the img_box when the image is in `#hero_stage`. A photo needs recovery when that flag is older than `WATCHDOG_LOAD_ERROR_DELAY_MS`, or its img has had no `src` or `naturalWidth` 0 for longer than the stuck threshold.

- **Single:** the hero is reloaded once per album: `preloadImage()` with the XL thumbnail and the original as fallback, and the `src` is swapped only once that has loaded. If the reload fails, the hero fails again, or the photo has no original path to fall back on, the album ends early through `transitionToNextAlbum()`, which reloads the page if no prefetch is ready.
- **Tiny:** a failed hero (either photo of a pair) triggers `rotateHero()` at once, which rotates the whole unit away; the failed photo then fails as a filmstrip cell. In a static pair there is nothing to rotate to: the failed photo leaves the album and the other is relaid out alone. A failed filmstrip cell leaves the album and the strip relays out without animation. With one photo left, the next tick tears down the tiny layout and renders that photo with the single renderer, with no fade (the backdrop stays up). Nothing is checked while a tiny entrance or rotation animates.
- **Stuck-invisible:** a hero or filmstrip photo with `opacity < 0.01` or `visibility: hidden` for longer than the threshold gets its inline `opacity`, `visibility`, `transform`, `transition`, `transform-origin` and `z-index` cleared. A single panorama keeps its `.hero-pan`/`.hero-pan-run` classes and `--pan-*` properties, so it keeps panning.

`clearAllPendingTimers()` and the single and tiny teardowns stop the hero watchdog.

### Configurable Timing

All watchdog constants are exported from `www/js/config.mjs` and can be adjusted for different devices:

| Constant | Default | Purpose |
|----------|---------|---------|
| `WATCHDOG_INTERVAL_MS` | 3000 | Watchdog scan frequency (ms) |
| `WATCHDOG_STUCK_GRACE_PERIOD_MS` | 1000 | Grace period before marking as stuck (ms) |
| `WATCHDOG_LOAD_ERROR_DELAY_MS` | 500 | Delay before recovering failed loads (ms) |
| `WATCHDOG_SWAP_DEFER_MS` | 100 | Deferral time for swap queueing (ms) |

For slower devices (such as a Raspberry Pi Zero), these can be increased to reduce false positives. For faster devices, they can be decreased for quicker recovery.

### Memory Management

The watchdog prevents memory leaks through:

1. **Event Handler Cleanup** - `.one()` handler fires only once:
   - Prevents multiple handlers from accumulating on same image
   - Unlike `.on()`, doesn't require manual `.off()` to clean up

2. **Interval Lifecycle** - Watchdog interval is cleared on page transitions:
   - `clearAllPendingTimers()` clears `watchdogInterval` on album transition, and the new album's grid render starts it again
   - Prevents ghost intervals running with stale DOM references
   - Prevents cascading intervals from accumulating over time

3. **Orphan DOM Return** - Unused img_box elements returned to photo_store:
   - `animateSwap()` guard clause returns orphaned img_box if swap has nothing to remove
   - Prevents DOM elements from leaking out of the store management system

4. **Race Condition Prevention** - Recovery swaps are deferred:
   - `_.delay(swapSinglePhoto, 100)` prevents watchdog from triggering swap during animation
   - Animation cleanup has time to complete before swap begins
   - Avoids concurrent DOM mutations that could cause visual glitches

### Error Logging

- **Production mode** - Watchdog logs via `debugLog()`, respecting `DEBUG_PROGRESSIVE_LOADING` flag
- **Development mode** - Set `DEBUG_PROGRESSIVE_LOADING: true` in `config.mjs` to see watchdog activity in console

---

## Future Enhancements

1. **Phase overlap**: Start fall animation while crush is still in progress
2. **Independent stacked swaps**: Swap individual photos in stacked cells (currently stacked cells aren't handled independently)
3. **Vertical gravity for stacked**: As described above, not yet implemented
4. **Adaptive timing**: Adjust animation speeds based on device performance
