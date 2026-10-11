// Independent process: a GUI runtime's exit code is not sufficient evidence.
const { readdirSync, statSync, readFileSync, existsSync } = require('node:fs');
const path = require('node:path');
const root = process.env.NEOARES_QA_OUTPUT;
if (!root) throw Error('NEOARES_QA_OUTPUT is required');
function result(prefix) {
  const latest = readdirSync(root).filter(name => name.startsWith(prefix))
    .map(name => path.join(root, name)).sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs)[0];
  if (!latest || existsSync(path.join(latest, 'failure.json'))) throw Error(`Failed or missing evidence: ${prefix}`);
  return JSON.parse(readFileSync(path.join(latest, 'result.json'), 'utf8'));
}
const windows = result('neoares-full-player-');
if (windows.failure || windows.checks.length < 21 || windows.checks.some(check => !check.passed) || windows.errors.length) throw Error('Incomplete window verification');
const visualizer = result('neoares-visualizer-proof-');
if (visualizer.snapshots.length !== 8 || visualizer.renderErrors.length) throw Error('Incomplete preset verification');
console.log('PASS independent evidence gate: 21 window checks and eight rendered presets');
