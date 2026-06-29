const fs = require('fs');
const file = 'C:/Users/USER/.gemini/antigravity/brain/90e301b0-6f76-4f2b-90c1-b85b9c65098e/su_sporlari.sql';
let data = fs.readFileSync(file, 'utf8');

// The format is typically: ... , <initialScore>, 'precaution1,precaution2', NOW(), NOW());
// We can use a regex that matches the precautions string which is right before , NOW(), NOW());
data = data.replace(/, '([^']*)', NOW\(\), NOW\(\)\);/g, (match, p1) => {
    // split by comma, and make it a valid JSON array string
    const arr = p1.split(',').map(s => s.trim()).filter(s => s.length > 0);
    const jsonStr = JSON.stringify(arr);
    // escape single quotes for SQL: ' -> ''
    const sqlSafeJsonStr = jsonStr.replace(/'/g, "''");
    return `, '${sqlSafeJsonStr}', NOW(), NOW());`;
});

fs.writeFileSync(file, data);
console.log('Fixed precautions JSON format.');
