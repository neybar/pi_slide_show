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
export const GRAVITY_ANIMATION_DURATION = 300;    // Phase B: Gravity fill duration (ms)
export const SLIDE_IN_ANIMATION_DURATION = 800;   // Phase C: Slide-in with bounce duration (ms)
export const SLIDE_ANIMATION_DURATION = 800;      // Legacy alias for slide-in duration (matches CSS)

// Progressive enhancement: full shrink animation vs instant vanish
// Set to false for low-powered devices (older Raspberry Pis)
export const ENABLE_SHRINK_ANIMATION = true;

// Image loading
export const IMAGE_PRELOAD_TIMEOUT = 30000;       // 30 seconds

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
        GRAVITY_ANIMATION_DURATION,
        SLIDE_IN_ANIMATION_DURATION,
        SLIDE_ANIMATION_DURATION,
        ENABLE_SHRINK_ANIMATION,
        IMAGE_PRELOAD_TIMEOUT
    };
}
