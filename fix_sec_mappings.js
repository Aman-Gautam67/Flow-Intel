const fs = require('fs');

const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/audit-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

// For sec004, add CMP-006
content = content.replace(
  'sec004:  ["SEC-004"],',
  'sec004:  ["SEC-004", "CMP-006"],'
);

// For sec008, add CMP-006
content = content.replace(
  'sec008:  ["SEC-008"],',
  'sec008:  ["SEC-008", "CMP-006"],'
);

fs.writeFileSync(path, content, 'utf8');
console.log("Updated mappings for sec004 and sec008!");
