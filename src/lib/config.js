// Parse Bob's $option (all strings) into a validated, frozen config object.

const DEFAULT_BASE_URL = 'https://openrouter.ai/api/v1';
const DEFAULT_TIMEOUT = 60;
const MAX_TEMPERATURE = 2;

// identifier -> { title, values, default } for every menu option.
const MENUS = {
  reasoning: {
    title: '思考模式',
    values: ['default', 'off', 'minimal', 'low', 'medium', 'high', 'xhigh', 'budget'],
    default: 'off',
  },
  showReasoning: { title: '显示思考过程', values: ['show', 'hide'], default: 'show' },
  routing: { title: '路由策略', values: ['default', 'price', 'throughput', 'latency'], default: 'default' },
  dataPolicy: { title: '数据策略', values: ['default', 'deny', 'zdr'], default: 'default' },
  polishMode: { title: '同语言润色', values: ['off', 'on'], default: 'off' },
  showRouteInfo: { title: '显示路由信息', values: ['off', 'on'], default: 'off' },
  outputFormat: { title: '译文格式', values: ['markdown', 'plain'], default: 'markdown' },
  stream: { title: '流式输出', values: ['on', 'off'], default: 'on' },
  responseCache: { title: '响应缓存', values: ['off', '300', '3600', '86400'], default: 'off' },
  timeout: { title: '超时', values: ['60', '120', '180', '300'], default: String(DEFAULT_TIMEOUT) },
};

class ConfigError extends Error {
  constructor(type, message) {
    super(message);
    this.type = type;
  }
}

const str = (v) => (typeof v === 'string' ? v.trim() : '');

const list = (v) =>
  Object.freeze(
    str(v)
      .split(/[,\n]/)
      .map((s) => s.trim())
      .filter(Boolean),
  );

function menu(options, id) {
  const spec = MENUS[id];
  const value = str(options[id]) || spec.default;
  if (!spec.values.includes(value)) {
    throw new ConfigError('param', `「${spec.title}」的值无效：${value}`);
  }
  return value;
}

function positiveInt(raw, title) {
  if (!/^\d+$/.test(raw) || Number(raw) <= 0) {
    throw new ConfigError('param', `「${title}」必须是正整数：${raw}`);
  }
  return Number(raw);
}

function optionalPositiveInt(raw, title) {
  return raw ? positiveInt(raw, title) : null;
}

function optionalTemperature(raw) {
  if (!raw) return null;
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0 || n > MAX_TEMPERATURE) {
    throw new ConfigError('param', `「Temperature」必须是 0 到 ${MAX_TEMPERATURE} 之间的数字：${raw}`);
  }
  return n;
}

function optionalJsonObject(raw) {
  if (!raw) return null;
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (e) {
    throw new ConfigError('param', `「额外请求参数」不是合法 JSON：${e.message}`);
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new ConfigError('param', '「额外请求参数」必须是 JSON 对象，例如 {"top_p": 0.9}');
  }
  return parsed;
}

function baseUrl(raw) {
  if (!raw) return DEFAULT_BASE_URL;
  if (!/^https?:\/\/\S+$/.test(raw)) {
    throw new ConfigError('param', `「API 地址」必须以 http:// 或 https:// 开头：${raw}`);
  }
  return raw.replace(/\/+$/, '');
}

function build(options) {
  const apiKey = str(options.apiKey);
  if (!apiKey) throw new ConfigError('secretKey', '请先在插件设置中填写 OpenRouter API Key');
  const model = str(options.model);
  if (!model) throw new ConfigError('param', '请先在插件设置中填写模型，例如 google/gemini-2.5-flash');

  const reasoning = menu(options, 'reasoning');
  const cache = menu(options, 'responseCache');

  return Object.freeze({
    apiKey,
    model,
    fallbackModels: list(options.fallbackModels),
    reasoning,
    reasoningBudget: reasoning === 'budget' ? positiveInt(str(options.reasoningBudget), '思考 Token 预算') : null,
    showReasoning: menu(options, 'showReasoning') === 'show',
    routing: menu(options, 'routing'),
    providerOnly: list(options.providerOnly),
    providerIgnore: list(options.providerIgnore),
    dataPolicy: menu(options, 'dataPolicy'),
    systemPrompt: str(options.systemPrompt) || null,
    userPrompt: str(options.userPrompt) || null,
    polishMode: menu(options, 'polishMode') === 'on',
    showRouteInfo: menu(options, 'showRouteInfo') === 'on',
    temperature: optionalTemperature(str(options.temperature)),
    maxTokens: optionalPositiveInt(str(options.maxTokens), '最大输出 Token'),
    outputFormat: menu(options, 'outputFormat'),
    stream: menu(options, 'stream') === 'on',
    cacheTtl: cache === 'off' ? null : Number(cache),
    timeout: Number(menu(options, 'timeout')),
    extraBody: optionalJsonObject(str(options.extraBody)),
    baseUrl: baseUrl(str(options.baseUrl)),
  });
}

// Returns { config } on success or { error: BobServiceError } on failure.
function parseConfig(options) {
  try {
    return { config: build(options || {}) };
  } catch (e) {
    if (e instanceof ConfigError) return { error: { type: e.type, message: e.message } };
    throw e;
  }
}

module.exports = { parseConfig, DEFAULT_BASE_URL, DEFAULT_TIMEOUT };
