// Guards the static JSON-LD block and canonical link in index.html.
// No deps; uses Node's built-in node:test runner (CommonJS, like the other tests).

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');

function extractJsonLd(source) {
  const match = source.match(
    /<script type="application\/ld\+json">([\s\S]*?)<\/script>/
  );
  assert.ok(match, 'JSON-LD script block is present');
  return JSON.parse(match[1]); // throws if the block is not valid JSON
}

test('JSON-LD parses and has the expected graph shape', () => {
  const data = extractJsonLd(HTML);
  assert.equal(data['@context'], 'https://schema.org');
  assert.ok(Array.isArray(data['@graph']), '@graph is an array');

  const app = data['@graph'].find(
    (node) => node['@id'] === 'https://whatifeconomics.com/#app'
  );
  assert.ok(app, 'app node is present');
  assert.ok(
    app['@type'].includes('WebApplication') &&
      app['@type'].includes('LearningResource'),
    'app node is dual-typed WebApplication + LearningResource'
  );
  assert.equal(app.name, 'what if… economics');
  assert.ok(typeof app.url === 'string' && app.url.length > 0, 'app has a url');
  assert.equal(app.isAccessibleForFree, true);

  const site = data['@graph'].find(
    (node) => node['@id'] === 'https://whatifeconomics.com/#website'
  );
  assert.ok(site, 'website node is present');
});

test('canonical link is present with the trailing-slash URL', () => {
  assert.match(
    HTML,
    /<link rel="canonical" href="https:\/\/whatifeconomics\.com\/">/
  );
});
