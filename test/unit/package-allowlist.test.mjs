import test from 'node:test';
import assert from 'node:assert/strict';
import {writeFileSync,existsSync,mkdirSync,readdirSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
const {RUNTIME_FILES,stageRuntime}=createRequire(import.meta.url)('../../scripts/build-extension.js');
test('stale generated files and unrelated root files never enter staged runtime',async()=>{
 mkdirSync('build',{recursive:true});mkdirSync('stage',{recursive:true});writeFileSync('build/stale-worker.js','synthetic');writeFileSync('stage/stale-secret.txt','synthetic');writeFileSync('unrelated-secret.txt','synthetic');
 try{await stageRuntime();assert.ok(!existsSync('build/stale-worker.js'));assert.ok(!existsSync('stage/stale-secret.txt'));assert.ok(!existsSync('stage/unrelated-secret.txt'));const files=readdirSync('stage',{recursive:true,withFileTypes:true}).filter(p=>p.isFile()).map(p=>p.parentPath.replace(/^stage\/?/,'')+(p.parentPath==='stage'?'':'/')+p.name).sort();assert.deepEqual(files,[...RUNTIME_FILES].sort());}finally{rmSync('unrelated-secret.txt',{force:true});}
});
