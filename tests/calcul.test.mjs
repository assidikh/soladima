// Tests du moteur de calcul. Lancer : node --test tests/
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const C = require('../calcul.js'), D = require('../donnees.js');

const mat = D.materielParDefaut().map((m, i) => ({ id: 'm' + i, prix: 0, ...m }));
const ap = (debut, q) => { const p = D.PRESETS.find(x => x[0].startsWith(debut));
  return { nom: p[0], qte: q, w: p[1], hJ: p[2], hN: p[3], dem: p[4], ponctuel: p[5], dc12: p[6] }; };
const MAISON = [ap('Ampoule LED', 8), ap('Ventilateur sur pied', 3), ap('Télévision LED 32', 1), ap('Décodeur', 1),
                 ap('Réfrigérateur 150', 1), ap('Chargeur', 4), ap('Fer à repasser', 1)];
const proche = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);

test('bilan : énergies de jour et de nuit, pointe et démarrage', () => {
  const B = C.besoins([{ qte: 2, w: 100, hJ: 3, hN: 1, dem: 1 }, { qte: 1, w: 200, hJ: 0, hN: 0, dem: 5 }, { qte: 1, w: 1000, hJ: 0.5, hN: 0, ponctuel: true }], { simul: 1 });
  proche(B.Ej, 2*100*3 + 1000*0.5); proche(B.En, 2*100*1);
  proche(B.Ppointe, 2*100 + 200 + 1000);            // continus + un seul ponctuel
  proche(B.Pstart, 1400 + 4*200);                   // le compresseur démarre à 5× pendant que le reste tourne
});

test('chaîne : consommation à vide de l\'onduleur comptée 24 h', () => {
  const ch = C.chaine({ Ej: 900, En: 900 }, 0.9, 30);
  proche(ch.idleWh, 720); proche(ch.Etot, 2000 + 720);
  proche(ch.Ebat, 1000 + 360 + C.PART_JOUR_BATT * (1000 + 360));
});

test('climat : N\'Djaména, août est le mois critique', () => {
  const c = C.climat("N'Djaména"), Y = C.rendementMPPT(c, C.PARAMS_DEFAUT);
  assert.equal(Y.indexOf(Math.min(...Y)), 7);
  // Cohérence avec PVGIS (3,79 kWh/kWc/j en août avec 14 % de pertes) : notre modèle doit être dans ±8 %
  assert.ok(Y[7] > 3.79*0.92 && Y[7] < 3.79*1.08, 'productible août ' + Y[7]);
  assert.equal(C.villes().length, 24);
});

test('panneaux : tension à vide à froid plus haute, tension MPP à chaud plus basse', () => {
  const p = { voc: 49.9, vmp: 42, bVoc: -0.27, gP: -0.35 }, t = C.tensionsPanneau(p, C.climat("N'Djaména"));
  assert.ok(t.vocF > p.voc && t.vocF < p.voc * 1.06);
  assert.ok(t.vmpC < p.vmp * 0.85);
});

test('câble : section par chute de tension et par courant admissible', () => {
  // 100 A sur 2 m en 24 V, 2 % : S ≥ 2·0,0225·2·100/(0,02·24) = 18,75 → 25 mm² ; mais le câble doit tenir le fusible de 125 A :
  // 35 mm² admet 138×0,87 = 120 A < 125 A, 50 mm² admet 146 A → 50 mm²
  const s = C.sectionCable(100, 2, 24, 0.02, 125);
  assert.equal(s.S, 50);
  assert.equal(C.sectionCable(10, 1, 230, 0.03, 16).S, 1.5);
});

test('dimensionnement : la production du mois critique couvre le besoin', () => {
  for(const ville of ["N'Djaména", 'Moundou', 'Abéché', 'Faya-Largeau']){
    const R = C.dimensionner(MAISON, { ville }, mat);
    R.archis.filter(a => a.faisable && a.id !== 'secours').forEach(a => {
      assert.ok(Math.min(...a.couverture) >= 1, `${ville} ${a.id} couverture ${Math.min(...a.couverture)}`);
      assert.ok(a.bat.Wh * C.TECH[R.P.tech].dod * C.TECH[R.P.tech].vieil >= a.bat.usable - 1, 'batterie trop petite');
    });
  }
});

