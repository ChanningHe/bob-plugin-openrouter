const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig, DEFAULT_BASE_URL } = require('../src/lib/config');

const base = { apiKey: 'sk-or-test', model: 'openai/gpt-5-mini' };

test('applies defaults for unset options', () => {
  const { config, error } = parseConfig(base);
  assert.equal(error, undefined);
  assert.equal(config.mode, 'translate');
  assert.equal(config.reasoning, 'off');
  assert.equal(config.showReasoning, true);
  assert.equal(config.routing, 'default');
  assert.equal(config.dataPolicy, 'default');
  assert.equal(config.outputFormat, 'markdown');
  assert.equal(config.stream, true);
  assert.equal(config.polishMode, false);
  assert.equal(config.cacheTtl, null);
  assert.equal(config.timeout, 60);
  assert.equal(config.baseUrl, DEFAULT_BASE_URL);
  assert.deepEqual(config.fallbackModels, []);
  assert.equal(config.temperature, null);
  assert.equal(config.maxTokens, null);
  assert.equal(config.extraBody, null);
});

test('returned config is frozen', () => {
  const { config } = parseConfig(base);
  assert.ok(Object.isFrozen(config));
  assert.ok(Object.isFrozen(config.fallbackModels));
});

test('missing api key is a secretKey error', () => {
  const { error } = parseConfig({ model: 'x/y' });
  assert.equal(error.type, 'secretKey');
});

test('missing model is a param error', () => {
  const { error } = parseConfig({ apiKey: 'k', model: '  ' });
  assert.equal(error.type, 'param');
});

test('trims key and model', () => {
  const { config } = parseConfig({ apiKey: ' k ', model: ' a/b ' });
  assert.equal(config.apiKey, 'k');
  assert.equal(config.model, 'a/b');
});

test('splits list options on comma and newline, dropping empties', () => {
  const { config } = parseConfig({
    ...base,
    fallbackModels: 'a/b, c/d\n\n e/f ,',
    providerOnly: 'openai,azure',
    providerIgnore: ' deepinfra ',
  });
  assert.deepEqual(config.fallbackModels, ['a/b', 'c/d', 'e/f']);
  assert.deepEqual(config.providerOnly, ['openai', 'azure']);
  assert.deepEqual(config.providerIgnore, ['deepinfra']);
});

test('rejects unknown menu values', () => {
  const { error } = parseConfig({ ...base, reasoning: 'turbo' });
  assert.equal(error.type, 'param');
  assert.match(error.message, /思考模式/);
});

test('budget mode requires a positive integer budget', () => {
  assert.equal(parseConfig({ ...base, reasoning: 'budget' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, reasoning: 'budget', reasoningBudget: '-1' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, reasoning: 'budget', reasoningBudget: '1.5' }).error.type, 'param');
  const { config } = parseConfig({ ...base, reasoning: 'budget', reasoningBudget: '2048' });
  assert.equal(config.reasoningBudget, 2048);
});

test('budget is ignored when not in budget mode', () => {
  const { config, error } = parseConfig({ ...base, reasoning: 'low', reasoningBudget: 'garbage' });
  assert.equal(error, undefined);
  assert.equal(config.reasoningBudget, null);
});

test('temperature must be within 0..2', () => {
  assert.equal(parseConfig({ ...base, temperature: '0.3' }).config.temperature, 0.3);
  assert.equal(parseConfig({ ...base, temperature: '3' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, temperature: 'hot' }).error.type, 'param');
});

test('maxTokens must be a positive integer', () => {
  assert.equal(parseConfig({ ...base, maxTokens: '4096' }).config.maxTokens, 4096);
  assert.equal(parseConfig({ ...base, maxTokens: '0' }).error.type, 'param');
});

test('extraBody must be a JSON object', () => {
  assert.deepEqual(parseConfig({ ...base, extraBody: '{"top_p":0.9}' }).config.extraBody, { top_p: 0.9 });
  assert.equal(parseConfig({ ...base, extraBody: '{bad' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, extraBody: '[1]' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, extraBody: '  ' }).config.extraBody, null);
});

test('baseUrl must be http(s) and loses trailing slash', () => {
  assert.equal(parseConfig({ ...base, baseUrl: 'https://proxy.example.com/v1/' }).config.baseUrl, 'https://proxy.example.com/v1');
  assert.equal(parseConfig({ ...base, baseUrl: 'ftp://x' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, baseUrl: '' }).config.baseUrl, DEFAULT_BASE_URL);
});

test('menu-backed booleans and numbers', () => {
  const { config } = parseConfig({
    ...base,
    showReasoning: 'hide',
    stream: 'off',
    polishMode: 'on',
    responseCache: '3600',
    timeout: '180',
    outputFormat: 'plain',
  });
  assert.equal(config.showReasoning, false);
  assert.equal(config.stream, false);
  assert.equal(config.polishMode, true);
  assert.equal(config.cacheTtl, 3600);
  assert.equal(config.timeout, 180);
  assert.equal(config.outputFormat, 'plain');
});

test('blank prompts fall back to null (use built-in)', () => {
  const { config } = parseConfig({ ...base, systemPrompt: '   ', userPrompt: 'Translate: $text' });
  assert.equal(config.systemPrompt, null);
  assert.equal(config.userPrompt, 'Translate: $text');
});

test('custom mode requires at least one prompt', () => {
  assert.equal(parseConfig({ ...base, mode: 'custom' }).error.type, 'param');
  assert.equal(parseConfig({ ...base, mode: 'custom', userPrompt: '$text' }).config.mode, 'custom');
  assert.equal(parseConfig({ ...base, mode: 'polish' }).config.mode, 'polish');
});
