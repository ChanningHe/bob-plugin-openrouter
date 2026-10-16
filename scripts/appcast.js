// Prepend a release to appcast.json (https://bobtranslate.com/plugin/quickstart/publish.html).
// Usage: node scripts/appcast.js <path-to.bobplugin>
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const root = path.join(__dirname, '..');
const info = require(path.join(root, 'src/info.json'));
const pluginPath = process.argv[2];

if (!pluginPath || !fs.existsSync(pluginPath)) {
  console.error('usage: node scripts/appcast.js <path-to.bobplugin>');
  process.exit(1);
}

const tag = `v${info.version}`;
const file = path.join(root, 'appcast.json');
const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { versions: [] };

const entry = {
  version: info.version,
  desc: `${info.homepage}/releases/tag/${tag}`,
  sha256: crypto.createHash('sha256').update(fs.readFileSync(pluginPath)).digest('hex'),
  url: `${info.homepage}/releases/download/${tag}/${path.basename(pluginPath)}`,
  minBobVersion: info.minBobVersion,
  timestamp: Date.now(),
};

const versions = [entry, ...current.versions.filter((v) => v.version !== info.version)];
fs.writeFileSync(file, JSON.stringify({ identifier: info.identifier, versions }, null, 2) + '\n');
console.log(`appcast.json: ${tag} ${entry.sha256}`);
