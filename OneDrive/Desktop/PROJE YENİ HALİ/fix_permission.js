const fs = require('fs');

const filePath = 'isg-frontend/src/components/WorkplaceDetailModal.tsx';
let content = fs.readFileSync(filePath, 'utf8');

const oldCode = `  // Permission check: Expert/Doctor can edit if they are tracking the workplace
  // If only assigned (not tracking), they can view but not edit
  const canEdit = user?.role === 'admin' || user?.role === 'osgb_admin' || user?.role === 'hr' || user?.role === 'accounting'
    ? true : expertId || doctorId
    ? (expertId && (workplaceData.trackingExpertId === expertId || (!workplaceData.trackingExpertId && workplaceData.assignedExpertId === expertId))) ||
    (doctorId && (workplaceData.trackingDoctorId === doctorId || (!workplaceData.trackingDoctorId && workplaceData.assignedDoctorId === doctorId)))
    : true; // If no expertId/doctorId provided, allow editing (for other pages that use this modal)`;

const newCode = `  // Permission check: Admin, OSGB Admin, HR, and Accounting can ALWAYS edit
  // Expert/Doctor can edit only if they are tracking the workplace
  const isAdminOrAuthorized = user?.role === 'admin' || user?.role === 'osgb_admin' || user?.role === 'hr' || user?.role === 'accounting';
  
  const canEdit = isAdminOrAuthorized 
    ? true // Authorized roles can always edit
    : expertId || doctorId
      ? (expertId && (workplaceData.trackingExpertId === expertId || (!workplaceData.trackingExpertId && workplaceData.assignedExpertId === expertId))) ||
      (doctorId && (workplaceData.trackingDoctorId === doctorId || (!workplaceData.trackingDoctorId && workplaceData.assignedDoctorId === doctorId)))
      : true; // If no expertId/doctorId provided, allow editing (for other pages that use this modal)`;

if (content.includes(oldCode)) {
    content = content.replace(oldCode, newCode);
    fs.writeFileSync(filePath, content, 'utf8');
    console.log('✅ WorkplaceDetailModal.tsx updated successfully!');
} else {
    console.log('❌ Old code not found in file!');
    console.log('Checking if already updated...');
    if (content.includes('isAdminOrAuthorized')) {
        console.log('✅ File already updated!');
    } else {
        console.log('⚠️ Code structure may have changed');
    }
}
