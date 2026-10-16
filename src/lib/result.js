// Turn reducer state into Bob translate results.
const { streamError } = require('./errors.js');
const { buildRouteInfo } = require('./routeInfo.js');

// ctx: { showReasoning, outputFormat, from, to }
function toFrame(state, ctx) {
  return {
    from: ctx.from,
    to: ctx.to,
    content: { format: ctx.outputFormat, text: state.content },
    ...(ctx.showReasoning && state.reasoning && { thinkInfo: { content: state.reasoning } }),
  };
}

// Returns { result } or { error }.
function finalize(state, ctx) {
  if (state.error) {
    const error = streamError(state.error);
    return { error: { ...error, addition: { error: error.addition, partialContent: state.content } } };
  }
  const text = state.content.trim();
  if (text && !state.done && !state.finishReason) {
    return {
      error: {
        type: 'network',
        message: '响应不完整：连接在译文完成前中断',
        addition: { partialContent: state.content },
      },
    };
  }
  if (!text) {
    const message =
      state.finishReason === 'length'
        ? '输出被截断：思考过程消耗了全部 max_tokens。请调大「最大输出 Token」或降低「思考模式」'
        : '模型没有返回译文';
    return { error: { type: 'api', message, addition: { finishReason: state.finishReason } } };
  }
  const frame = toFrame({ ...state, content: text }, ctx);
  const route = ctx.showRouteInfo ? buildRouteInfo(state) : null;
  // toDict.parts renders "label  text" on one line; additions would put the name on its own line.
  return { result: route ? { ...frame, toDict: { parts: [{ part: '路由', means: [route] }] } } : frame };
}

module.exports = { toFrame, finalize };
