const fs=require('node:fs');const path=require('node:path');const {createHash}=require('node:crypto');
const [label,...directories]=process.argv.slice(2);
if(!/^[a-z0-9-]+$/.test(label??'')||!directories.length)throw Error('Usage: node scripts/remediation-artifact-manifest.cjs label export-directories...');
const files=[];
function visit(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isDirectory())visit(file);
  else if(/\.(hbc|js|html|json)$/.test(entry.name)){const bytes=fs.readFileSync(file);files.push({path:path.relative(process.cwd(),file).replaceAll('\\','/'),bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});}
}}
for(const directory of directories)visit(directory);
const report={label,createdAt:new Date().toISOString(),limitations:'Export verification only; not an installed APK, device result, deployed artifact or participant acceptance.',files};
fs.writeFileSync(`tests/remediation/evidence/${label}-artifacts.json`,JSON.stringify(report,null,2)+'\n');
console.log(`Retained ${files.length} artifact hashes for ${label}.`);
