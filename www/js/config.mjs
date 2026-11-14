/**
 * Shared configuration constants for the slideshow application.
 * These values are used by both the frontend (www/js/main.js) and tests.
 *
 * IMPORTANT: When modifying these values, both the browser code and tests
 * will automatically use the updated values.
 */

// Swap timing
export const SWAP_INTERVAL = 10 * 1000;  // Swap one photo every 10 seconds

// Panorama configuration
export const PANORAMA_ASPECT_THRESHOLD = 2.0;     // Aspect ratio above which image is considered panorama
export const PANORAMA_USE_PROBABILITY = 0.5;      // Chance to use panorama when available
export const PANORAMA_STEAL_PROBABILITY = 0.5;    // Chance to steal panorama from other row
export const PANORAMA_POSITION_LEFT_PROBABILITY = 0.5;  // Chance to place panorama on left vs right
export const PAN_SPEED_PX_PER_SEC = 10;           // Animation pan speed in pixels per second

// Layout variety probabilities
export const ORIENTATION_MATCH_PROBABILITY = 0.7;       // Probability to prefer matching orientation
export const FILL_RIGHT_TO_LEFT_PROBABILITY = 0.5;      // Probability to fill row right-to-left
export const INTER_ROW_DIFFER_PROBABILITY = 0.7;        // Probability to prefer different pattern from other row
export const STACKED_LANDSCAPES_PROBABILITY = 0.3;      // Probability to use stacked landscapes for 1-col slots

// Animation configuration - Three-phase swap animation
export const SHRINK_ANIMATION_DURATION = 400;     // Phase A: Shrink-to-corner duration (ms)
export const SLIDE_IN_ANIMATION_DURATION = 800;   // Phase B & C: Gravity fill and slide-in with bounce (ms)
export const PHASE_OVERLAP_DELAY = 200;           // Delay before starting next phase while previous animates (ms)
export const FILL_STAGGER_DELAY = 100;           // Stagger delay between fill photo slide-in animations (ms)

// Progressive enhancement: full shrink animation vs instant vanish
// Set to false for low-powered devices (older Raspberry Pis)
export const ENABLE_SHRINK_ANIMATION = true;

// Image loading
export const IMAGE_PRELOAD_TIMEOUT = 30000;       // 30 seconds

// Progressive loading configuration
// Enables two-stage loading: fast M thumbnails first, then XL upgrades in background
export const PROGRESSIVE_LOADING_ENABLED = true;  // Set to false for original XL-only behavior
export const INITIAL_BATCH_SIZE = 15;             // First batch of photos to load (fast display)
export const INITIAL_QUALITY = 'M';               // Initial thumbnail quality (M = medium, faster)
export const FINAL_QUALITY = 'XL';                // Final thumbnail quality (XL = extra large)
export const UPGRADE_BATCH_SIZE = 5;              // Photos to upgrade per batch (prevents CPU spikes)
export const UPGRADE_DELAY_MS = 100;              // Delay between upgrade batches (ms)
export const LOAD_BATCH_SIZE = 5;                 // Photos to load per batch during initial load
export const DEBUG_PROGRESSIVE_LOADING = false;   // Set to true to enable console logging for progressive loading

// Album transition configuration
// Enables seamless album transitions without black screen flash via pre-fetching
export const PREFETCH_LEAD_TIME = 60000;          // Start pre-fetching next album 1 minute before transition (ms)
export const ALBUM_TRANSITION_ENABLED = true;     // Enable seamless transitions (set false to fallback to location.reload)
export const ALBUM_TRANSITION_FADE_DURATION = 1000; // Fade out/in duration for album transitions (ms)
export const STAGE_RETRY_BASE_MS = 5000;  // First retry delay after a failed initial load; doubles each failure (ms)
export const STAGE_RETRY_MAX_MS = 60000;  // Cap for the stage retry backoff (ms)
export const TRANSITION_READY_TIMEOUT_MS = 5000;  // Max wait for the new album's renderer (e.g. backdrop) before fading in anyway (ms)
export const PREFETCH_MEMORY_THRESHOLD_MB = 100;  // Skip prefetch if available memory < 100MB (requires Chrome/Edge; fallback: always prefetch)
export const FORCE_RELOAD_INTERVAL = 8;           // Force full page reload every N transitions (memory hygiene)
export const MIN_PHOTOS_FOR_TRANSITION = 15;      // Grid albums: photos loaded for a seamless transition (or the whole album if smaller; else reload). Single/tiny need 1

