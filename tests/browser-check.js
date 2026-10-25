// Run with the Playwright browser tool's filename argument against npm run dev.
async (page) => {
  const context = await page.context().browser().newContext({viewport:{width:1920,height:1080}});
  const tab = await context.newPage();
  const passed = [];
  const errors = [];
  tab.on('pageerror', error => errors.push(error.message));
  function check(value, message) { if (!value) throw new Error(message); }
  async function focus() { return tab.locator(':focus').getAttribute('aria-label'); }
  async function order() { return tab.locator('.app-tile').evaluateAll(els => els.map(el => el.dataset.app)); }
  async function back() { await tab.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown',{keyCode:461,bubbles:true,cancelable:true}))); }
  try {
    await tab.route('**/photos-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.HOME_PHOTOS=[];'}));
    await tab.goto('http://127.0.0.1:4173');
    check(await tab.title() === 'Sofa Goblin', 'Title');
    check(await tab.locator('.app-tile').count() === 5, 'Five apps');
    check(await focus() === 'YouTube', 'Initial focus');
    check(await tab.locator('#photos').isHidden(), 'No empty photo control');
    check(await tab.locator('.intro,.section-heading').count() === 0, 'Welcome copy and section headings removed');
    await tab.keyboard.press('ArrowLeft');
    check(await focus() === 'YouTube', 'Left edge should not wrap');
    await tab.keyboard.press('ArrowRight');
    await tab.keyboard.press('ArrowDown');
    check(await tab.locator(':focus').getAttribute('id') === 'arrange', 'Down to options');
    await tab.keyboard.press('ArrowUp');
    check(await focus() === 'Netflix', 'Up restores selection');
    await tab.keyboard.press('Enter');
    check((await tab.locator('#toast').innerText()).includes('Preview:'), 'Preview is explicit');
    passed.push('Five apps, bounded arrows, row focus, honest preview');

    await back();
    check(await tab.locator('#dialog').isVisible(), 'TV Back opens confirmation');
    check(await tab.locator(':focus').innerText() === 'Stay here', 'Safe default');
    await tab.keyboard.press('Shift+Tab');
    check(await tab.locator(':focus').innerText() === 'Open LG Home', 'Dialog focus trap');
    await back();
    check(await tab.locator('#dialog').isHidden() && await focus() === 'Netflix', 'Back cancels and restores focus');
    passed.push('TV Back confirmation, safe default, focus trap and cancellation');

    await tab.locator('#arrange').click();
    await tab.keyboard.press('ArrowRight');
    await tab.keyboard.press('Enter');
    const savedOrder = await order();
    check(savedOrder.join(',') === 'youtube,prime,netflix,disney,tubi', 'Move one app');
    await tab.reload();
    check((await order()).join() === savedOrder.join(), 'Order persists');
    await tab.locator('#arrange').click();
    await tab.keyboard.press('ArrowRight');
    await back();
    check((await order()).join() === savedOrder.join(), 'Cancel restores original');
    check(await tab.locator('#arrange').isEnabled(), 'Options restored after cancel');
    passed.push('Reorder save, reload persistence and rollback');

    await tab.evaluate(()=>localStorage.setItem('sofa-goblin.v1','{broken'));
    await tab.reload();
    check((await order()).join() === 'youtube,netflix,prime,disney,tubi', 'Corrupt preferences recover');
    for (const size of [{width:1920,height:1080},{width:1280,height:720}]) {
      await tab.setViewportSize(size);
      check(await tab.evaluate(()=>Array.from(document.querySelectorAll('.app-tile,footer')).every(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.y>=0&&r.right<=innerWidth&&r.bottom<=innerHeight;})), 'TV layout fits');
    }
    passed.push('Damaged preferences recover; 1080p and 720p layouts fit');

    await tab.addInitScript(()=>{
      window.__launches=[]; window.__reply=JSON.stringify({returnValue:true}); window.__delay=0; window.__cancels=0;
      window.PalmServiceBridge=function(){
        this.cancel=function(){window.__cancels++;};
        this.call=function(uri,raw){
          window.__launches.push({uri,payload:JSON.parse(raw)});
          if(window.__reply!==null) setTimeout(()=>this.onservicecallback(window.__reply),window.__delay);
        };
      };
    });
    await tab.reload();
    const targets = [['YouTube','youtube.leanback.v4'],['Netflix','netflix'],['Prime Video','amazon'],['Disney+','com.disney.disneyplus-prod'],['Tubi','com.tubitv.ott.tubi']];
    for (const [name,id] of targets) {
      await tab.getByRole('button',{name,exact:true}).click();
      await tab.waitForFunction(()=>!document.querySelector('#apps').classList.contains('busy'));
      check(await tab.evaluate(id=>window.__launches[window.__launches.length-1].payload.id===id,id), 'Exact TV app ID: '+name);
    }
    await tab.reload();
    check(await focus()==='Tubi', 'Successful launch remembered');
    passed.push('All five launch payloads and remembered successful app (mock TV bridge)');

    await tab.evaluate(()=>{window.__reply=JSON.stringify({returnValue:false,errorText:'Permission denied'});});
    await tab.getByRole('button',{name:'Netflix',exact:true}).click();
    await tab.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Permission denied'));
    check(await tab.evaluate(()=>!document.querySelector('#apps').classList.contains('busy')), 'Denied launch unlocks UI');
    await tab.evaluate(()=>{window.__reply='bad json';});
    await tab.getByRole('button',{name:'Netflix',exact:true}).click();
    await tab.waitForFunction(()=>document.querySelector('#toast').textContent.includes('Unexpected response'));
    await tab.evaluate(()=>{window.__reply=null;window.__launches=[];});
    await tab.getByRole('button',{name:'Netflix',exact:true}).click();
    await tab.keyboard.press('Enter');
    check(await tab.evaluate(()=>window.__launches.length)===1, 'Pending launch deduplicated');
    await tab.waitForFunction(()=>document.querySelector('#toast').textContent.includes('did not respond'),null,{timeout:9000});
    check(await tab.evaluate(()=>!document.querySelector('#apps').classList.contains('busy')), 'Timeout unlocks UI');
    await tab.evaluate(()=>{window.__reply=JSON.stringify({returnValue:true});});
    await tab.getByRole('button',{name:'YouTube',exact:true}).click();
    await tab.waitForFunction(()=>!document.querySelector('#apps').classList.contains('busy'));
    passed.push('Denied/malformed/timed-out launches recover; duplicate launch blocked; retry succeeds');

    await tab.route('**/photos-config.js',route=>route.fulfill({contentType:'text/javascript',body:'window.HOME_PHOTOS=["photos/photo-01.jpg","photos/photo-02.jpg","photos/photo-03.jpg"];'}));
    const photoRequests=[];
    await tab.route('**/photos/*.jpg',route=>{
      photoRequests.push(route.request().url());
      return route.fulfill({contentType:'image/png',body:Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aK1kAAAAASUVORK5CYII=','base64')});
    });
    await tab.clock.install();
    await tab.reload();
    await tab.waitForFunction(()=>!document.querySelector('#photo-background').hidden);
    check(photoRequests.length===1, 'Only first photo loaded initially');
    await tab.clock.fastForward(30001);
    await tab.waitForFunction(()=>document.querySelector('#photo-b').classList.contains('visible'));
    check(photoRequests.length===2, 'Next photo at 30 seconds');
    check(await tab.locator('#photo-background img').count()===2, 'Only two image layers');
    await tab.locator('#photos').click();
    check(await tab.locator('#photo-background').isHidden(), 'Photos toggle off');
    check(await tab.locator('#photo-background img[src]').count()===0, 'Images released when off');
    await tab.reload();
    check(await tab.locator('#photos').innerText()==='Photos: Off', 'Photo choice persists');
    await tab.locator('#photos').click();
    await tab.waitForFunction(()=>!document.querySelector('#photo-background').hidden);
    await tab.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:true});document.dispatchEvent(new Event('visibilitychange'));});
    check(await tab.locator('#photo-background img[src]').count()===0, 'Images released in background');
    const before=photoRequests.length;
    await tab.clock.fastForward(90000);
    check(photoRequests.length===before, 'No photo work in background');
    await tab.evaluate(()=>{Object.defineProperty(document,'hidden',{configurable:true,value:false});document.dispatchEvent(new Event('visibilitychange'));});
    await tab.waitForFunction(()=>!document.querySelector('#photo-background').hidden);
    passed.push('30-second photo cycle, two layers, persisted toggle, suspension and return');
    check(errors.length===0, 'No JavaScript errors: '+errors.join('; '));
    return {passed,scope:'Desktop Chromium with simulated TV bridge; actual TV installation and remote test still required.'};
  } finally { await context.close(); }
}
