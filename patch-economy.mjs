import fs from 'fs';

// --- 1. Update Car Prices in functions/api/save.js for a Weeks-Long Grind ---
let saveApi = fs.readFileSync('functions/api/save.js', 'utf8');
// Old prices: [0, 300, 800, 1500, 0, 500, 1200, 2200, 3500, 5000]
// New realistic progression prices (Takes days/weeks of consistent play):
saveApi = saveApi.replace(
  'const PRICES = [0, 300, 800, 1500, 0, 500, 1200, 2200, 3500, 5000];',
  'const PRICES = [0, 5000, 15000, 35000, 75000, 120000, 200000, 350000, 500000, 1000000];'
);
fs.writeFileSync('functions/api/save.js', saveApi);

// --- 2. Fix Coin / Score Inflation in public/index.html ---
let indexHtml = fs.readFileSync('public/index.html', 'utf8');
// Ensure coin reward on crash strictly reflects collected coins + modest distance bonus (avoiding 100 coins turning into 700+ unearned currency)
indexHtml = indexHtml.replace(
  /coinsEarned\s*=\s*[^;]+;/g,
  'coinsEarned = Math.floor(coinsCollected + (distanceTraveled / 200));'
);
fs.writeFileSync('public/index.html', indexHtml);

console.log('Economy and coin/score calculation patches applied successfully!');
