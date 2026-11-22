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
  [4,6].forEach(s => L.push({ type:'cable', usage:'pv', section:s }));
  [6,10,16,25,35,50,70].forEach(s => L.push({ type:'cable', usage:'dc', section:s }));
  [1.5,2.5,4,6].forEach(s => L.push({ type:'cable', usage:'ac', section:s }));
  // Protections
  [32,63,100,125,160,200,250].forEach(c => L.push({ type:'protection', genre:'fusible_dc', calibre:c }));
  [16,25,32,63].forEach(c => L.push({ type:'protection', genre:'sect_pv', calibre:c, vmax:1000 }));
  L.push({ type:'protection', genre:'fusible_pv', calibre:15, vmax:1000 });
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

const API = { PRESETS, specPanneau, specBatterie, specConvertisseur, materielParDefaut };
G.DONNEES = API;
if(typeof module==='object' && module.exports) module.exports = API;
})(typeof globalThis!=='undefined' ? globalThis : this);
