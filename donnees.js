/* donnees.js — appareils courants et catalogue de matériel par défaut de SolaDima.
   Les caractéristiques techniques du matériel sont des VALEURS TYPIQUES du marché :
   l'installateur doit les vérifier sur la fiche technique de ses propres références.
   Les prix sont toujours à renseigner par l'utilisateur (0 = « prix à renseigner »). */
(function(G){
'use strict';

/* Appareils courants.
   [nom, puissance W, heures de jour, heures de nuit, facteur de démarrage, usage ponctuel, existe en 12 V]
   Facteur de démarrage : 1 normal, 1,3 compresseur « inverter », 3 moteur, 5 compresseur classique.
   « Ponctuel » : appareil utilisé brièvement, jamais en même temps qu'un autre appareil ponctuel.
   Les heures sont des heures ÉQUIVALENTES à pleine puissance (un frigo de 150 W qui tourne par cycles
   pendant 24 h consomme comme 8 h à pleine puissance). */
const PRESETS = [
  ['Ampoule LED 9 W', 9, 0, 5, 1, false, true],
  ['Tube LED 18 W', 18, 0, 5, 1, false, true],
  ['Projecteur LED extérieur 20 W', 20, 0, 11, 1, false, true],
  ['Ventilateur 12 V 20 W', 20, 4, 6, 1, false, true],
  ['Ventilateur sur pied 60 W', 60, 4, 6, 1, false, false],
  ['Ventilateur de plafond 75 W', 75, 4, 6, 1, false, false],
  ['Télévision LED 32 pouces 50 W', 50, 2, 4, 1, false, true],
  ['Télévision LED 43 pouces 80 W', 80, 2, 4, 1, false, false],
  ['Décodeur TV 15 W', 15, 2, 4, 1, false, true],
  ['Radio / chaîne hi-fi 30 W', 30, 2, 2, 1, false, true],
  ['Chargeur de téléphone 10 W', 10, 1, 2, 1, false, true],
  ['Ordinateur portable 65 W', 65, 4, 1, 1, false, false],
  ['Ordinateur de bureau + écran 150 W', 150, 6, 0, 1, false, false],
  ['Box Internet / routeur Wi-Fi 12 W', 12, 12, 12, 1, false, true],
  ['Caméra de surveillance 10 W', 10, 12, 12, 1, false, true],
  ['Réfrigérateur 150 W', 150, 5, 3, 5, false, false],
  ['Réfrigérateur solaire 12/24 V 60 W', 60, 7, 5, 1, false, true],
  ['Congélateur coffre 200 W', 200, 6, 4, 5, false, false],
  ['Climatiseur split 1 CV classique (900 W)', 900, 4, 4, 5, false, false],
  ['Climatiseur split 1,5 CV classique (1 200 W)', 1200, 4, 4, 5, false, false],
  ['Climatiseur split 1 CV inverter (≈ 650 W en moyenne)', 650, 4, 4, 1.3, false, false],
  ['Climatiseur split 1,5 CV inverter (≈ 900 W en moyenne)', 900, 4, 4, 1.3, false, false],
  ['Pompe à eau / surpresseur 750 W', 750, 1, 0, 3, true, false],
  ['Machine à laver 500 W', 500, 1, 0, 3, true, false],
  ['Fer à repasser 1 000 W', 1000, 0.5, 0, 1, true, false],
  ['Mixeur 300 W', 300, 0.3, 0, 3, true, false],
  ['Bouilloire électrique 1 500 W', 1500, 0.3, 0, 1, true, false],
  ['Four micro-ondes (1 500 W absorbés)', 1500, 0.3, 0, 1, true, false],
  ['Tondeuse à cheveux / sèche-cheveux 1 200 W', 1200, 0.3, 0, 1, true, false],
  ['Portail motorisé 300 W', 300, 0.2, 0, 3, true, false]
];

/* Caractéristiques électriques typiques d'un panneau selon sa puissance (conditions STC).
   Sert aussi à compléter les panneaux enregistrés avant la version 2. */
function specPanneau(w){
  if(w <= 220){ // panneau « 12 V », 36 cellules
    const imp = w/18.2; return { voc:22.4, vmp:18.2, isc:+(imp*1.07).toFixed(2), imp:+imp.toFixed(2), bVoc:-0.30, gP:-0.38, cellules:36 };
  }
  if(w <= 380){ // 60 cellules (120 demi-cellules)
    const imp = w/33.6; return { voc:40.8, vmp:33.6, isc:+(imp*1.06).toFixed(2), imp:+imp.toFixed(2), bVoc:-0.28, gP:-0.36, cellules:60 };
  }
  if(w <= 480){ // 72 cellules (144 demi-cellules, format M10)
    const imp = w/41.4; return { voc:49.4, vmp:41.4, isc:+(imp*1.06).toFixed(2), imp:+imp.toFixed(2), bVoc:-0.27, gP:-0.35, cellules:72 };
  }
  const imp = w/42.0; return { voc:49.9, vmp:42.0, isc:+(imp*1.06).toFixed(2), imp:+imp.toFixed(2), bVoc:-0.27, gP:-0.35, cellules:72 };
}
function specBatterie(tech, v, ah){
  return tech==='lithium' ? { iCh: Math.round(ah*0.5), iDech: Math.min(200, ah) }      // BMS : 0,5 C en charge, 1 C en décharge
                          : { iCh: Math.round(ah*0.2), iDech: Math.round(ah*0.5) };    // gel/AGM : 0,2 C en charge
}
function specConvertisseur(w, onde){
  return { onde: onde||'pur', surge: 2, idle: Math.max(6, Math.round(w*0.01)), eta: onde==='modifie' ? 0.88 : 0.90 };
}

function materielParDefaut(){
  const L = [];
  [100, 200, 340, 450, 550].forEach(w => L.push({ type:'panneau', w, ...specPanneau(w) }));
  [[12.8,100],[12.8,200],[25.6,100],[25.6,200],[51.2,100],[51.2,200]].forEach(([v,ah]) => L.push({ type:'batterie', tech:'lithium', v, ah, ...specBatterie('lithium',v,ah) }));
  [[12,100],[12,200]].forEach(([v,ah]) => L.push({ type:'batterie', tech:'gel', v, ah, ...specBatterie('gel',v,ah) }));
  // Régulateurs : PWM (tension de panneaux max ~50 V), MPPT (100 à 250 V)
  [[10,50],[20,50],[30,50],[60,50]].forEach(([a,voc]) => L.push({ type:'regulateur', techno:'pwm', a, vocMax:voc, tensions:[12,24] }));
  [[20,100,[12,24]],[30,100,[12,24]],[40,100,[12,24]],[60,150,[12,24,48]],[80,150,[12,24,48]],[100,250,[12,24,48]]]
    .forEach(([a,voc,t]) => L.push({ type:'regulateur', techno:'mppt', a, vocMax:voc, tensions:t }));
  // Convertisseurs séparés (pur sinus, plus un modèle à onde modifiée bon marché)
  [[600,12],[1000,12],[1500,24],[2000,24],[3000,24],[3000,48],[5000,48]].forEach(([w,v]) => L.push({ type:'convertisseur', w, v, ...specConvertisseur(w,'pur') }));
  L.push({ type:'convertisseur', w:1000, v:12, ...specConvertisseur(1000,'modifie') });
  // Onduleurs hybrides tout-en-un (MPPT + chargeur + onduleur) : valeurs typiques de fiches techniques
  [
    { w:1200, v:12, pvMax:800,  vocMax:100, mpptMin:30,  mpptMax:80,  iCharge:50,  idle:18, surge:2, eta:0.90 },
    { w:3000, v:24, pvMax:2000, vocMax:145, mpptMin:30,  mpptMax:115, iCharge:60,  idle:30, surge:2, eta:0.92 },
    { w:3500, v:24, pvMax:4000, vocMax:500, mpptMin:120, mpptMax:450, iCharge:100, idle:40, surge:2, eta:0.92 },
    { w:5500, v:48, pvMax:6000, vocMax:500, mpptMin:120, mpptMax:450, iCharge:100, idle:55, surge:2, eta:0.93 },
    { w:8000, v:48, pvMax:9000, vocMax:500, mpptMin:120, mpptMax:450, iCharge:150, idle:80, surge:2, eta:0.93 }
  ].forEach(h => L.push({ type:'hybride', ...h }));
  // Câbles (prix au mètre)
  [4,6,10,16].forEach(s => L.push({ type:'cable', usage:'pv', section:s }));
  [6,10,16,25,35,50,70,95,120].forEach(s => L.push({ type:'cable', usage:'dc', section:s }));
  [1.5,2.5,4,6].forEach(s => L.push({ type:'cable', usage:'ac', section:s }));
  // Protections
  [16,25,32,40,63,80,100,125,160,200,250,300].forEach(c => L.push({ type:'protection', genre:'fusible_dc', calibre:c }));
  [16,25,32,63].forEach(c => L.push({ type:'protection', genre:'sect_pv', calibre:c, vmax:1000 }));
  [10,15,20,25].forEach(c => L.push({ type:'protection', genre:'fusible_pv', calibre:c, vmax:1000 }));
  L.push({ type:'protection', genre:'parafoudre_pv', calibre:0, vmax:600 }, { type:'protection', genre:'parafoudre_pv', calibre:0, vmax:1000 });
  [16,25,32,40].forEach(c => L.push({ type:'protection', genre:'disj_ac', calibre:c }));
  L.push({ type:'protection', genre:'terre', calibre:0 });
  // Autres articles ajoutés automatiquement au devis
  L.push({ type:'autre', nom:'Support de fixation (par panneau)', auto:'panneaux' },
         { type:'autre', nom:'Coffret et petit matériel électrique', auto:'un' },
         { type:'autre', nom:'Installation et mise en service', auto:'un' },
         { type:'autre', nom:'Transport', auto:'non' });
  return L;
}

/* ------------------------------------------------------------------
   Suggestions de valeurs d'après le nom saisi par l'utilisateur.
   [motif, catégorie, puissance W, heures de jour, heures de nuit, démarrage, ponctuel, existe en 12 V]
   L'ordre compte : le premier motif reconnu l'emporte (« clim inverter » avant « clim »).
   ------------------------------------------------------------------ */
const CATEGORIES = [
  [/clim.*inverter|inverter.*clim|split.*inverter/i, 'climatiseur inverter', 800, 4, 4, 1.3, false, false],
  [/clim|split|air ?cond/i, 'climatiseur', 1000, 4, 4, 5, false, false],
  [/cong[eé]l/i, 'congélateur', 200, 6, 4, 5, false, false],
  [/frigo|r[eé]frig|frigidaire/i, 'réfrigérateur', 150, 5, 3, 5, false, false],
  [/fontaine|distributeur.*eau/i, 'fontaine à eau', 100, 5, 3, 5, false, false],
  [/pompe|surpresseur|forage|moteur/i, 'pompe', 750, 1, 0, 3, true, false],
  [/machine.*laver|lave.?linge/i, 'machine à laver', 500, 1, 0, 3, true, false],
  [/mixeur|blender|robot|moulin/i, 'mixeur', 300, 0.3, 0, 3, true, false],
  [/fer\b|fer [àa] repasser|repass/i, 'fer à repasser', 1000, 0.5, 0, 1, true, false],
  [/bouilloire|chauffe.?eau|thermo/i, 'bouilloire', 1500, 0.3, 0, 1, true, false],
  [/micro.?onde/i, 'micro-ondes', 1500, 0.3, 0, 1, true, false],
  [/s[eè]che.?cheveux|tondeuse|coiff/i, 'sèche-cheveux', 1200, 0.3, 0, 1, true, false],
  [/portail/i, 'portail motorisé', 300, 0.2, 0, 3, true, false],
  [/imprim|photocop/i, 'imprimante', 300, 0.5, 0, 1, true, false],
  [/ventil.*12|ventil.*dc/i, 'ventilateur 12 V', 20, 4, 6, 1, false, true],
  [/ventil|brasseur/i, 'ventilateur', 60, 4, 6, 1, false, false],
  [/t[eé]l[eé]|tv|t[eé]l[eé]viseur/i, 'télévision', 60, 2, 4, 1, false, true],
  [/d[eé]codeur|parabole|canal/i, 'décodeur', 15, 2, 4, 1, false, true],
  [/radio|hi.?fi|chaîne|chaine|sono|enceinte/i, 'radio', 30, 2, 2, 1, false, true],
  [/ordinateur.*bureau|\bpc\b|unit[eé] centrale|desktop/i, 'ordinateur de bureau', 150, 6, 0, 1, false, false],
  [/ordinateur|portable|laptop/i, 'ordinateur portable', 65, 4, 1, 1, false, false],
  [/chargeur|t[eé]l[eé]phone|smartphone/i, 'chargeur de téléphone', 10, 1, 2, 1, false, true],
  [/box|routeur|wi.?fi|modem/i, 'box Internet', 12, 12, 12, 1, false, true],
  [/cam[eé]ra|surveillance|alarme/i, 'caméra', 10, 12, 12, 1, false, true],
  [/projecteur|ext[eé]rieur|lampadaire/i, 'éclairage extérieur', 20, 0, 11, 1, false, true],
  [/lampe|ampoule|led|n[eé]on|tube|[eé]clairage|lumi[eè]re/i, 'éclairage', 10, 0, 5, 1, false, true]
];
// Puissance lue dans le nom : « Lampe 15 W », « clim 1,5 CV », « TV 43 pouces »
function puissanceDansNom(nom){
  const s = String(nom||'').replace(',', '.');
  let m = s.match(/(\d+(?:\.\d+)?)\s*(kw|w)\b/i);
  if(m) return Math.round(parseFloat(m[1]) * (m[2].toLowerCase()==='kw' ? 1000 : 1));
  m = s.match(/(\d+(?:\.\d+)?)\s*cv\b/i);
  if(m) return Math.round(parseFloat(m[1]) * (/inverter/i.test(s) ? 650 : 850));      // 1 CV ≈ 850 W absorbés (classique)
  m = s.match(/(\d+)\s*(pouces|")/i);
  if(m && /t[eé]l[eé]|tv/i.test(s)) return Math.round(Math.max(30, +m[1]*1.8));
  return 0;
}
// Suggestion complète pour un appareil : null si le nom n'est pas reconnu
function suggerer(nom){
  const s = String(nom||'').trim(); if(!s) return null;
  const c = CATEGORIES.find(x => x[0].test(s)); if(!c) return null;
  const w = puissanceDansNom(s) || c[2];
  return { categorie:c[1], w, hJ:c[3], hN:c[4], dem:c[5], ponctuel:c[6], dc12:c[7] && w <= 120 };
}

/* Caractéristiques typiques d'un onduleur hybride, d'après le modèle du catalogue le plus proche */
function specHybride(w, v){
  const L = materielParDefaut().filter(m => m.type==='hybride');
  const meme = L.filter(m => m.v===v); const pool = meme.length ? meme : L;
  const p = pool.reduce((a,b) => Math.abs(b.w-w) < Math.abs(a.w-w) ? b : a);
  const k = w / p.w;
  return { pvMax: Math.round(p.pvMax*k/100)*100, vocMax:p.vocMax, mpptMin:p.mpptMin, mpptMax:p.mpptMax,
           iCharge: Math.round(p.iCharge*Math.min(1.5,Math.max(0.5,k))/10)*10, idle: Math.round(p.idle*Math.sqrt(k)), surge:p.surge, eta:p.eta };
}
function specRegulateur(techno, a){
  return techno==='pwm' ? { vocMax:50, tensions:[12,24] }
       : { vocMax: a<=40 ? 100 : a<=80 ? 150 : 250, tensions: a<=40 ? [12,24] : [12,24,48] };
}

const API = { PRESETS, specPanneau, specBatterie, specConvertisseur, specHybride, specRegulateur, materielParDefaut, suggerer, puissanceDansNom };
G.DONNEES = API;
if(typeof module==='object' && module.exports) module.exports = API;
})(typeof globalThis!=='undefined' ? globalThis : this);
