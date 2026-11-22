// Génère climat.js : données d'ensoleillement et de température des villes du Tchad.
// Sources : PVGIS 5.2 (Commission européenne, base SARAH-2, 2005-2020) et NASA POWER (climatologie).
// Usage : node outils/generer-climat.mjs   (nécessite internet, ~1 min)
import { writeFile } from 'node:fs/promises';

// Chefs-lieux des 23 provinces + quelques grandes villes. Coordonnées approchées (±0,05°),
// largement suffisantes : l'ensoleillement varie sur des dizaines de kilomètres.
const VILLES = [
  ["N'Djaména", 12.13, 15.05], ['Moundou', 8.57, 16.08], ['Sarh', 9.14, 18.39], ['Abéché', 13.83, 20.83],
  ['Kélo', 9.31, 15.81], ['Koumra', 8.91, 17.55], ['Pala', 9.36, 14.90], ['Am Timan', 10.98, 20.28],
  ['Bongor', 10.28, 15.37], ['Mongo', 12.18, 18.69], ['Doba', 8.65, 16.85], ['Ati', 13.21, 18.34],
  ['Laï', 9.40, 16.30], ['Massakory', 13.00, 15.73], ['Mao', 14.12, 15.31], ['Biltine', 14.53, 20.92],
  ['Faya-Largeau', 17.92, 19.11], ['Bol', 13.46, 14.71], ['Moussoro', 13.64, 16.49], ['Goz Beïda', 12.22, 21.41],
  ['Bardaï', 21.36, 17.00], ['Fada', 17.19, 21.58], ['Amdjarass', 16.07, 22.84], ['Massenya', 11.40, 16.17]
];
const MOIS = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'];
const pause = ms => new Promise(r => setTimeout(r, ms));
async function json(url){
  for(let k=0;k<4;k++){
    try{ const r = await fetch(url); if(r.ok) return await r.json(); }catch(e){}
    await pause(1500*(k+1));
  }
  throw new Error('Échec : '+url);
}
const r2 = x => Math.round(x*100)/100, r1 = x => Math.round(x*10)/10;

const sortie = [];
for(const [nom, lat, lon] of VILLES){
  const base = `https://re.jrc.ec.europa.eu/api/v5_2/PVcalc?lat=${lat}&lon=${lon}&peakpower=1&loss=0&aspect=0&outputformat=json`;
  // 1) inclinaison optimale annuelle selon PVGIS
  const opt = await json(base + '&optimalangles=1');
  const angleOpt = opt.inputs.mounting_system.fixed.slope.value;
  // Inclinaison retenue : au moins 10° (écoulement de l'eau et de la poussière), arrondie.
  const angle = Math.max(10, Math.round(angleOpt));
  // 2) productible à cette inclinaison, SANS pertes système (loss=0) :
  //    E_d inclut uniquement température, angle d'incidence et spectre.
  const pv = await json(base + `&angle=${angle}`);
  const H = pv.outputs.monthly.fixed.map(m => m['H(i)_d']);
  const fT = pv.outputs.monthly.fixed.map(m => m.E_d / m['H(i)_d']);
  // 3) températures (NASA POWER)
  const np = await json(`https://power.larc.nasa.gov/api/temporal/climatology/point?parameters=T2M,T2M_MAX,T2M_MIN&community=RE&longitude=${lon}&latitude=${lat}&format=JSON`);
  const P = np.properties.parameter;
  sortie.push({ nom, lat, lon, angle, H: H.map(r2), fT: fT.map(r2),
    tMoy: MOIS.map(m => r1(P.T2M[m])), tMax: MOIS.map(m => r1(P.T2M_MAX[m])), tMin: MOIS.map(m => r1(P.T2M_MIN[m])) });
  console.log(nom, angle+'°', 'H min', Math.min(...H).toFixed(2), 'fT', fT.map(x=>x.toFixed(2)).join(' '));
  await pause(300);
}

const entete = `/* Données climatiques des villes du Tchad — FICHIER GÉNÉRÉ par outils/generer-climat.mjs, ne pas modifier à la main.
   H   : ensoleillement moyen journalier sur le plan des panneaux (kWh/m²/jour), inclinaison « angle » plein sud,
         PVGIS 5.2 / SARAH-2, moyennes 2005-2020.
   fT  : rapport productible / ensoleillement sans pertes système (pertes de température, d'incidence et de spectre),
         calculé par PVGIS ; la production d'un kWc avec MPPT est H × fT × (autres pertes).
   tMoy, tMax, tMin : températures de l'air à 2 m (°C), moyennes mensuelles, NASA POWER (climatologie).
   Généré le ${new Date().toISOString().slice(0,10)}. */\n`;
await writeFile(new URL('../climat.js', import.meta.url), entete + 'globalThis.CLIMAT = ' + JSON.stringify(sortie) + ';\n'
  + "if(typeof module==='object' && module.exports) module.exports = globalThis.CLIMAT;\n");
console.log('climat.js écrit,', sortie.length, 'villes');
