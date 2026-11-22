/* schema.js — schéma de montage (SVG) et plan d'installation de la solution retenue.
   Tout est déduit du résultat du calcul : nombre réel de panneaux et de batteries, câblage série /
   parallèle, sections et longueurs de câbles, calibres des protections. */
'use strict';

const PALETTES = {
  clair:  { fond:'#ffffff', txt:'#1b1b1b', mut:'#6b5a4e', boite:'#fff8f1', bord:'#d9c3b0', plus:'#c2410c', moins:'#333333', ac:'#2a78d6', terre:'#15803d', pv:'#1e3a6b', pvCadre:'#9fb3d1', bat:'#3f3f46' },
  sombre: { fond:'#211a15', txt:'#f4ece5', mut:'#b5a396', boite:'#2a211b', bord:'#5b4636', plus:'#ff7a45', moins:'#c9c2bb', ac:'#5aa2f0', terre:'#4ade80', pv:'#3b5b8f', pvCadre:'#7d93b8', bat:'#a1a1aa' }
};
const nb = x => String(Math.round(x*10)/10).replace('.', ',');

function schemaSVG(r, pourPDF){
  const a = r.choisie, c = r.climat, B = a.besoins;
  const K = PALETTES[!pourPDF && document.body.classList.contains('dark') ? 'sombre' : 'clair'];
  const W = 360, G = 20, D = 340, CG = 85, CD = 275;            // marges, centres des colonnes gauche et droite
  let s = '';
  const t = (x, y, str, o = {}) => { s += `<text x="${x}" y="${y}" font-size="${o.fs||9.5}" font-weight="${o.b?700:400}" fill="${o.c||K.txt}" text-anchor="${o.a||'start'}" font-family="Arial, Helvetica, sans-serif">${esc(str)}</text>`; };
  const rect = (x, y, w, h, o = {}) => { s += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${o.rx??8}" fill="${o.f||K.boite}" stroke="${o.st||K.bord}" stroke-width="${o.sw||1}"/>`; };
  const ligne = (x1, y1, x2, y2, coul, o = {}) => { s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${coul}" stroke-width="${o.w||2}" ${o.dash?`stroke-dasharray="${o.dash}"`:''} stroke-linecap="round"/>`; };
  // Liaison continue : deux conducteurs, + (couleur) et − (sombre)
  const dc = (x1, y1, x2, y2) => {
    const v = x1 === x2, d = 2.5;
    ligne(v ? x1-d : x1, v ? y1 : y1-d, v ? x2-d : x2, v ? y2 : y2-d, K.plus);
    ligne(v ? x1+d : x1, v ? y1 : y1+d, v ? x2+d : x2, v ? y2 : y2+d, K.moins);
  };
  const ac = (x1, y1, x2, y2) => ligne(x1, y1, x2, y2, K.ac, { w:3 });
  const fusible = (x, y, label, vertical) => {
    s += vertical ? `<rect x="${x-6}" y="${y-8}" width="12" height="16" rx="2" fill="${K.fond}" stroke="${K.txt}" stroke-width="1.2"/><line x1="${x}" y1="${y-8}" x2="${x}" y2="${y+8}" stroke="${K.txt}" stroke-width="1"/>`
                  : `<rect x="${x-8}" y="${y-6}" width="16" height="12" rx="2" fill="${K.fond}" stroke="${K.txt}" stroke-width="1.2"/><line x1="${x-8}" y1="${y}" x2="${x+8}" y2="${y}" stroke="${K.txt}" stroke-width="1"/>`;
    if(label) vertical ? t(x+10, y+3, label, { fs:8.5, b:true }) : t(x, y-9, label, { fs:8.5, b:true, a:'middle' });
  };
  const cable = cb => cb ? `${nb(cb.S)} mm² ${cb.m.metal==='aluminium'?'alu':'cuivre'} ${cb.m.ame||'souple'} · ${nb(cb.L)} m` : '';
  const trouveCable = debut => a.cables.find(x => x.lien.startsWith(debut));
  const prot = g => a.protections.filter(p => p.genre === g);
  const fusDc = prot('fusible_dc');

  // En-tête
  t(W/2, 16, 'Schéma de montage', { fs:13, b:true, a:'middle' });
  t(W/2, 30, `${a.nom} · système ${a.V} V`, { fs:9.5, a:'middle', c:K.mut });

  // 1) Champ de panneaux : une chaîne par colonne, panneaux en série dans la colonne
  let y = 40; const hPv = 92;
  rect(G, y, D-G, hPv);
  t(G+8, y+16, 'Champ solaire', { fs:11, b:true });
  t(G+8, y+31, `${a.pv.N} × ${a.pv.m.w} Wc = ${a.pv.Wc} Wc`);
  t(G+8, y+44, `${a.pv.ns} en série × ${a.pv.np} chaîne(s) en parallèle`);
  t(G+8, y+57, `Inclinaison ${c.angle}°, plein sud`, { c:K.mut });
  t(G+8, y+70, `Voc d'une chaîne par temps froid : ${nb(a.pv.vocF*a.pv.ns)} V`, { c:K.mut });
  const cols = Math.min(a.pv.np, 6), rows = Math.min(a.pv.ns, 4), pw = 14, ph = 18, gx = 5, gy = 3;
  const x0 = D - 10 - cols*(pw+gx) + gx, y0 = y + (hPv - rows*(ph+gy) + gy)/2;
  for(let i=0;i<cols;i++) for(let j=0;j<rows;j++){
    s += `<rect x="${x0+i*(pw+gx)}" y="${y0+j*(ph+gy)}" width="${pw}" height="${ph}" rx="1.5" fill="${K.pv}" stroke="${K.pvCadre}" stroke-width="1"/>`;
    if(j>0) ligne(x0+i*(pw+gx)+pw/2, y0+j*(ph+gy)-gy, x0+i*(pw+gx)+pw/2, y0+j*(ph+gy), K.plus, { w:1.2 });
  }
  if(a.pv.np > cols || a.pv.ns > rows) t(D-10, y+hPv-5, `(${a.pv.N} panneaux au total)`, { fs:8, a:'end', c:K.mut });
  y += hPv;

  // 2) Liaison panneaux → boîte de jonction
  const cPv = trouveCable('Panneaux');
  dc(CG, y, CG, y+34); t(CG+12, y+15, 'Câble solaire', { fs:8.5, b:true }); t(CG+12, y+26, cable(cPv), { fs:8.5, c:K.mut });
  y += 34;

  // 3) Boîte de jonction DC : sectionneur, parafoudre, fusibles de chaîne
  const sect = prot('sect_pv')[0], para = prot('parafoudre_pv')[0], fpv = prot('fusible_pv')[0];
  const hJb = fpv ? 56 : 44;
  rect(G, y, D-G, hJb);
  t(G+8, y+15, 'Boîte de jonction DC (panneaux)', { fs:10.5, b:true });
  t(G+8, y+29, `Interrupteur-sectionneur DC ${sect?sect.calibre:''} A · parafoudre DC ≥ ${para?Math.ceil(para.vmin):''} V`);
  if(fpv) t(G+8, y+42, `Fusibles de chaîne ${fpv.calibre} A × ${fpv.n} (un par chaîne)`);
  y += hJb;
  dc(CG, y, CG, y+28); y += 28;

  // 4) Appareils : colonne gauche (onduleur hybride ou régulateur), colonne droite (batteries, convertisseur)
  const hApp = 70, xg = G, wg = 130, xd = 210, wd = D-210;
  const boiteApp = (x, yy, w, titre, l1, l2, l3) => { rect(x, yy, w, hApp, { st:K.txt, sw:1.4 }); t(x+8, yy+16, titre, { fs:10.5, b:true }); t(x+8, yy+31, l1); if(l2) t(x+8, yy+44, l2, { c:K.mut }); if(l3) t(x+8, yy+57, l3, { c:K.mut }); };
  const bat = a.bat, bm = bat.m;
  const boiteBat = yy => {
    rect(xd, yy, wd, hApp+26, { st:K.txt, sw:1.4 });
    t(xd+8, yy+16, 'Batteries', { fs:10.5, b:true });
    t(xd+8, yy+30, `${bat.units} × ${nb(bm.v)} V ${bm.ah} Ah`);
    t(xd+8, yy+43, `${bat.series} série × ${bat.par} parallèle`, { c:K.mut });
    t(xd+8, yy+56, `${nb(bat.Wh/1000)} kWh · ${bm.tech==='lithium'?'lithium':'gel'}`, { c:K.mut });
    const bc = Math.min(bat.series, 4), br = Math.min(bat.par, 3), bw = 16, bh = 10;
    for(let i=0;i<bc;i++) for(let j=0;j<br;j++) s += `<rect x="${xd+8+i*(bw+4)}" y="${yy+64+j*(bh+3)}" width="${bw}" height="${bh}" rx="1.5" fill="${K.bat}"/>`;
  };
  const yApp = y;
  if(a.hyb){
    boiteApp(xg, yApp, wg, 'Onduleur hybride', `${a.hyb.m.w} W · ${a.V} V`, 'MPPT intégré', 'Sortie pur sinus');
  } else {
    boiteApp(xg, yApp, wg, `Régulateur ${a.reg.m.techno==='pwm'?'PWM':'MPPT'}`, `${a.reg.n} × ${a.reg.m.a} A · ${a.V} V`, a.reg.m.techno==='pwm'?'Panneaux 12 V':'Panneaux ≤ '+a.reg.m.vocMax+' V', '');
  }
  boiteBat(yApp);
  // Liaison batterie ↔ appareil de gauche (hybride ou régulateur), avec son fusible
  const cBatG = a.hyb ? trouveCable('Batterie → onduleur') : trouveCable('Régulateur → batterie');
  const fG = a.hyb ? fusDc[0] : fusDc[0];
  dc(xg+wg, yApp+hApp/2, xd, yApp+hApp/2);
  fusible((xg+wg+xd)/2, yApp+hApp/2-2.5, fG ? `F ${fG.calibre} A` : '');
  t((xg+wg+xd)/2, yApp+hApp/2+17, cBatG ? `${nb(cBatG.S)} mm²` : '', { fs:8.5, a:'middle', c:K.mut });
  t((xg+wg+xd)/2, yApp+hApp/2+27, cBatG ? `${nb(cBatG.L)} m` : '', { fs:8.5, a:'middle', c:K.mut });
  y = yApp + hApp + 26;

  // 5) Sortie : 230 V (hybride ou convertisseur) ou circuits 12 V
  let xSortie = CG;
  if(a.conv){
    // batterie → convertisseur (colonne droite)
    const cConv = trouveCable('Batterie → convertisseur'), fC = fusDc[1];
    dc(CD, y, CD, y+38); fusible(CD-2.5, y+19, fC ? `F ${fC.calibre} A` : '', true);
    t(CD-14, y+22, cConv ? `${nb(cConv.S)} mm² · ${nb(cConv.L)} m` : '', { fs:8.5, a:'end', c:K.mut });
    y += 38;
    boiteApp(xd, y, wd, 'Convertisseur', `${a.conv.m.w} W · ${a.V} V`, a.conv.m.onde==='modifie'?'Onde modifiée':'Pur sinus', '');
    y += hApp; xSortie = CD;
  } else if(!a.hyb){
    // kit 12 V : batterie → fusible → circuits 12 V
    const c12 = trouveCable('Batterie → circuits'), f12 = fusDc[1] || fusDc[0];
    dc(CD, y, CD, y+38); fusible(CD-2.5, y+19, f12 ? `F ${f12.calibre} A` : '', true);
    y += 38;
    rect(G, y, D-G, 46, { st:K.txt, sw:1.4 });
    t(G+8, y+16, 'Circuits 12 V (un fusible par circuit)', { fs:10.5, b:true });
    t(G+8, y+31, c12 ? `Départ : ${cable(c12)}` : '', { c:K.mut });
    y += 46;
  } else {
    y = Math.max(y, yApp + hApp);
  }
  if(a.hyb || a.conv){
    const cAc = trouveCable('Sortie 230 V'), dj = prot('disj_ac')[0];
    const yDep = a.hyb ? yApp + hApp : y;
    ac(xSortie, yDep, xSortie, y+30);
    // Étiquette du côté où il y a de la place (à gauche si la sortie est dans la colonne de droite)
    const aDroite = xSortie < W/2;
    t(aDroite ? xSortie+10 : xSortie-10, y+18, cAc ? `230 V · ${cable(cAc)}` : '230 V', { fs:8.5, c:K.mut, a: aDroite ? 'start' : 'end' });
    y += 30;
    rect(G, y, D-G, 40, { st:K.ac, sw:1.4 });
    t(G+8, y+16, `Disjoncteur différentiel 30 mA ${dj?dj.calibre:''} A`, { fs:10.5, b:true });
    t(G+8, y+30, 'Protection des personnes et du circuit 230 V', { c:K.mut });
    y += 40;
    ac(W/2, y, W/2, y+22); y += 22;
    const app = (S.appareils||[]).filter(x => x.qte>0 && x.w>0).slice(0, 4).map(x => `${x.qte} × ${x.nom}`);
    rect(G, y, D-G, 30 + app.length*12, { st:K.ac, sw:1 });
    t(G+8, y+16, 'Tableau électrique → appareils', { fs:10.5, b:true });
    app.forEach((n, i) => t(G+8, y+30+i*12, n.length > 52 ? n.slice(0,50)+'…' : n, { c:K.mut }));
    y += 30 + app.length*12;
  }

  // 6) Terre et légende
  y += 16;
  const gx0 = G+6;
  ligne(gx0, y, gx0, y+10, K.terre, { w:2 }); [0,1,2].forEach(i => ligne(gx0-8+i*3, y+10+i*4, gx0+8-i*3, y+10+i*4, K.terre, { w:2 }));
  t(gx0+16, y+10, 'Terre : cadres des panneaux, onduleur, coffret', { fs:9 });
  y += 30;
  const leg = (x, coul, label, o) => { ligne(x, y, x+22, y, coul, o); t(x+27, y+3.5, label, { fs:8.5 }); };
  leg(G, K.plus, 'Continu +', { w:2 }); leg(G+90, K.moins, 'Continu −', { w:2 }); leg(G+180, K.ac, '230 V alternatif', { w:3 });
  y += 14;
  t(W/2, y+6, `Établi avec SolaDima — sections et protections calculées pour ${c.nom}`, { fs:7.5, a:'middle', c:K.mut });
  y += 14;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${y}" width="${W*2}" height="${y*2}" role="img" aria-label="Schéma de montage de l'installation solaire" style="width:100%;height:auto;background:${K.fond}"><rect width="${W}" height="${y}" fill="${K.fond}"/>${s}</svg>`;
}

/* Plan d'installation : étapes concrètes, avec les valeurs de ce système */
function planInstallation(r){
  const a = r.choisie, c = r.climat, T = SolaCalcul.TECH[r.P.tech];
  const surface = a.pv.N * a.pv.m.w / 205;                     // ≈ 205 Wc par m² pour les panneaux actuels
  const vocC = a.pv.vocF * a.pv.ns, k = a.V/12;
  const ond = a.hyb ? 'l\'onduleur hybride' : a.conv ? 'le convertisseur' : 'les circuits 12 V';
  const cPv = a.cables.find(x => x.lien.startsWith('Panneaux'));
  const etapes = [
    ['Emplacement des panneaux', [
      `Prévoir environ ${nb(surface)} m² de toit ou de terrain sans ombre de 9 h à 16 h, toute l'année (arbres, murs, château d'eau).`,
      `Orienter les panneaux plein sud, inclinés à ${c.angle}° : la pluie et le vent nettoient mieux les panneaux inclinés.`,
      'Laisser au moins 10 cm d\'air sous les panneaux pour les refroidir, et fixer solidement les supports contre les vents de la saison des pluies.'
    ]],
    ['Câblage des panneaux', [
      `Former ${a.pv.np} chaîne(s) de ${a.pv.ns} panneau(x) en série (le + d'un panneau au − du suivant), puis relier les chaînes en parallèle dans la boîte de jonction.`,
      `Avant de brancher, mesurer au multimètre la tension à vide de chaque chaîne : environ ${nb(a.pv.m.voc*a.pv.ns)} V au soleil, jamais plus de ${nb(vocC)} V par temps froid.`,
      cPv ? `Câble solaire ${nb(cPv.S)} mm² (${nb(cPv.L)} m aller), connecteurs MC4 sertis avec la bonne pince, câbles attachés et protégés des UV.` : ''
    ]],
    ['Local technique', [
      `Batteries à l'ombre, dans un local aéré et le plus frais possible, à ${nb(r.P.lBat)} m au plus de ${a.hyb?'l\'onduleur':'l\'appareil'}.`,
      T === SolaCalcul.TECH.gel ? 'Batteries gel : la chaleur réduit fortement leur durée de vie ; ne jamais les poser au soleil ni contre un mur exposé.' : 'Batteries lithium : poser sur un support stable, BMS accessible ; ne pas dépasser 45 °C pendant la charge.',
      `${a.hyb ? 'Onduleur hybride' : 'Régulateur et convertisseur'} fixé(s) au mur, à hauteur des yeux, avec de l'espace autour pour la ventilation.`
    ]],
    ['Ordre de raccordement (important)', [
      '1. Mise à la terre des cadres de panneaux, des supports et de l\'onduleur.',
      `2. Batteries entre elles (${a.bat.series} en série × ${a.bat.par} en parallèle), fusible batterie ouvert.`,
      `3. Câbles batterie vers ${a.hyb?'l\'onduleur hybride':'le régulateur'}${a.conv?' et le convertisseur':''}, en respectant les polarités, puis fermer le fusible batterie.`,
      '4. Panneaux en dernier : brancher avec le sectionneur DC ouvert, puis le fermer. (Un régulateur se branche toujours sur la batterie AVANT les panneaux.)',
      a.hyb || a.conv ? `5. Sortie 230 V vers le tableau à travers le disjoncteur différentiel 30 mA, puis brancher les appareils.` : '5. Brancher les circuits 12 V, chacun avec son fusible.'
    ]],
    ['Réglages', [
      `Choisir le type de batterie « ${a.bat.m.tech==='lithium'?'lithium / LiFePO4':'gel / AGM'} » dans ${a.hyb?'l\'onduleur hybride':'le régulateur'}.`,
      `Tension de charge (absorption) : ${nb(T.vAbs*k)} V ; coupure basse : environ ${nb((a.bat.m.tech==='lithium'?11.6:11.5)*k)} V pour protéger les batteries.`,
      a.hyb && r.P.reseau ? 'Mode de priorité : « solaire d\'abord » (SBU), le réseau ou le groupe seulement quand les batteries sont basses.' : ''
    ]],
    ['Mise en service et contrôles', [
      'Vérifier toutes les polarités et le serrage de chaque cosse (une cosse mal serrée chauffe et peut brûler).',
      'En plein soleil, vérifier que les batteries se chargent et noter le courant de charge.',
      'Appuyer sur le bouton « test » du disjoncteur différentiel : il doit couper.',
      'Expliquer au client l\'écran de l\'appareil, les appareils à éviter le soir, et le nettoyage des panneaux.'
    ]],
    ['Entretien', [
      'Nettoyer les panneaux à l\'eau, sans produit, chaque semaine pendant l\'harmattan et après les vents de sable.',
      'Tous les 6 mois : resserrer les cosses, vérifier les câbles et la fixation des supports.',
      'Surveiller la tension des batteries le matin : une tension basse chaque matin signale une consommation trop forte ou des panneaux sales.'
    ]]
  ];
  return etapes.map(([titre, pts]) => ({ titre, points: pts.filter(Boolean) }));
}
function planHTML(r){
  return planInstallation(r).map(e => `<h4>${esc(e.titre)}</h4><ul>${e.points.map(p => `<li>${esc(p)}</li>`).join('')}</ul>`).join('');
}
