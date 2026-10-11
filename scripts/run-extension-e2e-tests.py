#!/usr/bin/env python3
"""Temporary installation only; no personal profile, AMO, or signing access."""
import argparse,json,tempfile,subprocess,sys
from pathlib import Path
from test_support.firefox_harness import default_firefox_bin,firefox_session,get_available_port,serve_directory,navigate,execute_async,save_screenshot
ROOT=Path(__file__).resolve().parents[1]
ID='ass-subtitle-loader@example.local'
CHROME='''const {ExtensionParent}=ChromeUtils.importESModule("resource://gre/modules/ExtensionParent.sys.mjs");
const extension=ExtensionParent.GlobalManager.getExtension("ass-subtitle-loader@example.local");
const win=Services.wm.getMostRecentWindow("navigator:browser");
'''
def run_page(client,base,private=False,site=None):
    navigate(client,site or base+'/test/recorded-video.html')
    if site:
        ready=execute_async(client,"""const done=arguments[arguments.length-1];let n=0;const timer=setInterval(()=>{const v=document.querySelector('video');if(v && v.readyState>=1 && v.getBoundingClientRect().width>80){clearInterval(timer);done(true);}else if(++n>150){clearInterval(timer);done(false);}},200);""",timeout=35000)
        if not ready:raise AssertionError('Public video readiness')
    else:
        ready=execute_async(client,"""const done=arguments[arguments.length-1];let n=0;const timer=setInterval(()=>{if(document.body.dataset.ready==='1'){clearInterval(timer);done(true);}else if(++n>150){clearInterval(timer);done(false);}},100);""",timeout=20000)
        if not ready:
            metrics=client.command('WebDriver:ExecuteScript',{'script':"const v=document.querySelector('video');return {readyState:v.readyState,networkState:v.networkState,errorCode:v.error?.code || 0,paused:v.paused,foreground:document.hasFocus()};",'args':[]})
            raise AssertionError('Synthetic video boot: '+json.dumps(metrics))
    workflow=(ROOT/'test/browser/extension-css-workflow.js').read_text()
    if site:workflow="""(async()=>{const r=await globalThis.__cssTestListener({type:'ASS_SUBTITLE_LOAD',name:'synthetic-smoke.ass',content:globalThis.__cssTestTrack});if(!r.ok || !r.status.rendererReady || r.status.rendererBackend!=='dom') throw new Error('Public-video CSS smoke');return {ok:true,privateContext:r.status.privateContext,workflowPassed:true};})()"""
    client.command('Marionette:SetContext',{'value':'chrome'})
    info=execute_async(client,CHROME+'''const done=arguments[arguments.length-1];
const tab=win.gBrowser.selectedTab;extension.tabManager.addActiveTabPermission(tab);extension.tabManager.activateScripts(tab);
done({tabId:extension.apiManager.global.tabTracker.getId(tab),base:extension.baseURI.spec});''')
    target=client.command('WebDriver:GetWindowHandle',{})
    popup=client.command('WebDriver:NewWindow',{'type':'tab'})['handle']
    client.command('WebDriver:SwitchToWindow',{'handle':popup})
    navigate(client,info['base']+'popup/popup.html')
    result=execute_async(client,'''const [tabId,track,workflow]=arguments;const done=arguments[arguments.length-1];
(async()=>{
 const api=window.browser;
 await api.tabs.executeScript(tabId,{code:'const originalAdd=browser.runtime.onMessage.addListener.bind(browser.runtime.onMessage);browser.runtime.onMessage.addListener=listener=>{globalThis.__cssTestListener=listener;originalAdd(listener);};true;'});
 await api.tabs.executeScript(tabId,{file:'/build/content.bundle.js'});
 await api.tabs.executeScript(tabId,{code:'globalThis.__cssTestTrack='+JSON.stringify(track)});
 await api.tabs.update(tabId,{active:true});
 const panel=document.querySelector('.state-panel');
 if(!panel || panel.open || document.querySelector('#renderer-preference')) throw new Error('Popup CSS controls or collapsed disclosure');
 if(api.extension.inIncognitoContext && !document.querySelector('#diagnostics').disabled) throw new Error('Private diagnostic UI');
 const before=await api.storage.local.get(null);
 const result=(await api.tabs.executeScript(tabId,{code:workflow}))[0];
 const popupTabs=await api.tabs.query({url:api.runtime.getURL('popup/popup.html')});
 await api.tabs.update(popupTabs[0].id,{active:true});
 await new Promise(resolve=>setTimeout(resolve,150));
 await api.tabs.update(tabId,{active:true});
 await new Promise(resolve=>setTimeout(resolve,200));
 const resumed=(await api.tabs.executeScript(tabId,{code:'globalThis.__cssTestListener({type:"ASS_SUBTITLE_PING"})'}))[0];
 if(!resumed.status.rendererReady || !resumed.status.overlayConnected) throw new Error('Tab switching resynchronization');
 const after=await api.storage.local.get(null);
 if(JSON.stringify(before)!==JSON.stringify(after)) throw new Error('Storage mutated during temporary/private workflow');
 done(result);
})().catch(error=>done({ok:false,error:String(error.message)}));''',[info['tabId'],(ROOT/'test/dom-fixed-wrap.ass').read_text(),workflow],timeout=40000)
    if not result.get('ok'): raise AssertionError(result)
    if result['privateContext'] != private: raise AssertionError('Private context detection mismatch')
    client.command('WebDriver:CloseWindow',{})
    client.command('WebDriver:SwitchToWindow',{'handle':target})
    return result

