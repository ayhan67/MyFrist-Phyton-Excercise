const fs = require('fs');
const file = 'C:/Users/USER/.gemini/antigravity/brain/90e301b0-6f76-4f2b-90c1-b85b9c65098e/su_sporlari.sql';
let data = fs.readFileSync(file, 'utf8');

const lines = data.split('\n');
for (let i = 0; i < lines.length; i++) {
    let line = lines[i];
    if (line.includes('INSERT INTO')) {
        // Regex to match the precautions content safely. 
        // We know it is right before ", 1, 1, 1, NOW(), NOW());"
        // And it starts right after the initialScore which is a number like "10, '"
        let match = line.match(/(, \d+, )'(.*?)'(, \d+, \d+, \d+, NOW\(\), NOW\(\)\);)/);
        if (match) {
            let pre = match[1];
            let content = match[2];
            let post = match[3];
            
            // Check if it's already JSON (starts with [")
            if (!content.startsWith('["')) {
                // Unescape SQL quotes to regular quotes
                content = content.replace(/''/g, "'");
                
                // Split by comma
                let arr = content.split(',').map(s => s.trim()).filter(s => s.length > 0);
                let newJsonStr = JSON.stringify(arr);
                
                // Escape for SQL
                newJsonStr = newJsonStr.replace(/'/g, "''");
                
                line = line.substring(0, match.index) + pre + "'" + newJsonStr + "'" + post;
                lines[i] = line;
            }
        }
    }
}

fs.writeFileSync(file, lines.join('\n'));
console.log('Fixed missed lines with single quotes.');
