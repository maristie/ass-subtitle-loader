const fs = require('node:fs');
const path = require('node:path');
const {spawnSync} = require('node:child_process');
const {buildBundles} = require('./build-content-bundle.js');
const root = path.resolve(__dirname,'..');
const RUNTIME_FILES = Object.freeze(['manifest.json','build/content.bundle.js','build/popup.bundle.js','popup/popup.html','popup/popup.css','icons/icon-16.png','icons/icon-32.png','icons/icon-48.png','icons/icon-96.png','fonts/NotoSansCJKjp-Regular.otf','fonts/LICENSE','LICENSE']);
async function stageRuntime() {
 await buildBundles();
 const stage = path.join(root,'stage');
 fs.rmSync(stage,{recursive:true,force:true});
 for(const name of RUNTIME_FILES) {const target=path.join(stage,name);fs.mkdirSync(path.dirname(target),{recursive:true});fs.copyFileSync(path.join(root,name),target);}
 return stage;
}
async function main(argv=[]) {
 if(argv.length) throw new Error('Packaging accepts no build bypass or signing options.');
 const stage=await stageRuntime();
 fs.mkdirSync(path.join(root,'dist'),{recursive:true});
 const result=spawnSync('python3',[path.join(root,'scripts/zip-files.py'),path.join(root,'dist/ass-subtitle-loader-0.2.0-unsigned.xpi'),stage,...RUNTIME_FILES],{cwd:root,stdio:'inherit'});
 if(result.status!==0) throw new Error('Package build failed.');
}
if(require.main===module) main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1;});
module.exports={RUNTIME_FILES,stageRuntime,main};
