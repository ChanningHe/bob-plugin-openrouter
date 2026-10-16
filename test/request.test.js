const test = require('node:test');
const assert = require('node:assert/strict');
const { parseConfig } = require('../src/lib/config');
const { buildBody, buildHeaders, chatUrl, deepMerge } = require('../src/lib/request');

const messages = [{ role: 'user', content: 'hi' }];
const configOf = (over = {}) => {
  const { config, error } = parseConfig({ apiKey: 'sk-or-test', model: 'a/b', ...over });
  if (error) throw new Error(error.message);
  return config;
};

test('minimal body: model, messages, stream, reasoning off', () => {
  assert.deepEqual(buildBody(configOf(), messages), {
    model: 'a/b',
    messages,
    stream: true,
    reasoning: { effort: 'none' },
  });
});

test('reasoning mapping', () => {
  assert.equal(buildBody(configOf({ reasoning: 'default' }), messages).reasoning, undefined);
  assert.deepEqual(buildBody(configOf({ reasoning: 'high' }), messages).reasoning, { effort: 'high' });
  assert.deepEqual(
    buildBody(configOf({ reasoning: 'budget', reasoningBudget: '1024' }), messages).reasoning,
    { max_tokens: 1024 },
  );
});

test('hidden reasoning adds exclude only when reasoning is actively requested', () => {
  assert.deepEqual(
    buildBody(configOf({ reasoning: 'low', showReasoning: 'hide' }), messages).reasoning,
    { effort: 'low', exclude: true },
  );
  assert.deepEqual(buildBody(configOf({ showReasoning: 'hide' }), messages).reasoning, { effort: 'none' });
  assert.equal(buildBody(configOf({ reasoning: 'default', showReasoning: 'hide' }), messages).reasoning, undefined);
});

test('fallback models produce a models array led by the primary model', () => {
  const body = buildBody(configOf({ fallbackModels: 'c/d,e/f' }), messages);
  assert.deepEqual(body.models, ['a/b', 'c/d', 'e/f']);
});

test('provider object only when something is set', () => {
  assert.equal(buildBody(configOf(), messages).provider, undefined);
  const body = buildBody(
    configOf({ routing: 'throughput', providerOnly: 'openai', providerIgnore: 'x', dataPolicy: 'deny' }),
    messages,
  );
  assert.deepEqual(body.provider, { sort: 'throughput', only: ['openai'], ignore: ['x'], data_collection: 'deny' });
  assert.deepEqual(buildBody(configOf({ dataPolicy: 'zdr' }), messages).provider, { zdr: true });
});

test('optional sampling params are sent only when set', () => {
  const body = buildBody(configOf({ temperature: '0', maxTokens: '800', stream: 'off' }), messages);
  assert.equal(body.temperature, 0);
  assert.equal(body.max_tokens, 800);
  assert.equal(body.stream, false);
});

test('extraBody deep-merges last and wins', () => {
  const body = buildBody(
    configOf({ dataPolicy: 'deny', extraBody: '{"provider":{"zdr":true},"reasoning":{"effort":"low"},"top_p":0.5}' }),
    messages,
  );
  assert.deepEqual(body.provider, { data_collection: 'deny', zdr: true });
  assert.deepEqual(body.reasoning, { effort: 'low' });
  assert.equal(body.top_p, 0.5);
});

test('deepMerge does not mutate inputs and replaces arrays', () => {
  const a = { x: { y: 1 }, list: [1, 2] };
  const b = { x: { z: 2 }, list: [3] };
  const merged = deepMerge(a, b);
  assert.deepEqual(merged, { x: { y: 1, z: 2 }, list: [3] });
  assert.deepEqual(a, { x: { y: 1 }, list: [1, 2] });
});

test('headers: auth, attribution hidden, no cache by default', () => {
  const h = buildHeaders(configOf());
  assert.equal(h.Authorization, 'Bearer sk-or-test');
  assert.equal(h['Content-Type'], 'application/json');
  assert.equal(h['X-OpenRouter-App-Visibility'], 'hidden');
  assert.ok(h['HTTP-Referer'].startsWith('https://'));
  assert.equal(h['X-OpenRouter-Cache'], undefined);
});

test('headers: router metadata only when route info is shown', () => {
  assert.equal(buildHeaders(configOf())['X-OpenRouter-Metadata'], undefined);
  assert.equal(buildHeaders(configOf({ showRouteInfo: 'on' }))['X-OpenRouter-Metadata'], 'enabled');
});

test('headers: cache enabled with TTL', () => {
  const h = buildHeaders(configOf({ responseCache: '86400' }));
  assert.equal(h['X-OpenRouter-Cache'], 'true');
  assert.equal(h['X-OpenRouter-Cache-TTL'], '86400');
});

test('chatUrl joins base url', () => {
  assert.equal(chatUrl(configOf()), 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(chatUrl(configOf({ baseUrl: 'https://p.example/v1/' })), 'https://p.example/v1/chat/completions');
});
