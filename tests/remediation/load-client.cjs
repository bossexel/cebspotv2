const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const ts = require('typescript');

const root = path.resolve(__dirname, '../..');
const sourceRoot = path.join(root, 'src') + path.sep;

module.exports = function load(file, imports = {}, globals = {}) {
  const modules = new Map();

  function loadModule(absolutePath) {
    if (modules.has(absolutePath)) return modules.get(absolutePath);
    const exports = {};
    modules.set(absolutePath, exports);
    const code = ts.transpileModule(fs.readFileSync(absolutePath, 'utf8'), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
      fileName: absolutePath,
    }).outputText;

    vm.runInNewContext(code, {
      exports,
      require(name) {
        if (Object.hasOwn(imports, name)) return imports[name];
        if (name.startsWith('.')) {
          const resolved = path.resolve(path.dirname(absolutePath), name);
          const dependency = [resolved + '.ts', resolved + '.tsx', path.join(resolved, 'index.ts')]
            .find(candidate => candidate.startsWith(sourceRoot) && fs.existsSync(candidate));
          if (dependency) return loadModule(dependency);
        }
        throw Error('Unexpected dependency: ' + name);
      },
      console, Date, URL, ArrayBuffer, Uint8Array, TextEncoder, TextDecoder, setTimeout, clearTimeout,
      process: { env: {} },
      ...globals,
    }, { filename: absolutePath });
    return exports;
  }

  return loadModule(path.resolve(root, file));
};
