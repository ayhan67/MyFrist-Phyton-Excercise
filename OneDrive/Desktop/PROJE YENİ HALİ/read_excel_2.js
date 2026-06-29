const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const tempDir = path.join(__dirname, 'temp_excel_reader_2');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
process.chdir(tempDir);

fs.writeFileSync('package.json', JSON.stringify({
  "name": "temp-reader",
  "version": "1.0.0"
}));

try {
  execSync('npm install xlsx --legacy-peer-deps', { stdio: 'ignore' });
} catch(e) {
  console.error("Install failed");
}

const xlsx = require('xlsx');
const workbook = xlsx.readFile('../ISG_HIZMET_SOZLESME_SURECI_DISA_AKTAR_1782590277188.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log('COLUMNS:', data[0]);
console.log('ROW 1:', data[1]);
