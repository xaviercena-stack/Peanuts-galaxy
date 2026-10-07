// simulate-rtp-auto.js
// Auto-tuning Monte-Carlo simulator to reach target RTP by scaling paytable.
// Usage: node simulate-rtp-auto.js [spins]
// Example: node simulate-rtp-auto.js 200000

const SIM_SPINS = Number(process.argv[2] || 2000000);
const TARGET_RTP = 96.6;        // cible en pourcentage
const TOLERANCE_PCT = 0.15;     // tolérance RTP ± (pourcentage absolu)
const MAX_ITER = 50;            // nombre max d'itérations de la recherche binaire

// Game parameters (same model as before)
const COLS = 5;
const ROWS = 5;
let SYMBOL_WEIGHTS = { A:36, B:34, C:30, D:10, E:6, W:3, P:1 };
const PAY_BASE = { A:4, B:3.2, C:2.6, D:2.0, E:1.6 };

// multiplier tiers
const MULT_TIERS = [
  { min:2,  max:3,  weight:50 },
  { min:4,  max:6,  weight:28 },
  { min:7,  max:12, weight:12 },
  { min:13, max:25, weight:6  },
  { min:26, max:50, weight:3  },
  { min:51, max:80, weight:1  }
];

// bonus params
const BONUS_SCATTER_REQ = 3;
const BONUS_BASE_SPINS = 10;
const BONUS_W_BOOST = 3;

// caps to avoid explosion
const MAX_MULTIPLIER_PER_COLUMN = 100;
const MAX_TOTAL_MULTIPLIER = 12;

// helpers
function makeWeightedList(weights){
  return Object.entries(weights).flatMap(([s,w]) => Array.from({length:Math.max(0,Math.round(w))}, () => s));
}
function sampleSymbol(weighted){ return weighted[Math.floor(Math.random()*weighted.length)]; }
function sampleMultiplier(){
  const total = MULT_TIERS.reduce((s,t) => s + t.weight, 0);
  let pick = Math.random() * total;
  let chosen = MULT_TIERS[MULT_TIERS.length-1];
  for(const t of MULT_TIERS){
    if(pick < t.weight){ chosen = t; break; }
    pick -= t.weight;
  }
  const a = Math.random(), b = Math.random();
  const frac = Math.pow(a*b, 0.7);
  const value = Math.floor(chosen.min + frac * (chosen.max - chosen.min + 1));
  return Math.max(2, Math.min(MAX_MULTIPLIER_PER_COLUMN, value));
}
function evaluateGrid(grid, pay, bet=1){
  let winAmount = 0;
  let scatters = 0;
  for(let c=0;c<COLS;c++){
    for(let r=0;r<ROWS;r++){
      if(grid[c][r] === 'P'){ scatters++; break; }
    }
  }
  for(let r=0;r<ROWS;r++){
    let runSym = grid[0][r];
    let runCount = 1;
    for(let c=1;c<COLS;c++){
      const s = grid[c][r];
      if(s === runSym || s === 'W' || runSym === 'W'){
        runCount++;
        if(runSym === 'W' && s !== 'W') runSym = s;
      } else {
        if(runSym !== 'W' && pay[runSym] && runCount >= 3){
          winAmount += pay[runSym] * runCount * bet;
        }
        runSym = s; runCount = 1;
      }
    }
    if(runSym !== 'W' && pay[runSym] && runCount >= 3){
      winAmount += pay[runSym] * runCount * bet;
    }
  }
  const wildCols = [];
  for(let c=0;c<COLS;c++){
    let allW = true;
    for(let r=0;r<ROWS;r++){
      if(grid[c][r] !== 'W'){ allW = false; break; }
    }
    if(allW) wildCols.push(c);
  }
  return { winAmount: Math.round(winAmount), scatters, wildCols };
}
function spinGrid(weighted){
  const grid = Array.from({length:COLS}, ()=>Array.from({length:ROWS}, ()=>null));
  for(let c=0;c<COLS;c++) for(let r=0;r<ROWS;r++) grid[c][r] = sampleSymbol(weighted);
  return grid;
}

