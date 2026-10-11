import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateSubtitleContent} from '../../src/core/validate-track.js';
import {createDefaultsController, createStoredDefaultsStatus} from '../../src/content/defaults.js';
import {createRuntimeLogger,redactLogDetails} from '../../src/shared/diagnostics.js';
import {createDefaultSubtitleAdjustments} from '../../src/shared/settings.js';
const valid=readFileSync(new URL('../dom-fixed-wrap.ass',import.meta.url),'utf8');
const globalKey='assSubtitleLoader.defaults.global';
const siteKey='assSubtitleLoader.defaults.site.https%3A%2F%2Fsynthetic.invalid';
function fixture(privateContext=false) {
 globalThis.location={origin:'https://synthetic.invalid'};
 const stored={[globalKey]:{version:1,rendererPreference:'removed-value',performanceMode:'removed-value',updatedAt:'legacy',subtitleAdjustments:{fontScale:1.5}},[siteKey]:{subtitleAdjustments:{opacity:0.5}}};
 const writes=[],reads=[];const api={extension:{inIncognitoContext:privateContext},storage:{local:{async get(keys){reads.push(keys);return stored;},async set(values){writes.push(values);Object.assign(stored,values);},async remove(keys){writes.push(keys);delete stored[keys];}}}};
 const state={subtitleAdjustments:createDefaultSubtitleAdjustments()};
 const controller=createDefaultsController({api,state,getStatus:()=>state,trace(){}});
 return {api,state,stored,writes,reads,controller};
}
test('supported fixtures validate without expanding the CSS subset',()=>{
 for(const name of ['amo-danmaku','dom-fixed-wrap','dom-dense-lanes','dom-lane-scheduler','dom-synthetic-lane-matrix','large-load']) assert.ok(validateSubtitleContent(readFileSync(new URL(`../${name}.ass`,import.meta.url),'utf8')).supported);
});
test('unsupported and malformed files report line numbers without authored text',()=>{
 const mutations=[s=>s.replace('\\pos(', '\\clip('),s=>s+'\nDialogue: malformed secret-text',s=>s.replace('Format: Layer','Format: Secret'),s=>s.replace('0:00:00.00','0:99:00.00'),s=>s+'\n[Fonts]\nsecret-text',s=>s.replace('\\an8','\\an11'),s=>s.replace('\\an8','\\an8\\c&HFFFFFFF&'),s=>s.replace('\\an8','\\an8\\b1.2'),s=>s.replace('\\pos(640,40)','\\pos(,40)')];
 for(const mutate of mutations) assert.throws(()=>validateSubtitleContent(mutate(valid)),error=>/^Line \d+:/.test(error.message)&&!error.message.includes('secret-text'));
});
test('site settings win and removed legacy fields cannot prevent migration',async()=>{
 const f=fixture();await f.controller.loadStoredDefaults();assert.equal(f.state.subtitleAdjustments.opacity,0.5);assert.equal(f.state.settingsDefaults.effectiveScope,'site');
 await f.controller.saveGlobalDefaults({subtitleAdjustments:createDefaultSubtitleAdjustments(),updatedAt:'ignored',rendererPreference:'ignored'});
 assert.deepEqual(Object.keys(f.stored[globalKey]).sort(),['subtitleAdjustments','version']);assert.equal(f.stored[globalKey].version,2);
});
test('private tabs read global only and every save/reset rejects before writing',async()=>{
 const f=fixture(true);await f.controller.loadStoredDefaults();assert.deepEqual(f.reads,[[globalKey]]);assert.equal(f.state.subtitleAdjustments.fontScale,1.5);assert.equal(f.state.settingsDefaults.origin,null);assert.equal(f.state.settingsDefaults.canStore,false);
 for(const name of ['saveSiteDefaults','saveGlobalDefaults','resetSiteDefaults','resetGlobalDefaults']) await assert.rejects(f.controller[name]({subtitleAdjustments:createDefaultSubtitleAdjustments()}),/private tabs/);
 assert.deepEqual(f.writes,[]);assert.equal(createStoredDefaultsStatus(f.api).origin,null);
});
test('diagnostics are opt-in, redact strings and stacks, and stay disabled privately',()=>{
 const calls=[];const previous=console.log;console.log=(...args)=>calls.push(args);
 try {let enabled=false;const log=createRuntimeLogger({enabled:()=>enabled});log('load:start',{name:'secret',url:'https://synthetic.invalid',frames:5});assert.equal(calls.length,0);enabled=true;log('load:start',{name:'secret',url:'https://synthetic.invalid',frames:5,details:{stack:'secret'}});assert.deepEqual(calls[0].at(-1),{frames:5});createRuntimeLogger({enabled:()=>true,privateContext:()=>true})('load:start',{frames:2});assert.equal(calls.length,1);assert.deepEqual(redactLogDetails({title:'secret',origin:'secret',text:'secret',error:'secret',delay:2}),{delay:2});} finally {console.log=previous;}
});
