const test = require('node:test');
const assert = require('node:assert/strict');
const { $data } = require('./helpers/fakeData');

// Bob globals, configured per test.
global.$data = $data;
global.$log = { info() {}, error() {} };

const main = require('../src/main');

const OPTIONS = { apiKey: 'sk-or-test', model: 'a/b' };

function makeQuery(over = {}) {
  const calls = { streams: [], completion: null };
  const query = {
    text: 'hello',
    from: 'auto',
    to: 'auto',
    detectFrom: 'en',
    detectTo: 'zh-Hans',
    cancelSignal: { id: 'sig' },
    onStream: (r) => calls.streams.push(r.result),
    onCompletion: (r) => {
      assert.equal(calls.completion, null, 'onCompletion called twice');
      calls.completion = r;
    },
    ...over,
  };
  return { query, calls };
}

function sse(objs) {
  return objs.map((o) => (o === '[DONE]' ? 'data: [DONE]\n\n' : `data: ${JSON.stringify(o)}\n\n`)).join('');
}

function streamingHttp(payload, { statusCode = 200, splitAt = 7, error } = {}) {
  const seen = {};
  global.$http = {
    streamRequest(req) {
      seen.req = req;
      const bytes = Buffer.from(payload, 'utf8');
      for (let i = 0; i < bytes.length; i += splitAt) {
        req.streamHandler({ text: '', rawData: $data.fromBuffer(bytes.subarray(i, i + splitAt)) });
      }
      req.handler({ response: { statusCode }, error });
    },
  };
  return seen;
}

test('supportLanguages and timeout come from config', () => {
  global.$option = { ...OPTIONS, timeout: '180' };
  assert.ok(main.supportLanguages().includes('zh-Hans'));
  assert.equal(main.pluginTimeoutInterval(), 180);
  global.$option = { timeout: 'garbage' };
  assert.equal(main.pluginTimeoutInterval(), 60);
});

test('config error short-circuits without a request', () => {
  global.$option = { model: 'a/b' };
  global.$http = { streamRequest: () => assert.fail('no request expected') };
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.error.type, 'secretKey');
});

test('streaming translate: reasoning + content frames, final result', () => {
  global.$option = { ...OPTIONS };
  const seen = streamingHttp(
    ': OPENROUTER PROCESSING\n\n' +
      sse([
        { choices: [{ delta: { reasoning: '想' } }] },
        { choices: [{ delta: { content: '你好' } }] },
        { choices: [{ delta: { content: '，世界' }, finish_reason: 'stop' }] },
        '[DONE]',
      ]),
  );
  const { query, calls } = makeQuery();
  main.translate(query);

  assert.equal(seen.req.method, 'POST');
  assert.equal(seen.req.url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(seen.req.cancelSignal, query.cancelSignal);
  assert.deepEqual(seen.req.body.reasoning, { effort: 'none' });
  assert.ok(calls.streams.length >= 2);
  assert.equal(calls.streams.at(-1).content.text, '你好，世界');
  assert.equal(calls.streams[0].thinkInfo.content, '想');
  assert.deepEqual(calls.completion.result.content, { format: 'markdown', text: '你好，世界' });
  assert.equal(calls.completion.result.thinkInfo.content, '想');
});

test('streaming translate: route info from the final chunk', () => {
  global.$option = { ...OPTIONS, showRouteInfo: 'on' };
  const seen = streamingHttp(
    sse([
      { model: 'a/b', provider: 'OpenAI', choices: [{ delta: { content: '你好' } }] },
      {
        model: 'a/b',
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 3, completion_tokens: 2, cost: 0.00002 },
        openrouter_metadata: { attempts: [{ provider: 'OpenAI', model: 'a/b', status: 200 }] },
      },
      '[DONE]',
    ]),
  );
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(seen.req.header['X-OpenRouter-Metadata'], 'enabled');
  assert.equal(calls.streams.at(-1).toDict, undefined);
  assert.deepEqual(calls.completion.result.toDict, {
    parts: [{ part: '路由', means: ['OpenAI · a/b · $0.00002（3→2 tok）'] }],
  });
});

test('streaming translate: HTTP error body is parsed', () => {
  global.$option = { ...OPTIONS };
  streamingHttp(JSON.stringify({ error: { message: 'User not found.', code: 401 } }), { statusCode: 401 });
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.error.type, 'secretKey');
  assert.match(calls.completion.error.message, /User not found/);
});

test('streaming translate: transport error', () => {
  global.$option = { ...OPTIONS };
  streamingHttp('', { statusCode: undefined, error: { message: 'offline' } });
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.error.type, 'network');
});

test('streaming translate: CRLF lines and mid-stream error on HTTP 200', () => {
  global.$option = { ...OPTIONS };
  streamingHttp(
    'data: {"choices":[{"delta":{"content":"部分"}}]}\r\n\r\n' +
      'data: {"error":{"code":502,"message":"Provider disconnected"},"choices":[{"delta":{},"finish_reason":"error"}]}\r\n\r\n' +
      'data: [DONE]\r\n\r\n',
  );
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.streams.at(-1).content.text, '部分');
  assert.equal(calls.completion.error.type, 'api');
  assert.match(calls.completion.error.message, /Provider disconnected/);
});

test('streaming translate: plain JSON body on HTTP 200 is still understood', () => {
  global.$option = { ...OPTIONS };
  streamingHttp(JSON.stringify({ choices: [{ message: { content: '你好' }, finish_reason: 'stop' }] }));
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.result.content.text, '你好');
});

