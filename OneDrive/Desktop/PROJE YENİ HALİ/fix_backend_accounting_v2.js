const fs = require('fs');

const filePath = 'isg-backend/controllers/mobileController.js';
let content = fs.readFileSync(filePath, 'utf8');

// Replace the access check to add accounting support
const oldCode = `    // Admin bypass
    logger.debug('[getWorkplaceById] Checking access - isAdmin:', req.user.isAdmin, 'personnelId:', personnelId);
    if (req.user.isAdmin) {
      logger.debug('[getWorkplaceById] ADMIN BYPASS ACTIVATED');
      hasAccess = true;
      canEdit = true; // Admins can edit everything
    } else if (personnelType === 'expert') {`;

const newCode = `    // Admin bypass
    logger.debug('[getWorkplaceById] Checking access - isAdmin:', req.user.isAdmin, 'personnelType:', personnelType, 'personnelId:', personnelId);
    if (req.user.isAdmin) {
      logger.debug('[getWorkplaceById] ADMIN BYPASS ACTIVATED');
      hasAccess = true;
      canEdit = true; // Admins can edit everything
    } else if (personnelType === 'accounting' || personnelType === 'hr' || personnelType === 'osgb_admin') {
      // Accounting, HR, and OSGB Admin users can access and edit all workplaces in their organization
      logger.debug('[getWorkplaceById] ACCOUNTING/HR/OSGB_ADMIN BYPASS ACTIVATED');
      hasAccess = true;
      canEdit = true;
    } else if (personnelType === 'expert') {`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ Backend mobileController.js updated successfully!');
    console.log('Muhasebe kullanıcıları artık tüm işyerlerini düzenleyebilir.');
} else {
    console.log('❌ Old code not found in file!');
    console.log('Searching for similar patterns...');
    const lines = content.split('\n');
    lines.forEach((line, idx) => {
        if (line.includes('personnelType ===')) {
            console.log(`Line ${idx + 1}: ${line.trim()}`);
        }
    });
}
