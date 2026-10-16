// Bob plugin entry: https://bobtranslate.com/plugin/quickstart/translate.html
var lang = require('./lib/lang.js');
var configLib = require('./lib/config.js');
var prompt = require('./lib/prompt.js');
var request = require('./lib/request.js');
var compat = require('./lib/compat.js');
var errors = require('./lib/errors.js');
var sse = require('./lib/sse.js');
var stream = require('./lib/stream.js');
var result = require('./lib/result.js');
var lineBufferLib = require('./lib/lineBuffer.js');

var MIN_TIMEOUT = 30;
var MAX_TIMEOUT = 300;

function once(fn) {
  var called = false;
  return function (value) {
    if (called) return;
    called = true;
    fn(value);
  };
}

function statusOf(resp) {
  return resp && resp.response ? resp.response.statusCode : undefined;
}

function parseJson(text) {
  try {
    return JSON.parse(text);
  } catch (e) {
    return null;
  }
}

function supportLanguages() {
  return lang.supportLanguages();
}

function pluginTimeoutInterval() {
  var t = Number($option && $option.timeout);
  return t >= MIN_TIMEOUT && t <= MAX_TIMEOUT ? t : configLib.DEFAULT_TIMEOUT;
}

function hasStreamData(state) {
  return state.content !== '' || state.reasoning !== '' || state.finishReason !== null || state.error !== null;
}

// A server or proxy may ignore `stream: true` and answer with a plain JSON body.
function recoverPlainBody(state) {
  if (hasStreamData(state)) return state;
  var body = parseJson(state.raw);
  if (!body || typeof body !== 'object' || !Array.isArray(body.choices)) return state;
  return Object.assign({}, stream.reduceEvent(stream.INITIAL_STATE, stream.eventFromResponse(body)), { done: true });
}

function streamOutcome(resp, state, ctx) {
  var status = statusOf(resp);
  if (status >= 400) {
    var body = parseJson(state.raw) || { error: { message: state.raw } };
    return { error: errors.httpError(status, body) };
  }
  if (resp.error && !state.done) return { error: errors.transportError(resp.error) };
  return result.finalize(recoverPlainBody(state), ctx);
}

function streamTranslate(config, query, ctx, req, complete) {
  var buffer = lineBufferLib.createLineBuffer($data);
  var state = stream.INITIAL_STATE;
  var finished = false;

  function apply(text) {
    if (finished) return;
    var before = state;
    state = sse.parseSseLines(text).reduce(stream.reduceEvent, state);
    var changed = state.content !== before.content || state.reasoning !== before.reasoning;
    if (changed && typeof query.onStream === 'function') {
      query.onStream({ result: result.toFrame(state, ctx) });
    }
  }

  $http.streamRequest(
    Object.assign({}, req, {
      streamHandler: function (chunk) {
        apply(buffer.push(chunk.rawData));
      },
      handler: function (resp) {
        apply(buffer.flush());
        finished = true;
        complete(streamOutcome(resp, state, ctx));
      },
    }),
  );
}

function plainTranslate(config, query, ctx, req, complete) {
  $http.request(
    Object.assign({}, req, {
      handler: function (resp) {
        var status = statusOf(resp);
        if (resp.error && !status) return complete({ error: errors.transportError(resp.error) });
        if (status >= 400) return complete({ error: errors.httpError(status, resp.data) });
        if (!resp.data || typeof resp.data !== 'object') {
          return complete({ error: { type: 'api', message: 'OpenRouter 返回了无法解析的数据', addition: resp.data } });
        }
        var state = stream.reduceEvent(stream.INITIAL_STATE, stream.eventFromResponse(resp.data));
        complete(result.finalize(state, ctx));
      },
    }),
  );
}

function translate(query, completion) {
  var complete = once(query.onCompletion || completion);
  var parsed = configLib.parseConfig($option);
  if (parsed.error) return complete({ error: parsed.error });
  var config = parsed.config;

  var ctx = {
    showReasoning: config.showReasoning,
    outputFormat: config.outputFormat,
    showRouteInfo: config.showRouteInfo,
    from: query.detectFrom,
    to: query.detectTo,
  };
  var req = {
    method: 'POST',
    url: request.chatUrl(config),
    header: request.buildHeaders(config),
    body: request.buildBody(config, prompt.buildMessages(config, query)),
    timeout: config.timeout,
    cancelSignal: query.cancelSignal,
  };

  if (config.stream) {
    streamTranslate(config, query, ctx, req, complete);
  } else {
    plainTranslate(config, query, ctx, req, complete);
  }
}

function getJson(config, path, handler) {
  $http.get({
    url: config.baseUrl + path,
    header: { Authorization: 'Bearer ' + config.apiKey },
    timeout: config.timeout,
    handler: handler,
  });
}

function validateModel(config, done) {
  var path = compat.modelLookupPath(config.model);
  if (!path) return done({ result: true });
  getJson(config, path, function (resp) {
    var status = statusOf(resp);
    if (status === 404) {
      return done({ result: false, error: { type: 'param', message: '找不到模型：' + config.model } });
    }
    if (status !== 200) {
      var err = status ? errors.httpError(status, resp.data) : errors.transportError(resp.error);
      return done({ result: false, error: err });
    }
    var message = compat.checkModelCompat((resp.data && resp.data.data) || {}, config);
    done(message ? { result: false, error: { type: 'param', message: message } } : { result: true });
  });
}

function pluginValidate(completion) {
  var done = once(completion);
  var parsed = configLib.parseConfig($option);
  if (parsed.error) return done({ result: false, error: parsed.error });
  var config = parsed.config;

  getJson(config, '/key', function (resp) {
    var status = statusOf(resp);
    if (status !== 200) {
      var err = status ? errors.httpError(status, resp.data) : errors.transportError(resp.error);
      return done({ result: false, error: err });
    }
    validateModel(config, done);
  });
}

if (typeof module !== 'undefined') {
  module.exports = {
    supportLanguages: supportLanguages,
    translate: translate,
    pluginValidate: pluginValidate,
    pluginTimeoutInterval: pluginTimeoutInterval,
  };
}
