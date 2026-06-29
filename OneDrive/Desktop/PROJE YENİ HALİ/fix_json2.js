const fs = require('fs');
const file = 'C:/Users/USER/.gemini/antigravity/brain/90e301b0-6f76-4f2b-90c1-b85b9c65098e/su_sporlari.sql';
let data = fs.readFileSync(file, 'utf8');

// Update column list
data = data.replace(
    /\"initialScore\", \"precautions\", \"createdAt\", \"updatedAt\"\)/g,
    '\"initialScore\", \"precautions\", \"finalProbability\", \"finalSeverity\", \"finalScore\", \"createdAt\", \"updatedAt\")'
);

// Update values by adding `1, 1, 1` before NOW()
data = data.replace(
    /', NOW\(\), NOW\(\)\);/g,
    "', 1, 1, 1, NOW(), NOW());"
);

fs.writeFileSync(file, data);
console.log('Fixed final columns.');
