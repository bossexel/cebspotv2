const fs=require('node:fs'),path=require('node:path'),ts=require('typescript');
const root=path.resolve(__dirname,'../..');const sources=[];
function walk(dir){for(const d of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,d.name);if(d.isDirectory())walk(p);else if(/\.tsx?$/.test(p))sources.push(p);}}
walk(path.join(root,'app'));walk(path.join(root,'src'));
const routes=sources.filter(p=>p.startsWith(path.join(root,'app')+path.sep)&&!p.endsWith('_layout.tsx')).map(p=>'/'+path.relative(path.join(root,'app'),p).replace(/\\/g,'/').replace(/\.tsx?$/,'').replace(/(^|\/)index$/,''));
const references=[];
for(const file of sources){const text=fs.readFileSync(file,'utf8'),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);function visit(n){
 if(ts.isCallExpression(n)&&ts.isPropertyAccessExpression(n.expression)&&['push','replace'].includes(n.expression.name.text)&&n.expression.expression.getText(tree)==='router'){
  let a=n.arguments[0];if(a&&ts.isObjectLiteralExpression(a)){const prop=a.properties.find(p=>ts.isPropertyAssignment(p)&&p.name.getText(tree)==='pathname');a=prop?.initializer;}
  if(a&&ts.isStringLiteral(a)&&a.text.startsWith('/'))references.push({file:path.relative(root,file).replace(/\\/g,'/'),line:tree.getLineAndCharacterOfPosition(a.getStart()).line+1,route:a.text,exists:routes.includes(a.text)});
 }ts.forEachChild(n,visit);}visit(tree);}
const result={routeCount:routes.length,staticNavigationReferences:references.length,missingStaticTargets:references.filter(r=>!r.exists),routes,limitations:'Literal router.push/replace targets only; parameter validity and external links require separate checks.'};
fs.writeFileSync(path.join(__dirname,'evidence/routes.json'),JSON.stringify(result,null,2));console.log(JSON.stringify({...result,routes:undefined},null,2));
