// Expo SDK 52's Windows extraction helper expects the removed tar default export.
// Keep its public API compatible with the security-patched named-export package.
const fs=require('node:fs');
const original='_tar().default.extract';
const replacement='(_tar().default ?? _tar()).extract';
for(const name of ['tar','npm']){
 const file=require.resolve(`@expo/cli/build/src/utils/${name}.js`);
 const source=fs.readFileSync(file,'utf8');
 if(!source.includes(replacement)){
  if(source.split(original).length!==2)throw Error('Expo tar helper changed. Review the compatibility patch before installing.');
  fs.writeFileSync(file,source.replace(original,replacement));
 }
}
