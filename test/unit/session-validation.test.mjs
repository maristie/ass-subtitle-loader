import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import esbuild from 'esbuild';
test('content handler preserves the existing valid track when a replacement is rejected',async()=>{
 const bundle=await esbuild.build({entryPoints:['src/content.js'],bundle:true,write:false,format:'iife',platform:'browser',target:'firefox140'});
 let listener;
 const document={title:'Synthetic',querySelectorAll:()=>[],createElement:()=>({isConnected:true}),documentElement:{appendChild(){}}};
 const sandbox={document,HTMLVideoElement:class{},MutationObserver:class{observe(){}disconnect(){}},location:{origin:'https://synthetic.invalid'},browser:{extension:{inIncognitoContext:false},runtime:{getManifest:()=>({version:'0.2.0'}),getURL:p=>p,onMessage:{addListener(fn){listener=fn;}}}},console,setTimeout,clearTimeout,queueMicrotask};
 vm.runInNewContext(bundle.outputFiles[0].text,sandbox);
 const content=readFileSync('test/dom-fixed-wrap.ass','utf8');
 const first=await listener({type:'ASS_SUBTITLE_LOAD',name:'previous.ass',content});assert.equal(first.pending,true);
 const rejected=await listener({type:'ASS_SUBTITLE_LOAD',name:'invalid.ass',content:content.replace('\\pos(','\\clip(')});
 assert.equal(rejected.ok,false);assert.match(rejected.error,/^Line \d+:/);assert.equal(rejected.status.subtitleName,'previous.ass');assert.equal(rejected.status.hasSubtitle,true);
});
