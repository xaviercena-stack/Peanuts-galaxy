// tools/generate_books.js
const fs = require('fs');
const path = require('path');

/*
 Configuration utilisateur
 - roundsCount : nombre de rounds à générer
 - maxPayoutMultiplier : valeur max du payoutMultiplier (uint64)
 - csvFilename / jsonlFilename : noms de sortie
*/
const roundsCount = 5000;
const maxPayoutMultiplier = 200; // adapte selon ton jeu / RTP
const csvFilename = path.join(__dirname, '..', 'lookup_base_0.csv');
const jsonlFilename = path.join(__dirname, '..', 'books_base.jsonl');

function randInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }

// Génère un tableau de rounds simples
function generateRounds(count) {
  const rounds = [];
  for (let i = 1; i <= count; i++) {
    const payoutMultiplier = randInt(0, maxPayoutMultiplier); // uint64-compatible
    const events = []; // structure d'events vide; ajoute des events si besoin
    rounds.push({ id: i, events, payoutMultiplier });
  }
  return rounds;
}

// Écrit le JSONL
function writeJsonl(rounds, outPath) {
  const lines = rounds.map(r => JSON.stringify(r)).join('\n');
  fs.writeFileSync(outPath, lines, { encoding: 'utf8' });
  console.log(`Wrote ${rounds.length} rounds to ${outPath}`);
}

// Écrit le CSV (simulationNumber,roundProbability,payoutMultiplier) as uint64 per line
function writeCsv(rounds, outPath) {
  // Ici on crée une table simple: simulationNumber = id, roundProbability = 1, payoutMultiplier matches
  // roundProbability must be integer uint64; when using weights system you must scale probabilities accordingly
  const lines = rounds.map(r => `${r.id},1,${r.payoutMultiplier}`).join('\n');
  fs.writeFileSync(outPath, lines, { encoding: 'utf8' });
  console.log(`Wrote lookup CSV to ${outPath}`);
}

function main() {
  const rounds = generateRounds(roundsCount);
  writeJsonl(rounds, jsonlFilename);
  writeCsv(rounds, csvFilename);
}

main();
