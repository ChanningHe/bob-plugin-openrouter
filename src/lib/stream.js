// Pure reducer folding SSE events into translation state.

const MAX_RAW_LENGTH = 8192;

const INITIAL_STATE = Object.freeze({
  content: '',
  reasoning: '',
  finishReason: null,
  error: null,
  done: false,
  raw: '',
  model: null,
  provider: null,
  usage: null,
  metadata: null,
});

function appendRaw(raw, line) {
  const next = raw ? `${raw}\n${line}` : line;
  return next.slice(0, MAX_RAW_LENGTH);
}

function reduceData(state, data) {
  const choice = (data.choices && data.choices[0]) || {};
  const delta = choice.delta || {};
  return Object.freeze({
    ...state,
    content: state.content + (typeof delta.content === 'string' ? delta.content : ''),
    reasoning: state.reasoning + (typeof delta.reasoning === 'string' ? delta.reasoning : ''),
    finishReason: choice.finish_reason || state.finishReason,
    error: data.error || state.error,
    model: data.model || state.model,
    provider: data.provider || state.provider,
    usage: data.usage || state.usage,
    metadata: data.openrouter_metadata || state.metadata,
  });
}

function reduceEvent(state, event) {
  switch (event.type) {
    case 'data':
      return reduceData(state, event.data);
    case 'done':
      return Object.freeze({ ...state, done: true });
    case 'raw':
      return Object.freeze({ ...state, raw: appendRaw(state.raw, event.line) });
    default:
      return state;
  }
}

// Normalize a non-stream response into a single data event.
function eventFromResponse(data) {
  const choices = (data.choices || []).map((c) => ({ delta: c.message || {}, finish_reason: c.finish_reason }));
  return { type: 'data', data: { ...data, choices } };
}

module.exports = { INITIAL_STATE, reduceEvent, eventFromResponse };
