# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Workflow Rules

- All work must be done in a feature branch, not directly on master

## Project Overview

A Raspberry Pi photo slideshow application with two components:
1. **Perl backend** - Scans a photo library, extracts EXIF data, and generates `slideshow.json`
2. **JavaScript frontend** - Lightweight web viewer that displays photos in a randomized grid layout

## Build & Run Commands

### Perl Backend

```bash
# Install dependencies (requires Carton)
carton install

# Run the slideshow generator
carton exec -- ./generate_slideshow.pl

# Docker build and run
docker build -t pi_slide_show .
docker run pi_slide_show
```

### Frontend (www/)

```bash
cd www
npm install          # Install dependencies
npm run build        # One-time SCSS compilation
npm run dev          # Watch for SCSS changes
```

## Architecture

### Perl Component

- `generate_slideshow.pl` - Entry point; loads YAML config and runs generator (supports background mode with configurable sleep interval)
- `lib/Photo/SlideShow.pm` - Core module using Mo (minimal OO). Walks photo directories via File::Find, extracts orientation via Image::ExifTool, outputs JSON
- Configuration via `generate_slideshow.yml`:
  - `photo_library` - Source directory path
  - `web_photo_dir` - URL path prefix for frontend
  - `default_count` - Number of random photos per batch
  - `background` / `bg_sleep` - Daemon mode settings

### Frontend Component

- `www/index.html` - Single-page app using Pure CSS grid, jQuery, and Underscore.js
- `www/js/main.js` - Fetches `/photos/slideshow.json`, builds responsive grid with fade transitions
- Photos organized in two rows (top/bottom shelves), auto-refreshes every 15 minutes
- Uses Synology thumbnail paths (`@eaDir/SYNOPHOTO_THUMB_XL.jpg`) for optimized loading

## Key Implementation Details

- File locking via `File::Flock::Tiny` prevents concurrent runs
- SMB3 compatibility: `$File::Find::dont_use_nlink=1` workaround for network shares
- Skips iPhoto Library and Synology `@eaDir` metadata directories
- Frontend adapts column count based on window aspect ratio (5 columns for wide, 4 for normal)
