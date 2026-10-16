// Check a model's reasoning metadata (GET /model/{author}/{slug}) against the config.

// Routing variants are not catalog entries; strip them before lookup.
const ROUTING_VARIANTS = /:(nitro|floor|exacto|online)$/;

// Returns the API path for the model lookup, or null when the model cannot be looked up
// (presets, OpenRouter routers, malformed ids).
function modelLookupPath(model) {
  if (model.startsWith('@') || model.startsWith('openrouter/')) return null;
  const id = model.replace(ROUTING_VARIANTS, '');
  return /^[^/\s]+\/[^/\s]+$/.test(id) ? `/model/${id}` : null;
}

// Returns null when compatible, otherwise a user-facing message.
function checkModelCompat(model, config) {
  const info = model.reasoning;
  const mode = config.reasoning;
  if (mode === 'default') return null;

  if (!info) {
    return mode === 'off' ? null : '该模型不支持思考，请把「思考模式」设为「关闭」或「模型默认」';
  }

  const efforts = info.supported_efforts;
  if (mode === 'off') {
    if (!info.mandatory) return null;
    const hint = Array.isArray(efforts) && efforts.length ? `，可选强度：${efforts.join(' / ')}` : '';
    return `该模型强制开启思考，无法关闭。请把「思考模式」改为「模型默认」或最低强度${hint}`;
  }

  if (mode === 'budget') {
    return info.supports_max_tokens ? null : '该模型不支持按 Token 预算控制思考，请改用思考强度';
  }

  if (Array.isArray(efforts) && !efforts.includes(mode)) {
    return `该模型不支持思考强度 ${mode}，可选：${efforts.join(' / ')}`;
  }
  return null;
}

module.exports = { modelLookupPath, checkModelCompat };
