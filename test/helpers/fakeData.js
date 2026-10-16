// Minimal Node implementation of Bob's $data API, enough for the plugin's needs.
class FakeData {
  constructor(buf) {
    this.buf = buf;
  }
  get length() {
    return this.buf.length;
  }
  readUInt8(i) {
    return i >= 0 && i < this.buf.length ? this.buf[i] : 0;
  }
  subData(start, end) {
    return new FakeData(Buffer.from(this.buf.subarray(start, end)));
  }
  appendData(other) {
    this.buf = Buffer.concat([this.buf, other.buf]);
  }
  toUTF8() {
    return new TextDecoder('utf-8', { fatal: true }).decode(this.buf);
  }
}

const $data = {
  fromUTF8: (s) => new FakeData(Buffer.from(s, 'utf8')),
  fromData: (d) => new FakeData(Buffer.from(d.buf)),
  fromBuffer: (b) => new FakeData(Buffer.from(b)),
};

module.exports = { $data, FakeData };