// Album display modes (see www/js/album-mode.mjs)
export const ALBUM_DURATION_MS = 15 * 60 * 1000;     // Grid album play time (ms)
export const SINGLE_PHOTO_DURATION_MS = 90 * 1000;   // Single-photo album play time (ms)
export const TINY_ALBUM_MAX = 10;                    // 2..N photos is tiny: 2 rows x 5 columns = 10 slots, so the grid would clone photos
export const TINY_MIN_DURATION_MS = 2 * 60 * 1000;   // Minimum tiny album play time (ms)
export const TINY_HERO_LAPS = 1;                     // Full rotations a tiny album gets
export const FILMSTRIP_HEIGHT_PCT = 20;               // Tiny album: strip height below the hero (% of viewport height)
export const FILMSTRIP_WIDTH_PCT = 16;                // Tiny album: strip width beside a portrait hero (% of viewport width)
export const FILMSTRIP_GAP_PX = 8;                    // Gap between filmstrip cells, and between strip and hero (px)
export const FILMSTRIP_MAX_CELL_ASPECT = 2.0;         // Cap a cell's long axis at this multiple of its strip-axis size
export const TINY_RELOCATE_FADE_OUT_MS = 250;         // Rotation that moves the strip (below <-> right): strip fades out first (ms)
export const TINY_RELOCATE_FADE_IN_MS = 400;          // ...then fades back in at its new side (ms)

// Blurred backdrop behind contain-fit photos (see www/js/backdrop.mjs)
export const HERO_MARGIN_PX = 0;          // Safe margin around a single/tiny hero (px)
export const BACKDROP_ENABLED = true;
export const BACKDROP_SIZE_PX = 64;       // Long edge of the downscaled copy
export const BACKDROP_BLUR_PX = 4;        // Canvas blur radius at that size
export const BACKDROP_BRIGHTNESS = 0.55;  // Darkening (1 = unchanged)
export const BACKDROP_FADE_MS = 800;      // Crossfade, matches SLIDE_IN_ANIMATION_DURATION

// Watchdog and recovery configuration
// Monitors live cells for stuck animations and failed image loads
export const WATCHDOG_INTERVAL_MS = 3000;         // Watchdog scan frequency (ms)
export const WATCHDOG_STUCK_GRACE_PERIOD_MS = 1000;  // Grace period before marking cell as stuck (ms)
export const WATCHDOG_LOAD_ERROR_DELAY_MS = 500;     // Delay before recovering failed image load (ms)
export const WATCHDOG_SWAP_DEFER_MS = 100;          // Deferral time for swap queueing to avoid race conditions (ms)

// Make available as global for browser usage (non-module scripts)
if (typeof window !== 'undefined') {
    window.SlideshowConfig = {
        SWAP_INTERVAL,
        PANORAMA_ASPECT_THRESHOLD,
        PANORAMA_USE_PROBABILITY,
        PANORAMA_STEAL_PROBABILITY,
        PANORAMA_POSITION_LEFT_PROBABILITY,
        PAN_SPEED_PX_PER_SEC,
        ORIENTATION_MATCH_PROBABILITY,
        FILL_RIGHT_TO_LEFT_PROBABILITY,
        INTER_ROW_DIFFER_PROBABILITY,
        STACKED_LANDSCAPES_PROBABILITY,
        SHRINK_ANIMATION_DURATION,
        SLIDE_IN_ANIMATION_DURATION,
        PHASE_OVERLAP_DELAY,
        FILL_STAGGER_DELAY,
        ENABLE_SHRINK_ANIMATION,
        IMAGE_PRELOAD_TIMEOUT,
        PROGRESSIVE_LOADING_ENABLED,
        INITIAL_BATCH_SIZE,
        INITIAL_QUALITY,
        FINAL_QUALITY,
        UPGRADE_BATCH_SIZE,
        UPGRADE_DELAY_MS,
        LOAD_BATCH_SIZE,
        DEBUG_PROGRESSIVE_LOADING,
        PREFETCH_LEAD_TIME,
        ALBUM_TRANSITION_ENABLED,
        ALBUM_TRANSITION_FADE_DURATION,
        STAGE_RETRY_BASE_MS,
        STAGE_RETRY_MAX_MS,
        TRANSITION_READY_TIMEOUT_MS,
        PREFETCH_MEMORY_THRESHOLD_MB,
        FORCE_RELOAD_INTERVAL,
        MIN_PHOTOS_FOR_TRANSITION,
        ALBUM_DURATION_MS,
        SINGLE_PHOTO_DURATION_MS,
        TINY_ALBUM_MAX,
        TINY_MIN_DURATION_MS,
        TINY_HERO_LAPS,
        FILMSTRIP_HEIGHT_PCT,
        FILMSTRIP_WIDTH_PCT,
        FILMSTRIP_GAP_PX,
        FILMSTRIP_MAX_CELL_ASPECT,
        TINY_RELOCATE_FADE_OUT_MS,
        TINY_RELOCATE_FADE_IN_MS,
        HERO_MARGIN_PX,
        BACKDROP_ENABLED,
        BACKDROP_SIZE_PX,
        BACKDROP_BLUR_PX,
        BACKDROP_BRIGHTNESS,
        BACKDROP_FADE_MS,
        WATCHDOG_INTERVAL_MS,
        WATCHDOG_STUCK_GRACE_PERIOD_MS,
        WATCHDOG_LOAD_ERROR_DELAY_MS,
        WATCHDOG_SWAP_DEFER_MS
    };
}
