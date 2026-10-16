const test = require('node:test');
const assert = require('node:assert/strict');
const { buildRouteInfo } = require('../src/lib/routeInfo');
const { INITIAL_STATE, reduceEvent } = require('../src/lib/stream');

const state = (over) => ({ ...INITIAL_STATE, ...over });

test('reducer captures model, provider, usage and metadata from chunks', () => {
  const s = [
    { type: 'data', data: { model: 'openai/gpt-4o-mini', provider: 'OpenAI', choices: [{ delta: { content: 'a' } }] } },
    {
      type: 'data',
      data: {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0.0001 },
        openrouter_metadata: { attempts: [{ provider: 'OpenAI', model: 'openai/gpt-4o-mini', status: 200 }] },
      },
    },
  ].reduce(reduceEvent, INITIAL_STATE);
  assert.equal(s.model, 'openai/gpt-4o-mini');
  assert.equal(s.provider, 'OpenAI');
  assert.equal(s.usage.cost, 0.0001);
  assert.equal(s.metadata.attempts.length, 1);
});

test('one line: provider (with retries) · model · cost', () => {
  const line = buildRouteInfo(
    state({
      model: 'anthropic/claude-haiku-4.5',
      provider: 'Ignored',
      usage: { prompt_tokens: 120, completion_tokens: 45, cost: 0.000123 },
      metadata: {
        attempts: [
          { provider: 'Anthropic', model: 'anthropic/claude-haiku-4.5', status: 429 },
          { provider: 'Amazon Bedrock', model: 'anthropic/claude-haiku-4.5', status: 200 },
        ],
      },
    }),
  );
  assert.equal(line, 'Amazon Bedrock（重试：Anthropic 429） · anthropic/claude-haiku-4.5 · $0.000123（120→45 tok）');
});

test('provider falls back to selected endpoint, then top-level provider', () => {
  const fromEndpoints = buildRouteInfo(
    state({ metadata: { endpoints: { available: [{ provider: 'A', selected: false }, { provider: 'B', selected: true }] } } }),
  );
  assert.equal(fromEndpoints, 'B');
  assert.equal(buildRouteInfo(state({ provider: 'OpenAI' })), 'OpenAI');
});

test('reasoning tokens are shown when present', () => {
  const line = buildRouteInfo(
    state({ usage: { prompt_tokens: 1, completion_tokens: 30, cost: 0.01, completion_tokens_details: { reasoning_tokens: 20 } } }),
  );
  assert.equal(line, '$0.01（1→30 tok，思考 20）');
});

test('zero cost (e.g. cache hit) is still shown', () => {
  assert.equal(buildRouteInfo(state({ usage: { prompt_tokens: 0, completion_tokens: 0, cost: 0 } })), '$0（0→0 tok）');
});

test('nothing known yields null', () => {
  assert.equal(buildRouteInfo(INITIAL_STATE), null);
});
