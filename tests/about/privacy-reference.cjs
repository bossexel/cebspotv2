const { expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Compare every supplied policy line with the editable module, including accents,
// punctuation, names, date, contact, lists, and the order of sections.
const source = fs.readFileSync(path.join(__dirname, '../../src/constants/Cebspot.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports = {};
new Function('exports', compiled)(moduleExports);
const content = moduleExports.CebspotContent;
const actual = [content.title, content.effectiveDate, ...content.sections.flatMap(section => [section.title,
  ...section.blocks.flatMap(block => [block.heading, ...(block.paragraphs || []), ...(block.items || []), block.email?.label].filter(Boolean)),
])];
const expected = fs.readFileSync(path.join(__dirname, 'privacy-reference.txt'), 'utf8').split(/\r?\n/)
  .map(line => line.trim().replace(/^•\s*/, '')).filter(Boolean);
assert.deepEqual(actual, expected, 'All supplied policy content is preserved verbatim and in order');
assert.equal(content.sections.length, 11);
assert.equal(content.sections.at(-1).blocks[0].email.url, 'mailto:johnbenedicteduc@gmail.com');

async function checkReferencePolicy(page, theme, width) {
  await expect(page.getByText(content.effectiveDate, { exact: true })).toBeVisible();
  await expect(page.locator('[data-testid^="privacy-card-"]')).toHaveCount(11);
  const search = page.getByRole('textbox', { name: content.searchLabel, exact: true });
  await expect(search).toHaveAttribute('placeholder', content.searchPlaceholder);
  for (const section of content.sections) {
    const card = page.getByTestId(`privacy-card-${section.id}`);
    for (const block of section.blocks) {
      for (const text of [block.heading, ...(block.paragraphs || []), ...(block.items || []), block.email?.label].filter(Boolean)) {
        await expect(card.getByText(text, { exact: true })).toHaveCount(1);
      }
    }
    const toggle = page.getByRole('button', { name: section.title, exact: true });
    await expect(toggle).toHaveAttribute('aria-expanded', 'true');
    await toggle.click();
    await expect(page.getByTestId(`privacy-section-${section.id}`)).toHaveCount(0);
    await toggle.click();
    await expect(page.getByTestId(`privacy-section-${section.id}`)).toBeVisible();
  }
  await expect(page.getByTestId('privacy-panel-location')).toHaveCount(1);
  await expect(page.getByTestId('privacy-panel-statement')).toHaveCount(1);
  await expect(page.getByTestId('privacy-panel-warning')).toHaveCount(1);
  assert.equal(await page.getByTestId('privacy-panel-statement').evaluate(node => getComputedStyle(node).backgroundColor),
    theme === 'dark' ? 'rgb(21, 55, 30)' : 'rgb(225, 238, 220)', 'Sharing statement panel is green in both themes');
  await expect(page.getByRole('link', { name: 'Email: johnbenedicteduc@gmail.com', exact: true })).toHaveCount(1);
  // Do not click/open the listed email: no messages or submissions are made.
  await search.fill('Data Retention');
  await expect(page.locator('[data-testid^="privacy-card-"]')).toHaveCount(1);
  await expect(page.getByTestId('privacy-card-retention')).toBeVisible();
  await search.fill('crash reports');
  await expect(page.locator('[data-testid^="privacy-card-"]')).toHaveCount(1);
  await expect(page.getByTestId('privacy-section-information')).toBeVisible();
  await search.fill('not-a-policy-topic-xyz');
  await expect(page.getByRole('heading', { name: content.emptyTitle, exact: true })).toBeVisible();
  await page.getByRole('button', { name: content.clearLabel, exact: true }).first().click();
  await expect(page.locator('[data-testid^="privacy-card-"]')).toHaveCount(11);
  if (width >= 320) {
    const cells = page.getByTestId('privacy-services-grid').locator(':scope > div');
    await cells.first().scrollIntoViewIfNeeded();
    const first = await cells.nth(0).boundingBox();
    const second = await cells.nth(1).boundingBox();
    assert.ok(second.x > first.x + first.width, 'Service categories have two columns');
    assert.ok(Math.abs(first.y - second.y) <= 1, 'Service row aligns');
  }
  await page.getByTestId('privacy-panel-statement').scrollIntoViewIfNeeded();
  await page.screenshot({ path: `.codex-tmp/reference-privacy-${width}-${theme}.png` });
  assert.equal(await page.locator('iframe').count(), 0, 'Native policy content');
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > innerWidth), false, 'No horizontal page overflow');
}

module.exports = { checkReferencePolicy };
