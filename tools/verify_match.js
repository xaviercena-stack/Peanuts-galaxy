// tools/verify_match.js
const fs = require('fs');
const path = require('path');

const csvPath = path.join(__dirname, '..', 'lookup_base_0.csv');
const jsonlPath = path.join(__dirname, '..', 'books_base.jsonl');

function readCsv(pathCsv) {
  const data = fs.readFileSync(pathCsv, 'utf8').trim().split('\n');
  // retourne map id -> payoutMultiplier
  const map = new Map();
  for (const line of data) {
    const parts = line.split(',');
    if (parts.length < 3) { console.error('CSV format invalid', line); process.exit(1); }
    const id = Number(parts[0]);
    const payout = Number(parts[2]);
    map.set(id, payout);
  }
  return map;
}

function readJsonl(pathJsonl) {
  const lines = fs.readFileSync(pathJsonl, 'utf8').trim().split('\n');
  const map = new Map();
  lines.forEach(line => {
    const obj = JSON.parse(line);
    map.set(Number(obj.id), Number(obj.payoutMultiplier));
  });
  return map;
}

function main() {
  const csv = readCsv(csvPath);
  const jsonl = readJsonl(jsonlPath);

  let mismatch = 0;
  for (const [id, payout] of jsonl.entries()) {
    const expected = csv.get(id);
    if (expected === undefined) {
      console.error(`Missing CSV entry for id ${id}`);
      mismatch++;
      continue;
    }
    if (expected !== payout) {
      console.error(`Mismatch id ${id}: CSV=${expected} JSONL=${payout}`);
      mismatch++;
    }
  }

  if (mismatch === 0) console.log('All entries match ✅');
  else console.log(`${mismatch} mismatches found ❌`);
}

main();
