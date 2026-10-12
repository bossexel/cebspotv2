// Never print or retain credential values or matching source lines.
const fs=require('node:fs'),path=require('node:path');
const {execFileSync}=require('node:child_process');
const root=path.resolve(__dirname,'..');
const git=args=>execFileSync('git',args,{cwd:root,encoding:'utf8',maxBuffer:100e6,windowsHide:true});
function scan(bytes,known=[]) {
 const kinds=new Set();
 for(const secret of known)if(bytes.includes(Buffer.from(secret)))kinds.add('known-private-value');
 const text=bytes.toString('utf8');
 for(const token of text.match(/\b(?:sk_live_|sk_test_|whsk_|sb_secret_)[A-Za-z0-9_-]{20,}\b/g)||[])if(!/synthetic|fixture|placeholder|example/i.test(token))kinds.add('private-key-pattern');
 for(const token of text.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g)||[]){try{if(JSON.parse(Buffer.from(token.split('.')[1],'base64url')).role==='service_role')kinds.add('service-role-jwt')}catch{}}
 return [...kinds];
}
if(require.main===module){
 const known=[];
 for(const file of ['.env.local','.env.test.local']){
  if(!fs.existsSync(path.join(root,file)))continue;
  for(const line of fs.readFileSync(path.join(root,file),'utf8').split(/\r?\n/)){
   const m=line.match(/^\s*([A-Z_0-9]+)\s*=\s*(.*?)\s*$/);
   if(m&&/SECRET|PASSWORD|SERVICE_ROLE|WORKER_TOKEN/.test(m[1])){const value=m[2].replace(/^['"]|['"]$/g,'');if(value.length>=12)known.push(value)}
  }
 }
 const report={currentScanned:0,artifactScanned:0,skippedLargeFiles:[],currentMatches:[],artifactMatches:[],historySensitivePaths:[],trackedGeneratedPaths:[],limitations:'Working tree and specified artifacts scanned up to 20 MiB each. History filename inventory only; not an exhaustive history/blob/session forensic scan. Values and matching lines never retained.'};
 for(const relative of [...new Set(git(['ls-files','--cached','--others','--exclude-standard','-z']).split('\0').filter(Boolean))]){
  const file=path.join(root,relative);if(!fs.existsSync(file)||!fs.statSync(file).isFile())continue;
  if(fs.statSync(file).size>20e6){report.skippedLargeFiles.push(relative);continue}
  report.currentScanned++;const kinds=scan(fs.readFileSync(file),known);if(kinds.length)report.currentMatches.push({file:relative,kinds});
 }
 function walk(directory){for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  const file=path.join(directory,entry.name);if(entry.isDirectory())walk(file);else if(entry.isFile()){
   if(fs.statSync(file).size>20e6){report.skippedLargeFiles.push(path.relative(root,file));continue}
   report.artifactScanned++;const kinds=scan(fs.readFileSync(file),known);if(kinds.length)report.artifactMatches.push({file:path.relative(root,file),kinds});
  }
 }}
 for(const directory of process.argv.slice(2))walk(path.resolve(directory));
 report.historySensitivePaths=[...new Set(git(['rev-list','--objects','--all']).split('\n').map(line=>line.slice(line.indexOf(' ')+1)).filter(file=>
  (/(^|\/)\.env($|\.)/.test(file)&&!file.endsWith('.example'))||/(^|\/)(Cookies(?:-journal)?|Login Data(?:-journal)?|Local Storage)(\/|$)/.test(file)))];
 report.trackedGeneratedPaths=git(['ls-tree','-r','--name-only','HEAD','.chrome-video-review','.codex-tmp']).split('\n').filter(Boolean);
 fs.writeFileSync(path.join(root,'tests/remediation/evidence/final-secret-scan.json'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({...report,historySensitivePaths:report.historySensitivePaths.length,trackedGeneratedPaths:report.trackedGeneratedPaths.length}));
 if(report.currentMatches.length||report.artifactMatches.length)process.exitCode=1;
}
module.exports={scan};
