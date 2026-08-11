const fs = require('fs');
const path = require('path');

function search(dir, regex1, regex2) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      search(fullPath, regex1, regex2);
    } else if (fullPath.endsWith('.ts') || fullPath.endsWith('.tsx')) {
      const content = fs.readFileSync(fullPath, 'utf8');
      if (regex1.test(content) || regex2.test(content)) {
        console.log("MATCH IN:", fullPath);
      }
    }
  }
}

search(path.join(__dirname, 'src'), /aiGuardrailsScore\s*\?\?\s*100/, /isAiGuardStale/);
