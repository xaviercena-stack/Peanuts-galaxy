// front/game.js
import { evaluateSpin, PAY_SCALE as MATH_PAY_SCALE } from '/math/math.js';

/*
 Peanuts Galaxy - game.js (complete, cleaned, fixes)
 - IMAGE_PATH ./images/
 - Ensures slowdownSpinsRemain declared
 - Ensures wild multipliers >= 2 and displayed correctly
 - Improved visible-cell mapping (nearest cell to target row) for accurate win-line placement
 - Winning runs enforced to start at reel 0 and require >=3 contiguous matches
 - Win cells get a glow and win-lines draw precisely between the visible cells
 - Exports WIN_LINES_DEFINITIONS (15 canonical lines)
 - Fix: safe wiring for auto-spin button (checks existence before adding handler)
*/

const IMAGE_PATH = './images/';
const SYMBOL_IMAGES = {
  A: 'red_nebula.png',
  B: 'blue_star.png',
  C: 'green_planet.png',
  D: 'purple_comet.png',
  E: 'golden_asteroid.png',
  W: 'wild_vortex.png',
  P: 'peanut_scatter.png'
};

/* Tunables */
const COLS = 5;
const ROWS = 5;
const REPEAT_TRACK = 6;
const CELL_GAP = 6;
const FINAL_VISIBLE_INDEX = 0;

/* Pay scale (parity with math.js) */
export const PAY_SCALE = 1.0 * (typeof MATH_PAY_SCALE === 'number' ? MATH_PAY_SCALE : 1.0);
const PAYTABLE_BASE = { A:4, B:3.2, C:2.6, D:2.0, E:1.6 };
const PAYTABLE = {};
for(const k of Object.keys(PAYTABLE_BASE)) PAYTABLE[k] = PAYTABLE_BASE[k] * PAY_SCALE;

/* 15 canonical winlines (reference) */
export const WIN_LINES_DEFINITIONS = [
  [0,0,0,0,0],
  [2,2,2,2,2],
  [4,4,4,4,4],
  [4,3,2,1,0],
  [0,1,2,3,4],
  [0,1,1,1,0],
  [2,1,1,1,2],
  [0,1,2,1,0],
  [2,3,2,1,2],
  [1,1,2,1,1],
  [0,0,1,0,0],
  [4,4,3,4,4],
  [4,3,2,3,4],
  [0,1,2,3,2],
  [1,1,3,1,1]
];

/* RNG weights */
const SYMBOL_WEIGHTS_BASE = { A:36, B:34, C:30, D:10, E:6, W:3, P:1 };
function makeWeightedList(weights){
  return Object.entries(weights).flatMap(([s,w]) => Array.from({length:Math.max(0,Math.round(w))}, () => s));
}
let weightedList = makeWeightedList(SYMBOL_WEIGHTS_BASE);
function randomSymbol(){ return weightedList[Math.floor(Math.random()*weightedList.length)]; }

/* DOM refs */
const startBtn = document.getElementById('start-button');
const spinBtn = document.getElementById('spin-button');
const autoBtn = document.getElementById('auto-spin');
const betInput = document.getElementById('bet');
const balanceEl = document.getElementById('balance');
const resultDiv = document.getElementById('result');
const slotMachineEl = document.getElementById('slot-machine');

let balance = Number(balanceEl?.textContent || 1000);

/* slowdown state (declared) */
let slowdownMultiplier = 1.0;
let slowdownSpinsRemain = 0;
const SLOWDOWN_FACTOR = 1.6;
const SLOWDOWN_SPIN_COUNT = 3;

/* SVG overlay */
let svgOverlay = null;
function ensureSvgOverlay(){
  if(svgOverlay && slotMachineEl.contains(svgOverlay)) return svgOverlay;
  svgOverlay = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svgOverlay.setAttribute('class', 'winline-overlay');
  svgOverlay.style.position = 'absolute';
  svgOverlay.style.left = '0';
  svgOverlay.style.top = '0';
  svgOverlay.style.width = '100%';
  svgOverlay.style.height = '100%';
  svgOverlay.style.pointerEvents = 'none';
  svgOverlay.style.overflow = 'visible';
  svgOverlay.style.zIndex = '60';
  if(getComputedStyle(slotMachineEl).position === 'static') slotMachineEl.style.position = 'relative';
  slotMachineEl.appendChild(svgOverlay);
  return svgOverlay;
}
function clearWinLines(){
  if(!svgOverlay) return;
  while(svgOverlay.firstChild) svgOverlay.removeChild(svgOverlay.firstChild);
}

