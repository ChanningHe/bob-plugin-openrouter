// Parse complete SSE lines into events.
// Event shapes: { type: 'data', data } | { type: 'done' } | { type: 'raw', line }

function parseLine(line) {
  if (!line.startsWith('data:')) return { type: 'raw', line };
  const payload = line.slice('data:'.length).trim();
  if (payload === '[DONE]') return { type: 'done' };
  let data;
  try {
    data = JSON.parse(payload);
  } catch (e) {
    return { type: 'raw', line };
  }
  return data !== null && typeof data === 'object' ? { type: 'data', data } : { type: 'raw', line };
}

function parseSseLines(text) {
  return text
    .split('\n')
    .map((line) => line.replace(/\r$/, ''))
    .filter((line) => line.trim() !== '' && !line.startsWith(':'))
    .map(parseLine);
}

module.exports = { parseSseLines };
