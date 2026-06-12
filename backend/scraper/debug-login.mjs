import { chromium } from 'playwright';
import { readFileSync } from 'fs';

const CHROMIUM_PATH = process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH || '/usr/bin/chromium-browser';
const id = process.env.ISRACARD_ID;
const card6 = process.env.ISRACARD_CARD6;
const pass  = process.env.ISRACARD_PASSWORD;

async function typeSlowly(page, sel, text) {
  await page.locator(sel).click();
  await page.locator(sel).fill('');
  for (const ch of String(text)) { await page.locator(sel).press(ch); await page.waitForTimeout(40); }
}

const browser = await chromium.launch({
  executablePath: CHROMIUM_PATH, headless: true,
  args: ['--no-sandbox','--disable-setuid-sandbox','--disable-dev-shm-usage','--disable-gpu'],
});
const ctx = await browser.newContext({ locale:'he-IL',
  userAgent:'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0.0.0 Safari/537.36' });
const page = await ctx.newPage();
page.setDefaultTimeout(60000);

// Log EVERY request/response touching isracard
page.on('request',  req  => { if (req.url().includes('isracard')) console.log('[REQ]', req.method(), req.url().split('?')[1]||req.url()); });
page.on('response', async res => {
  if (!res.url().includes('isracard')) return;
  const path = res.url().split('?')[1] || res.url().split('/').pop();
  let body = '';
  try { body = (await res.text()).slice(0,200); } catch {}
  console.log('[RES]', res.status(), path, body);
});

console.log('navigating...');
await page.goto('https://digital.isracard.co.il/personalarea/Login/', { waitUntil:'domcontentloaded', timeout:30000 });
await page.waitForTimeout(2000);

console.log('clicking #flip...');
await page.locator('#flip').waitFor({ state:'visible', timeout:30000 });
await page.locator('#flip').click();
await page.locator('#otpLoginId_ID').waitFor({ state:'visible', timeout:15000 });

console.log('filling form...');
await typeSlowly(page, '#otpLoginId_ID', id);
await typeSlowly(page, '#cardnum', card6);
await typeSlowly(page, '#otpLoginPwd', pass);

// Check form validity before submitting
const valid = await page.evaluate(() => {
  const f = document.getElementById('otpLobbyFormPassword');
  return { class: f?.className, valid: f?.checkValidity() };
});
console.log('form state:', valid);

console.log('clicking submit...');
await page.locator('#otpLobbyFormPassword button:has-text("כניסה")').click();

console.log('waiting 10s for any response...');
await page.waitForTimeout(10000);
console.log('final url:', page.url());

const snap = await page.evaluate(() => document.body.innerText.slice(0,300));
console.log('page text:', snap);

await browser.close();