/* Visual helpers */
function showMultiplierBadge(reelIndex, mult){
  const reel = document.getElementById(`reel${reelIndex+1}`);
  if(!reel) return;
  const existing = reel.querySelector('.mult-badge');
  if(existing) existing.remove();
  const badge = document.createElement('div');
  badge.className = 'mult-badge';
  const value = Math.max(2, Math.round(Number(mult) || 2));
  badge.textContent = `x${value}`;
  badge.style.position = 'absolute';
  badge.style.right = '8px';
  badge.style.top = '8px';
  badge.style.background = 'rgba(20,18,30,0.9)';
  badge.style.color = '#FFD86A';
  badge.style.padding = '6px 8px';
  badge.style.borderRadius = '8px';
  badge.style.fontWeight = '700';
  badge.style.fontSize = '14px';
  badge.style.pointerEvents = 'none';
  badge.style.zIndex = '80';
  reel.appendChild(badge);
  requestAnimationFrame(()=> badge.classList.add('show'));
  setTimeout(()=> { if(badge.parentNode) badge.parentNode.removeChild(badge); }, 3000);
}

function createColumnBurst(reelEl, color='rgba(255,185,66,0.12)'){
  if(!reelEl) return;
  const s = document.createElement('div');
  s.className = 'mult-burst';
  s.style.position = 'absolute';
  s.style.width = '220px';
  s.style.height = '220px';
  s.style.left = '-60px';
  s.style.top = '-60px';
  s.style.borderRadius = '50%';
  s.style.pointerEvents = 'none';
  s.style.background = `radial-gradient(circle at 40% 30%, rgba(255,230,160,0.95), ${color} 20%, transparent 50%)`;
  s.style.opacity = '0';
  s.style.transition = 'opacity 220ms ease';
  reelEl.appendChild(s);
  requestAnimationFrame(()=> s.style.opacity = '1');
  setTimeout(()=> { s.style.opacity = '0'; setTimeout(()=> s.remove(), 500); }, 700);
}

function clearWinGlows(){
  const cells = slotMachineEl.querySelectorAll('.reel-cell.win-glow');
  cells.forEach(c => c.classList.remove('win-glow'));
}

/* Improved mapping: choose visible cell closest to target row Y */
function applyWinGlowsForRun(run){
  for(let c = run.start; c <= run.end; c++){
    const reel = document.getElementById(`reel${c+1}`);
    if(!reel) continue;
    const reelRect = reel.getBoundingClientRect();
    const track = reel.querySelector('.reel-track');
    if(!track) continue;
    const cells = Array.from(track.querySelectorAll('.reel-cell'));
    const visible = [];
    for(const cell of cells){
      const crect = cell.getBoundingClientRect();
      const cx = crect.left + crect.width/2;
      const cy = crect.top + crect.height/2;
      if(cy >= reelRect.top - 1 && cy <= reelRect.bottom + 1){
        visible.push({ el: cell, x: cx, y: cy, height: crect.height });
      }
    }
    const rowH = reelRect.height / ROWS;
    const targetY = reelRect.top + rowH * (run.row + 0.5);
    if(visible.length > 0){
      visible.sort((a,b)=> Math.abs(a.y - targetY) - Math.abs(b.y - targetY));
      visible[0].el.classList.add('win-glow');
    } else {
      const fallback = cells[Math.floor(cells.length/2)];
      if(fallback) fallback.classList.add('win-glow');
    }
  }
}

/* Multiplier sampling (x2..x100, tiered rarity) */
function sampleMultiplier(){
  const tiers = [
    { min: 2,  max: 3,  weight: 48 },
    { min: 4,  max: 6,  weight: 26 },
    { min: 7,  max: 12, weight: 12 },
    { min: 13, max: 25, weight: 8 },
    { min: 26, max: 50, weight: 4 },
    { min: 51, max: 100,weight: 2 }
  ];
  const total = tiers.reduce((s,t) => s + t.weight, 0);
  let pick = Math.random() * total;
  let chosen = tiers[tiers.length-1];
  for(const t of tiers){
    if(pick < t.weight){ chosen = t; break; }
    pick -= t.weight;
  }
  const u = Math.random();
  const v = Math.random();
  const frac = Math.pow(u * v, 0.65);
  const value = Math.floor(chosen.min + frac * (chosen.max - chosen.min + 1));
  return Math.max(2, Math.min(100, value));
}

