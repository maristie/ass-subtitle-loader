const {spawnSync}=require('node:child_process');
const fs=require('node:fs');
const path=require('node:path');
function main() {
 const result=spawnSync(path.resolve('node_modules/.bin/addons-linter'),['stage','--output','json'],{encoding:'utf8'});
 if(result.error) throw result.error;
 const report=JSON.parse(result.stdout);
 fs.mkdirSync('dist',{recursive:true});fs.writeFileSync('dist/lint.json',JSON.stringify(report,null,2)+'\n');
 const desktopWarnings=report.warnings.filter(w=>!(w.code==='KEY_FIREFOX_ANDROID_UNSUPPORTED_BY_MIN_VERSION' && w.file==='manifest.json' && w.description.includes('browser_specific_settings.gecko.data_collection_permissions')));
 if(report.errors.length || report.notices.length || desktopWarnings.length) throw new Error('Extension lint failed; see dist/lint.json.');
 console.log('Desktop extension lint passed. Raw report retains the Android-only compatibility warning.');
}
if(require.main===module) {try{main();}catch(error){console.error(error.message);process.exitCode=1;}}
module.exports={main};
