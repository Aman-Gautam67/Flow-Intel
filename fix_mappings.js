const fs = require('fs');

const path = 'D:/PROJECTS/Site/work-flow-intel/src/lib/qa/audit-fixtures.ts';
let content = fs.readFileSync(path, 'utf8');

// Replace the mappings for obs001 to cmp010 to include "SEC-003"
content = content.replace(/(\["(OBS|IDP|DOC|COST|CMP)-\d{3}"\])/g, '$1.concat(["SEC-003"])');

// Oh wait, `["OBS-001"]` is an array literal. Replacing with `["OBS-001"].concat(["SEC-003"])` is valid TS but ugly.
// Better: 
content = content.replace(/\["(OBS|IDP|DOC|COST|CMP)-\d{3}"\]/g, (match) => {
    return match.replace(']', ', "SEC-003"]');
});

fs.writeFileSync(path, content, 'utf8');
console.log("Updated mappings to avoid false negatives!");