test('architectures : l\'hybride n\'a ni régulateur ni convertisseur sur le devis', () => {
  const R = C.dimensionner(MAISON, {}, mat), h = R.archis.find(a => a.id === 'hybride');
  assert.ok(h.faisable);
  assert.ok(!h.lignes.some(l => l.cle === 'reg' || l.cle === 'conv'));
  const rc = R.archis.find(a => a.id === 'regconv');
  assert.ok(rc.lignes.some(l => l.cle === 'reg') && rc.lignes.some(l => l.cle === 'conv'));
});

test('architectures : kit 12 V seulement si tous les appareils existent en 12 V', () => {
  assert.equal(C.dimensionner(MAISON, {}, mat).archis[0].faisable, false);
  const petit = [ap('Ampoule LED', 6), ap('Télévision LED 32', 1), ap('Chargeur', 3)];
  assert.equal(C.dimensionner(petit, {}, mat).archis[0].faisable, true);
});

test('PWM avec un grand panneau : l\'essentiel de la puissance est perdue', () => {
  const pwm = mat.filter(m => m.type !== 'regulateur' || m.techno === 'pwm').filter(m => m.type !== 'panneau' || m.w === 340);
  const R = C.dimensionner([ap('Ampoule LED', 6), ap('Télévision LED 32', 1)], { vsys: 12 }, pwm), k = R.archis[0];
  assert.ok(k.faisable);
  assert.equal(k.pv.mode, 'PWM');
  assert.ok(k.pv.ratio < 0.45, 'ratio ' + k.pv.ratio);   // ≈ 13,4 V / 33,6 V = 40 %
  assert.ok(k.warns.some(w => w.includes('PWM')));
});

test('moteur : pas de convertisseur à onde modifiée, onduleur assez fort au démarrage', () => {
  const R = C.dimensionner([ap('Réfrigérateur 150', 1), ap('Ampoule LED', 4)], {}, mat), rc = R.archis.find(a => a.id === 'regconv');
  assert.ok(rc.faisable);
  assert.notEqual(rc.conv.m.onde, 'modifie');
  assert.ok(rc.conv.m.w * rc.conv.m.surge >= R.besoins.Pstart);
});

test('chaîne de panneaux : tension à froid sous le maximum de l\'appareil', () => {
  const R = C.dimensionner(MAISON, {}, mat);
  R.archis.filter(a => a.faisable).forEach(a => {
    const vmax = a.hyb ? a.hyb.m.vocMax : a.reg.m.vocMax;
    assert.ok(a.pv.vocF * a.pv.ns <= vmax, `${a.id} : ${a.pv.vocF * a.pv.ns} V > ${vmax} V`);
  });
});

test('batteries : courant de décharge tenu par le BMS', () => {
  const R = C.dimensionner(MAISON, {}, mat);
  R.archis.filter(a => a.faisable).forEach(a => {
    assert.ok(a.bat.Idech / a.bat.par <= a.bat.m.iDech + 1e-9, `${a.id} : ${a.bat.Idech / a.bat.par} A par rangée`);
  });
});

test('secours réseau : seulement si le client a le réseau ou un groupe', () => {
  assert.equal(C.dimensionner(MAISON, {}, mat).archis[3].faisable, false);
  const s = C.dimensionner(MAISON, { reseau: true, coupure: 6 }, mat).archis[3];
  assert.ok(s.faisable && s.appointAn >= 0);
});

test('économie : coûts cumulés cohérents et invariants', () => {
  const prix = mat.map(m => ({ ...m, prix: 100000 }));
  const R = C.dimensionner(MAISON, {}, prix);
  const e = C.economie(R.choisie, R.P, { heuresGroupe: 6, prixEssence: 700, prixGasoil: 800, entretienHeure: 100, prixGroupeKva: 150000 });
  assert.equal(e.solaire.length, 11);
  assert.ok(e.groupe.every((x, i) => i === 0 || x > e.groupe[i-1]));
  assert.ok(e.litresJour > 0 && e.vieBatt >= 1);
  // Doubler le prix du carburant ne peut que rapprocher le retour sur investissement
  const e2 = C.economie(R.choisie, R.P, { heuresGroupe: 6, prixEssence: 1400, prixGasoil: 1600, entretienHeure: 100, prixGroupeKva: 150000 });
  assert.ok(e2.retour === null || e.retour === null || e2.retour <= e.retour);
});

test('PWM : un panneau dont la tension à vide à froid dépasse 50 V est refusé', () => {
  const pwm = mat.filter(m => m.type !== 'regulateur' || m.techno === 'pwm').filter(m => m.type !== 'panneau' || m.w === 550);
  assert.equal(C.dimensionner([ap('Ampoule LED', 6)], { vsys: 12 }, pwm).archis[0].faisable, false);
});
