const fs = require('fs');
const { execSync } = require('child_process');
const path = require('path');

const tempDir = path.join(__dirname, 'temp_excel_reader');
if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir);
process.chdir(tempDir);

try {
  require.resolve('xlsx');
} catch(e) {
  execSync('npm install xlsx --no-save', { stdio: 'ignore' });
}

const xlsx = require('xlsx');
const workbook = xlsx.readFile('../ISG_HIZMET_SOZLESME_SURECI_DISA_AKTAR_1782590277188.xlsx');
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];
const data = xlsx.utils.sheet_to_json(worksheet, { header: 1 });

console.log('COLUMNS:', data[0]);
console.log('ROW 1:', data[1]);
