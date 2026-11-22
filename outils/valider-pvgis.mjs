// Validation indépendante : chaque système proposé par SolaDima est simulé heure par heure par PVGIS
// (outil « systèmes autonomes », 16 années de météo réelle) qui compte les jours où la batterie se vide.
// Usage : node outils/valider-pvgis.mjs [aut]     (aut = jours d'autonomie en plus de la nuit, défaut 0,5)
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../calcul.js'), D = require('../donnees.js');

const aut = process.argv[2] !== undefined ? +process.argv[2] : C.PARAMS_DEFAUT.aut;
const mat = D.materielParDefaut().map((m, i) => ({ id: 'm' + i, prix: 0, ...m }));
const ap = (debut, q) => { const p = D.PRESETS.find(x => x[0].startsWith(debut));
  return { nom: p[0], qte: q, w: p[1], hJ: p[2], hN: p[3], dem: p[4], ponctuel: p[5], dc12: p[6] }; };
const CAS = [
  ['Petit kit', [ap('Ampoule LED', 6), ap('Télévision LED 32', 1), ap('Décodeur', 1), ap('Chargeur', 3), ap('Ventilateur 12 V', 2)]],
  ['Maison type', [ap('Ampoule LED', 8), ap('Ventilateur sur pied', 3), ap('Télévision LED 32', 1), ap('Décodeur', 1), ap('Réfrigérateur 150', 1), ap('Chargeur', 4), ap('Fer à repasser', 1)]],
  ['Maison + clim', [ap('Ampoule LED', 10), ap('Ventilateur de plafond', 4), ap('Télévision LED 43', 1), ap('Réfrigérateur 150', 1), ap('Climatiseur split 1 CV inverter', 1)]],
  ['Boutique de jour', [ap('Tube LED', 6), ap('Ordinateur de bureau', 2), ap('Congélateur', 1), ap('Ventilateur de plafond', 2), ap('Box', 1)]]
];
const VILLES = ["N'Djaména", 'Moundou', 'Abéché', 'Faya-Largeau'];
const pause = ms => new Promise(r => setTimeout(r, ms));

// Profil horaire de consommation : la part « jour » répartie de 7 h à 18 h, la part « nuit » sur les autres heures
function profil(ch){
  const h = [];
  for(let i=0;i<24;i++) h.push(i>=7 && i<19 ? ch.EjDC/12 : ch.EnDC/12);
  const s = h.reduce((a,b)=>a+b,0); return h.map(x => (x/s).toFixed(4));
}
for(const [nom, app] of CAS) for(const ville of VILLES){
  const R = C.dimensionner(app, { ville, aut }, mat), a = R.choisie, T = C.TECH[R.P.tech];
  const url = `https://re.jrc.ec.europa.eu/api/v5_2/SHScalc?lat=${R.climat.lat}&lon=${R.climat.lon}&angle=${R.climat.angle}&aspect=0`
    + `&peakpower=${a.pv.Wc}&batterysize=${Math.round(a.bat.Wh*T.vieil)}&cutoff=${Math.round((1-T.dod)*100)}`
    + `&consumptionday=${Math.round(a.chaine.Etot)}&hourconsumption=${profil(a.chaine).join(',')}&outputformat=json`;
  let d = null;
  for(let k=0;k<4 && !d;k++){ try{ const r = await fetch(url); if(r.ok) d = await r.json(); }catch(e){} if(!d) await pause(2000); }
  if(!d){ console.log(nom, ville, 'PVGIS indisponible'); continue; }
  const m = d.outputs.monthly, pire = m.reduce((x,y) => y.f_e > x.f_e ? y : x);
  console.log(`${nom.padEnd(16)} ${ville.padEnd(13)} ${a.nom.padEnd(28)} ${String(a.pv.Wc).padStart(5)} Wc ${(a.bat.Wh/1000).toFixed(2).padStart(6)} kWh `
    + `| jours batterie vide : année ${d.outputs.totals.f_e.toFixed(1)} %, pire mois ${C.MOIS[pire.month-1]} ${pire.f_e.toFixed(1)} % `
    + `| énergie manquante ${(100*d.outputs.totals.E_miss/a.chaine.Etot).toFixed(1)} %`);
  await pause(400);
}
