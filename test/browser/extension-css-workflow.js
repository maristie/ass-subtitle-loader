// Runs in the real extension's content-script compartment with synthetic input.
(async () => {
 const send=globalThis.__cssTestListener;
 const content=globalThis.__cssTestTrack;
 const wait=ms=>new Promise(r=>setTimeout(r,ms));
 const assert=(value,label)=>{if(!value) throw new Error(label);};
 const status=async()=> (await send({type:'ASS_SUBTITLE_PING'})).status;
 async function until(check,label) {for(let i=0;i<100;i++){if(await check())return;await wait(50);}throw new Error(label);}
 const video=document.querySelector('video');
 await until(()=>document.body.dataset.ready==='1','synthetic video readiness');
 await send({type:'ASS_SUBTITLE_SHOW_PICKER'});
 let picker=document.querySelector('.ass-subtitle-loader-picker');
 const input=picker.querySelector('input[type=file]');
 const files=new DataTransfer();files.items.add(new File([content],'synthetic.ass',{type:'text/plain'}));input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));
 await until(async()=> (await status()).rendererReady,'file selection');
 assert(!document.querySelector('.ass-subtitle-loader-overlay canvas'),'CSS overlay');
 const prior=(await status()).subtitleName;
 const invalid=await send({type:'ASS_SUBTITLE_LOAD',name:'invalid.ass',content:content.replace('\\pos(', '\\clip(')});
 assert(!invalid.ok && /^Line \d+:/.test(invalid.error),'unsupported rejection');
 assert((await status()).subtitleName===prior && (await status()).rendererReady,'previous session preservation');
 const changed=new DataTransfer();changed.items.add(new File([content],'changed.ass'));input.files=changed.files;input.dispatchEvent(new Event('change',{bubbles:true}));await until(async()=> (await status()).subtitleName==='changed.ass','file change');
 const drop=new DataTransfer();drop.items.add(new File([content],'dropped.ass'));picker.dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:drop}));await until(async()=> (await status()).subtitleName==='dropped.ass','file drop');
 // Explicit UTF-16 LE and Windows-1252 decoding via the actual picker.
 picker.querySelector('select').value='utf-16le';
 const bytes=new Uint8Array(content.length*2);for(let i=0;i<content.length;i++){bytes[i*2]=content.charCodeAt(i)&255;bytes[i*2+1]=content.charCodeAt(i)>>8;}
 const encoded=new DataTransfer();encoded.items.add(new File([bytes],'utf16.ass'));input.files=encoded.files;input.dispatchEvent(new Event('change',{bubbles:true}));await until(async()=> (await status()).subtitleName==='utf16.ass' && (await status()).rendererReady,'UTF-16 picker');
 picker.querySelector('select').value='windows-1252';input.files=files.files;input.dispatchEvent(new Event('change',{bubbles:true}));await until(async()=> (await status()).subtitleName==='synthetic.ass','Windows-1252 picker');
 await send({type:'ASS_SUBTITLE_SET_DELAY',delay:0.5});assert((await status()).subtitleDelay===0.5,'delay');
 video.pause();video.currentTime=1;await wait(200);assert(Math.abs((await status()).subtitleTime-0.5)<0.2,'seeking');
 video.playbackRate=2;await video.play();await wait(250);assert(document.querySelector('.ass-subtitle-loader-dom-comment'),'speed change');
 await send({type:'ASS_SUBTITLE_SET_ADJUSTMENTS',adjustments:{opacity:0}});assert((await status()).subtitleAdjustments.opacity===0,'zero opacity');
 assert([...document.querySelectorAll('.ass-subtitle-loader-dom-comment')].every(el=>getComputedStyle(el).opacity==='0'),'zero opacity paint');
 await send({type:'ASS_SUBTITLE_SET_ADJUSTMENTS',adjustments:{opacity:1}});
 const host=video.parentElement;host.style.width='640px';window.dispatchEvent(new Event('resize'));await wait(200);assert(document.querySelector('.ass-subtitle-loader-overlay').getBoundingClientRect().width<=641,'resize bounds');
 await host.requestFullscreen();await wait(250);assert(document.fullscreenElement===host,'fullscreen');assert((await status()).overlayConnected,'fullscreen overlay');await document.exitFullscreen();
 await send({type:'ASS_SUBTITLE_REMOVE'});assert(!(await status()).hasSubtitle && !document.querySelector('.ass-subtitle-loader-overlay'),'removal');
 const oldParent=video.parentElement,next=video.nextSibling;video.remove();await wait(100);
 const pending=await send({type:'ASS_SUBTITLE_LOAD',name:'waiting.ass',content});assert(pending.pending,'waiting for video');oldParent.insertBefore(video,next);await until(async()=> (await status()).rendererReady,'video arrival');
 const clone=video.cloneNode();clone.src=video.currentSrc;video.replaceWith(clone);await wait(200);assert(!(await status()).hasSubtitle,'video replacement cleanup');
 await clone.play();await send({type:'ASS_SUBTITLE_LOAD',name:'private-check.ass',content});
 const s=await status();
 if(s.privateContext) {
  await send({type:'ASS_SUBTITLE_SET_ADJUSTMENTS',adjustments:{fontScale:1.25}});assert((await status()).subtitleAdjustments.fontScale===1.25,'private temporary adjustment');
  for(const type of ['ASS_SUBTITLE_SAVE_SITE_DEFAULTS','ASS_SUBTITLE_SAVE_GLOBAL_DEFAULTS','ASS_SUBTITLE_RESET_SITE_DEFAULTS','ASS_SUBTITLE_RESET_GLOBAL_DEFAULTS']) assert(!(await send({type,defaults:{subtitleAdjustments:s.subtitleAdjustments}})).ok,'private write guard');
  await send({type:'ASS_SUBTITLE_SET_DIAGNOSTICS',enabled:true});assert(!(await status()).diagnosticsEnabled,'private diagnostics guard');assert((await status()).settingsDefaults.origin===null,'private origin omitted');
 }
 return {ok:true,privateContext:s.privateContext,workflowPassed:true};
})()
