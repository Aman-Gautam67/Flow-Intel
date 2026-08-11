const fs = require('fs');
const path = require('path');
const dir = 'src/lib/engine/rule-packs';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.rules.ts'));

for (const file of files) {
  let content = fs.readFileSync(path.join(dir, file), 'utf-8');
  let changed = false;

  // Regex to match the start of a rule definition block
  const rulePattern = /(id:\s*"(?:[A-Z]+-\d+)".*?penaltyPoints:\s*\d+,)/gs;

  content = content.replace(rulePattern, (match) => {
    const idMatch = match.match(/id:\s*"([A-Z]+-\d+)"/);
    if (!idMatch) return match;
    const id = idMatch[1];

    let newMatch = match;

    // Apply documentation demotions
    if (["DOC-004", "DOC-005", "DOC-013"].includes(id)) {
      newMatch = newMatch.replace(/severity:\s*"HIGH"/, 'severity: "MEDIUM"');
      newMatch = newMatch.replace(/marketplaceBlocking:\s*true/, 'marketplaceBlocking: false');
    }
    if (id.startsWith("DOC-")) {
      newMatch = newMatch.replace(/marketplaceBlocking:\s*true/, 'marketplaceBlocking: false');
    }

    // Determine current severity for bounds checking
    const severityMatch = newMatch.match(/severity:\s*"(CRITICAL|HIGH|MEDIUM|LOW|INFO)"/);
    const severity = severityMatch ? severityMatch[1] : 'UNKNOWN';

    // Cap penalty points based on severity
    newMatch = newMatch.replace(/penaltyPoints:\s*(\d+)/, (pMatch, pValStr) => {
      let pVal = parseInt(pValStr, 10);
      if (severity === 'CRITICAL') pVal = Math.min(Math.max(pVal, 20), 35);
      else if (severity === 'HIGH') pVal = Math.min(Math.max(pVal, 10), 20);
      else if (severity === 'MEDIUM') pVal = Math.min(Math.max(pVal, 5), 10);
      else if (severity === 'LOW') pVal = Math.min(Math.max(pVal, 1), 5);
      else if (severity === 'INFO') pVal = 0;
      return `penaltyPoints: ${pVal}`;
    });

    if (match !== newMatch) {
      changed = true;
      console.log(`Updated ${id} in ${file}`);
    }
    return newMatch;
  });

  if (changed) {
    fs.writeFileSync(path.join(dir, file), content, 'utf-8');
  }
}
console.log("Done patching rules!");
