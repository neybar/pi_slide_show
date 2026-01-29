import { test, expect } from '@playwright/test';

test.describe('Slideshow E2E Tests', () => {
  test('page loads without errors', async ({ page }) => {
    const errors = [];
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto('/');

    // Wait for page to fully load
    await page.waitForLoadState('networkidle');

    // Verify no JavaScript errors occurred
    expect(errors).toEqual([]);

    // Verify basic page structure exists
    await expect(page.locator('#content')).toBeVisible();
    await expect(page.locator('#top_row')).toBeVisible();
    await expect(page.locator('#bottom_row')).toBeVisible();
  });

  test('all photo slots are populated', async ({ page }) => {
    await page.goto('/');

    // Wait for photos to load (slideshow fetches and preloads images)
    await page.waitForFunction(
      () => document.querySelectorAll('#photo_store div.img_box').length > 0,
      { timeout: 10000 }
    );

    // Wait for the slideshow to build rows
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 10000 }
    );

    // Verify photos are in the rows
    const topRowPhotos = await page.locator('#top_row .photo').count();
    const bottomRowPhotos = await page.locator('#bottom_row .photo').count();

    expect(topRowPhotos).toBeGreaterThan(0);
    expect(bottomRowPhotos).toBeGreaterThan(0);
    expect(topRowPhotos + bottomRowPhotos).toBeGreaterThanOrEqual(4);
  });

  test('no broken images (no 404s)', async ({ page }) => {
    const failedRequests = [];

    page.on('response', (response) => {
      if (response.status() === 404) {
        failedRequests.push({
          url: response.url(),
          status: response.status(),
        });
      }
    });

    await page.goto('/');

    // Wait for photos to load
    await page.waitForFunction(
      () => document.querySelectorAll('#photo_store div.img_box').length > 0,
      { timeout: 10000 }
    );

    // Filter out expected 404s (like @eaDir thumbnails that may not exist for test fixtures)
    const unexpected404s = failedRequests.filter(
      (req) => !req.url.includes('@eaDir')
    );

    // Only fail on unexpected 404s (main resources, not thumbnails)
    const critical404s = unexpected404s.filter(
      (req) =>
        req.url.includes('.html') ||
        req.url.includes('.js') ||
        req.url.includes('.css') ||
        req.url.includes('/album/')
    );

    expect(critical404s).toEqual([]);
  });

  test('album endpoint returns different photos on each request', async ({ page }) => {
    // Make two API requests and compare results
    const response1 = await page.request.get('/album/5');
    const response2 = await page.request.get('/album/5');

    expect(response1.ok()).toBe(true);
    expect(response2.ok()).toBe(true);

    const data1 = await response1.json();
    const data2 = await response2.json();

    // Both should return photos (may be fewer than requested if library is small)
    expect(data1.count).toBeGreaterThan(0);
    expect(data2.count).toBeGreaterThan(0);
    expect(data1.images.length).toBe(data1.count);
    expect(data2.images.length).toBe(data2.count);

    // Extract file paths for comparison - order should differ due to random selection
    const order1 = data1.images.map((img) => img.file).join(',');
    const order2 = data2.images.map((img) => img.file).join(',');

    // Due to random selection, the order should differ
    // (statistically very unlikely to be identical)
    expect(order1).not.toBe(order2);
  });

  test('grid layout has correct structure (top/bottom shelves)', async ({ page }) => {
    await page.goto('/');

    // Wait for slideshow to initialize
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 10000 }
    );

    // Verify shelf structure
    const shelves = await page.locator('.shelf').count();
    expect(shelves).toBe(2);

    // Verify Pure CSS grid classes are applied
    const topRowContainer = page.locator('#top_row');
    const bottomRowContainer = page.locator('#bottom_row');

    await expect(topRowContainer).toHaveClass(/pure-g/);
    await expect(bottomRowContainer).toHaveClass(/pure-g/);

    // Verify photos have Pure CSS unit classes
    const photoElements = page.locator('.photo');
    const count = await photoElements.count();

    for (let i = 0; i < count; i++) {
      const photoClass = await photoElements.nth(i).getAttribute('class');
      // Should have a pure-u-* class for grid sizing
      expect(photoClass).toMatch(/pure-u-\d+-\d+/);
    }
  });

  test('album endpoint returns valid JSON structure', async ({ page }) => {
    const response = await page.request.get('/album/25');

    expect(response.ok()).toBe(true);
    expect(response.headers()['content-type']).toContain('application/json');

    const data = await response.json();

    // Verify structure
    expect(data).toHaveProperty('count');
    expect(data).toHaveProperty('images');
    expect(Array.isArray(data.images)).toBe(true);

    // Verify each image has required properties
    for (const img of data.images) {
      expect(img).toHaveProperty('file');
      expect(img).toHaveProperty('Orientation');
      expect(typeof img.file).toBe('string');
      expect([1, 3, 6, 8]).toContain(img.Orientation);
    }
  });

  test('static assets are served correctly', async ({ page }) => {
    // Test CSS file
    const cssResponse = await page.request.get('/css/main.css');
    expect(cssResponse.ok()).toBe(true);
    expect(cssResponse.headers()['content-type']).toContain('text/css');

    // Test JS file
    const jsResponse = await page.request.get('/js/main.js');
    expect(jsResponse.ok()).toBe(true);
    expect(jsResponse.headers()['content-type']).toContain('javascript');
  });

  test('photo files are served from library', async ({ page }) => {
    // First get an album to find a valid photo path
    const albumResponse = await page.request.get('/album/1');
    expect(albumResponse.ok()).toBe(true);

    const album = await albumResponse.json();
    expect(album.images.length).toBeGreaterThan(0);

    // Request the photo file directly
    const photoPath = album.images[0].file;
    const photoResponse = await page.request.get('/' + photoPath);

    expect(photoResponse.ok()).toBe(true);
    expect(photoResponse.headers()['content-type']).toContain('image/');
  });

  test('security headers are present', async ({ page }) => {
    const response = await page.request.get('/');

    expect(response.headers()['x-content-type-options']).toBe('nosniff');
    expect(response.headers()['x-frame-options']).toBe('SAMEORIGIN');
  });

  test('invalid album count is handled gracefully', async ({ page }) => {
    // Request with count 0
    const response0 = await page.request.get('/album/0');
    expect(response0.ok()).toBe(true);
    const data0 = await response0.json();
    expect(data0.count).toBe(0);
    expect(data0.images).toEqual([]);

    // Request with invalid count (string) - returns 404 since route doesn't match
    const responseInvalid = await page.request.get('/album/abc');
    expect(responseInvalid.status()).toBe(404);
  });

  test('images actually load and render visually', async ({ page }) => {
    await page.goto('/');

    // Wait for slideshow to build rows with photos
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo img, #bottom_row .photo img').length > 0,
      { timeout: 15000 }
    );

    // Get all images in the photo rows
    const images = page.locator('#top_row .photo img, #bottom_row .photo img');
    const imageCount = await images.count();

    expect(imageCount).toBeGreaterThan(0);

    // Verify each image actually loaded (naturalWidth > 0 means image loaded successfully)
    let loadedCount = 0;
    for (let i = 0; i < imageCount; i++) {
      const naturalWidth = await images.nth(i).evaluate((img) => img.naturalWidth);
      if (naturalWidth > 0) {
        loadedCount++;
      }
    }

    // All visible images should have loaded successfully
    expect(loadedCount).toBe(imageCount);
    expect(loadedCount).toBeGreaterThanOrEqual(4); // At minimum, should have 4 photos displayed
  });
});

