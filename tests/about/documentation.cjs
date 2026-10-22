const { expect } = require('@playwright/test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

// Mirror only configuration presence for conditional public documentation. Never
// pass keys/endpoints into the test's generated content or its output.
const relevant = ['EXPO_PUBLIC_MAPTILER_KEY', 'EXPO_PUBLIC_CARTO_BASEMAPS_API_KEY', 'EXPO_PUBLIC_FACE_BLUR_API_URL'];
const env = {};
const localEnv = path.join(__dirname, '../../.env.local');
const lines = fs.existsSync(localEnv) ? fs.readFileSync(localEnv, 'utf8').split(/\r?\n/) : [];
for (const name of relevant) {
  const configured = process.env[name] ?? lines.find(line => line.startsWith(`${name}=`))?.slice(name.length + 1);
  env[name] = configured?.trim() ? 'configured' : '';
}
const source = fs.readFileSync(path.join(__dirname, '../../src/constants/documentation.ts'), 'utf8');
const compiled = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText;
const moduleExports = {};
new Function('exports', 'process', compiled)(moduleExports, { env });
const content = moduleExports.documentationContent;
assert.equal(content.layers.length, 4);

async function checkCard(page, card) {
  const view = page.getByTestId(`content-card-${card.id}`);
  await expect(view).toHaveCount(1);
  for (const text of [card.title, card.category, ...card.paragraphs,
    ...(card.details || []).flatMap(block => [block.heading, ...(block.paragraphs || []), ...(block.items || [])].filter(Boolean)),
    ...(card.chips || []),
  ]) await expect(view.getByText(text, { exact: true })).toHaveCount(1);
}

async function checkDocumentation(page, width) {
  await expect(page.getByTestId('documentation-overview').getByText(content.label, { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: content.heading, exact: true })).toBeVisible();
  await expect(page.getByTestId('documentation-overview').getByText(content.subtitle, { exact: true })).toBeVisible();
  await expect(page.getByTestId('screen-safe-area').last()).toBeVisible();
  await checkCard(page, content.summary);
  for (const card of content.technologies) await checkCard(page, card);
  const firstTechnology = await page.getByTestId('content-card-client').boundingBox();
  const secondTechnology = await page.getByTestId('content-card-navigation').boundingBox();
  if (width >= 900) {
    assert.ok(secondTechnology.x > firstTechnology.x + firstTechnology.width, 'Wide technology grid uses two columns');
    assert.ok(Math.abs(secondTechnology.y - firstTechnology.y) <= 1, 'Technology columns align');
  } else {
    assert.ok(Math.abs(secondTechnology.x - firstTechnology.x) <= 1 && secondTechnology.y > firstTechnology.y, 'Phone technology cards use one column');
  }
  for (const tab of content.tabs) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    for (const other of content.tabs) await expect(page.getByRole('tab', { name: other, exact: true })).toHaveAttribute('aria-selected', String(tab === other));
    const selectedColor = await page.getByRole('tab', { name: tab, exact: true }).evaluate(node => getComputedStyle(node).backgroundColor);
    const otherColor = await page.getByRole('tab', { name: content.tabs.find(value => value !== tab), exact: true }).evaluate(node => getComputedStyle(node).backgroundColor);
    assert.notEqual(selectedColor, otherColor, 'Selected control has contrasting background');
    if (tab === 'Features') {
      await expect(page.getByRole('heading', { name: content.featureHeading, exact: true })).toHaveCount(1);
      for (const card of content.features) await checkCard(page, card);
    }
    if (tab === 'Architecture') {
      for (const card of content.layers) {
        await checkCard(page, card);
        const grid = page.getByTestId(`content-chips-${card.id}`);
        const bounds = await grid.boundingBox();
        const children = await grid.locator(':scope > div').all();
        const rows = new Set();
        for (const child of children) {
          const box = await child.boundingBox();
          assert.ok(box.x >= bounds.x - 1 && box.x + box.width <= bounds.x + bounds.width + 1, 'Chip fits its container');
          rows.add(Math.round(box.y));
        }
        if (width === 320) assert.ok(rows.size > 1, 'Phone technology chips wrap');
      }
      await checkCard(page, { id: 'integration-specifications', category: content.integrationLabel, title: content.integrationHeading,
        paragraphs: [content.integrationIntroduction], details: content.flows.map(flow => ({ heading: flow.title, paragraphs: flow.paragraphs })) });
      await page.getByRole('button', { name: content.backLabel, exact: true }).scrollIntoViewIfNeeded();
      const footer = await page.getByRole('button', { name: content.backLabel, exact: true }).boundingBox();
      assert.ok(footer.y + footer.height <= page.viewportSize().height - 12, 'Bottom reading space is preserved');
    }
  }
  // Start the surrounding scroll-retention checks from each tab's initial state.
  for (const tab of content.tabs) {
    await page.getByRole('tab', { name: tab, exact: true }).click();
    await page.getByTestId(`documentation-${tab.toLowerCase()}`).evaluate(node => { node.scrollTop = 0; });
  }
  await page.getByRole('tab', { name: 'Overview', exact: true }).click();
}

module.exports = { checkDocumentation };
