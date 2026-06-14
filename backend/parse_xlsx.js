const XLSX = require('xlsx');
const fs = require('fs');
const files = fs.readdirSync('/tmp').filter(x => x.startsWith('isracard_export_') && x.endsWith('.xlsx'));
if (!files.length) { console.log('no file'); process.exit(1); }
const wb = XLSX.read(fs.readFileSync('/tmp/' + files[0]));
console.log('SHEETS:', wb.SheetNames);
wb.SheetNames.forEach(name => {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });
  console.log('\\n=== SHEET:', name, '===');
  rows.slice(0, 15).forEach((r, i) => console.log('row' + i + ':', JSON.stringify(r)));
});