test('streaming translate: no onStream after completion', () => {
  global.$option = { ...OPTIONS };
  let req;
  global.$http = { streamRequest: (r) => (req = r) };
  const { query, calls } = makeQuery();
  main.translate(query);
  req.handler({ response: { statusCode: 200 }, error: { message: 'cancelled' } });
  req.streamHandler({ text: '', rawData: $data.fromUTF8('data: {"choices":[{"delta":{"content":"late"}}]}\n') });
  assert.equal(calls.streams.length, 0);
  assert.equal(calls.completion.error.type, 'network');
});

test('non-stream translate: HTTP error and transport error', () => {
  global.$option = { ...OPTIONS, stream: 'off' };
  global.$http = { request: (r) => r.handler({ response: { statusCode: 429 }, data: { error: { message: 'Rate limited' } } }) };
  let { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.error.type, 'network');
  assert.match(calls.completion.error.message, /Rate limited/);

  global.$http = { request: (r) => r.handler({ error: { message: 'offline' } }) };
  ({ query, calls } = makeQuery());
  main.translate(query);
  assert.equal(calls.completion.error.type, 'network');

  global.$http = { request: (r) => r.handler({ response: { statusCode: 200 }, data: 'not json' }) };
  ({ query, calls } = makeQuery());
  main.translate(query);
  assert.equal(calls.completion.error.type, 'api');
});

test('non-stream translate uses $http.request', () => {
  global.$option = { ...OPTIONS, stream: 'off', outputFormat: 'plain' };
  let seen;
  global.$http = {
    request(req) {
      seen = req;
      req.handler({
        response: { statusCode: 200 },
        data: { choices: [{ message: { content: '你好' }, finish_reason: 'stop' }] },
      });
    },
  };
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(seen.body.stream, false);
  assert.deepEqual(calls.completion.result.content, { format: 'plain', text: '你好' });
});

test('polish mode reports the source language as target', () => {
  global.$option = { ...OPTIONS, mode: 'polish', stream: 'off' };
  global.$http = {
    request: (r) => r.handler({ response: { statusCode: 200 }, data: { choices: [{ message: { content: 'Hello.' }, finish_reason: 'stop' }] } }),
  };
  const { query, calls } = makeQuery();
  main.translate(query);
  assert.equal(calls.completion.result.from, 'en');
  assert.equal(calls.completion.result.to, 'en');
});

test('legacy completion callback is used when onCompletion is absent', () => {
  global.$option = { model: 'a/b' };
  let got;
  main.translate({ text: 'x', detectFrom: 'en', detectTo: 'zh-Hans' }, (r) => (got = r));
  assert.equal(got.error.type, 'secretKey');
});

function validateHttp(routes) {
  global.$http = {
    get(req) {
      const path = req.url.replace('https://openrouter.ai/api/v1', '');
      const [statusCode, data] = routes[path] || [404, { error: { message: 'not found' } }];
      req.handler({ response: { statusCode }, data });
    },
  };
}

test('pluginValidate: success', () => {
  global.$option = { ...OPTIONS, model: 'openai/gpt-x-mini' };
  validateHttp({
    '/key': [200, { data: { label: 'k' } }],
    '/model/openai/gpt-x-mini': [200, { data: { id: 'openai/gpt-x-mini' } }],
  });
  let got;
  main.pluginValidate((r) => (got = r));
  assert.deepEqual(got, { result: true });
});

test('pluginValidate: bad key', () => {
  global.$option = { ...OPTIONS };
  validateHttp({ '/key': [401, { error: { message: 'User not found.' } }] });
  let got;
  main.pluginValidate((r) => (got = r));
  assert.equal(got.result, false);
  assert.equal(got.error.type, 'secretKey');
});

test('pluginValidate: unknown model', () => {
  global.$option = { ...OPTIONS, model: 'nope/nope' };
  validateHttp({ '/key': [200, { data: {} }] });
  let got;
  main.pluginValidate((r) => (got = r));
  assert.equal(got.result, false);
  assert.match(got.error.message, /nope\/nope/);
});

test('pluginValidate: mandatory reasoning with off', () => {
  global.$option = { ...OPTIONS, model: 'openai/gpt-5' };
  validateHttp({
    '/key': [200, { data: {} }],
    '/model/openai/gpt-5': [200, { data: { reasoning: { mandatory: true, supported_efforts: ['high', 'minimal'] } } }],
  });
  let got;
  main.pluginValidate((r) => (got = r));
  assert.equal(got.result, false);
  assert.equal(got.error.type, 'param');
});

test('pluginValidate: transport errors on key and model lookups', () => {
  global.$option = { ...OPTIONS, model: 'openai/gpt-x' };
  global.$http = { get: (r) => r.handler({ error: { message: 'offline' } }) };
  let got;
  main.pluginValidate((r) => (got = r));
  assert.equal(got.error.type, 'network');

  global.$http = {
    get: (r) => (r.url.endsWith('/key') ? r.handler({ response: { statusCode: 200 }, data: {} }) : r.handler({ error: { message: 'offline' } })),
  };
  main.pluginValidate((r) => (got = r));
  assert.equal(got.error.type, 'network');
});

test('pluginValidate: config error', () => {
  global.$option = { model: 'a/b' };
  let got;
  main.pluginValidate((r) => (got = r));
  assert.equal(got.result, false);
  assert.equal(got.error.type, 'secretKey');
});

test('pluginValidate: presets skip the model check', () => {
  global.$option = { ...OPTIONS, model: '@preset/tr' };
  validateHttp({ '/key': [200, { data: {} }] });
  let got;
  main.pluginValidate((r) => (got = r));
  assert.deepEqual(got, { result: true });
});
