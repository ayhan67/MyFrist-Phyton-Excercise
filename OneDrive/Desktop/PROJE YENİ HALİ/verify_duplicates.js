const { Expert, Doctor, sequelize } = require('./isg-backend/models');
const ExpertService = require('./isg-backend/services/ExpertService');
const DoctorService = require('./isg-backend/services/DoctorService');
const expertService = require('./isg-backend/services/ExpertService');
const doctorService = require('./isg-backend/services/DoctorService');

async function runTest() {
    try {
        console.log('--- Expert Duplication Test ---');
        const orgId = 1; // Assuming organization 1 exists
        const tcNo = '12345678901';
        
        // Clean up previous test data if any
        await Expert.destroy({ where: { tcNo, organizationId: orgId } });
        
        console.log('1. Creating first expert...');
        await expertService.create({
            firstName: 'Test',
            lastName: 'User 1',
            tcNo: tcNo,
            expertiseClass: 'A'
        }, orgId);
        console.log('First expert created successfully.');
        
        console.log('2. Attempting to create duplicate expert...');
        try {
            await expertService.create({
                firstName: 'Test',
                lastName: 'User 2',
                tcNo: tcNo,
                expertiseClass: 'B'
            }, orgId);
            console.error('FAIL: Duplicate expert was allowed!');
        } catch (error) {
            console.log('SUCCESS: Duplicate expert prevented:', error.message);
        }

        console.log('\n--- Doctor Duplication Test ---');
        // Clean up previous test data if any
        await Doctor.destroy({ where: { tcNo, organizationId: orgId } });

        console.log('1. Creating first doctor...');
        await doctorService.create({
            firstName: 'Test',
            lastName: 'Doc 1',
            tcNo: tcNo
        }, orgId);
        console.log('First doctor created successfully.');

        console.log('2. Attempting to create duplicate doctor...');
        try {
            await doctorService.create({
                firstName: 'Test',
                lastName: 'Doc 2',
                tcNo: tcNo
            }, orgId);
            console.error('FAIL: Duplicate doctor was allowed!');
        } catch (error) {
            console.log('SUCCESS: Duplicate doctor prevented:', error.message);
        }

    } catch (err) {
        console.error('Test script error:', err);
    } finally {
        await sequelize.close();
    }
}

runTest();