/* Utility: visible centers for drawing strokes (nearest-cell approach) */
function getReelVisibleCenters(){
  const centers = Array.from({length:COLS}, ()=>Array.from({length:ROWS}, ()=>({x:0,y:0,el:null})));
  for(let c=0;c<COLS;c++){
    const reel = document.getElementById(`reel${c+1}`);
    if(!reel) continue;
    const reelRect = reel.getBoundingClientRect();
    const track = reel.querySelector('.reel-track');
    if(!track) continue;
    const cells = Array.from(track.querySelectorAll('.reel-cell'));
    if(cells.length === 0) continue;
    const visible = [];
    for(const cell of cells){
      const crect = cell.getBoundingClientRect();
      const cx = crect.left + crect.width/2;
      const cy = crect.top + crect.height/2;
      if(cy >= reelRect.top - 1 && cy <= reelRect.bottom + 1) visible.push({ el: cell, x: cx, y: cy });
    }
    const rowH = reelRect.height / ROWS;
    for(let r=0;r<ROWS;r++){
      const targetY = reelRect.top + rowH * (r + 0.5);
      if(visible.length > 0){
        visible.sort((a,b)=> Math.abs(a.y - targetY) - Math.abs(b.y - targetY));
        centers[c][r] = { x: visible[0].x, y: visible[0].y, el: visible[0].el };
      } else {
        const centerX = reelRect.left + reelRect.width/2;
        centers[c][r] = { x: centerX, y: reelRect.top + rowH*(r+0.5), el: null };
      }
    }
  }
  return centers;
}

/* Winning run detection enforcing start-at-reel-0 and >=3 */
function computeWinLinesFromGrid(grid){
  const winLines = [];
  for(let row = 0; row < ROWS; row++){
    let baseSym = grid[0][row];
    if(baseSym === 'P') continue;
    if(baseSym === 'W'){
      let found = null;
      for(let c=1;c<COLS;c++){
        const s = grid[c][row];
        if(s !== 'W' && s !== 'P'){ found = s; break; }
      }
      baseSym = found || 'W';
    }
    if(baseSym === 'P' || !baseSym) continue;
    let count = 0;
    let endCol = -1;
    for(let c=0;c<COLS;c++){
      const s = grid[c][row];
      if(s === 'P') break;
      const matches = (s === baseSym || s === 'W' || baseSym === 'W');
      if(matches){ count++; endCol = c; } else break;
    }
    if(count >= 3){
      let baseWin = 0;
      if(baseSym !== 'W' && PAYTABLE[baseSym]) baseWin = PAYTABLE[baseSym] * count;
      winLines.push({ lineIndex: row, symbol: baseSym, count, startCol: 0, endCol, win: Math.round(baseWin) });
    }
  }
  return winLines;
}

