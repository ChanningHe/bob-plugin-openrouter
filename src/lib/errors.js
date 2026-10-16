// Map HTTP / API failures to Bob service errors: { type, message, addition? }.

const REASONING_HINT = '（该模型可能强制开启思考，请把「思考模式」改为「模型默认」或某个思考强度）';

function apiMessage(data) {
  if (data && data.error) {
    if (typeof data.error === 'string') return data.error;
    if (data.error.message) return data.error.message;
  }
  return '';
}

function typeForStatus(status) {
  if (status === 401 || status === 403) return 'secretKey';
  if (status === 402 || status === 408 || status === 429 || status >= 500) return 'network';
  return 'api';
}

function withReasoningHint(message) {
  return /reasoning/i.test(message) && /(mandatory|disable|none|required)/i.test(message)
    ? message + REASONING_HINT
    : message;
}

function httpError(status, data) {
  const detail = apiMessage(data) || '请求失败';
  return {
    type: typeForStatus(status),
    message: withReasoningHint(`OpenRouter 返回 ${status}：${detail}`),
    addition: data,
  };
}

// Error object delivered inside a 200 stream or body: { code?, message, metadata? }.
function streamError(error) {
  const message = (error && error.message) || String(error);
  return { type: 'api', message: withReasoningHint(`OpenRouter 错误：${message}`), addition: error };
}

function transportError(error) {
  return {
    type: 'network',
    message: `网络请求失败：${(error && error.message) || '未知错误'}`,
    addition: error && error.debugMessage,
  };
}

module.exports = { httpError, streamError, transportError };
