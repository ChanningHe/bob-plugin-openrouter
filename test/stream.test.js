const test = require('node:test');
const assert = require('node:assert/strict');
const { $data } = require('./helpers/fakeData');
const { createLineBuffer } = require('../src/lib/lineBuffer');
const { parseSseLines } = require('../src/lib/sse');
const { INITIAL_STATE, reduceEvent, eventFromResponse } = require('../src/lib/stream');
const { toFrame, finalize } = require('../src/lib/result');
const { httpError, transportError } = require('../src/lib/errors');

const ctx = { showReasoning: true, outputFormat: 'markdown', from: 'en', to: 'zh-Hans' };
const chunk = (delta, finish = null) => ({ type: 'data', data: { choices: [{ delta, finish_reason: finish }] } });
const run = (events) => events.reduce(reduceEvent, INITIAL_STATE);

test('line buffer only releases complete lines', () => {
  const lb = createLineBuffer($data);
  assert.equal(lb.push($data.fromUTF8('data: {"a"')), '');
  assert.equal(lb.push($data.fromUTF8(':1}\ndata: [DO')), 'data: {"a":1}\n');
  assert.equal(lb.push($data.fromUTF8('NE]\n')), 'data: [DONE]\n');
  assert.equal(lb.flush(), '');
});

test('line buffer survives a UTF-8 character split across chunks', () => {
  const bytes = Buffer.from('data: 你好\n', 'utf8');
  const lb = createLineBuffer($data);
  // split inside the 3-byte encoding of 你
  assert.equal(lb.push($data.fromBuffer(bytes.subarray(0, 7))), '');
  assert.equal(lb.push($data.fromBuffer(bytes.subarray(7))), 'data: 你好\n');
});

test('line buffer flush returns trailing partial line', () => {
  const lb = createLineBuffer($data);
  lb.push($data.fromUTF8('{"error":{"message":"bad"}}'));
  assert.equal(lb.flush(), '{"error":{"message":"bad"}}');
  assert.equal(lb.flush(), '');
});

test('sse parser: data, done, comments, blanks, raw', () => {
  const events = parseSseLines(': OPENROUTER PROCESSING\r\n\ndata: {"x":1}\ndata:[DONE]\nnot sse\n');
  assert.deepEqual(events, [
    { type: 'data', data: { x: 1 } },
    { type: 'done' },
    { type: 'raw', line: 'not sse' },
  ]);
});

test('sse parser: invalid json in data line becomes raw', () => {
  assert.deepEqual(parseSseLines('data: {oops\n'), [{ type: 'raw', line: 'data: {oops' }]);
});

test('sse parser: non-object data payloads become raw', () => {
  assert.deepEqual(parseSseLines('data: null\ndata: 42\n'), [
    { type: 'raw', line: 'data: null' },
    { type: 'raw', line: 'data: 42' },
  ]);
});

test('reducer accumulates content and reasoning without mutating', () => {
  const s1 = reduceEvent(INITIAL_STATE, chunk({ reasoning: 'think ' }));
  const s2 = reduceEvent(s1, chunk({ reasoning: 'more', content: '你' }));
  const s3 = reduceEvent(s2, chunk({ content: '好' }, 'stop'));
  assert.equal(s1.content, '');
  assert.equal(s3.reasoning, 'think more');
  assert.equal(s3.content, '你好');
  assert.equal(s3.finishReason, 'stop');
  assert.equal(INITIAL_STATE.content, '');
});

test('reducer captures mid-stream errors and done', () => {
  const s = run([
    chunk({ content: 'part' }),
    { type: 'data', data: { error: { code: 502, message: 'Provider disconnected' }, choices: [{ delta: { content: '' }, finish_reason: 'error' }] } },
    { type: 'done' },
  ]);
  assert.equal(s.content, 'part');
  assert.equal(s.error.message, 'Provider disconnected');
  assert.equal(s.done, true);
});

test('reducer keeps raw lines for non-SSE error bodies', () => {
  const s = run([{ type: 'raw', line: '{"error":' }, { type: 'raw', line: '{"message":"x"}}' }]);
  assert.equal(s.raw, '{"error":\n{"message":"x"}}');
});