/* Render & animate reels */
function buildReelTrackSymbols(colSymbols, repeats = REPEAT_TRACK){
  const track = [];
  for(let i=0;i<repeats;i++) track.push(...colSymbols);
  track.push(...colSymbols.slice().reverse());
  return track;
}
function generateGrid(){
  return Array.from({length:COLS}, () => Array.from({length:ROWS}, () => randomSymbol()));
}
function renderGrid(grid){
  for(let c=0;c<COLS;c++){
    const reel = document.getElementById(`reel${c+1}`);
    if(!reel) continue;
    let track = reel.querySelector('.reel-track');
    if(track) track.innerHTML = '';
    else { track = document.createElement('div'); track.className = 'reel-track'; reel.appendChild(track); }
    const colSymbols = grid[c].slice(0, ROWS);
    const trackSymbols = buildReelTrackSymbols(colSymbols, REPEAT_TRACK);
    for(let i=0;i<trackSymbols.length;i++){
      const div = document.createElement('div');
      div.className = 'reel-cell';
      div.style.height = '56px';
      div.style.margin = '3px 0';
      const img = document.createElement('img');
      const sym = trackSymbols[i];
      img.src = IMAGE_PATH + (SYMBOL_IMAGES[sym] || SYMBOL_IMAGES['A']);
      img.alt = sym;
      img.style.maxWidth = '100%';
      img.style.maxHeight = '100%';
      img.style.background = 'transparent';
      div.appendChild(img);
      track.appendChild(div);
    }
    track.style.transition = 'none';
    track.style.transform = `translateY(0px)`;
    void track.offsetHeight;
    track.classList.remove('stop-bounce');
    reel.classList.remove('spin-ended');
  }
}
function animateReel(reelIndex, finalTopIndex = FINAL_VISIBLE_INDEX, spins = 3, baseDuration = 900){
  return new Promise(resolve=>{
    const reel = document.getElementById(`reel${reelIndex+1}`);
    if(!reel) return resolve();
    const track = reel.querySelector('.reel-track');
    const firstCell = track.querySelector('.reel-cell');
    if(!firstCell) return resolve();
    const cellRect = firstCell.getBoundingClientRect();
    const cellH = Math.round(cellRect.height + CELL_GAP);
    const duration = Math.round(baseDuration * slowdownMultiplier);
    const targetOffset = (spins * ROWS + finalTopIndex) * cellH;
    reel.classList.add('spin-starting');
    track.style.transition = `transform ${duration}ms cubic-bezier(.2,.9,.2,1)`;
    requestAnimationFrame(()=> { track.style.transform = `translateY(-${targetOffset}px)`; });
    const onEnd = ()=>{
      track.removeEventListener('transitionend', onEnd);
      const rotateBy = spins * ROWS;
      for(let i=0;i<rotateBy;i++) if(track.firstElementChild) track.appendChild(track.firstElementChild);
      track.style.transition = 'none';
      track.style.transform = `translateY(-${finalTopIndex * cellH}px)`;
      void track.offsetHeight;
      track.classList.add('stop-bounce');
      reel.classList.remove('spin-starting');
      reel.classList.add('spin-ended');
      setTimeout(()=> resolve(), 60);
    };
    track.addEventListener('transitionend', onEnd);
    setTimeout(()=> { try{ track.removeEventListener('transitionend', onEnd); }catch(e){}; resolve(); }, duration + 500);
  });
}

/* singleSpin lifecycle */
async function singleSpin(bet, forcedStickyCols = []){
  const grid = generateGrid();
  for(const c of forcedStickyCols) for(let r=0;r<ROWS;r++) grid[c][r] = 'W';
  const newlyExtended = [];
  for(let c=0;c<COLS;c++){
    let hasW = false;
    for(let r=0;r<ROWS;r++) if(grid[c][r] === 'W'){ hasW = true; break; }
    if(hasW){ newlyExtended.push(c); for(let r=0;r<ROWS;r++) grid[c][r] = 'W'; }
  }
  renderGrid(grid);
  const promises = [];
  for(let c=0;c<COLS;c++){
    await new Promise(r=>setTimeout(r, c * 90));
    promises.push(animateReel(c, FINAL_VISIBLE_INDEX, 3, 900 + c*60));
  }
  await Promise.all(promises);
  const res = evaluateSpin(grid, bet) || {};
  const computed = computeWinLinesFromGrid(grid);
  res.winLines = computed.map(w => ({ lineIndex: w.lineIndex, symbol: w.symbol, count: w.count, startCol: w.startCol || 0, endCol: w.endCol, win: w.win }));
  // Ensure wild multipliers numeric and >=2
  res.wildColMultipliers = res.wildColMultipliers || {};
  for(const col of newlyExtended){
    const existing = Number(res.wildColMultipliers[col] || 0);
    if(!existing || existing < 2) res.wildColMultipliers[col] = sampleMultiplier();
    else res.wildColMultipliers[col] = Math.max(2, Math.round(existing));
  }
  // Ensure wildCols reflect newlyExtended
  res.wildCols = res.wildCols || [];
  for(const col of newlyExtended) if(!res.wildCols.includes(col)) res.wildCols.push(col);
  return { grid, res, newlyExtended };
}

/* Visual reveal and payout */
function applyWildVisualsAndBadges(res, newlyExtended){
  clearWinGlows();
  clearWinLines();
  if(res.wildCols && res.wildCols.length) for(const col of res.wildCols) document.getElementById(`reel${col+1}`)?.classList.add('wild-extended');
  if(res.wildColMultipliers){
    for(const key of Object.keys(res.wildColMultipliers)){
      const idx = Number(key);
      const mult = Number(res.wildColMultipliers[key] || 2);
      if(!Number.isNaN(idx) && mult){
        showMultiplierBadge(idx, mult);
        const reelEl = document.getElementById(`reel${idx+1}`);
        createColumnBurst(reelEl);
      }
    }
  }
  if(newlyExtended && newlyExtended.length){
    for(const col of newlyExtended){
      const reelEl = document.getElementById(`reel${col+1}`);
      if(reelEl){
        reelEl.classList.add('wild-extended');
        createColumnBurst(reelEl);
      }
    }
  }
}

