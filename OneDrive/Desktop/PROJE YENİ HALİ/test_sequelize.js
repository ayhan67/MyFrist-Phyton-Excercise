
const { Op } = require('sequelize');
const conditions = [
    { name: { [Op.like]: '%özb%' } },
    { sskRegistrationNo: { [Op.like]: '%özb%' } },
    { address: { [Op.like]: '%özb%' } },
    { name: { [Op.like]: '%ÖZB%' } },
    { sskRegistrationNo: { [Op.like]: '%ÖZB%' } },
    { address: { [Op.like]: '%ÖZB%' } }
];

const where = { [Op.or]: conditions };

console.log('JSON stringify where:');
console.log(JSON.stringify(where, null, 2));
