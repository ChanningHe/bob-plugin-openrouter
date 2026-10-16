const test = require('node:test');
const assert = require('node:assert/strict');
const info = require('../src/info.json');
const pkg = require('../package.json');
const { parseConfig } = require('../src/lib/config');

const base = { apiKey: 'k', model: 'a/b' };

test('identifier and version follow Bob rules and match package.json', () => {
  assert.match(info.identifier, /^[a-z0-9.]+$/);
  assert.match(info.version, /^[a-z0-9.]+$/);
  assert.equal(info.version, pkg.version);
  assert.equal(info.category, 'translate');
});

test('option identifiers are unique', () => {
  const ids = info.options.map((o) => o.identifier);
  assert.equal(new Set(ids).size, ids.length);
});

test('every menu value is accepted by parseConfig', () => {
  for (const opt of info.options.filter((o) => o.type === 'menu')) {
    for (const { value } of opt.menuValues) {
      const extra =
        (opt.identifier === 'reasoning' && value === 'budget' && { reasoningBudget: '100' }) ||
        (opt.identifier === 'mode' && value === 'custom' && { userPrompt: '$text' }) ||
        {};
      const { error } = parseConfig({ ...base, ...extra, [opt.identifier]: value });
      assert.equal(error, undefined, `${opt.identifier}=${value}: ${error && error.message}`);
    }
  }
});

test('menu defaults in info.json equal parseConfig defaults', () => {
  const fromDefaults = parseConfig(base).config;
  const fromInfo = parseConfig({
    ...base,
    ...Object.fromEntries(info.options.filter((o) => o.defaultValue).map((o) => [o.identifier, o.defaultValue])),
  }).config;
  assert.deepEqual(fromInfo, fromDefaults);
});