function computePayoutFromRes(res, grid, bet){
  let baseWin = 0;
  if(res.winLines && res.winLines.length){
    for(const wl of res.winLines){
      const symbol = wl.symbol;
      const count = wl.count;
      if(symbol === 'W') continue;
      if(PAYTABLE[symbol] && count >= 3) baseWin += PAYTABLE[symbol] * count * bet;
    }
  }
  let multProduct = 1;
  if(res.wildColMultipliers){
    for(const k of Object.keys(res.wildColMultipliers)) multProduct *= Number(res.wildColMultipliers[k] || 1);
  }
  return Math.round(baseWin * multProduct);
}

function revealWinVisuals(grid, res){
  clearWinGlows();
  clearWinLines();
  if(!res.winLines || !res.winLines.length) return;
  const centers = getReelVisibleCenters();
  for(const wl of res.winLines){
    const run = { row: wl.lineIndex, start: wl.startCol || 0, end: wl.endCol || (wl.count - 1) };
    applyWinGlowsForRun(run);
    const pts = [];
    for(let c = run.start; c <= run.end; c++){
      const center = (centers[c] && centers[c][run.row]) ? centers[c][run.row] : null;
      if(center) pts.push({ x: center.x, y: center.y });
    }
    if(pts.length >= 2) drawStrokePath(pts);
  }
}

/* Main spin and bonus flows */
async function doSpin(){
  const bet = Number(betInput?.value || 0);
  if(!bet || bet <= 0 || bet > balance){ alert('Mise invalide'); return; }
  balance -= bet; balanceEl.textContent = balance;
  resultDiv.textContent = 'Spinning…';
  clearWinGlows();
  clearWinLines();
  for(let i=1;i<=COLS;i++) document.getElementById(`reel${i}`)?.classList.remove('wild-extended');
  const { grid, res, newlyExtended } = await singleSpin(bet);
  applyWildVisualsAndBadges(res, newlyExtended);
  const payout = computePayoutFromRes(res, grid, bet);
  if(res.winLines && res.winLines.length) setTimeout(()=> revealWinVisuals(grid, res), 80);
  resultDiv.textContent = `Gain : ${payout} — Scatters : ${res.scatters || 0}`;
  balance += payout; balanceEl.textContent = balance;
  if(res.scatters === 2){
    slowdownSpinsRemain = SLOWDOWN_SPIN_COUNT;
    slowdownMultiplier = SLOWDOWN_FACTOR;
  }
  if(slowdownSpinsRemain > 0){
    slowdownSpinsRemain--;
    if(slowdownSpinsRemain <= 0){ slowdownMultiplier = 1.0; slowdownSpinsRemain = 0; }
  }
  if(res.bonusType) await startBonusAutoTen(bet);
}

/* Bonus loop */
async function startBonusAutoTen(baseBet){
  let spins = 10;
  const stickyCols = new Set();
  const stickyMultipliers = {};
  let bonusTotal = 0;
  while(spins > 0){
    const forced = Array.from(stickyCols);
    const { grid, res, newlyExtended } = await singleSpin(baseBet, forced);
    if(newlyExtended && newlyExtended.length){
      for(const c of newlyExtended){
        if(!stickyCols.has(c)){
          stickyCols.add(c);
          stickyMultipliers[c] = Number(res.wildColMultipliers && res.wildColMultipliers[c] ? res.wildColMultipliers[c] : sampleMultiplier());
        }
      }
    }
    applyWildVisualsAndBadges(res, newlyExtended);
    let spinBase = 0;
    if(res.winLines && res.winLines.length){
      for(const wl of res.winLines){
        const symbol = wl.symbol;
        const count = wl.count;
        if(symbol === 'W') continue;
        if(PAYTABLE[symbol] && count >= 3) spinBase += PAYTABLE[symbol] * count * baseBet;
      }
    }
    let factor = 1;
    for(const k of Object.keys(stickyMultipliers)) factor *= Number(stickyMultipliers[k] || 1);
    if(res.wildColMultipliers) for(const k of Object.keys(res.wildColMultipliers)) factor *= Number(res.wildColMultipliers[k] || 1);
    const spinWin = Math.round(spinBase * factor);
    bonusTotal += spinWin;
    if(res.winLines && res.winLines.length) setTimeout(()=> revealWinVisuals(grid, res), 80);
    if(res.scatters >= 3) spins += 10;
    spins--;
    resultDiv.textContent = `Bonus spins remaining: ${spins} — Gain actuel bonus: ${Math.round(bonusTotal)}`;
    balanceEl.textContent = Math.round(balance + bonusTotal);
    await new Promise(r=>setTimeout(r, 520));
  }
  balance += Math.round(bonusTotal);
  balanceEl.textContent = balance;
  setTimeout(()=>{ for(let i=1;i<=COLS;i++) document.getElementById(`reel${i}`)?.classList.remove('wild-extended'); }, 700);
}

