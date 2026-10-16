// End-to-end smoke test against the real OpenRouter API, with Bob's runtime shimmed in Node.
// Usage: OPENROUTER_API_KEY=sk-or-... node scripts/smoke.js [model] [reasoning]
const { $data } = require('../test/helpers/fakeData');

global.$data = $data;
global.$log = { info: console.log, error: console.error };

async function send(req) {
  const isGet = (req.method || 'GET') === 'GET';
  try {
    const res = await fetch(req.url, {
      method: req.method || 'GET',
      headers: req.header,
      body: isGet ? undefined : JSON.stringify(req.body),
      signal: AbortSignal.timeout((req.timeout || 60) * 1000),
    });
    return { res };
  } catch (error) {
    return { error: { message: error.message, debugMessage: String(error) } };
  }
}

global.$http = {
  async get(req) {
    const { res, error } = await send({ ...req, method: 'GET' });
    if (error) return req.handler({ error });
    const text = await res.text();
    let data = text;
    try {
      data = JSON.parse(text);
    } catch (e) {
      // keep raw text, like Bob does
    }
    req.handler({ response: { statusCode: res.status }, data });
  },
  async request(req) {
    const { res, error } = await send(req);
    if (error) return req.handler({ error });
    req.handler({ response: { statusCode: res.status }, data: await res.json().catch(() => null) });
  },
  async streamRequest(req) {
    const { res, error } = await send(req);
    if (error) return req.handler({ error });
    for await (const part of res.body) {
      req.streamHandler({ text: '', rawData: $data.fromBuffer(part) });
    }
    req.handler({ response: { statusCode: res.status } });
  },
};

const main = require('../src/main');
const [model = 'google/gemini-2.5-flash', reasoning = 'off'] = process.argv.slice(2);
global.$option = { apiKey: process.env.OPENROUTER_API_KEY || 'sk-or-invalid', model, reasoning, showRouteInfo: 'on' };

main.pluginValidate((r) => console.log('validate:', JSON.stringify(r)));

let frames = 0;
main.translate({
  text: 'The quick brown fox jumps over the lazy dog.',
  from: 'auto',
  to: 'auto',
  detectFrom: 'en',
  detectTo: 'zh-Hans',
  onStream: () => frames++,
  onCompletion: (r) => console.log(`translate (${frames} stream frames):`, JSON.stringify(r, null, 2)),
});
