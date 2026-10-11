const path = require('node:path');
const fs = require('node:fs');
const esbuild = require('esbuild');
const root = path.resolve(__dirname, '..');
async function buildBundles() {
 fs.rmSync(path.join(root,'build'), {recursive:true,force:true});
 await esbuild.build({entryPoints:{content:path.join(root,'src/content.js'),popup:path.join(root,'popup/popup.js')},bundle:true,entryNames:'[name].bundle',format:'iife',target:['firefox140'],outdir:path.join(root,'build'),logLevel:'silent'});
}
if(require.main===module) buildBundles().catch(()=>{console.error('Bundle failed.');process.exitCode=1;});
module.exports={buildBundles};
