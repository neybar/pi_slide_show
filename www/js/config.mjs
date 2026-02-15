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
export const PREFETCH_MEMORY_THRESHOLD_MB = 100;  // Skip prefetch if available memory < 100MB (requires Chrome/Edge; fallback: always prefetch)
export const FORCE_RELOAD_INTERVAL = 8;           // Force full page reload every N transitions (memory hygiene)
export const MIN_PHOTOS_FOR_TRANSITION = 15;      // Minimum photos required for seamless transition (fall back to reload if less)

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
        PREFETCH_MEMORY_THRESHOLD_MB,
        FORCE_RELOAD_INTERVAL,
        MIN_PHOTOS_FOR_TRANSITION
    };
}
