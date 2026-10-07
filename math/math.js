// front/math/math.js
// Evaluator for Peanuts Galaxy
// - Includes PAY_SCALE (apply to paytable values to tune RTP)
// - Conservative base paytable (used as baseWin before multipliers applied in game.js)
// - Counts scatters (max 1 per column), detects full-W columns, returns structured result
// - Does NOT finalize wild multipliers (game.js samples and enforces min x2)

export const PAY_SCALE = 1.0; // change this to tune overall pay levels (e.g., 0.966 to lower RTP)

export function evaluateSpin(grid, bet = 1){
  const COLS = grid.length;
  const ROWS = grid[0]?.length || 0;

  let winAmount = 0;
  let scatters = 0;
  const winLines = []; // raw wins (game.js may override display rules)
  const wildCols = [];
  const wildColMultipliers = {}; // placeholder; game.js will sample real multipliers >= 2

  // Count scatters (max one per column)
  for(let c = 0; c < COLS; c++){
    for(let r = 0; r < ROWS; r++){
      if(grid[c][r] === 'P'){ scatters++; break; }
    }
  }

  // Base paytable (scaled by PAY_SCALE)
  const PAY_BASE = { A:4, B:3.2, C:2.6, D:2.0, E:1.6 };
  const PAY = {};
  for(const k of Object.keys(PAY_BASE)) PAY[k] = PAY_BASE[k] * PAY_SCALE;

  // Horizontal evaluation (W acts as wildcard for non-scatter symbols)
  for(let r = 0; r < ROWS; r++){
    let runSym = grid[0][r];
    let runCount = 1;
    for(let c = 1; c < COLS; c++){
      const s = grid[c][r];
      if(s === runSym || s === 'W' || runSym === 'W'){
        runCount++;
        if(runSym === 'W' && s !== 'W') runSym = s;
      } else {
        if(runSym !== 'W' && PAY[runSym] && runCount >= 3){
          const lineWin = PAY[runSym] * runCount * bet;
          winAmount += lineWin;
          winLines.push({ lineIndex: r, symbol: runSym, count: runCount, win: Math.round(lineWin) });
        }
        runSym = s;
        runCount = 1;
      }
    }
    if(runSym !== 'W' && PAY[runSym] && runCount >= 3){
      const lineWin = PAY[runSym] * runCount * bet;
      winAmount += lineWin;
      winLines.push({ lineIndex: r, symbol: runSym, count: runCount, win: Math.round(lineWin) });
    }
  }

  // Detect full-W columns
  for(let c = 0; c < COLS; c++){
    let allW = true;
    for(let r = 0; r < ROWS; r++){
      if(grid[c][r] !== 'W'){ allW = false; break; }
    }
    if(allW){
      wildCols.push(c);
      wildColMultipliers[c] = 1; // placeholder — game.js will replace with sampled >=2
    }
  }

  const bonusType = scatters >= 3 ? 'bonus' : null;

  return {
    winAmount: Math.round(winAmount),
    scatters,
    winLines,
    wildCols,
    wildColMultipliers,
    bonusType
  };
}

export default evaluateSpin;
