// Investigate the existing browser test's 500 ms observation window under 4x CPU
// throttling. Keep application code unchanged and hold the mocked save for 3 s.
const fs = require('node:fs'); const path = require('node:path'); const Module = require('node:module');
const file = path.resolve(__dirname, '../owner-dashboard/browser.cjs');
let source = fs.readFileSync(file, 'utf8');
source = source.replace('window.__ownerTest.mutationDelay=500;', 'window.__ownerTest.mutationDelay=3000;');
source = source.replace('for(const device of cases) {', "for(const device of cases.filter(d => ['xiaomi-pad5-large-text','vivo-y29-dark','xiaomi-pad5-dark'].includes(d.name))) {");
const moduleUnderTest = new Module(file, module); moduleUnderTest.filename = file; moduleUnderTest.paths = Module._nodeModulePaths(path.dirname(file)); moduleUnderTest._compile(source, file);
