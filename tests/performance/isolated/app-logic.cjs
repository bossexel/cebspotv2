'use strict';
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const { root } = require('./config.cjs');
function loadTs(relative) {
  const file = path.resolve(root, relative);
  if (!file.startsWith(path.join(root, 'src', 'utils') + path.sep)) throw Error('Only app utility modules may be loaded');
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 }, fileName: file }).outputText;
  const exports = {};
  Function('exports', 'require', output)(exports, name => loadTs(path.relative(root, path.resolve(path.dirname(file), name + '.ts'))));
  return exports;
}
function discoveryLogic() {
  const file = path.join(root, 'app/index.tsx');
  const source = ts.createSourceFile(file, fs.readFileSync(file, 'utf8'), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  let filterBody;
  const functions = source.statements.filter(s => ts.isFunctionDeclaration(s) && ['enhanceSpots', 'compareSpotsForDiscovery'].includes(s.name?.text));
  function visit(node) {
    if (ts.isVariableDeclaration(node) && node.name.getText(source) === 'filteredSpots') filterBody = node.initializer?.arguments?.[0]?.body;
    ts.forEachChild(node, visit);
  }
  visit(source);
  if (!filterBody || functions.length !== 2) throw Error('Discovery implementation changed: update source extractor');
  const code = functions.map(f => f.getText(source)).join('\n') + '\nexports.filter = function(spots,search,filters)' + filterBody.getText(source) +
    '; exports.enhance = enhanceSpots;';
  const output = ts.transpileModule(code, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports = {};
  Function('exports', 'calculateHaversineDistanceKm', 'cebuRegion', output)(exports,
    loadTs('src/utils/distance.ts').calculateHaversineDistanceKm, { latitude: 10.3298, longitude: 123.9054 });
  return exports;
}
module.exports = { loadTs, discoveryLogic };
