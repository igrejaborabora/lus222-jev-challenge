/**
 * Regenerate the checked-in share image and icons with an existing Playwright install.
 * PLAYWRIGHT_MODULE=/absolute/path/to/playwright/index.mjs node scripts/render-social-assets.mjs
 * No runtime dependency or build-time browser is required by the deployed website.
 */
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

const root=new URL('../',import.meta.url);
const modulePath=process.env.PLAYWRIGHT_MODULE;
if(!modulePath)throw new Error('Set PLAYWRIGHT_MODULE to an existing Playwright module path.');
const {chromium}=await import(pathToFileURL(modulePath).href);
const imageData=await readFile(new URL('public/img/lus-222-hero.webp',root));
const favicon=`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><title>PX — Pixelgrammar Lab</title><rect width="64" height="64" rx="13" fill="#0b1416"/><path fill="#a4eddf" fill-rule="evenodd" d="M8 17h12c8 0 13 4 13 11s-5 11-13 11h-5v9H8zm7 6v10h5c4 0 6-2 6-5s-2-5-6-5z"/><path fill="#a4eddf" d="M33 17h8l6 10 6-10h8L51 32l10 16h-8l-6-10-6 10h-8l10-16z"/></svg>`;
await writeFile(new URL('public/favicon.svg',root),favicon+'\n');
const browser=await chromium.launch({headless:true});
try{
  const page=await browser.newPage({viewport:{width:1200,height:630},deviceScaleFactor:1,reducedMotion:'reduce'});
  await page.setContent(`<!doctype html><html lang="en"><head><meta charset="utf-8"><link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600&family=IBM+Plex+Mono:wght@400;500&family=IBM+Plex+Sans:wght@700&display=swap" rel="stylesheet"><style>
*{box-sizing:border-box}html,body{margin:0;width:1200px;height:630px;overflow:hidden;background:#0b1416;color:#f0f0e8;font-family:'DM Sans',sans-serif}.art{position:absolute;left:180px;top:20px;width:1060px;height:665px;object-fit:cover;filter:grayscale(1);opacity:.78}.shade{position:absolute;inset:0;background:linear-gradient(90deg,#0b1416 0%,#0b1416f5 24%,#0b1416b5 43%,#0b141610 70%),linear-gradient(0deg,#0b1416 0%,transparent 27%,transparent 78%,#0b14168c)}header{position:absolute;left:56px;right:56px;top:35px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;gap:20px;align-items:center}.brand canvas{width:86px;height:64px}.wordmark{font:500 13px/1.7 'IBM Plex Mono',monospace;letter-spacing:2px}.wordmark b{display:block;color:#a4eddf;font-size:11px;letter-spacing:5.7px;font-weight:500}.edition{padding:10px 14px;border:1px solid #a4eddf55;color:#cbe3da;font:12px 'IBM Plex Mono',monospace;letter-spacing:2px}.main{position:absolute;left:56px;top:157px}.eyebrow{font:11px 'IBM Plex Mono',monospace;letter-spacing:2px;color:#a4eddf;margin:0 0 18px}h1{font:500 87px/.99 'DM Sans',sans-serif;letter-spacing:-6px;margin:0}h1 em{font-style:normal;color:#a4eddf}.sub{font-size:22px;line-height:1.5;color:#c2d0c8;margin:24px 0 0}footer{position:absolute;left:56px;right:56px;bottom:43px;padding-top:17px;border-top:1px solid #bfd8ce38;display:flex;justify-content:space-between;color:#a7bfb5;font:11px 'IBM Plex Mono',monospace;letter-spacing:1.4px}.url{color:#a4eddf;letter-spacing:.5px}.credit{position:absolute;bottom:15px;right:56px;color:#95aaa2;font:8px 'IBM Plex Mono',monospace;letter-spacing:.2px}
</style></head><body><img class="art" alt="" src="data:image/webp;base64,${imageData.toString('base64')}"><div class="shade"></div><header><div class="brand"><canvas id="px" width="172" height="128"></canvas><div class="wordmark">PIXELGRAMMAR<b>LAB</b></div></div><div class="edition">HUMAN × AI</div></header><main class="main"><p class="eyebrow">LUS–222 / PORTO</p><h1>Flight<br><em>Experiment.</em></h1><p class="sub">You fly. JEV decides.<br>One shared cockpit.</p></main><footer><span>TAKE CONTROL. SEE HOW AI DECIDES.</span><span class="url">lus222.pixelgrammar.com ↗</span></footer><small class="credit">Independent experiment · Aircraft render: EEA Aircraft</small></body></html>`);
  await page.evaluate(async()=>{
    await Promise.all([document.fonts.load('500 87px "DM Sans"'),document.fonts.load('700 112px "IBM Plex Sans"'),document.fonts.load('400 12px "IBM Plex Mono"')]);
    await document.fonts.ready;
    await Promise.all([...document.images].map(img=>img.decode()));
    if(!document.fonts.check('500 87px "DM Sans"')||!document.fonts.check('700 112px "IBM Plex Sans"'))throw new Error('Brand fonts did not load.');
    const canvas=document.querySelector('#px'),ctx=canvas.getContext('2d');
    const source=document.createElement('canvas');source.width=172;source.height=128;
    const mask=source.getContext('2d',{willReadFrequently:true});
    mask.font='700 112px "IBM Plex Sans"';mask.fillStyle='#fff';mask.textAlign='center';mask.textBaseline='middle';mask.fillText('PX',86,70);
    const {data}=mask.getImageData(0,0,172,128);
    for(let y=0;y<128;y+=3)for(let x=0;x<172;x+=3)if(data[(y*172+x)*4+3]>128){ctx.fillStyle=(x+y)%27===0?'#bea0ff':'#a4eddf';ctx.fillRect(x,y,2.2,2.2);}
  });
  await page.screenshot({path:fileURLToPath(new URL('public/og-flight-experiment.png',root))});
  const iconData=`data:image/svg+xml;base64,${Buffer.from(favicon).toString('base64')}`;
  for(const [size,path] of [[96,'favicon-96.png'],[180,'apple-touch-icon.png'],[32,'favicon-32.png']]){
    await page.setViewportSize({width:size,height:size});
    await page.setContent(`<style>html,body{margin:0;width:100%;height:100%;background:transparent}img{display:block;width:100%;height:100%}</style><img src="${iconData}" alt="PX">`);
    await page.locator('img').evaluate(img=>img.decode());
    const png=await page.screenshot({omitBackground:true});
    if(size!==32)await writeFile(new URL(`public/${path}`,root),png);
    else{
      // ICO may contain PNG payloads; 32 px is the fallback for older browser tabs.
      const header=Buffer.alloc(22);header.writeUInt16LE(1,2);header.writeUInt16LE(1,4);
      header[6]=32;header[7]=32;header.writeUInt16LE(1,10);header.writeUInt16LE(32,12);
      header.writeUInt32LE(png.length,14);header.writeUInt32LE(22,18);
      await writeFile(new URL('public/favicon.ico',root),Buffer.concat([header,png]));
    }
  }
  console.log('Generated 1200×630 social image, SVG/ICO/96 px favicons and 180 px Apple icon.');
}finally{await browser.close();}
