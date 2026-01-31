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

// Animation configuration
export const SLIDE_ANIMATION_DURATION = 1200;     // Animation duration in milliseconds (matches CSS)

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
        SLIDE_ANIMATION_DURATION,
        IMAGE_PRELOAD_TIMEOUT
    };
}
