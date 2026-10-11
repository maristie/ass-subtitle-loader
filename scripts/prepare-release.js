// Offline release preparation: no credentials, signing client, or publication.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const {execFileSync}=require('node:child_process');
const {main:build,RUNTIME_FILES}=require('./build-extension.js');
const {main:lint}=require('./lint-extension.js');
async function main() {
 const root=path.resolve(__dirname,'..');process.chdir(root);
 if(execFileSync('git',['status','--porcelain'],{encoding:'utf8'}).trim()) throw new Error('Release preparation requires a clean committed tree.');
 execFileSync('git',['rev-parse','--verify','HEAD'],{stdio:'ignore'});
 fs.rmSync('dist',{recursive:true,force:true});
 await build();execFileSync(process.execPath,['--test',...fs.readdirSync('test/unit').filter(f=>f.endsWith('.test.mjs')).map(f=>'test/unit/'+f)],{stdio:'inherit'});lint();
 const sourceFiles=execFileSync('git',['ls-files','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
 const allowed=name=> ['README.md','PRIVACY.md','CHANGELOG.md','LICENSE','manifest.json','package.json','package-lock.json','.gitignore'].includes(name)|| /^(src|popup|icons|fonts|scripts|test|docs|\.github)\//.test(name);
 if(sourceFiles.some(f=>!allowed(f)||/(?:^|\/)(?:audit(?:[-.]|$)|credentials|\.env|(?:node_modules|artifacts|dist|build|stage)\/)/i.test(f))) throw new Error('Unexpected reviewer source input.');
 execFileSync('python3',['scripts/zip-files.py','dist/ass-subtitle-loader-0.2.0-source.zip','.',...sourceFiles]);
 const inventory=RUNTIME_FILES.map(file=>({file,bytes:fs.statSync('stage/'+file).size,sha256:crypto.createHash('sha256').update(fs.readFileSync('stage/'+file)).digest('hex')}));
 fs.writeFileSync('dist/inventory.json',JSON.stringify(inventory,null,2)+'\n');
 const files=fs.readdirSync('dist').filter(f=>f!=='SHA256SUMS').sort();
 fs.writeFileSync('dist/SHA256SUMS',files.map(f=>crypto.createHash('sha256').update(fs.readFileSync('dist/'+f)).digest('hex')+'  '+f).join('\n')+'\n');
 execFileSync('python3',['scripts/scan-release.py'],{stdio:'inherit'});
 console.log('Unsigned release artifacts prepared locally in dist/.');
}
if(require.main===module) main().catch(error=>{console.error(error.message);process.exitCode=1;});
