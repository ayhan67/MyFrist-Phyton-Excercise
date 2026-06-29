import re

# Read file
with open('isg-frontend/src/components/WorkplaceDetailModal.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Old code
old_code = """  // Permission check: Expert/Doctor can edit if they are tracking the workplace
  // If only assigned (not tracking), they can view but not edit
  const canEdit = user?.role === 'admin' || user?.role === 'osgb_admin' || user?.role === 'hr' || user?.role === 'accounting'
    ? true : expertId || doctorId
    ? (expertId && (workplaceData.trackingExpertId === expertId || (!workplaceData.trackingExpertId && workplaceData.assignedExpertId === expertId))) ||
    (doctorId && (workplaceData.trackingDoctorId === doctorId || (!workplaceData.trackingDoctorId && workplaceData.assignedDoctorId === doctorId)))
    : true; // If no expertId/doctorId provided, allow editing (for other pages that use this modal)"""

# New code
new_code = """  // Permission check: Admin, OSGB Admin, HR, and Accounting can ALWAYS edit
  // Expert/Doctor can edit only if they are tracking the workplace
  const isAdminOrAuthorized = user?.role === 'admin' || user?.role === 'osgb_admin' || user?.role === 'hr' || user?.role === 'accounting';
  
  const canEdit = isAdminOrAuthorized 
    ? true // Authorized roles can always edit
    : expertId || doctorId
      ? (expertId && (workplaceData.trackingExpertId === expertId || (!workplaceData.trackingExpertId && workplaceData.assignedExpertId === expertId))) ||
      (doctorId && (workplaceData.trackingDoctorId === doctorId || (!workplaceData.trackingDoctorId && workplaceData.assignedDoctorId === doctorId)))
      : true; // If no expertId/doctorId provided, allow editing (for other pages that use this modal)"""

# Replace
content = content.replace(old_code, new_code)

# Write file
with open('isg-frontend/src/components/WorkplaceDetailModal.tsx', 'w', encoding='utf-8') as f:
    f.write(content)

print('✅ WorkplaceDetailModal.tsx updated successfully!')
print('Muhasebe kullanıcıları artık VisitsPage üzerinden işyeri düzenleyebilir.')