// run single simulation using a given payScale applied to PAY_BASE
function simulateWithPayScale(spins, payScale){
  const pay = {};
  for(const k of Object.keys(PAY_BASE)) pay[k] = PAY_BASE[k] * payScale;
  const baseWeighted = makeWeightedList(SYMBOL_WEIGHTS);
  const boostedWeights = {...SYMBOL_WEIGHTS, W: Math.max(1, Math.round(SYMBOL_WEIGHTS.W * BONUS_W_BOOST))};
  const boostedList = makeWeightedList(boostedWeights);

  let totalBet = 0;
  let totalPayout = 0;
  let simulated = 0;
  while(simulated < spins){
    totalBet++; simulated++;
    const grid = spinGrid(baseWeighted);
    for(let c=0;c<COLS;c++){ let hasW=false; for(let r=0;r<ROWS;r++) if(grid[c][r]==='W'){ hasW=true; break; } if(hasW) for(let r=0;r<ROWS;r++) grid[c][r]='W'; }
    const res = evaluateGrid(grid, pay, 1);
    // compute capped multiplier product
    let product = 1;
    if(res.wildCols.length){
      for(const col of res.wildCols){
        product *= sampleMultiplier();
        if(product >= MAX_TOTAL_MULTIPLIER){ product = MAX_TOTAL_MULTIPLIER; break; }
      }
    }
    totalPayout += Math.round(res.winAmount * product);
    // bonus:
    if(res.scatters >= BONUS_SCATTER_REQ){
      let bonusQueue = BONUS_BASE_SPINS;
      while(bonusQueue > 0){
        totalBet++; simulated++;
        const bgrid = spinGrid(boostedList);
        for(let c=0;c<COLS;c++){ let hasW=false; for(let r=0;r<ROWS;r++) if(bgrid[c][r]==='W'){ hasW=true; break; } if(hasW) for(let r=0;r<ROWS;r++) bgrid[c][r]='W'; }
        const bres = evaluateGrid(bgrid, pay, 1);
        let bproduct = 1;
        if(bres.wildCols.length){
          for(const col of bres.wildCols){
            bproduct *= sampleMultiplier();
            if(bproduct >= MAX_TOTAL_MULTIPLIER){ bproduct = MAX_TOTAL_MULTIPLIER; break; }
          }
        }
        totalPayout += Math.round(bres.winAmount * bproduct);
        if(bres.scatters >= 3) bonusQueue += BONUS_BASE_SPINS;
        bonusQueue--;
        if(simulated >= spins) break;
      }
    }
  }
  return { totalBet, totalPayout, rtp: (totalPayout/totalBet)*100 };
}

// binary search on payScale to reach TARGET_RTP
function findPayScale(spins, targetRtp){
  let low = 0.2, high = 2.0; // initial bounds (scale PAY_BASE)
  let best = { payScale:1, rtp:null };
  for(let iter=0; iter<MAX_ITER; iter++){
    const mid = (low + high)/2;
    const out = simulateWithPayScale(spins, mid);
    const rtp = out.rtp;
    best = { payScale: mid, rtp };
    console.log(`iter ${iter+1}: payScale=${mid.toFixed(5)} -> RTP=${rtp.toFixed(4)}%`);
    if(Math.abs(rtp - targetRtp) <= TOLERANCE_PCT) return best;
    if(rtp > targetRtp) {
      // payScale too generous => lower scale
      high = mid;
    } else {
      low = mid;
    }
  }
  return best;
}

// run
console.log(`Auto-tuning payScale to reach target RTP=${TARGET_RTP}% (tol=${TOLERANCE_PCT}%) using ${SIM_SPINS} spins per iteration`);
const result = findPayScale(SIM_SPINS, TARGET_RTP);
console.log('--- Finished ---');
console.log(`Best found payScale=${result.payScale.toFixed(6)} -> RTP=${result.rtp.toFixed(4)}%`);
console.log('Apply this payScale to your PAY table by multiplying base pay values by this factor.');
console.log('Example: A:', (PAY_BASE.A * result.payScale).toFixed(4), 'B:', (PAY_BASE.B * result.payScale).toFixed(4));
