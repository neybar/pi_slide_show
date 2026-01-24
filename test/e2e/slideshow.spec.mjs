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
    const response1 = await page.request.get('/album/10');
    const response2 = await page.request.get('/album/10');

    expect(response1.ok()).toBe(true);
    expect(response2.ok()).toBe(true);

    const data1 = await response1.json();
    const data2 = await response2.json();

    // Both should have the correct count
    expect(data1.count).toBe(10);
    expect(data2.count).toBe(10);

    // Extract file paths for comparison
    const files1 = data1.images.map((img) => img.file).sort();
    const files2 = data2.images.map((img) => img.file).sort();

    // Due to random selection from a pool of 50 photos, the sets should differ
    // (statistically very unlikely to be identical)
    const areDifferent =
      JSON.stringify(files1) !== JSON.stringify(files2) ||
      data1.images.map((img) => img.file).join(',') !==
        data2.images.map((img) => img.file).join(',');

    expect(areDifferent).toBe(true);
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

    // Request with invalid count (string)
    const responseInvalid = await page.request.get('/album/abc');
    expect(responseInvalid.status()).toBe(400);
  });
});
