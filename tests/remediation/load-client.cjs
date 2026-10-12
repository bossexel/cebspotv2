const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const ts=require('typescript');
module.exports=function load(file,imports={},globals={}) {
  const exports={};
  const code=ts.transpileModule(fs.readFileSync(path.resolve(__dirname,'../..',file),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022},fileName:file}).outputText;
  vm.runInNewContext(code,{exports,require(name){if(!(name in imports))throw Error('Unexpected dependency: '+name);return imports[name];},console,Date,URL,ArrayBuffer,Uint8Array,TextEncoder,TextDecoder,setTimeout,clearTimeout,process:{env:{}},...globals});
  return exports;
};
