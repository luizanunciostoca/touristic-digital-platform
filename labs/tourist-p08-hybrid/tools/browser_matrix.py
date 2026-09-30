#!/usr/bin/env python3
"""Execute the exact isolated P08 HTML/CSS/JS sources inline (Chrome localhost policy workaround).
No production URL is opened, no external network is permitted, screenshots are authentic browser outputs.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import re, json, hashlib, datetime, os, subprocess, urllib.request, urllib.error, time

ROOT=Path(__file__).resolve().parent.parent
EVIDENCE=ROOT/'evidence'/'browser'
EVIDENCE.mkdir(parents=True,exist_ok=True)
SOURCES=['src/identity.mjs','src/owner-port.mjs','src/service.mjs','src/assistant-bridge.mjs','src/surfaces.mjs','preview/main.mjs']
SHA={p:hashlib.sha256((ROOT/p).read_bytes()).hexdigest() for p in SOURCES+['preview/index.html','preview/styles.css','tools/preview-server.mjs']}

def html_inline():
 def cleaned(source):
  source=re.sub(r'^import\s*\{[\s\S]*?\}\s*from\s*[\'\"][^\'\"]+[\'\"];\s*','',source,flags=re.M)
  return re.sub(r'(?m)^export\s+','',source)
 script='\n'.join(cleaned((ROOT/p).read_text()) for p in SOURCES)
 html=(ROOT/'preview/index.html').read_text()
 html=html.replace('<link rel="stylesheet" href="/preview/styles.css">','<style>\n'+(ROOT/'preview/styles.css').read_text()+'\n</style>')
 html=html.replace('<script type="module" src="/preview/main.mjs"></script>','')
 return html.replace('</body>','<script>\n'+script+'\n</script></body>')

def launch_root_server():
 port=43218
 process=subprocess.Popen(['node','tools/preview-server.mjs'],cwd=ROOT,env={**os.environ,'P08_PORT':str(port)},stdout=subprocess.DEVNULL,stderr=subprocess.PIPE)
 for _ in range(60):
  try:
   url=f'http://127.0.0.1:{port}/'
   with urllib.request.urlopen(url,timeout=.4) as res:
    assert res.status==200
    assert res.headers['x-morro-mode']=='isolated-fixture-only'
    assert res.headers['Content-Security-Policy'].find("connect-src 'none'")>=0
   break
  except (OSError,urllib.error.URLError):time.sleep(.06)
 else:raise AssertionError('P08_LOOPBACK_SERVER_START_FAILED')
 try:
  assert urllib.request.urlopen(urllib.request.Request(url,method='HEAD'),timeout=2).status==200
  for method in ['POST','PUT','PATCH','DELETE']:
   try:
    urllib.request.urlopen(urllib.request.Request(url,data=b'not-allowed',method=method),timeout=2)
    raise AssertionError('HTTP_WRITE_ACCEPTED_'+method)
   except urllib.error.HTTPError as exc: assert exc.code==405,(method,exc.code)
  for path,expected in [('/..%2F..%2Fetc%2Fpasswd',403),('/%E0%A4%A',400)]:
   try:
    urllib.request.urlopen(url.rstrip('/')+path,timeout=2)
    raise AssertionError('PATH_ACCEPTED_'+path)
   except urllib.error.HTTPError as exc:assert exc.code==expected,(path,exc.code)
  assert urllib.request.urlopen(url,timeout=2).status==200
  return {'GET':200,'HEAD':200,'writes':'405 x4','pathTraversal':403,'malformedURL':400,'recoverAfterError':200,'loopbackOnly':True,'connectSrc':'none'}
 finally:
  process.terminate();process.wait(timeout=4)

def shot(page,name):
 path=EVIDENCE/(name+'.png')
 page.screenshot(path=str(path),full_page=True,animations='disabled')
 return {'path':path.name,'sha256':hashlib.sha256(path.read_bytes()).hexdigest(),'bytes':path.stat().st_size}

def safe_assert_layout(page,width,height):
 assert page.evaluate('document.documentElement.scrollWidth <= innerWidth+1'),(width,height,'HORIZONTAL_PAGE_OVERFLOW')
 assert page.locator('.saved-panel').is_visible()
 dims=page.locator('.saved-panel').bounding_box()
 assert dims is not None and dims['x']>=-1 and dims['x']+dims['width']<=width+1,(width,height,dims)
 assert page.locator('.composer input').is_visible(),(width,height,'PERSISTENT_COMPOSER_MISSING')
 assert page.locator('.composer button').is_visible(),(width,height,'PERSISTENT_SEND_MISSING')
 assert page.locator('.bottom-nav button').is_visible(),(width,height,'BOTTOM_SAVED_NAV_MISSING')
 for selector in ['.saved-panel [data-action=close]','.saved-panel [data-action=ask-assistant]','#nav-saved','.composer button']:
  metrics=page.locator(selector).first.bounding_box()
  assert metrics and metrics['height']>=43.5 and metrics['width']>=43.5,(width,height,selector,metrics)
  assert metrics['y']+metrics['height']<=height+2,(width,height,selector,metrics)
  assert metrics['x']>=-1 and metrics['x']+metrics['width']<=width+1,(width,height,selector,'HORIZONTAL_HIT_TARGET_CLIPPED',metrics)

def run():
 inline=html_inline()
 http=launch_root_server()
 viewports=[(320,720),(360,800),(390,844),(430,932),(768,1024),(844,390),(1440,900)]
 matrix=[];shots=[];assertions=0
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('P08_CHROME','/usr/bin/chromium'),args=['--no-sandbox','--disable-dev-shm-usage'])
  for width,height in viewports:
   context=browser.new_context(viewport={'width':width,'height':height},locale='pt-BR',reduced_motion='reduce')
   page=context.new_page();errors=[];requests=[]
   page.on('pageerror',lambda err:errors.append(str(err)))
   page.on('request',lambda req:requests.append(req.url))
   page.set_content(inline,wait_until='load')
   assert page.locator('.lab-flag').is_visible()
   assert 'SEM EFEITOS EXTERNOS' in page.locator('.lab-flag').inner_text()
   assert page.locator('.demo-marker').count()==3
   assert page.locator('#home-saved-panel').is_hidden()
   assert page.locator('.assistant-saved-list .saved-card').count()==0
   assert page.locator('#nav-saved').get_attribute('aria-expanded')=='false'
   assertions+=5
   page.locator('.demo-marker').first.click()
   page.locator('#nav-saved').click()
   assert page.locator('.saved-panel .saved-card').count()==1
   saved_place_id=page.locator('.saved-panel .saved-card').get_attribute('data-place-id')
   # On the approved hybrid UI the same collection is rendered in one visible
   # projection at a time. Assistant receives the projection on explicit handoff.
   assert page.locator('.assistant-saved-list .saved-card').count()==0
   assert page.locator('#nav-saved').get_attribute('aria-expanded')=='true'
   assertions+=3
   safe_assert_layout(page,width,height);assertions+=7
   shots.append(shot(page,f'P08_Hybrid_panel_{width}x{height}'))
   page.locator('.saved-panel [data-action=ask-assistant]').click()
   assert page.locator('#home-saved-panel').is_hidden()
   assert page.locator('.assistant-saved-list .saved-card').count()==1
   assert page.locator('.assistant-saved-list .saved-card').get_attribute('data-place-id')==saved_place_id
   assert 'Assistant recebeu 1' in page.locator('#assistant-response').inner_text()
   assertions+=3
   shots.append(shot(page,f'P08_Hybrid_assistant_{width}x{height}'))
   # Remove from Assistant: both entry points must rerender from one observable store.
   page.locator('.assistant-saved-list [data-action=remove]').first.click()
   assert page.locator('.assistant-saved-list .saved-card').count()==0
   page.locator('#nav-saved').click()
   assert page.locator('.saved-panel .saved-card').count()==0
   assertions+=2
   page.keyboard.press('Escape')
   assert page.locator('#home-saved-panel').is_hidden()
   assert page.locator('#nav-saved').get_attribute('aria-expanded')=='false'
   assertions+=2
   assert not errors,(width,height,errors)
   assert not requests,(width,height,requests)
   assertions+=2
   matrix.append({'viewport':[width,height],'status':'PASS','panelAssistantSameSource':True,'contextExplicit':True,'keyboardEscape':True,'noPageErrors':True,'externalRequests':0,'mapComposerNavPreserved':True})
   context.close()
   print('PASS viewport',width,height,flush=True)
  # Dedicated cross-destination, locales and fail-closed browser cases.
  ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errs=[];page.on('pageerror',lambda err:errs.append(str(err)))
  page.set_content(inline,wait_until='load')
  page.locator('.demo-marker').first.click()
  page.locator('.lab-tools summary').click()
  page.locator('#destination').select_option('itacare')
  page.locator('.lab-tools summary').click()
  page.locator('#nav-saved').click()
  assert page.locator('.saved-panel .saved-card').count()==0
  page.locator('#nav-saved').click()
  page.locator('.demo-marker').first.click()
  page.locator('.lab-tools summary').click();page.locator('#destination').select_option('morro-de-sao-paulo');page.locator('.lab-tools summary').click()
  page.locator('#nav-saved').click()
  assert page.locator('.saved-panel .saved-card').count()==1
  assert page.locator('.saved-panel .saved-card').get_attribute('data-place-id')=='demo-segunda-praia'
  shots.append(shot(page,'P08_Hybrid_destinations_isolated_390x844'))
  assertions+=3
  for loc in ['en','es','he','pt-BR']:
   page.locator('.lab-tools summary').click();page.locator('#locale').select_option(loc);page.locator('.lab-tools summary').click()
   assert page.locator('#home-saved-panel').is_visible()
   assert page.locator('#home-saved-panel').get_attribute('dir')==('rtl' if loc=='he' else 'ltr')
   assert page.locator('.saved-panel .saved-card').count()==1
   assert page.locator('.assistant-saved-list .saved-card').count()==0
   shots.append(shot(page,'P08_Hybrid_locale_'+loc.replace('-','_')+'_390x844'))
   assertions+=3
  assert not errs,errs
  ctx.close()
  # Owner fixture uses a controlled in-memory backend with exact readbacks, NO requests.
  ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();errs=[];reqs=[]
  page.on('pageerror',lambda err:errs.append(str(err)))
  page.on('request',lambda req:reqs.append(req.url))
  page.set_content(inline,wait_until='load')
  page.locator('.lab-tools summary').click();page.locator('#mode').select_option('owner');page.locator('.lab-tools summary').click()
  page.wait_for_timeout(55)
  page.locator('.demo-marker').first.click()
  page.locator('#nav-saved').click()
  page.wait_for_function("document.querySelector('.saved-card__meta')?.textContent?.includes('serviço')",timeout=3000)
  assert page.locator('.saved-panel .saved-card').count()==1,(page.locator('[data-testid=saved-status]').all_text_contents(),errs)
  assert 'serviço' in page.locator('.saved-card__meta').first.inner_text().lower()
  shots.append(shot(page,'P08_Hybrid_verified_owner_fixture_390x844'))
  page.locator('.lab-tools summary').click();page.locator('#offline').check();page.locator('.lab-tools summary').click()
  assert page.locator('.saved-panel [data-action=open-place]').first.is_disabled()
  assert page.locator('.saved-panel [data-action=remove]').first.is_disabled()
  shots.append(shot(page,'P08_Hybrid_owner_offline_fail_closed_390x844'))
  assert not errs,errs
  assert not reqs,reqs
  assertions+=6;ctx.close()
  # User content rendered using textContent; malicious HTML must not execute.
  injected=inline.replace("name:'Segunda Praia'", "name:'<img src=x onerror=alert(1)>'",1)
  ctx=browser.new_context(viewport={'width':390,'height':844});page=ctx.new_page();alerts=[];page.on('dialog',lambda d:(alerts.append(d.message),d.dismiss()))
  page.set_content(injected,wait_until='load');page.locator('.demo-marker').first.click();page.locator('#nav-saved').click()
  assert page.locator('.saved-panel .saved-card__title').first.inner_text()=='<img src=x onerror=alert(1)>'
  assert page.locator('.saved-panel .saved-card__title img').count()==0
  assert not alerts
  assertions+=3;ctx.close()
  browser.close()
 proof={'scope':'P08_HYBRID_ISOLATED_PREVIEW_ONLY_NOT_MAIN_NOT_PRODUCTION','method':'EXACT_SOURCE_HTML_CSS_JS_INLINE_BROWSER_NO_NETWORK; HTTP read-only security independently verified via localhost urllib','timestampUtc':datetime.datetime.now(datetime.timezone.utc).isoformat(),'sourceFilesSHA256':SHA,'viewports':matrix,'viewportCount':len(matrix),'screenshots':shots,'screenshotCount':len(shots),'assertionCount':assertions,'pageErrors':0,'externalRequests':0,'http':http,'status':'PASS','realMapOrBackendMounted':False,'financialOrExternalMutations':0}
 target=EVIDENCE/'BROWSER_MATRIX.json';target.write_text(json.dumps(proof,ensure_ascii=False,indent=2)+'\n')
 print(json.dumps({'status':proof['status'],'viewports':proof['viewportCount'],'screenshots':proof['screenshotCount'],'assertions':assertions,'proof':str(target)},ensure_ascii=False))
if __name__=='__main__':run()
