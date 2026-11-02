const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname,'..');
const label = process.argv[2];
const cases = {
  focused: ['--test','tests/remediation/reservation-upgrade.test.cjs'],
  upgraded: ['--require','./tests/remediation/load-captured-reservation-database.cjs','--test','--test-concurrency=2','tests/remediation/durable-payments.test.cjs','tests/remediation/inventory.test.cjs','tests/remediation/reservation-details.test.cjs'],
  typecheck: ['node_modules/typescript/bin/tsc','--noEmit'],
  deletion: ['--test','tests/remediation/account-deletion.test.cjs'],
  verification: ['tests/remediation/verify-reservation-probes.cjs'],
  android: ['node_modules/expo/bin/cli','export','--platform','android','--output-dir','.codex-tmp/reservation-android-export'],
  admin: ['scripts/admin-web.cjs','export','--platform','web','--output-dir','.codex-tmp/reservation-admin-export'],
  full: ['--test','--test-concurrency=2',...['backend','remediation','platform','refactoring'].flatMap(dir=>fs.readdirSync(path.join(root,'tests',dir)).filter(f=>f.endsWith('.test.cjs')).map(f=>`tests/${dir}/${f}`))],
};
if (!cases[label]) throw new Error('Choose focused, upgraded, deletion, typecheck, android, admin, or full');
if (['focused','upgraded','full'].includes(label) && !process.env.RESERVATION_SCHEMA_CAPTURE) throw new Error('Set RESERVATION_SCHEMA_CAPTURE to the local metadata capture for this validation');
const startedAt = new Date().toISOString(); let output='';
const child = spawn(process.execPath,cases[label],{cwd:root,windowsHide:true,env:{...process.env,EXPO_NO_DOTENV:'1'},stdio:['ignore','pipe','pipe']});
for(const stream of [child.stdout,child.stderr]) stream.on('data',data=>{output+=data.toString();});
child.on('error',error=>{console.error(error.code || 'Unable to start local check');process.exitCode=1;});
child.on('close',code=>{
  const file=path.join(root,`tests/remediation/evidence/commands/reservation-2026-11-02-${label}.json`);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify({label:`reservation-2026-11-02-${label}`,command:['node',...cases[label]],startedAt,finishedAt:new Date().toISOString(),exitCode:code,output},null,2)+'\n');
  console.log(`${label}: exit ${code}; ${path.relative(root,file)}`);
  console.log(output.split(/\r?\n/).slice(-14).join('\n'));
  process.exitCode=code ?? 1;
});