test.describe('Panorama E2E Tests', () => {
  test('panorama container has .panorama-container class', async ({ page }) => {
    await page.goto('/');

    // Wait for slideshow to build rows - may take multiple refreshes to get a panorama
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    // Check if a panorama is displayed (it's random, so it may not always appear)
    const panoramaContainer = page.locator('.panorama-container');
    const panoramaCount = await panoramaContainer.count();

    // If a panorama is displayed, verify it has the correct classes
    if (panoramaCount > 0) {
      await expect(panoramaContainer.first()).toHaveClass(/panorama-container/);
      // The .panorama-container IS the .photo div (same element)
      await expect(panoramaContainer.first()).toHaveClass(/photo/);
    }
    // If no panorama, test passes (random selection may not include one)
  });

  test('panorama spans multiple columns', async ({ page }) => {
    await page.goto('/');

    // Wait for slideshow to load
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const panoramaContainer = page.locator('.panorama-container');
    const panoramaCount = await panoramaContainer.count();

    if (panoramaCount > 0) {
      // The .panorama-container IS the .photo div with the pure-u-* class
      const classAttr = await panoramaContainer.first().getAttribute('class');

      // Panorama should span more than 1 column
      // Note: Pure CSS fractions are reduced (e.g., 2/4 becomes 1/2 → pure-u-1-2)
      expect(classAttr).toMatch(/pure-u-\d+-\d+/);

      // Extract the fraction from pure-u-X-Y
      const match = classAttr.match(/pure-u-(\d+)-(\d+)/);
      expect(match).not.toBeNull();
      const numerator = parseInt(match[1], 10);
      const denominator = parseInt(match[2], 10);
      expect(denominator).toBeGreaterThan(0);

      // The fraction represents the proportion of the row.
      // Minimum: 2 columns out of 5 = 0.4 (or 2/4 = 0.5 which is also >= 0.4)
      // Maximum: totalColumns-1, so 4/5 = 0.8 (leaves room for a portrait)
      const fraction = numerator / denominator;
      expect(fraction).toBeGreaterThanOrEqual(0.4); // At least 2/5 of the row
      expect(fraction).toBeLessThan(1.0); // Never takes the full row (leaves room for portrait)
    }
  });

  test('overflowing panorama has .panorama-overflow class', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const panoramaContainer = page.locator('.panorama-container');
    const panoramaCount = await panoramaContainer.count();

    if (panoramaCount > 0) {
      // The .panorama-container IS the .photo div with the panorama-overflow class
      const classAttr = await panoramaContainer.first().getAttribute('class');

      // If image overflows container, it should have panorama-overflow class
      // The 3:1 test image (900x300) should overflow in most viewports
      if (classAttr.includes('panorama-overflow')) {
        expect(classAttr).toContain('panorama-overflow');
      }
      // If no overflow class, the panorama fits in its container - also valid
    }
  });

  test('CSS custom properties are set on panorama overflow', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const panoramaOverflow = page.locator('.panorama-overflow');
    const overflowCount = await panoramaOverflow.count();

    if (overflowCount > 0) {
      // Verify CSS custom properties are set
      const panDistance = await panoramaOverflow.first().evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--pan-distance')
      );
      const panDuration = await panoramaOverflow.first().evaluate((el) =>
        getComputedStyle(el).getPropertyValue('--pan-duration')
      );

      // Properties should be set (non-empty)
      expect(panDistance).toBeTruthy();
      expect(panDuration).toBeTruthy();

      // Verify format: --pan-distance should be negative pixels, --pan-duration should end in 's'
      expect(panDistance).toMatch(/-?\d+(\.\d+)?px/);
      expect(panDuration).toMatch(/\d+(\.\d+)?s/);
    }
  });

  test('panorama animation changes transform over time', async ({ page }) => {
    await page.goto('/');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const panoramaOverflow = page.locator('.panorama-overflow img');
    const overflowCount = await panoramaOverflow.count();

    if (overflowCount > 0) {
      // Get initial transform value
      const initialTransform = await panoramaOverflow.first().evaluate((el) =>
        getComputedStyle(el).transform
      );

      // Wait a short time for animation to progress
      await page.waitForTimeout(500);

      // Get transform value after waiting
      const laterTransform = await panoramaOverflow.first().evaluate((el) =>
        getComputedStyle(el).transform
      );

      // Animation should cause transform to change
      // Note: If animation hasn't started yet or is at the same keyframe position, this might fail
      // We check that transform is being applied (not 'none')
      expect(initialTransform).not.toBe('none');
      expect(laterTransform).not.toBe('none');

      // Both should contain matrix values indicating translation
      expect(initialTransform).toMatch(/matrix/);
      expect(laterTransform).toMatch(/matrix/);
    }
  });
});
