const {test}=require('node:test');const assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path');
test('patched tar remains compatible with the actual Expo CLI archive extraction path',async()=>{
 const tar=require('tar');
 const directory=fs.mkdtempSync(path.resolve('.codex-tmp/tar-compatibility-'));
 const output=path.join(directory,'output');fs.mkdirSync(output);
 fs.writeFileSync(path.join(directory,'synthetic.txt'),'Synthetic archive compatibility fixture.');
 const archive=path.join(directory,'synthetic.tar');
 await tar.create({cwd:directory,file:archive,portable:true},['synthetic.txt']);
 await require('@expo/cli/build/src/utils/tar').extractAsync(archive,output);
 assert.equal(fs.readFileSync(path.join(output,'synthetic.txt'),'utf8'),'Synthetic archive compatibility fixture.');
 const npmOutput=path.join(directory,'npm-output');fs.mkdirSync(npmOutput);
 await require('@expo/cli/build/src/utils/npm').extractLocalNpmTarballAsync(archive,{cwd:npmOutput,strip:0,name:'synthetic'});
 assert.equal(fs.readFileSync(path.join(npmOutput,'synthetic.txt'),'utf8'),'Synthetic archive compatibility fixture.');
 assert.equal(require('../../package.json').overrides.tar,'7.5.21');
});
