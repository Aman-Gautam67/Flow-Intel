const fs = require('fs');
let data = fs.readFileSync('src/lib/qa/fixtures/negative-fixtures.ts', 'utf8');

data = data.replace("{ id: 'nr-3', name: 'act', type: 'http request'", "{ id: 'nr-2.5', type: 'inject', wires: [['nr-3']] },\n      { id: 'nr-3', name: 'act', type: 'http request'");

data = data.replace("type: 'SCHEDULE'", "type: 'PIECE_TRIGGER'");

fs.writeFileSync('src/lib/qa/fixtures/negative-fixtures.ts', data);
console.log('Fixed');
