import {test,expect} from '@playwright/test';

const base=process.env.TOOLSCOUT_BROWSER_BASE||'http://127.0.0.1:4173';

test('homepage implements the ToolScout 2.0 editorial direction',async({page})=>{
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body.ts-home')).toHaveCount(1);
  await expect(page.locator('.brand')).toHaveAttribute('href','/');
  await expect(page.locator('.brand img')).toHaveAttribute('src','/favicon.svg');
  await expect(page.getByRole('heading',{level:1})).toContainText('Find the');
  await expect(page.getByRole('heading',{level:1})).toContainText('Faster.');
  await expect(page.locator('.decisionDoors .door')).toHaveCount(3);
  await expect(page.locator('#softwarePulse')).toBeVisible();
  await expect(page.locator('#pulseTitle')).not.toHaveText('');
  await expect(page.getByText('Independent. No sponsored rankings.')).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test('tool directory renders the catalog and AI signals',async({page})=>{
  await page.goto(base+'/tools.html',{waitUntil:'domcontentloaded'});
  await page.waitForSelector('.tool');
  const count=await page.locator('.tool').count();
  expect(count).toBeGreaterThan(80);
  await page.locator('#q').fill('ChatGPT');
  await expect(page.locator('.tool').filter({hasText:'ChatGPT'}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test('generated Figma profile includes AI interoperability evidence',async({page})=>{
  await page.goto(base+'/tools/figma.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('[data-ai-interoperability="1"]')).toBeVisible();
  await expect(page.locator('[data-ai-interoperability="1"]')).toContainText('AI interoperability');
  await expect(page.locator('[data-ai-interoperability="1"]')).toContainText('MCP');
});

test('public redesign transform gives internal pages the shared ToolScout 2.0 shell',async({page})=>{
  await page.goto(base+'/.browser-fixtures/figma-public.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('style[data-toolscout-public-redesign="2"]')).toHaveCount(1);
  await expect(page.locator('html[data-toolscout-redesign="2"]')).toHaveCount(1);
  await expect(page.locator('.ts2-global-nav')).toBeVisible();
  await expect(page.locator('.ts2-brand')).toHaveAttribute('href','/');
  await expect(page.getByRole('link',{name:'Compare'}).first()).toBeVisible();
  await expect(page.getByRole('link',{name:"What's new"}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test('Trends uses one shared global header and exposes publisher navigation',async({page})=>{
  await page.goto(base+'/.browser-fixtures/trends-public.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.ts2-global-nav')).toHaveCount(1);
  await expect(page.locator('.darkBand .shell > nav')).toHaveCount(0);
  await expect(page.getByRole('link',{name:'Trends'}).first()).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('link',{name:'Publisher Kit'}).first()).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test('Publisher Kit uses the shared sticky navigation and is indexable',async({page})=>{
  await page.goto(base+'/.browser-fixtures/publisher-kit.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.ts2-global-nav')).toHaveCount(1);
  await expect(page.getByRole('link',{name:'Publisher Kit'}).first()).toHaveAttribute('aria-current','page');
  await expect(page.getByRole('link',{name:'Trends'}).first()).toBeVisible();
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute('content','index,follow');
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://trytoolscout.org/distribution/publisher-kit');
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test('generated comparison includes AI decision dimensions',async({page})=>{
  await page.goto(base+'/make-vs-zapier.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toContainText('AI interoperability');
  await expect(page.locator('body')).toContainText('AI assistants');
  await expect(page.locator('body')).toContainText('Agent connectivity');
});

test('transformed comparison keeps the canonical page and gains the shared visual shell',async({page})=>{
  await page.goto(base+'/.browser-fixtures/comparison-public.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('.ts2-global-nav')).toBeVisible();
  await expect(page.locator('link[rel="canonical"]')).toHaveAttribute('href','https://trytoolscout.org/make-vs-zapier');
  await expect(page.locator('body')).toContainText('Make');
  await expect(page.locator('body')).toContainText('Zapier');
});

test('Command Center redesign fixture exposes GA4 and GSC explorers',async({page})=>{
  await page.goto(base+'/.browser-fixtures/analytics.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('style[data-toolscout-command-center-redesign="2"]')).toHaveCount(1);
  await expect(page.locator('script[data-toolscout-command-center-explorers="2"]')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'Overview'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Acquisition'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Performance'})).toBeVisible();
  await expect(page.getByRole('button',{name:'Queries'})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBeTruthy();
});

test.describe('mobile global navigation fit',()=>{
  test.use({viewport:{width:390,height:844}});
  test('all six primary navigation links are fully visible without horizontal rail clipping',async({page})=>{
    for(const item of [
      ['/index.html','.navlinks'],
      ['/.browser-fixtures/trends-public.html','.ts2-links'],
      ['/.browser-fixtures/publisher-kit.html','.nav-links']
    ]){
      const [path,selector]=item;
      await page.goto(base+path,{waitUntil:'domcontentloaded'});
      const fit=await page.locator(selector).evaluate(nav=>{
        const nr=nav.getBoundingClientRect();
        const links=[...nav.querySelectorAll('a')].map(a=>{const r=a.getBoundingClientRect();return{text:(a.textContent||'').trim(),left:r.left,right:r.right}});
        return{scrollFree:nav.scrollWidth<=nav.clientWidth+1,links,navLeft:nr.left,navRight:nr.right,allVisible:links.every(x=>x.left>=nr.left-1&&x.right<=nr.right+1)};
      });
      expect(fit.scrollFree,path+' nav should not horizontally scroll at 390px').toBeTruthy();
      expect(fit.allVisible,path+' nav links should be fully visible').toBeTruthy();
      expect(fit.links.map(x=>x.text)).toEqual(['Tools','Guides','Compare',"What's new",'Trends','Publisher Kit']);
    }
  });
});

test.describe('mobile release smoke',()=>{
  test.use({viewport:{width:390,height:844}});
  test('public redesign and Command Center avoid page-level horizontal overflow',async({page})=>{
    for(const path of ['/index.html','/tools.html','/make-vs-zapier.html','/.browser-fixtures/figma-public.html','/.browser-fixtures/comparison-public.html','/.browser-fixtures/trends-public.html','/.browser-fixtures/publisher-kit.html','/.browser-fixtures/analytics.html']){
      await page.goto(base+path,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(120);
      const overflow=await page.evaluate(()=>{
        const viewport=window.innerWidth,doc=document.documentElement.scrollWidth;
        const offenders=[...document.querySelectorAll('body *')].map(el=>{
          const r=el.getBoundingClientRect(),s=getComputedStyle(el);
          return{tag:el.tagName,id:el.id||'',cls:String(el.className||'').slice(0,120),left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width),overflowX:s.overflowX,whiteSpace:s.whiteSpace};
        }).filter(x=>x.right>viewport+2||x.left<-2).sort((a,b)=>(b.right-viewport)-(a.right-viewport)).slice(0,12);
        return{ok:doc<=viewport+2,viewport,doc,offenders};
      });
      if(!overflow.ok)console.log('MOBILE_OVERFLOW_DIAGNOSTIC',path,JSON.stringify(overflow));
      expect(overflow.ok,path+' overflow').toBeTruthy();
    }
  });
});

test('reduced-motion contracts cover public and private redesigns',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base+'/index.html',{waitUntil:'domcontentloaded'});
  const homeCss=await page.locator('style').allTextContents();
  expect(homeCss.join('\n')).toContain('@media(prefers-reduced-motion:reduce)');
  await page.goto(base+'/.browser-fixtures/figma-public.html',{waitUntil:'domcontentloaded'});
  const publicCss=await page.locator('style[data-toolscout-public-redesign="2"]').textContent();
  expect(publicCss).toContain('@media(prefers-reduced-motion:reduce)');
  await page.goto(base+'/.browser-fixtures/analytics.html',{waitUntil:'domcontentloaded'});
  const privateCss=await page.locator('style[data-toolscout-command-center-redesign="2"]').textContent();
  expect(privateCss).toContain('@media(prefers-reduced-motion:reduce)');
});
