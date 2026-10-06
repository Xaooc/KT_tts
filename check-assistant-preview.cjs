const fs=require('fs'),assert=require('assert');
const {chromium}=require('C:/Users/PC/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright');
const html=fs.readFileSync('output/assistant-preview.html','utf8');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:'C:/Program Files/Google/Chrome/Application/chrome.exe'});const errors=[];let checks=0;
 try{const page=await browser.newPage({viewport:{width:1280,height:1000},deviceScaleFactor:1});page.on('pageerror',e=>errors.push(e.message));await page.setContent(html);
 const expect=async(selector,text)=>{assert((await page.locator(selector).innerText()).includes(text),selector+' missing '+text);checks++};
 await expect('#dock','Осталось AP');await page.screenshot({path:'output/assistant-activation-preview.png',fullPage:true});
 await page.locator('[data-step="dash"]').click();assert(await page.locator('[data-step="finish"]').isEnabled());checks++;await page.locator('[data-step="finish"]').click();await expect('#dock','Оперативник использован');
 await page.locator('[data-scene="activation"]').click();await page.locator('[data-step="shoot"]').click();await page.locator('[data-open-ploy]').click();assert(!(await page.locator('[data-step="apply"]').isEnabled()));checks++;
 await expect('#dock','Стрельба в процессе');await expect('#dock','карабин Теслы');await page.screenshot({path:'output/assistant-ploy-preview.png',fullPage:true});
 await page.locator('#confirm').check();await page.locator('[data-step="apply"]').click();await expect('.player.red','1');await expect('#dock','Применена');
 await page.locator('[data-step="undo"]').click();await expect('.player.red','2');await expect('#dock','Применить · 1 CP');
 await page.locator('[data-step="undo"]').click();await expect('#dock','AP возвращены');await page.locator('[data-show-activation]').click();await expect('#dock','Потрачено 1 / 2 AP');
 await page.locator('[data-step="shoot"]').click();await page.locator('[data-open-ploy]').click();await page.locator('#confirm').check();await page.locator('[data-step="apply"]').click();await page.locator('[data-step="resolve"]').click();await expect('#dock','временного эффекта нет');await page.locator('[data-step="finish"]').click();
 await page.locator('[data-scene="round"]').click();await page.screenshot({path:'output/assistant-round-preview.png',fullPage:true});await page.locator('#confirm').check();await page.locator('[data-step="next"]').click();await expect('#toolbar','3');await page.locator('[data-step="red"]').click();await expect('.player.red','3');await expect('.player.blue','5');
 await page.locator('#confirm').check();await page.locator('[data-step="next"]').click();await page.locator('#confirm').check();await page.locator('[data-step="apply"]').click();await page.locator('[data-step="pass"]').click();await page.locator('[data-step="pass"]').click();await expect('#dock','Раунд готов к игре');
 await page.locator('[data-scene="round"]').click();await page.locator('#confirm').check();await page.locator('[data-step="next"]').click();await page.locator('[data-step="blue"]').click();await page.locator('#confirm').check();await page.locator('[data-step="next"]').click();await page.locator('[data-step="pass"]').click();await page.locator('[data-step="pass"]').click();await expect('#dock','Раунд готов к игре');
 await page.locator('[data-scene="shoot"]').click();await page.locator('[data-rule="blast"]').click();assert(await page.locator('#rule-dialog').isVisible());checks++;await page.locator('#close-rule').click();
 for(const width of [1280,1024,760,390,320]){
  await page.setViewportSize({width,height:1000});
  for(const scene of ['activation','shoot','round']){await page.locator('[data-scene="'+scene+'"]').click();const dims=await page.evaluate(()=>({scroll:document.documentElement.scrollWidth,client:document.documentElement.clientWidth}));assert(dims.scroll<=dims.client,'Horizontal overflow at '+width+' '+scene);checks++;
   const outside=await page.locator('#dock button,#dock input').evaluateAll(els=>els.filter(e=>{const a=e.getBoundingClientRect(),b=e.closest('#dock').getBoundingClientRect();return a.left<b.left-1||a.right>b.right+1}).map(e=>e.textContent));assert.deepEqual(outside,[],'Controls outside dock');checks++;
  }
 }
 await page.setViewportSize({width:390,height:1000});await page.locator('[data-scene="shoot"]').click();await page.screenshot({path:'output/assistant-mobile-preview.png',fullPage:true});
 assert.deepEqual(errors,[]);const report={passed:true,checks,browser:'Chrome headless',nativeTTSUIRendered:false,computerUse:false,viewports:[1280,1024,760,390,320],interactionFlows:['activation and zero AP finish','ploy cost, undo and action expiry','initiative both players','alternating gambit passes','clickable glossary'],screenshots:['assistant-activation-preview.png','assistant-ploy-preview.png','assistant-round-preview.png','assistant-mobile-preview.png']};fs.writeFileSync('output/assistant-preview-verification.json',JSON.stringify(report,null,2));console.log(report);
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