def main():
    parser=argparse.ArgumentParser();parser.add_argument('--firefox-bin',default=default_firefox_bin());parser.add_argument('--real-site',help='Opt-in public video URL for a disposable-profile smoke test');args=parser.parse_args()
    subprocess.run(['npm','run','package'],cwd=ROOT,check=True)
    with serve_directory(ROOT,get_available_port()) as base,tempfile.TemporaryDirectory(prefix='css-extension-test-') as profile:
      with firefox_session(args.firefox_bin,profile,get_available_port(),allow_system_access=True,script_timeout=45000) as client:
        client.command('Addon:Install',{'path':str(ROOT/'dist/ass-subtitle-loader-0.2.0-unsigned.xpi'),'temporary':True,'allowPrivateBrowsing':True})
        normal=run_page(client,base)
        previous_handles=set(client.command('WebDriver:GetWindowHandles',{}))
        client.command('Marionette:SetContext',{'value':'chrome'})
        started=execute_async(client,'''const done=arguments[arguments.length-1];
const {OpenBrowserWindow}=Services.wm.getMostRecentWindow('navigator:browser');
const win=OpenBrowserWindow({private:true});
// The window load event precedes delayed startup, which navigates the initial
// tab to about:privatebrowsing. Wait for that navigation before loading a fixture.
let tries=0;
const timer=setInterval(()=>{
 const browser=win.gBrowser?.selectedBrowser;
 if(win.gBrowserInit?.delayedStartupFinished && browser?.currentURI.spec==='about:privatebrowsing' && !browser.webProgress.isLoadingDocument) {
  clearInterval(timer);win.focus();done(true);
 } else if(++tries>200) {clearInterval(timer);done(false);}
},50);''')
        if not started:raise AssertionError('Private window startup did not finish')
        client.command('Marionette:SetContext',{'value':'content'})
        handles=set(client.command('WebDriver:GetWindowHandles',{}))-previous_handles
        if len(handles)!=1:raise AssertionError('Private window handle is ambiguous')
        client.command('Marionette:SetContext',{'value':'content'})
        client.command('WebDriver:SwitchToWindow',{'handle':handles.pop()})
        client.command('Marionette:SetContext',{'value':'chrome'})
        client.command('WebDriver:ExecuteScript',{'script':'window.focus(); return true;','args':[]})
        private=run_page(client,base,True)
        if args.real_site:run_page(client,base,True,site=args.real_site)
        print(json.dumps({'installedExtension':normal,'privateWindow':private,'realSiteCssReady':bool(args.real_site)}))
if __name__=='__main__':main()
