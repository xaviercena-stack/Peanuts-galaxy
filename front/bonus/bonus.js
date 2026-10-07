const bonusPrizes = [
  { type: 'spins', value: 10 },
  { type: 'multiplier', value: 2 },
  { type: 'multiplier', value: 3 },
  { type: 'spins', value: 5 },
  { type: 'jackpotAccess', value: true }
];

document.querySelectorAll('.chest').forEach(chest => {
  chest.addEventListener('click', () => {
    const index = parseInt(chest.dataset.index);
    const prize = bonusPrizes[index];
    const resultDiv = document.getElementById('bonus-result');

    switch (prize.type) {
      case 'spins':
        resultDiv.innerHTML = `🎉 Tu gagnes ${prize.value} spins gratuits !`;
        break;
      case 'multiplier':
        resultDiv.innerHTML = `🚀 Multiplicateur x${prize.value} activé !`;
        break;
      case 'jackpotAccess':
        resultDiv.innerHTML = `💎 Accès au niveau secret du Jackpot !`;
        break;
    }

    chest.style.borderColor = '#00ffcc';
  setTimeout(() => {
      document.getElementById('spin-button').disabled = false;
      document.getElementById('bonus-screen').style.display = 'none';
    }, 2000); // délai pour laisser le joueur voir le résultat
  });
});