import {test,expect} from '@playwright/test';

const base=process.env.TOOLSCOUT_BROWSER_BASE||'http://127.0.0.1:4173';

test('tool directory renders the redesigned catalog and AI signals',async({page})=>{
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

test('generated comparison includes AI decision dimensions',async({page})=>{
  await page.goto(base+'/make-vs-zapier.html',{waitUntil:'domcontentloaded'});
  await expect(page.locator('body')).toContainText('AI interoperability');
  await expect(page.locator('body')).toContainText('AI assistants');
  await expect(page.locator('body')).toContainText('Agent connectivity');
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

test.describe('mobile release smoke',()=>{
  test.use({viewport:{width:390,height:844}});
  test('catalog, comparison and Command Center avoid page-level horizontal overflow',async({page})=>{
    for(const path of ['/tools.html','/make-vs-zapier.html','/.browser-fixtures/analytics.html']){
      await page.goto(base+path,{waitUntil:'domcontentloaded'});
      await page.waitForTimeout(100);
      expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2),path+' overflow').toBeTruthy();
    }
  });
});

test('reduced-motion contract is present in the Command Center redesign',async({page})=>{
  await page.emulateMedia({reducedMotion:'reduce'});
  await page.goto(base+'/.browser-fixtures/analytics.html',{waitUntil:'domcontentloaded'});
  const css=await page.locator('style[data-toolscout-command-center-redesign="2"]').textContent();
  expect(css).toContain('@media(prefers-reduced-motion:reduce)');
});
