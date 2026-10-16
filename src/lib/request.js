// Build the OpenRouter chat completion request from a parsed config.

const HOMEPAGE = 'https://github.com/ChanningHe/bob-plugin-openrouter';
const APP_TITLE = 'Bob OpenRouter';

const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

// Recursive merge returning a new object; arrays and scalars from `patch` replace.
function deepMerge(base, patch) {
  return Object.keys(patch).reduce(
    (acc, key) => ({
      ...acc,
      [key]: isPlainObject(acc[key]) && isPlainObject(patch[key]) ? deepMerge(acc[key], patch[key]) : patch[key],
    }),
    { ...base },
  );
}

function buildReasoning(config) {
  const exclude = config.showReasoning ? {} : { exclude: true };
  switch (config.reasoning) {
    case 'default':
      return undefined;
    case 'off':
      return { effort: 'none' };
    case 'budget':
      return { max_tokens: config.reasoningBudget, ...exclude };
    default:
      return { effort: config.reasoning, ...exclude };
  }
}

function buildProvider(config) {
  const provider = {
    ...(config.routing !== 'default' && { sort: config.routing }),
    ...(config.providerOnly.length > 0 && { only: [...config.providerOnly] }),
    ...(config.providerIgnore.length > 0 && { ignore: [...config.providerIgnore] }),
    ...(config.dataPolicy === 'deny' && { data_collection: 'deny' }),
    ...(config.dataPolicy === 'zdr' && { zdr: true }),
  };
  return Object.keys(provider).length > 0 ? provider : undefined;
}

function buildBody(config, messages) {
  const reasoning = buildReasoning(config);
  const provider = buildProvider(config);
  const body = {
    model: config.model,
    ...(config.fallbackModels.length > 0 && { models: [config.model, ...config.fallbackModels] }),
    messages,
    stream: config.stream,
    ...(reasoning && { reasoning }),
    ...(provider && { provider }),
    ...(config.temperature !== null && { temperature: config.temperature }),
    ...(config.maxTokens !== null && { max_tokens: config.maxTokens }),
  };
  return config.extraBody ? deepMerge(body, config.extraBody) : body;
}

function buildHeaders(config) {
  return {
    Authorization: `Bearer ${config.apiKey}`,
    'Content-Type': 'application/json',
    'HTTP-Referer': HOMEPAGE,
    'X-OpenRouter-Title': APP_TITLE,
    'X-OpenRouter-App-Visibility': 'hidden',
    ...(config.showRouteInfo && { 'X-OpenRouter-Metadata': 'enabled' }),
    ...(config.cacheTtl !== null && {
      'X-OpenRouter-Cache': 'true',
      'X-OpenRouter-Cache-TTL': String(config.cacheTtl),
    }),
  };
}

function chatUrl(config) {
  return `${config.baseUrl}/chat/completions`;
}

module.exports = { buildBody, buildHeaders, chatUrl, deepMerge };
