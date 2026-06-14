process.env.PLAYWRIGHT_BROWSERS_PATH = '/app/pw-browsers';
const { firefox } = require('playwright');
const fs = require('fs');
const COOKIES_PATH = '/app/scraper/.isracard-cookies.json';

(async () => {
  const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
  const b = await firefox.launch({ headless: true });
  const ctx = await b.newContext({ locale: 'he-IL' });
  await ctx.addCookies(cookies);
  const p = await ctx.newPage();

  const allRequests = [];
  ctx.on('request', req => {
    const url = req.url();
    if (!url.match(/\.(svg|png|jpg|css|woff|ico)$/))
      allRequests.push({ method: req.method(), url, post: req.postData()?.slice(0, 300) });
  });

  await p.goto('https://web.isracard.co.il/Transactions', { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  await p.waitForTimeout(3000);

  const beforeCount = allRequests.length;

  // Try to download via the excel button
  let downloadUrl = null;
  let downloadFile = null;

  const [dl] = await Promise.all([
    p.waitForEvent('download', { timeout: 15000 }).catch(() => null),
    p.locator('[aria-label="download excel"]').first().click().catch(() => {})
  ]);

  await p.waitForTimeout(4000);

  if (dl) {
    downloadUrl = dl.url();
    const savePath = '/tmp/isracard_export_' + Date.now() + '.xlsx';
    await dl.saveAs(savePath);
    downloadFile = savePath;
    const size = fs.statSync(savePath).size;
    console.log('DOWNLOAD_URL:', downloadUrl);
    console.log('SAVED:', savePath, 'SIZE:', size);
  }

  const newReqs = allRequests.slice(beforeCount);
  console.log('NEW_REQUESTS_AFTER_CLICK:');
  newReqs.forEach(r => console.log(r.method, r.url, r.post ? 'POST_BODY:' + r.post : ''));

  await b.close();

  // Save cookies again (refresh session)
  const newCtx = await firefox.launch({ headless: true }).then(async b2 => {
    const c2 = await b2.newContext({ locale: 'he-IL' });
    await c2.addCookies(cookies);
    const cookies2 = await c2.cookies();
    fs.writeFileSync(COOKIES_PATH, JSON.stringify(cookies2, null, 2));
    console.log('COOKIES_REFRESHED:', cookies2.length);
    await b2.close();
  }).catch(() => {});
})().catch(e => { console.error('ERR:', e.message); process.exit(1); });
