#!/usr/bin/env python3
"""P08 REAL isolated HTML/JS/CSS browser QA; explicit inline execution because
container Chromium security blocks all URL navigation. No production access.
Run: python3 tools/browser-qa.py --out /path/to/evidence
Requirements: playwright (Python), system Chromium or Playwright Chromium.
"""
from __future__ import annotations
import argparse, hashlib, json, pathlib, posixpath, re, sys, time
from playwright.sync_api import sync_playwright

ROOT = pathlib.Path(__file__).resolve().parent.parent
ORDER = ['src/identity.mjs','src/owner-port.mjs','src/service.mjs',
         'src/assistant-bridge.mjs','src/legacy-bridge.mjs','src/surfaces.mjs','preview/main.mjs']
RESOLUTIONS = [(320,568),(360,800),(390,844),(430,932),(768,1024),(1024,768),(1440,900),(844,390)]

def actual_sources_inline():
    modules=[]
    for path in ORDER:
        source=(ROOT/path).read_text()
        exports=re.findall(r'(?m)^export\s+(?:async\s+)?(?:function|const|class)\s+(\w+)', source)
        def imp(m):
            names,loc=m.groups()
            resolved=(loc.lstrip('/') if loc.startswith('/') else posixpath.normpath(posixpath.join(posixpath.dirname(path),loc)))
            if resolved not in ORDER: raise RuntimeError(f'unexpected external import {path}: {loc}')
            return f'const {{{names}}} = __modules[{json.dumps(resolved)}];\n'
        source=re.sub(r'(?m)^import\s*\{([^}]+)\}\s*from\s*[\'\"]([^\'\"]+)[\'\"];\s*', imp, source)
        source=re.sub(r'(?m)^export\s+(?=(?:async\s+)?(?:function|const|class))','',source)
        if re.search(r'(?m)^\s*(?:import|export)\s+',source):raise RuntimeError(f'unexpected ESM syntax in {path}')
        if path=='preview/main.mjs': modules.append('(function(){\n'+source+'\n})();\n')
        else:modules.append(f'__modules[{json.dumps(path)}]=(function(){{\n{source}\nreturn {{{",".join(exports)}}};\n}})();\n')
    script='(function(){ const __modules=Object.create(null);\n'+''.join(modules)+'\n})();'
    html=(ROOT/'preview/index.html').read_text()
    html=html.replace('<link rel="stylesheet" href="/preview/styles.css">', '<style>'+(ROOT/'preview/styles.css').read_text()+'</style>')
    html=html.replace('<script type="module" src="/preview/main.mjs"></script>','')
    return html,script


