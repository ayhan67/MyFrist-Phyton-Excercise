const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');
const PizZip = require('pizzip');
const Docxtemplater = require('docxtemplater');

const testDir = __dirname;

// Create test Excel file
const excelData = [
  ['AD_SOYAD', 'TC_KIMLIK', 'TARIH'],
  ['Ahmet Yılmaz', '12345678901', '2026-05-23'],
  ['Fatma Kara', '98765432109', '2026-05-23']
];

const wb = XLSX.utils.book_new();
const ws = XLSX.utils.aoa_to_sheet(excelData);
XLSX.utils.book_append_sheet(wb, ws, 'Kişiler');
XLSX.writeFile(wb, path.join(testDir, 'test-list.xlsx'));
console.log('✓ Created test-list.xlsx');

// Create test Word template
// Read a simple docx template (create a minimal one)
const docContent = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"
            xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <w:body>
    <w:p>
      <w:r>
        <w:t>Sertifika</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Ad Soyad: {{AD_SOYAD}}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>TC Kimlik: {{TC_KIMLIK}}</w:t>
      </w:r>
    </w:p>
    <w:p>
      <w:r>
        <w:t>Tarih: {{TARIH}}</w:t>
      </w:r>
    </w:p>
  </w:body>
</w:document>`;

const rels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
</Relationships>`;

const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
</Types>`;

const JSZip = require('jszip');
const zip = new JSZip();
zip.file('_rels/.rels', rels);
zip.file('[Content_Types].xml', contentTypes);
zip.file('word/document.xml', docContent);
zip.file('word/_rels/document.xml.rels', docRels);

zip.generateAsync({ type: 'nodebuffer' }).then(buffer => {
  fs.writeFileSync(path.join(testDir, 'test-template.docx'), buffer);
  console.log('✓ Created test-template.docx');
});
