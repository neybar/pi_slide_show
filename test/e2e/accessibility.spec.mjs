/**
 * Accessibility tests for the photo slideshow
 *
 * Uses @axe-core/playwright to detect WCAG 2.0 A/AA violations.
 * The slideshow is a full-screen kiosk display, so some rules
 * are intentionally disabled (e.g., landmark requirements for
 * a single-purpose visual display).
 *
 * Excluded rules (by design):
 * - landmark-one-main: No main landmark needed for a single-purpose visual display
 * - region: Content outside landmarks is expected (photos are the entire page)
 * - page-has-heading-one: No heading hierarchy needed for a photo wall
 * - meta-refresh: The 20-minute meta refresh is an intentional safety net
 *   for kiosk mode (see index.html comment). JS transitions happen at 15 min;
 *   the meta refresh is a fallback if JS fails.
 */

import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

// Rules excluded for kiosk photo display context
const EXCLUDED_RULES = [
  'landmark-one-main',
  'region',
  'page-has-heading-one',
  'meta-refresh',
];

test.describe('Accessibility Tests', () => {
  test('should not have critical accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    // Wait for photos to load into the display
    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(EXCLUDED_RULES)
      .analyze();

    const critical = results.violations.filter(v => v.impact === 'critical');
    if (critical.length > 0) {
      const details = critical.map(v =>
        `${v.id}: ${v.description} (${v.nodes.length} instances)`
      ).join('\n  ');
      expect(critical, `Critical a11y violations:\n  ${details}`).toEqual([]);
    }
  });

  test('should not have serious accessibility violations', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa'])
      .disableRules(EXCLUDED_RULES)
      .analyze();

    const serious = results.violations.filter(v => v.impact === 'serious');
    if (serious.length > 0) {
      const details = serious.map(v =>
        `${v.id}: ${v.description} (${v.nodes.length} instances)`
      ).join('\n  ');
      expect(serious, `Serious a11y violations:\n  ${details}`).toEqual([]);
    }
  });

  test('photos should have alt text', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo img, #bottom_row .photo img').length > 0,
      { timeout: 15000 }
    );

    // Check all visible images in the display rows
    const images = page.locator('#top_row .photo img, #bottom_row .photo img');
    const count = await images.count();
    expect(count).toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const img = images.nth(i);
      const alt = await img.getAttribute('alt');

      expect(
        alt,
        `Image ${i} is missing alt attribute`
      ).toBeTruthy();
    }
  });

  test('page should have a valid lang attribute', async ({ page }) => {
    await page.goto('/');

    const lang = await page.locator('html').getAttribute('lang');
    expect(lang).toBeTruthy();
  });

  test('page should have a descriptive title', async ({ page }) => {
    await page.goto('/');

    const title = await page.title();
    expect(title.length).toBeGreaterThan(0);
  });

  test('color contrast should meet WCAG AA for text elements', async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');

    await page.waitForFunction(
      () => document.querySelectorAll('#top_row .photo, #bottom_row .photo').length > 0,
      { timeout: 15000 }
    );

    const results = await new AxeBuilder({ page })
      .withRules(['color-contrast'])
      .analyze();

    const contrastViolations = results.violations.filter(v => v.id === 'color-contrast');
    if (contrastViolations.length > 0) {
      const details = contrastViolations.map(v =>
        v.nodes.map(n => `  ${n.html}: ${n.failureSummary}`).join('\n')
      ).join('\n');
      console.log(`Color contrast issues:\n${details}`);
    }

    // No critical or serious contrast failures
    const severeContrast = contrastViolations.filter(v =>
      v.nodes.some(n => n.impact === 'critical' || n.impact === 'serious')
    );
    expect(severeContrast).toEqual([]);
  });
});
