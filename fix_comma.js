const fs = require('fs');
const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/audit-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('cmp003:  ["CMP-003", "CMP-005"]\n  obs001:', 'cmp003:  ["CMP-003", "CMP-005"],\n  obs001:');

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed comma!");
