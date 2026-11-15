import fs from 'fs';

// --- A. Patch save.js prices ---
let sv = fs.readFileSync('functions/api/save.js', 'utf8');
sv = sv.replace('const PRICES = [0, 300, 800, 1500, 0];', 'const PRICES = [0, 300, 800, 1500, 0, 500, 1200, 2200, 3500, 5000];');
fs.writeFileSync('functions/api/save.js', sv);

// --- B. Patch _admin.js owner check ---
let ad = fs.readFileSync('functions/api/admin/_admin.js', 'utf8');
ad = ad.replace('&& user.email_confirmed_at !== null', '');
fs.writeFileSync('functions/api/admin/_admin.js', ad);

// --- C. Patch public/admin/index.html ---
let h = fs.readFileSync('public/admin/index.html', 'utf8');
h = h.replace(
  "var U='https://gilqteqdtwehwrqyapae.supabase.co',K='sb_publishable_eMOnlOA3gXljbwcSpKW-vg_ldYa-hfD'",
  "var CFG=window.NAIJA_CONFIG||{},U=CFG.SUPABASE_URL||'https://gilqteqdtwehwrqyapae.supabase.co',K=CFG.SUPABASE_ANON_KEY||'sb_publishable_eMOnlOA3gXljbwcSpKW-vg_ldYa-hfD'"
);
fs.writeFileSync('public/admin/index.html', h);

// --- D. Patch public/index.html licence bug ---
let g = fs.readFileSync('public/index.html', 'utf8');
g = g.replace(
  "JB.lic!=null?'Licence stage '+(JB.lic+1)+': '+AB25[JB.lic].n+'. '+AB25[JB.lic].d:",
  "JB.lic!=null?'Licence stage '+(JB.lic+1)+': '+LIC()[JB.lic].n+'. '+LIC()[JB.lic].d:"
);
fs.writeFileSync('public/index.html', g);

console.log('All backend and frontend patches applied successfully via patch-app.mjs');
