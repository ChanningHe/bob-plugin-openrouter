// Summarize which provider/model served the request and what it cost.

const COST_DECIMALS = 8;
const HTTP_OK = 200;

function formatCost(cost) {
  if (cost === 0) return '$0';
  return '$' + cost.toFixed(COST_DECIMALS).replace(/\.?0+$/, '');
}

function describeAttempts(attempts) {
  const index = attempts.map((a) => a.status).lastIndexOf(HTTP_OK);
  if (index < 0) return null;
  const provider = attempts[index].provider;
  if (index === 0) return provider;
  const prior = attempts
    .slice(0, index)
    .map((a) => `${a.provider} ${a.status}`)
    .join('、');
  return `${provider}（重试：${prior}）`;
}

function selectedEndpoint(metadata) {
  const available = (metadata.endpoints && metadata.endpoints.available) || [];
  const selected = available.find((e) => e.selected);
  return selected ? selected.provider : null;
}

function providerOf(state) {
  const metadata = state.metadata || {};
  const fromAttempts = Array.isArray(metadata.attempts) ? describeAttempts(metadata.attempts) : null;
  return fromAttempts || selectedEndpoint(metadata) || state.provider;
}

function costOf(usage) {
  if (!usage || typeof usage.cost !== 'number') return null;
  const details = usage.completion_tokens_details || {};
  const reasoning = details.reasoning_tokens ? `，思考 ${details.reasoning_tokens}` : '';
  return `${formatCost(usage.cost)}（${usage.prompt_tokens}→${usage.completion_tokens} tok${reasoning}）`;
}

// One compact line "provider · model · cost", or null when nothing is known.
function buildRouteInfo(state) {
  const parts = [providerOf(state), state.model, costOf(state.usage)].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : null;
}

module.exports = { buildRouteInfo };