def run_browser(browser,html,script,viewport,out,proof):
    w,h=viewport
    tag=f'{w}x{h}'
    context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,locale='pt-BR',reduced_motion='reduce')
    page=context.new_page();page.set_default_timeout(8000)
    errors=[];requests=[];page.on('pageerror',lambda e: errors.append(str(e)))
    page.on('request',lambda r: requests.append(r.url))
    page.set_content(html,wait_until='domcontentloaded')
    # about:blank disables localStorage. A deterministic memory port is used only
    # by these inline browser fixtures; the real service has separate persistence unit tests.
    page.evaluate('''() => { const data=new Map(); Object.defineProperty(window,'localStorage', {configurable:true,value:{
       getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v),removeItem:k=>data.delete(k),__data:data}}); }''')
    page.add_script_tag(content=script)
    assert page.locator('#demo-markers .demo-marker').count()==3,errors
    assert page.locator('#home-saved-panel').is_hidden()
    assert page.locator('#assistant-projection .saved-card').count()==0, 'assistant must not duplicate list on Home by default'
    assert page.locator('.lab-flag').inner_text().startswith('LAB ISOLADO')
    shot=lambda case:page.screenshot(path=str(out/f'{tag}--{case}.png'),full_page=False,animations='disabled')
    def config_change(selector,value,action='select_option'):
        controls=page.locator('.lab-tools')
        if not controls.evaluate('e=>e.open'):page.locator('.lab-tools summary').click()
        getattr(page.locator(selector),action)(value) if action=='select_option' else getattr(page.locator(selector),action)()
        page.locator('.lab-tools summary').click()

    shot('home-empty')
    page.locator('#demo-markers .demo-marker').first.click()
    assert page.locator('#demo-markers .demo-marker').first.get_attribute('aria-pressed')=='true'
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel').is_visible()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    assert page.locator('#assistant-projection .saved-card').count()==0
    assert page.locator('.shell').get_attribute('data-p08-panel-open')=='true'
    assert page.locator('#nav-saved').get_attribute('aria-expanded')=='true'
    rects=page.evaluate('''() => {
       const r=x=>{const q=x.getBoundingClientRect();return {x:q.x,y:q.y,left:q.left,right:q.right,top:q.top,bottom:q.bottom,width:q.width,height:q.height}};
       return {panel:r(document.querySelector('.saved-panel')),dock:r(document.querySelector('.assistant-dock')),
         nav:r(document.querySelector('.bottom-nav')),viewport:{w:innerWidth,h:innerHeight},documentWidth:document.documentElement.scrollWidth}; }''')
    p,d,n=rects['panel'],rects['dock'],rects['nav']
    overlap= p['left']<d['right']-1 and d['left']<p['right']-1 and p['top']<d['bottom']-1 and d['top']<p['bottom']-1
    assert not overlap, f'panel/dock overlap {tag}: {rects}'
    assert n['top']>=d['bottom']-1 or (w,h)==(844,390), f'dock/nav overlap {tag}: {rects}'
    assert rects['documentWidth']<=w+1, f'horizontal overflow {tag}: {rects}'
    assert page.evaluate('document.documentElement.scrollHeight <= innerHeight + 1'), f'vertical viewport shift {tag}'
    assert page.evaluate('scrollY')==0, f'full-page scroll hides Home chrome {tag}'
    for touch in ['.composer button','.saved-panel [data-action=ask-assistant]']:
        bb=page.locator(touch).first.bounding_box()
        assert bb and bb['x']>=-1 and bb['x']+bb['width']<=w+1 and bb['y']>=-1 and bb['y']+bb['height']<=h+1, f'hit target clipped {tag} {touch} {bb}'
    assert p['height']>60 and d['height']>60
    cta=page.locator('#home-saved-panel [data-action=ask-assistant]').bounding_box()
    assert cta and cta['y']>=p['top']-1 and cta['y']+cta['height']<=p['bottom']+1, f'handoff CTA initially clipped {tag}: {cta}, panel {p}'
    shot('panel-one-favorite')
    page.keyboard.press('Escape')
    assert page.locator('#home-saved-panel').is_hidden()
    assert page.locator('#nav-saved').get_attribute('aria-expanded')=='false'
    assert page.evaluate("document.activeElement?.id")=='nav-saved',f'focus was not returned after Escape, {tag}'
    page.locator('#nav-saved').click()
    page.locator('#home-saved-panel [data-action="ask-assistant"]').click()
    assert page.locator('#home-saved-panel').is_hidden()
    assert page.locator('#assistant-projection .saved-card').count()==1
    assert 'MESMA fonte' in page.locator('#assistant-response').inner_text()
    shot('assistant-same-collection')
    # The Assistant mutation must update the same collection exposed by Home.
    page.locator('#assistant-projection [data-action="remove"]').click()
    assert page.locator('#assistant-projection .saved-card').count()==0
    assert page.locator('#demo-markers .demo-marker').first.get_attribute('aria-pressed')=='false'
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==0
    shot('empty-after-assistant-removal')
    # Add two favorites; focus must remain in the panel after removing one.
    page.locator('#home-saved-panel [data-action="close"]').click()
    page.locator('#demo-markers .demo-marker').nth(0).click()
    page.locator('#demo-markers .demo-marker').nth(1).click()
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==2
    page.locator('#home-saved-panel .saved-card').first.locator('[data-action="remove"]').focus()
    page.locator('#home-saved-panel .saved-card').first.locator('[data-action="remove"]').click()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    assert page.evaluate('document.querySelector("#home-saved-panel").contains(document.activeElement)'),f'lost focus after removal {tag}'
    page.locator('#home-saved-panel [data-action="close"]').click()
    # Switching destination never leaks favorites; restoring destination recovers session.
    config_change('#destination','itacare')
    assert page.locator('#demo-markers .demo-marker').count()==2
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==0
    shot('itacare-empty')
    page.locator('#home-saved-panel [data-action="close"]').click()
    page.locator('#demo-markers .demo-marker').first.click()
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    shot('itacare-guest')
    page.locator('#home-saved-panel [data-action="close"]').click()
    config_change('#destination','morro-de-sao-paulo')
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    # Translations must use actual Hebrew copy AND layout direction.
    config_change('#locale','he')
    assert page.locator('html').get_attribute('dir')=='rtl'
    assert 'השמורים' in page.locator('#home-saved-panel .saved-panel__title').inner_text()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    shot('he-rtl-panel')
    config_change('#locale','pt-BR')
    page.locator('#home-saved-panel [data-action="close"]').click()
    config_change('#mode','owner')
    page.wait_for_timeout(65)
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==0, 'guest entries must not leak into owner mode'
    page.locator('#home-saved-panel [data-action="close"]').click()
    page.locator('#demo-markers .demo-marker').first.click()
    page.wait_for_timeout(65)
    page.locator('#nav-saved').click()
    assert page.locator('#home-saved-panel .saved-card').count()==1
    assert page.locator('#home-saved-panel .saved-card__meta').inner_text().endswith('Lugar registrado no serviço')
    shot('owner-fixture-verified')
    config_change('#offline',None,'check')
    assert 'Offline' in page.locator('#home-saved-panel [data-testid="saved-status"]').inner_text()
    assert page.locator('#home-saved-panel [data-action="open-place"]').is_disabled()
    shot('owner-offline-blocked')
    config_change('#offline',None,'uncheck')
    page.wait_for_timeout(55)
    assert page.locator('#home-saved-panel [data-action="open-place"]').is_enabled()
    assert not errors, f'JS page errors {tag}: {errors}'
    assert not requests, f'external browser requests {tag}: {requests}'
    proof.append({'viewport':tag,'status':'PASS','screenshots':len(list(out.glob(f'{tag}--*.png'))),
                  'panelDockOverlap':False,'horizontalOverflow':False,'keyFocusRestored':True,
                  'assistantHomeSameCollection':True,'destinationsIsolated':True,
                  'guestOwnerSeparated':True,'ownerOfflineFailClosed':True,'hebrewRTL':True,'consoleErrors':errors,'requests':requests,'viewportDidNotScroll':True})
    context.close()


