process.env.PLAYWRIGHT_BROWSERS_PATH='/app/pw-browsers';
const { firefox } = require('playwright');
(async () => {
  const b = await firefox.launch({ headless: true });
  const ctx = await b.newContext({ locale: 'he-IL' });
  const p = await ctx.newPage();
  const redirects = [];
  p.on('response', r => {
    if (r.status() >= 300 && r.status() < 400)
      redirects.push(r.status() + ' ' + r.url().slice(0,120));
  });
  await p.goto('https://app.discountbank.co.il', { waitUntil: 'domcontentloaded', timeout: 30000 });
  await p.waitForTimeout(5000);
  console.log('final url:', p.url().slice(0,150));
  console.log('title:', await p.title());
  console.log('redirects:', JSON.stringify(redirects));
  const inputs = await p.evaluate(() =>
    Array.from(document.querySelectorAll('input')).map(e => ({
      id: e.id, name: e.name, type: e.type, placeholder: e.placeholder
    }))
  );
  console.log('inputs:', JSON.stringify(inputs));
  await b.close();
})().catch(e => console.error('ERR:', e.message));
