const fs = require('fs');
const path = require('path');
const dir = 'src/lib/engine/rule-packs';
const files = fs.readdirSync(dir).filter(f => f.endsWith('.rules.ts'));
const anomalies = [];

for (const file of files) {
  const content = fs.readFileSync(path.join(dir, file), 'utf-8');
  // Hacky regex to extract rule objects
  const rules = content.split('id: "').slice(1);
  for (const r of rules) {
    const idMatch = r.match(/^([A-Z]+-\d+)"/);
    if (!idMatch) continue;
    const id = idMatch[1];
    
    const severityMatch = r.match(/severity:\s*"(CRITICAL|HIGH|MEDIUM|LOW|INFO)"/);
    const severity = severityMatch ? severityMatch[1] : 'UNKNOWN';
    
    const penaltyMatch = r.match(/penaltyPoints:\s*(\d+)/);
    const penalty = penaltyMatch ? parseInt(penaltyMatch[1], 10) : -1;
    
    const blockingMatch = r.match(/marketplaceBlocking:\s*(true|false)/);
    const blocking = blockingMatch ? blockingMatch[1] === 'true' : false;
    
    const catMatch = r.match(/category:\s*"([A-Z_]+)"/);
    const category = catMatch ? catMatch[1] : 'UNKNOWN';
    
    let isAnomaly = false;
    let reason = [];
    
    if (severity === 'CRITICAL' && (penalty < 20 || penalty > 35)) { isAnomaly = true; reason.push('CRITICAL penalty out of 20-35 bounds'); }
    if (severity === 'HIGH' && (penalty < 10 || penalty > 20)) { isAnomaly = true; reason.push('HIGH penalty out of 10-20 bounds'); }
    if (severity === 'MEDIUM' && (penalty < 5 || penalty > 10)) { isAnomaly = true; reason.push('MEDIUM penalty out of 5-10 bounds'); }
    if (severity === 'LOW' && (penalty < 1 || penalty > 5)) { isAnomaly = true; reason.push('LOW penalty out of 1-5 bounds'); }
    if (severity === 'INFO' && penalty !== 0) { isAnomaly = true; reason.push('INFO penalty must be 0'); }
    
    if (category === 'DOCUMENTATION' && blocking) {
      isAnomaly = true; reason.push('DOCUMENTATION rule should never block marketplace');
    }
    
    if ((severity === 'LOW' || severity === 'INFO' || severity === 'MEDIUM') && blocking && category !== 'DOCUMENTATION') {
      isAnomaly = true; reason.push(severity + ' rule blocks marketplace');
    }

    if (isAnomaly) {
      anomalies.push({ id, file, severity, penalty, blocking, category, reason: reason.join(', ') });
    }
  }
}
console.log(JSON.stringify(anomalies, null, 2));