test('eventFromResponse normalizes a non-stream response', () => {
  const s = run([eventFromResponse({ choices: [{ message: { content: 'hi', reasoning: 'r' }, finish_reason: 'stop' }] })]);
  assert.equal(s.content, 'hi');
  assert.equal(s.reasoning, 'r');
  assert.equal(s.finishReason, 'stop');
});

test('toFrame shows reasoning only when enabled and present', () => {
  const s = run([chunk({ reasoning: 'r', content: 'c' })]);
  assert.deepEqual(toFrame(s, ctx), {
    from: 'en',
    to: 'zh-Hans',
    content: { format: 'markdown', text: 'c' },
    thinkInfo: { content: 'r' },
  });
  assert.equal(toFrame(s, { ...ctx, showReasoning: false }).thinkInfo, undefined);
  assert.equal(toFrame(run([chunk({ content: 'c' })]), ctx).thinkInfo, undefined);
});

test('finalize: success trims surrounding whitespace', () => {
  const { result, error } = finalize(run([chunk({ content: '\n 你好 \n' }, 'stop')]), ctx);
  assert.equal(error, undefined);
  assert.equal(result.content.text, '你好');
});

test('finalize: stream error wins but keeps partial content in addition', () => {
  const { error } = finalize(run([chunk({ content: 'x' }), { type: 'data', data: { error: { message: 'boom' } } }]), ctx);
  assert.equal(error.type, 'api');
  assert.match(error.message, /boom/);
  assert.equal(error.addition.partialContent, 'x');
});

test('finalize: stream that ended without [DONE] or finish_reason is incomplete', () => {
  const { error } = finalize(run([chunk({ content: 'half' })]), ctx);
  assert.equal(error.type, 'network');
  assert.equal(error.addition.partialContent, 'half');
});

test('finalize: empty content after length means reasoning ate the budget', () => {
  const { error } = finalize(run([chunk({ reasoning: 'long...' }, 'length')]), ctx);
  assert.equal(error.type, 'api');
  assert.match(error.message, /max_tokens/);
});

test('finalize: route info goes to toDict.parts only when enabled', () => {
  const s = run([{ type: 'data', data: { provider: 'OpenAI', choices: [{ delta: { content: 'hi' }, finish_reason: 'stop' }] } }]);
  assert.equal(finalize(s, ctx).result.toDict, undefined);
  const { result } = finalize(s, { ...ctx, showRouteInfo: true });
  assert.deepEqual(result.toDict, { parts: [{ part: '路由', means: ['OpenAI'] }] });
  assert.equal(result.content.text, 'hi');
});

test('finalize: route info enabled but nothing known adds no toDict', () => {
  const s = run([chunk({ content: 'hi' }, 'stop')]);
  assert.equal(finalize(s, { ...ctx, showRouteInfo: true }).result.toDict, undefined);
});

test('finalize: empty content otherwise', () => {
  const { error } = finalize(run([chunk({}, 'stop')]), ctx);
  assert.equal(error.type, 'api');
});

test('httpError maps status codes to Bob error types', () => {
  assert.equal(httpError(401, { error: { message: 'No auth' } }).type, 'secretKey');
  assert.equal(httpError(402, {}).type, 'network');
  assert.equal(httpError(429, {}).type, 'network');
  assert.equal(httpError(503, {}).type, 'network');
  const bad = httpError(400, { error: { message: 'Invalid model' } });
  assert.equal(bad.type, 'api');
  assert.match(bad.message, /Invalid model/);
  assert.match(bad.message, /400/);
});

test('httpError adds a hint when reasoning cannot be disabled', () => {
  const e = httpError(400, { error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' } });
  assert.match(e.message, /思考模式/);
});

test('transportError is a network error carrying the message', () => {
  const e = transportError({ message: 'The request timed out.', debugMessage: 'NSURLErrorDomain -1001' });
  assert.equal(e.type, 'network');
  assert.match(e.message, /timed out/);
  assert.equal(e.addition, 'NSURLErrorDomain -1001');
});
