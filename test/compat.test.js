const test = require('node:test');
const assert = require('node:assert/strict');
const { modelLookupPath, checkModelCompat } = require('../src/lib/compat');

const cfg = (over = {}) => ({ reasoning: 'off', ...over });

test('modelLookupPath strips routing variants and skips presets/routers', () => {
  assert.equal(modelLookupPath('openai/gpt-5'), '/model/openai/gpt-5');
  assert.equal(modelLookupPath('openai/gpt-5:nitro'), '/model/openai/gpt-5');
  assert.equal(modelLookupPath('meta/llama:free'), '/model/meta/llama:free');
  assert.equal(modelLookupPath('@preset/my-translate'), null);
  assert.equal(modelLookupPath('openrouter/auto'), null);
  assert.equal(modelLookupPath('no-slash'), null);
});

test('off on a mandatory-reasoning model is rejected', () => {
  const msg = checkModelCompat({ reasoning: { mandatory: true, supported_efforts: ['high', 'low'] } }, cfg());
  assert.match(msg, /强制/);
  assert.match(msg, /low/);
});

test('effort not in supported_efforts is rejected', () => {
  const msg = checkModelCompat({ reasoning: { supported_efforts: ['high', 'medium'] } }, cfg({ reasoning: 'minimal' }));
  assert.match(msg, /minimal/);
});

test('reasoning requested on a non-reasoning model is rejected, off is fine', () => {
  assert.match(checkModelCompat({}, cfg({ reasoning: 'high' })), /不支持思考/);
  assert.equal(checkModelCompat({}, cfg()), null);
  assert.equal(checkModelCompat({}, cfg({ reasoning: 'default' })), null);
});

test('budget requires supports_max_tokens', () => {
  assert.match(checkModelCompat({ reasoning: { supported_efforts: null } }, cfg({ reasoning: 'budget' })), /预算/);
  assert.equal(checkModelCompat({ reasoning: { supports_max_tokens: true } }, cfg({ reasoning: 'budget' })), null);
});

test('null supported_efforts accepts any effort', () => {
  assert.equal(checkModelCompat({ reasoning: { supported_efforts: null } }, cfg({ reasoning: 'xhigh' })), null);
});
