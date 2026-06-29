with open('isg-backend/controllers/mobileController.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Replace the access check to add accounting support
old_code = """    // Admin bypass
    logger.debug('[getWorkplaceById] Checking access - isAdmin:', req.user.isAdmin, 'personnelId:', personnelId);
    if (req.user.isAdmin) {
      logger.debug('[getWorkplaceById] ADMIN BYPASS ACTIVATED');
      hasAccess = true;
      canEdit = true; // Admins can edit everything
    } else if (personnelType === 'expert') {"""

new_code = """    // Admin bypass
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
    } else if (personnelType === 'expert') {"""

if old_code in content:
    content = content.replace(old_code, new_code)
    with open('isg-backend/controllers/mobileController.js', 'w', encoding='utf-8') as f:
        f.write(content)
    print('✅ Backend mobileController.js updated successfully!')
    print('Muhasebe kullanıcıları artık tüm işyerlerini düzenleyebilir.')
else:
    print('❌ Old code not found in file!')
