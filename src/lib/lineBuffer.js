// Byte-level line buffer for $http.streamRequest chunks.
// Chunks can split anywhere, including inside a multi-byte UTF-8 character, so we
// buffer raw bytes and only decode up to the last '\n' (ASCII, never inside a character).

const NEWLINE = 0x0a;

function lastNewline(data) {
  for (let i = data.length - 1; i >= 0; i--) {
    if (data.readUInt8(i) === NEWLINE) return i;
  }
  return -1;
}

// dataApi is Bob's $data (injected for testability).
function createLineBuffer(dataApi) {
  let pending = null;

  function push(chunk) {
    if (!chunk || chunk.length === 0) return '';
    if (pending === null) {
      pending = dataApi.fromData(chunk);
    } else {
      pending.appendData(chunk);
    }
    const idx = lastNewline(pending);
    if (idx < 0) return '';
    const text = pending.subData(0, idx + 1).toUTF8() || '';
    pending = idx + 1 < pending.length ? pending.subData(idx + 1, pending.length) : null;
    return text;
  }

  function flush() {
    if (pending === null) return '';
    const text = pending.toUTF8() || '';
    pending = null;
    return text;
  }

  return { push, flush };
}

module.exports = { createLineBuffer };
