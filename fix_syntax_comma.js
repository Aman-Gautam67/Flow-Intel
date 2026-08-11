const fs = require('fs');
const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/audit-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

content = content.replace('cmp010: ["CMP-010", "DOC-001"],\n,\n};', 'cmp010: ["CMP-010", "DOC-001"],\n};');

fs.writeFileSync(path, content, 'utf8');
console.log("Fixed trailing comma syntax error!");