def main():
    parser=argparse.ArgumentParser();parser.add_argument('--out',type=pathlib.Path,required=True);parser.add_argument('--chromium',default='/usr/bin/chromium');args=parser.parse_args()
    out=args.out;out.mkdir(parents=True,exist_ok=True)
    html,script=actual_sources_inline(); results=[];started=time.time()
    with sync_playwright() as p:
        kwargs={'executable_path':args.chromium} if pathlib.Path(args.chromium).exists() else {}
        browser=p.chromium.launch(headless=True,args=['--no-sandbox','--disable-dev-shm-usage'],**kwargs)
        for viewport in RESOLUTIONS:
            print('BROWSER_QA',viewport,flush=True)
            run_browser(browser,html,script,viewport,out,results)
        browser.close()
    images=[{'name':x.name,'sha256':hashlib.sha256(x.read_bytes()).hexdigest(),'bytes':x.stat().st_size} for x in sorted(out.glob('*.png'))]
    files={p.relative_to(ROOT).as_posix():hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(ROOT.rglob('*.mjs')) if 'node_modules' not in p.parts}
    proof={'kind':'ISOLATED_ACTUAL_HTML_CSS_JS_INLINE_BROWSER_NOT_PRODUCTION','source':'labs/tourist-p08-hybrid',
           'javascriptNoExternalRequests':True,'inlineReason':'execution sandbox blocks browser URL navigation; real HTTP server separately tested',
           'screenshotCount':len(images),'viewports':results,'screenshots':images,'sources':files,'durationSeconds':round(time.time()-started,1),
           'limitations':['Not deployed product DOM','No real authenticated backend','No real map tiles or routing','Playwright inline execution, not network-integrated E2E']}
    (out/'browser-proof.json').write_text(json.dumps(proof,ensure_ascii=False,indent=2))
    print(json.dumps({'viewports':len(results),'screenshots':len(images),'failed':0,'seconds':proof['durationSeconds']},ensure_ascii=False))
    return 0

if __name__=='__main__':sys.exit(main())