/* Drawing stroke path */
function drawStrokePath(points, color = 'rgba(255,220,80,0.98)'){
  if(points.length < 2) return;
  ensureSvgOverlay();
  const ns = 'http://www.w3.org/2000/svg';
  const path = document.createElementNS(ns, 'path');
  const slotRect = slotMachineEl.getBoundingClientRect();
  const local = points.map(p => ({ x: p.x - slotRect.left, y: p.y - slotRect.top }));
  let d = `M ${local[0].x.toFixed(1)} ${local[0].y.toFixed(1)}`;
  for(let i=1;i<local.length;i++){
    const prev = local[i-1], cur = local[i];
    const midX = (prev.x + cur.x) / 2;
    const midY = (prev.y + cur.y) / 2;
    d += ` Q ${prev.x.toFixed(1)} ${prev.y.toFixed(1)} ${midX.toFixed(1)} ${midY.toFixed(1)}`;
  }
  const last = local[local.length-1];
  d += ` L ${last.x.toFixed(1)} ${last.y.toFixed(1)}`;
  path.setAttribute('d', d);
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', color);
  path.setAttribute('stroke-width', '6');
  path.setAttribute('stroke-linecap', 'round');
  path.setAttribute('stroke-linejoin', 'round');
  path.style.filter = 'drop-shadow(0 8px 18px rgba(255,200,80,0.18))';
  path.style.opacity = '0';
  path.style.transition = 'opacity 220ms ease, stroke-dashoffset 640ms cubic-bezier(.2,.9,.2,1)';
  const length = 2000;
  path.setAttribute('stroke-dasharray', `${length}`);
  path.setAttribute('stroke-dashoffset', `${length}`);
  svgOverlay.appendChild(path);
  requestAnimationFrame(()=>{ path.style.opacity = '1'; path.setAttribute('stroke-dashoffset', '0'); });
  setTimeout(()=>{ path.style.transition = 'opacity 320ms ease'; path.style.opacity = '0'; setTimeout(()=>{ if(path.parentNode) path.parentNode.removeChild(path); }, 420); }, 2200);
}

/* UI wiring & paytable populate */
startBtn?.addEventListener('click', ()=>{
  document.getElementById('intro-screen')?.classList.add('hidden');
  document.getElementById('slot-machine')?.setAttribute('aria-hidden','false');
});
spinBtn?.addEventListener('click', doSpin);
// fix: add event only if autoBtn exists and is an Element with addEventListener
if(autoBtn && typeof autoBtn.addEventListener === 'function'){
  autoBtn.addEventListener('click', async ()=>{
    for(let i=0;i<10;i++){ await doSpin(); await new Promise(r=>setTimeout(r,250)); }
  });
}

(function populatePaytable(){
  const ul = document.getElementById('paytable-list');
  if(!ul) return;
  ul.innerHTML = '';
  const pay = { A:{3:4,4:12,5:40}, B:{3:3.2,4:9,5:28}, C:{3:2.6,4:7,5:20}, D:{3:2,4:5,5:16}, E:{3:1.6,4:4,5:12} };
  for(const s of Object.keys(pay)){
    const li = document.createElement('li');
    li.textContent = `${s}: 3→${(pay[s][3]*PAY_SCALE).toFixed(2)}×, 4→${(pay[s][4]*PAY_SCALE).toFixed(2)}×, 5→${(pay[s][5]*PAY_SCALE).toFixed(2)}×`;
    ul.appendChild(li);
  }
})();
