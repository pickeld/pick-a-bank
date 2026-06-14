process.env.PLAYWRIGHT_BROWSERS_PATH='/app/pw-browsers';
const { firefox } = require('playwright');
(async () => {
  const b = await firefox.launch({ headless: true });
  const ctx = await b.newContext({ locale: 'he-IL' });
  const p = await ctx.newPage();

  p.on('response', r => {
    if (r.status() >= 300 && r.status() < 400)
      console.log('redirect', r.status(), r.url().slice(0,120));
  });

  await p.goto('https://app.discountbank.co.il', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(4000);
  console.log('url:', p.url());
  console.log('title:', await p.title());
  const inputs = await p.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(e => ({
      id: e.id, name: e.name, type: e.type, placeholder: e.placeholder
    }))
  );
  console.log('inputs:', JSON.stringify(inputs));
  const buttons = await p.evaluate(() =>
    Array.from(document.querySelectorAll('button')).slice(0,10).map(e => ({
      text: e.textContent.trim().slice(0,60), id: e.id, type: e.type
    }))
  );
  console.log('buttons:', JSON.stringify(buttons));
  await b.close();
})().catch(e => console.error('ERR:', e.message));
