/* calcul.js — moteur de dimensionnement de SolaDima (aucun accès à la page : testable seul).
   Méthode : bilan énergétique au mois le plus défavorable (données PVGIS par ville), chaîne de
   rendements explicite, contrôles électriques (tensions des chaînes de panneaux à chaud et à froid,
   courants des batteries, câbles, protections), comparaison de quatre architectures.
   Toutes les énergies sont en Wh/jour, les puissances en W, les courants en A. */
(function(G){
'use strict';
const CL = G.CLIMAT || (typeof require === 'function' ? require('./climat.js') : []);

/* ------------------------------------------------------------------
   Constantes physiques et hypothèses (justifiées dans la note de calcul)
   ------------------------------------------------------------------ */
const JOURS_MOIS = [31,28,31,30,31,30,31,31,30,31,30,31];
const MOIS = ['Jan','Fév','Mar','Avr','Mai','Juin','Juil','Août','Sep','Oct','Nov','Déc'];
// Par tranche de 12 V : tension d'absorption, tension moyenne en charge, tension basse sous forte charge.
const TECH = {
  lithium: { nom:'Lithium (LiFePO4)', dod:0.80, eta:0.95, vieil:0.90, vAbs:14.2, vCh:13.4, vMin:12.0, cycles:4000, dodRef:0.8, vieCal:12, seriesMax:4, parMax:4 },
  gel:     { nom:'Gel / AGM',         dod:0.50, eta:0.85, vieil:0.80, vAbs:14.4, vCh:13.2, vMin:11.5, cycles:1000, dodRef:0.5, vieCal:8,  seriesMax:4, parMax:3 }
};
const H_JOUR = 12, H_NUIT = 12;     // répartition de la consommation à vide des onduleurs
const PART_JOUR_BATT = 0.30;        // part de la consommation « de jour » qui passe quand même par la batterie (matin, soir, nuages)
const JOURS_RECHARGE = 7;           // jours pour reconstituer la réserve d'autonomie après un épisode nuageux
const DECLASSEMENT_OND = 0.85;      // un onduleur ne tient pas durablement 100 % de sa puissance par 40 °C
const DT_CELLULE = 30;              // échauffement des cellules au-dessus de l'air en plein soleil (°C)
const K_CRETE = 0.85;               // puissance de crête réelle des panneaux / puissance STC (chaleur)
const ETA_MPPT = 0.96, ETA_CHARGEUR = 0.90;
const RHO_CU = 0.0225;              // résistivité du cuivre chaud (Ω·mm²/m)
// Courants admissibles (A), cuivre isolé PVC, 2 conducteurs chargés, pose apparente (CEI 60364-5-52, méthode C), à 30 °C
const IZ = { 1.5:19.5, 2.5:27, 4:36, 6:46, 10:63, 16:85, 25:112, 35:138, 50:168, 70:213, 95:258, 120:299 };
const K_TEMP_CABLE = 0.87;
// Aluminium : même méthode de pose (CEI 60364-5-52, méthode C, PVC, 30 °C) ; résistivité à chaud
const IZ_AL = { 2.5:21, 4:28, 6:36, 10:49, 16:66, 25:83, 35:103, 50:125, 70:160, 95:195, 120:226 };
const RHO_AL = 0.036;          // correction pour 40 °C ambiant (PVC)
const SECTIONS = Object.keys(IZ).map(Number).sort((a,b)=>a-b);
const CALIBRES_DC = [10,16,20,25,32,40,50,63,80,100,125,160,200,250,300,400];
const CALIBRES_AC = [10,16,20,25,32,40,50,63];
const CALIBRES_PV = [10,12,15,16,20,25,32];
// Estimations internes (F CFA) servant UNIQUEMENT à classer les solutions quand un prix manque.
// Ils incluent la part de pose propre à chaque unité (support et pose d'un panneau, câblage d'un régulateur…).
const PRIX_INDICATIF = {
  panneau: m => m.w*(m.w<=220 ? 200 : m.w<=380 ? 140 : 115),
  batterie: m => (m.tech==='lithium'?300:110)*m.v*m.ah + 5000,
  regulateur: m => (m.techno==='pwm'?600:2500)*m.a + 15000, convertisseur: m => (m.onde==='modifie'?50:90)*m.w,
  hybride: m => 110*m.w, cable: m => (m.metal==='aluminium' ? 70 : 150)*m.section, protection: () => 8000, autre: () => 0
};

const cls = v => v < 18 ? 12 : (v < 36 ? 24 : 48);
const sum = a => a.reduce((s,x)=>s+x, 0);
const vFr = v => String(v).replace('.', ',');
// Coût de pose propre à chaque panneau ou batterie (supports, cosses…) : articles « autres » ajoutés par panneau / par batterie,
// ou une estimation si l'utilisateur n'en a pas chiffré. Sans lui, le classement favoriserait les petits panneaux.
function surcout(mat, auto, defaut){ const p = mat.filter(m => m.type==='autre' && m.auto===auto).reduce((s,m)=>s+(m.prix||0),0); return p > 0 ? p : defaut; }
const cout = m => (m && m.prix > 0) ? m.prix : (m ? (PRIX_INDICATIF[m.type]||(()=>0))(m) : 0);

function nomAuto(m){
  switch(m.type){
    case 'panneau': return `Panneau solaire ${m.w} Wc${m.cellules===36?' (12 V, 36 cellules)':''}`;
    case 'batterie': return `Batterie ${m.tech==='lithium'?'lithium LiFePO4':'gel / AGM'} ${vFr(m.v)} V ${m.ah} Ah`;
    case 'regulateur': return `Régulateur solaire ${m.techno==='pwm'?'PWM':'MPPT'} ${m.a} A${m.techno==='mppt'?` (${m.vocMax} V max)`:''}`;
    case 'convertisseur': return `Convertisseur ${m.onde==='modifie'?'onde modifiée':'pur sinus'} ${m.w} W ${m.v} V`;
    case 'hybride': return `Onduleur hybride ${m.w} W ${m.v} V pur sinus (MPPT ${m.pvMax} W intégré)`;
    case 'cable': {
      const al = m.metal==='aluminium', rig = m.ame==='rigide';
      const ref = m.usage==='pv' ? 'H1Z2Z2-K' : al ? 'AR2V' : m.usage==='dc' ? 'H07RN-F' : rig ? 'H07V-U / R2V' : 'H07V-K';
      return `Câble ${m.usage==='pv'?'solaire':m.usage==='ac'?'230 V':'batterie'} ${al?'aluminium':(m.usage==='pv'?'cuivre étamé':'cuivre')} ${rig?'rigide':'souple'} ${vFr(m.section)} mm² (${ref}, le mètre)`; }
    case 'protection': return ({
      fusible_dc:`Fusible / disjoncteur DC ${m.calibre} A (batterie)`, sect_pv:`Interrupteur-sectionneur DC ${m.calibre} A (panneaux)`,
      fusible_pv:`Fusible de chaîne PV ${m.calibre} A`, parafoudre_pv:`Parafoudre DC panneaux ${m.vmax} V`,
      disj_ac:`Disjoncteur différentiel 30 mA ${m.calibre} A`, terre:'Kit de mise à la terre (piquet, câble)' })[m.genre] || 'Protection';
    default: return m.nom || 'Article';
  }
}

/* ------------------------------------------------------------------ Climat */
function climat(ville){
  return CL.find(c => c.nom === ville) || CL.find(c => c.nom === "N'Djaména") || CL[0];
}
// Énergie au bus continu par Wc et par jour, pour chaque mois (panneaux + MPPT)
function rendementMPPT(c, P){
  return c.H.map((h,i) => h * c.fT[i] * (1-P.poussiere) * (1-P.pertesDc) * ETA_MPPT);
}
function temperaturesCellule(c){
  return { tcMax: Math.max(...c.tMax) + DT_CELLULE, tcMin: Math.min(...c.tMin) - 2 };
}
function tensionsPanneau(p, c){
  const { tcMax, tcMin } = temperaturesCellule(c);
  return { vocF: p.voc*(1 + p.bVoc/100*(tcMin-25)), vmpC: p.vmp*(1 + p.gP/100*(tcMax-25)), tcMax, tcMin };
}

/* ------------------------------------------------------------------ Besoins */
function besoins(appareils, P){
  let Ej=0, En=0, Pinst=0, Pcont=0, Pponct=0, tout12=true, moteur=false, n=0;
  const L = [];
  (appareils||[]).forEach(a => {
    const q=+a.qte||0, w=+a.w||0, hj=+a.hJ||0, hn=+a.hN||0, k=Math.max(1,+a.dem||1);
    if(q<=0 || w<=0) return;
    n++; Ej += q*w*hj; En += q*w*hn; Pinst += q*w;
    if(a.ponctuel) Pponct = Math.max(Pponct, w); else Pcont += q*w;
    if(!a.dc12) tout12 = false;
    if(k > 1.05) moteur = true;
    L.push({ q, w, k, ponctuel:!!a.ponctuel });
  });
  const base = Pcont * P.simul, Ppointe = base + Pponct;
  // Démarrage : le plus gros appel au démarrage, un seul moteur démarrant à la fois
  let Pstart = Ppointe;
  L.forEach(x => {
    const s = x.ponctuel ? base + x.k*x.w : Ppointe + (x.k-1)*x.w;
    Pstart = Math.max(Pstart, s);
  });
  return { vide: n===0 || Ej+En<=0, E:Ej+En, Ej, En, Pinst, Pcont, Pponct, Ppointe, Pstart, tout12, moteur };
}

/* Chaîne énergétique : énergie demandée au bus continu (Wh/jour) */
function chaine(B, eta, idle){
  const EjDC = B.Ej/eta + idle*H_JOUR, EnDC = B.En/eta + idle*H_NUIT;
  return { EjDC, EnDC, Etot: EjDC+EnDC, Ebat: EnDC + PART_JOUR_BATT*EjDC, Edir: (1-PART_JOUR_BATT)*EjDC, idleWh: idle*24 };
}

/* ------------------------------------------------------------------ Batteries */
function choisirBatteries(mat, tech, V, nomReq, Idech, Ich){
  const T = TECH[tech], res = [];
  mat.filter(m => m.type==='batterie' && m.tech===tech && m.v>0 && m.ah>0).forEach(m => {
    const c = cls(m.v); if(c > V || V % c) return;
    const series = V / c; if(series > T.seriesMax) return;
    const parE = Math.ceil(nomReq / (series*m.v*m.ah));
    const parI = m.iDech>0 ? Math.ceil(Idech / m.iDech) : 1;
    const parC = m.iCh>0 ? Math.ceil(Ich / m.iCh) : 1;
    const par = Math.max(1, parE, parI, parC), units = series*par;
    res.push({ m, series, par, units, Wh: units*m.v*m.ah, Ah: par*m.ah, cle: units*cout(m), parE, parI, parC });
  });
  // On écarte d'abord les montages avec trop de rangées en parallèle, s'il existe une autre solution
  res.sort((a,b) => (a.par>T.parMax)-(b.par>T.parMax) || a.cle-b.cle || a.units-b.units);
  return res[0] || null;
}

/* ------------------------------------------------------------------ Panneaux */
// Chaîne MPPT : nombre de panneaux en série dans [nsMin, nsMax], minimise le nombre total de panneaux.
function configMPPT(p, WcReq, nsMin, nsMax){
  if(nsMin < 1) nsMin = 1;
  if(nsMin > nsMax) return null;
  const Nreq = Math.max(1, Math.ceil(WcReq / p.w));
  let best = null;
  for(let ns=nsMin; ns<=nsMax; ns++){
    const np = Math.ceil(Nreq/ns), N = ns*np;
    if(!best || N < best.N || (N===best.N && ns > best.ns)) best = { ns, np, N, Wc: N*p.w };
  }
  return best;
}

/* ------------------------------------------------------------------ Câbles et protections */
function sectionCable(I, L, V, dvMax, calibre){
  // Section minimale : chute de tension (aller-retour) ET courant admissible ≥ calibre de la protection
  const sDv = 2*RHO_CU*L*I / (dvMax*V);
  const S = SECTIONS.find(s => s >= sDv && IZ[s]*K_TEMP_CABLE >= Math.max(I, calibre||0)) || SECTIONS[SECTIONS.length-1];
  return { S, dv: 2*RHO_CU*L*I/(S*V), Iz: IZ[S]*K_TEMP_CABLE };
}
/* Choix du câble dans le catalogue : le moins cher qui respecte la chute de tension et tient le calibre de la
   protection, compte tenu de son métal. Côté panneaux et batterie, seul le cuivre souple est admis (cosses,
   vibrations, corrosion de l'aluminium sur les bornes) ; côté 230 V, cuivre ou aluminium, souple ou rigide. */
function cableAdmis(m, usage){ return usage==='ac' || ((m.ame||'souple')==='souple' && (m.metal||'cuivre')==='cuivre'); }
function choisirCable(mat, usage, I, L, V, dvMax, calibre, sMin){
  const ok = (mat||[]).filter(m => m.type==='cable' && m.usage===usage && m.section >= (sMin||0) && cableAdmis(m, usage)).map(m => {
    const al = m.metal==='aluminium', iz = (al ? IZ_AL : IZ)[m.section]; if(!iz) return null;
    const dv = 2*(al ? RHO_AL : RHO_CU)*L*I/(m.section*V);
    return (dv <= dvMax && iz*K_TEMP_CABLE >= Math.max(I, calibre||0)) ? { m, S:m.section, dv, cle:cout(m) } : null;
  }).filter(Boolean).sort((a,b) => a.cle-b.cle || a.S-b.S);
  if(ok.length) return ok[0];
  const S = Math.max(sMin||0, sectionCable(I, L, V, dvMax, calibre).S);
  return { m:{ type:'cable', usage, section:S, ame: usage==='ac'?'rigide':'souple', metal:'cuivre', prix:0 }, S, dv: 2*RHO_CU*L*I/(S*V) };
}
const calibreSup = (I, liste) => liste.find(c => c >= I) || liste[liste.length-1];

function cablesProtections(r, P, c, mat){
  const cab = [], prot = [], V = r.V, T = TECH[P.tech];
  // 1) Panneaux → régulateur / onduleur hybride (par entrée)
  const pv = r.pv, nEntrees = r.reg ? r.reg.n : 1, npE = Math.ceil(pv.np / nEntrees);
  const Ipv = 1.25 * pv.m.isc * npE, Vpv = pv.m.vmp * pv.ns;
  const cPv = choisirCable(mat, 'pv', Ipv, P.lPv, Vpv, 0.03, 0, 4);
  cab.push({ lien:'Panneaux → ' + (r.hyb ? 'onduleur hybride' : 'régulateur'), usage:'pv', I:Ipv, L:P.lPv, S:cPv.S, dv:cPv.dv, m:cPv.m, n:nEntrees });
  const vocChaine = tensionsPanneau(pv.m, c).vocF * pv.ns;
  prot.push({ genre:'sect_pv', calibre: calibreSup(Ipv, CALIBRES_PV.concat([40,50,63])), vmin: vocChaine, n:nEntrees, pourquoi:'Couper les panneaux pour intervenir en sécurité' });
  prot.push({ genre:'parafoudre_pv', calibre:0, vmin: vocChaine*1.2, n:nEntrees, pourquoi:'Orages fréquents en saison des pluies' });
  if(npE >= 3){
    const If = CALIBRES_PV.find(x => x >= 1.5*pv.m.isc && x <= 2.4*pv.m.isc) || calibreSup(1.5*pv.m.isc, CALIBRES_PV);
    prot.push({ genre:'fusible_pv', calibre: If, vmin: vocChaine, n: npE*nEntrees, pourquoi:'3 chaînes ou plus en parallèle : protège chaque chaîne d\'un retour de courant (CEI 62548)' });
  }
  // 2) Régulateur → batterie
  if(r.reg){
    const I = r.reg.m.a, cal = calibreSup(1.25*I, CALIBRES_DC), s = choisirCable(mat, 'dc', I, Math.max(1, P.lBat), V, 0.015, cal);
    cab.push({ lien:'Régulateur → batterie', usage:'dc', I, L:Math.max(1,P.lBat), S:s.S, dv:s.dv, m:s.m, n:r.reg.n });
    prot.push({ genre:'fusible_dc', calibre:cal, n:r.reg.n, pourquoi:'Protège le câble régulateur–batterie' });
  }
  // 3) Batterie → onduleur / convertisseur, ou départ des circuits 12 V
  const ond = r.hyb || r.conv;
  if(ond){
    const Imax = ond.m.w / (ond.m.eta * T.vMin * V/12);       // courant continu à pleine puissance, batterie basse
    const cal = calibreSup(1.25*Imax, CALIBRES_DC), s = choisirCable(mat, 'dc', Imax, P.lBat, V, 0.02, cal);
    cab.push({ lien:'Batterie → ' + (r.hyb?'onduleur hybride':'convertisseur'), usage:'dc', I:Imax, L:P.lBat, S:s.S, dv:s.dv, m:s.m, n:1 });
    prot.push({ genre:'fusible_dc', calibre:cal, n:1, pourquoi:'Fusible au plus près de la borne + de la batterie' });
    const Iac = ond.m.w / 230, calAc = calibreSup(Iac, CALIBRES_AC), sAc = choisirCable(mat, 'ac', Iac, P.lAc, 230, 0.03, calAc, 1.5);
    cab.push({ lien:'Sortie 230 V → tableau', usage:'ac', I:Iac, L:P.lAc, S:sAc.S, dv:sAc.dv, m:sAc.m, n:1 });
    prot.push({ genre:'disj_ac', calibre:calAc, n:1, pourquoi:'Protection des personnes (différentiel 30 mA) et du circuit 230 V' });
  } else {
    const I = r.besoins.Ppointe / (T.vMin), cal = calibreSup(1.25*I, CALIBRES_DC), s = choisirCable(mat, 'dc', I, P.lAc, 12, 0.03, cal);
    cab.push({ lien:'Batterie → circuits 12 V', usage:'dc', I, L:P.lAc, S:s.S, dv:s.dv, m:s.m, n:1 });
    prot.push({ genre:'fusible_dc', calibre:cal, n:1, pourquoi:'Fusible général des circuits 12 V' });
  }
  prot.push({ genre:'terre', calibre:0, n:1, pourquoi:'Mise à la terre des cadres de panneaux et de l\'onduleur' });
  return { cables: cab, protections: prot };
}

/* ------------------------------------------------------------------ Contrôles batterie */
function controlesBatterie(bat, T, tech, Ich, Idech, out){
  if(!bat) return;
  if(bat.par > T.parMax) out.warns.push(`${bat.par} rangées de batteries en parallèle : au-delà de ${T.parMax}, les batteries se déséquilibrent. Préférez des batteries plus grosses ou une tension plus haute.`);
  if(bat.parI > bat.parE) out.infos.push(`Batteries ajoutées pour tenir le courant de décharge (${Math.round(Idech)} A) et non pour l'énergie.`);
  if(bat.parC > bat.parE && bat.parC >= bat.parI) out.infos.push(`Batteries ajoutées pour accepter le courant de charge des panneaux (${Math.round(Ich)} A).`);
  if(tech==='gel'){
    const tauxC = Ich / bat.Ah;
    if(tauxC < 0.05) out.warns.push(`Courant de charge faible (${(tauxC*100).toFixed(0)} % de la capacité) : les batteries gel risquent de ne jamais se recharger complètement et de se sulfater. Ajoutez des panneaux.`);
  }
}

/* ------------------------------------------------------------------ Les architectures */
function besoinBus(ch, T, P, autonome){
  const rec = autonome ? P.aut * ch.Etot / JOURS_RECHARGE / T.eta : 0;
  const net = ch.Edir + ch.Ebat / T.eta + rec;
  return { net, avecMarge: net * (1 + P.marge), rec };
}

function nouveauResultat(id, nom){ return { id, nom, faisable:false, raisons:[], warns:[], infos:[], lignes:[] }; }

function finaliser(r, B, P, c, mat, ch, T, Y, Breq, prodMois){
  r.besoins = B; r.chaine = ch; r.besoinNet = Breq.net; r.besoinMarge = Breq.avecMarge;
  r.prodMois = prodMois;                                    // Wh/jour au bus continu
  r.couverture = prodMois.map(x => x / Breq.net);
  r.moisCritique = r.couverture.indexOf(Math.min(...r.couverture));
  r.prodAn = sum(prodMois.map((x,i)=>x*JOURS_MOIS[i]))/1000;
  r.surplusAn = sum(prodMois.map((x,i)=>Math.max(0,x-Breq.net)*JOURS_MOIS[i]))/1000;
  r.deficitMois = prodMois.map((x,i)=>Math.max(0,Breq.net - x)*JOURS_MOIS[i]/1000);
  const cp = cablesProtections(r, P, c, mat); r.cables = cp.cables; r.protections = cp.protections;
  r.lignes = lignes(r, mat);
  r.total = sum(r.lignes.map(l => l.qte*l.pu));
  r.prixComplet = r.lignes.every(l => l.pu > 0);
  r.cle = sum(r.lignes.map(l => l.qte*(l.pu || l.puIndicatif || 0)));
  r.faisable = true;
  return r;
}

// Architecture 1 : kit 12 V en courant continu, sans onduleur
function kit12V(B, P, c, mat){
  const r = nouveauResultat('kit12', 'Kit 12 V sans onduleur'), T = TECH[P.tech], V = 12;
  r.description = 'Panneaux, régulateur et batterie 12 V ; les appareils fonctionnent directement en 12 V (aucun onduleur).';
  if(!B.tout12) r.raisons.push('Certains appareils n\'existent pas en 12 V (cochez « existe en 12 V » si c\'est le cas).');
  if(B.Ppointe > 400) r.raisons.push(`Puissance trop forte pour du 12 V (${Math.round(B.Ppointe)} W ; limite pratique 400 W).`);
  if(B.E > 2000) r.raisons.push(`Consommation trop forte pour un kit 12 V (${(B.E/1000).toFixed(1)} kWh/jour ; limite pratique 2 kWh).`);
  if(P.vsys !== 'auto' && +P.vsys !== 12) r.raisons.push('Tension imposée différente de 12 V.');
  if(r.raisons.length) return r;
  const ch = chaine(B, 1/(1+0.02), 0);                    // 2 % de pertes dans les câbles 12 V
  return avecRegulateur(r, B, P, c, mat, ch, T, V, null);
}

// Architecture 2 : régulateur + convertisseur séparé
function regulateurConvertisseur(B, P, c, mat){
  const r = nouveauResultat('regconv', 'Régulateur + convertisseur'), T = TECH[P.tech];
  r.description = 'Panneaux → régulateur (PWM ou MPPT) → batteries → convertisseur séparé 230 V (pur sinus de préférence).';
  const Vs = P.vsys==='auto' ? [12,24,48] : [+P.vsys];
  let best = null; const echecs = new Set();
  Vs.forEach(V => {
    const aptes = mat.filter(m => m.type==='convertisseur' && cls(m.v)===V && m.w>0)
      .filter(m => (B.moteur ? m.onde!=='modifie' : true))
      .filter(m => m.w*DECLASSEMENT_OND >= B.Ppointe && m.w*(m.surge||2) >= B.Pstart);
    // Pur sinus en priorité : l'onde modifiée n'est retenue que si aucun pur sinus ne convient
    const purs = aptes.filter(m => m.onde!=='modifie');
    const convs = (purs.length ? purs : aptes).sort((a,b) => cout(a)-cout(b));
    if(!convs.length){ echecs.add(V); return; }
    const conv = convs[0];
    const cand = avecRegulateur(nouveauResultat(r.id, r.nom), B, P, c, mat, chaine(B, conv.eta||0.9, conv.idle||10), T, V, { m:conv, n:1 });
    if(cand.faisable && (!best || cand.cle < best.cle)) best = cand;
  });
  if(best){ best.description = r.description; if(best.conv.m.onde==='modifie') best.warns.push('Convertisseur à onde modifiée : déconseillé pour les moteurs, frigos et chargeurs d\'ordinateur. Préférez un pur sinus.'); return best; }
  r.raisons.push(echecs.size===Vs.length
    ? `Aucun convertisseur ${B.moteur?'pur sinus ':''}de votre matériel ne tient ${Math.ceil(B.Ppointe/DECLASSEMENT_OND)} W en continu et ${Math.ceil(B.Pstart)} W au démarrage.`
    : 'Aucune combinaison panneaux + régulateur + batteries compatible dans votre matériel.');
  return r;
}

// Partie commune aux architectures avec régulateur séparé
function avecRegulateur(r, B, P, c, mat, ch, T, V, conv){
  const k = V/12, Y = rendementMPPT(c, P), Breq = besoinBus(ch, T, P, true);
  const regs = mat.filter(m => m.type==='regulateur' && m.a>0 && (m.tensions||[12,24,48]).includes(V));
  const pans = mat.filter(m => m.type==='panneau' && m.w>0 && m.voc>0 && m.vmp>0);
  let best = null;
  regs.forEach(reg => pans.forEach(p => {
    const t = tensionsPanneau(p, c);
    let ns, np, Ich, mode = reg.techno==='pwm' ? 'PWM' : 'MPPT', ratio = 1;
    // Production d'UNE chaîne de panneaux, au bus continu, pour chaque mois (Wh/jour)
    let parChaine;
    if(mode==='PWM'){
      // Le PWM impose la tension de la batterie aux panneaux : P ≈ Imp × V batterie (le courant suit l'ensoleillement)
      ns = Math.ceil((T.vCh*k + 1.0) / t.vmpC);
      if(ns*t.vocF > reg.vocMax) return;
      parChaine = c.H.map(h => h * p.imp * T.vCh*k * (1-P.poussiere) * (1-P.pertesDc));
      np = Math.ceil(Breq.avecMarge / Math.min(...parChaine));
      ratio = (p.imp*T.vCh*k) / (p.imp*p.vmp*ns);
      Ich = 1.25 * np * p.isc;
    } else {
      const nsMin = Math.ceil((T.vCh*k + 3) / t.vmpC), nsMax = Math.floor(0.97*reg.vocMax / t.vocF);
      const cfg = configMPPT(p, Breq.avecMarge / Math.min(...Y), nsMin, nsMax);
      if(!cfg) return;
      ({ ns, np } = cfg);
      parChaine = Y.map(y => y * ns * p.w);
      Ich = np * ns * p.w * K_CRETE * ETA_MPPT / (T.vCh*k);
    }
    const nReg = Math.ceil(Ich / reg.a);
    if(nReg > 4) return;
    if(nReg > np) np = nReg;                       // au moins une chaîne par régulateur
    const N = ns*np, Wc = N*p.w, prodMois = parChaine.map(x => x*np);
    const IchBatt = Math.min(Ich, nReg*reg.a);
    const Idech = conv ? B.Ppointe / ((conv.m.eta||0.9) * T.vMin * k) : B.Ppointe / (T.vMin*k);
    const usable = ch.Ebat + P.aut*ch.Etot, nomReq = usable / (T.dod*T.vieil);
    const bat = choisirBatteries(mat, P.tech, V, nomReq, Idech, IchBatt);
    if(!bat) return;
    const cle = N*(cout(p)+surcout(mat,'panneaux',15000)) + nReg*cout(reg) + bat.units*(cout(bat.m)+surcout(mat,'batteries',0)) + (conv?cout(conv.m):0);
    if(!best || cle < best.cle) best = { cle, V, pv:{ m:p, ns, np, N, Wc, mode, ratio, ...t }, reg:{ m:reg, n:nReg, Ich }, bat:{ ...bat, usable, nomReq, Idech, Ich:IchBatt }, prodMois };
  }));
  if(!best){ r.raisons.push(`Aucune combinaison panneaux + régulateur + batteries ${P.tech==='lithium'?'lithium':'gel'} en ${V} V dans votre matériel.`); return r; }
  Object.assign(r, { V:best.V, pv:best.pv, reg:best.reg, bat:best.bat, conv });
  if(best.pv.mode==='PWM' && best.pv.ratio < 0.7)
    r.warns.push(`Régulateur PWM avec des panneaux de ${best.pv.m.w} Wc : seulement ${Math.round(best.pv.ratio*100)} % de leur puissance est utilisée. Un régulateur MPPT ou des panneaux 12 V (36 cellules) feraient mieux.`);
  controlesBatterie(best.bat, T, P.tech, best.bat.Ich, best.bat.Idech, r);
  return finaliser(r, B, P, c, mat, ch, T, Y, Breq, best.prodMois);
}

// Architectures 3 et 4 : onduleur hybride tout-en-un (avec ou sans secours réseau / groupe)
function hybride(B, P, c, mat, secours){
  const r = nouveauResultat(secours ? 'secours' : 'hybride', secours ? 'Hybride + réseau SNE ou groupe' : 'Onduleur hybride tout-en-un');
  r.description = secours
    ? 'Onduleur hybride ; le réseau ou le groupe recharge les batteries et prend le relais quand le soleil ne suffit pas.'
    : 'Un seul appareil : régulateur MPPT, chargeur et onduleur à sortie pur sinus. Pas de régulateur ni de convertisseur à acheter en plus.';
  if(secours && !P.reseau){ r.raisons.push('Le client n\'a ni réseau SNE ni groupe électrogène (réglage « Secours disponible »).'); return r; }
  const T = TECH[P.tech], Y = rendementMPPT(c, P), Ydim = secours ? sum(Y)/12 : Math.min(...Y);
  const hybs = mat.filter(m => m.type==='hybride' && m.w>0 && (P.vsys==='auto' || cls(m.v)===+P.vsys));
  const okP = hybs.filter(h => h.w*DECLASSEMENT_OND >= B.Ppointe && h.w*(h.surge||2) >= B.Pstart);
  if(!okP.length){ r.raisons.push(`Aucun onduleur hybride de votre matériel ne tient ${Math.ceil(B.Ppointe/DECLASSEMENT_OND)} W en continu et ${Math.ceil(B.Pstart)} W au démarrage.`); return r; }
  const pans = mat.filter(m => m.type==='panneau' && m.w>0 && m.voc>0 && m.vmp>0);
  let best = null; const pb = new Set();
  okP.forEach(h => {
    const V = cls(h.v), k = V/12, ch = chaine(B, h.eta||0.92, h.idle||40), Breq = besoinBus(ch, T, P, !secours);
    pans.forEach(p => {
      const t = tensionsPanneau(p, c);
      const nsMin = Math.ceil(h.mpptMin / t.vmpC), nsMax = Math.min(Math.floor(0.97*h.vocMax / t.vocF), Math.floor(h.mpptMax / p.vmp));
      const cfg = configMPPT(p, Breq.avecMarge / Ydim, nsMin, nsMax);
      if(!cfg){ pb.add('tension'); return; }
      if(cfg.Wc > h.pvMax){ pb.add('pvmax'); return; }
      const IchPv = cfg.Wc * K_CRETE * ETA_MPPT / (T.vCh*k), Ich = Math.min(IchPv, h.iCharge||IchPv);
      // Le courant de charge maxi doit permettre de remplir la batterie dans la journée du mois critique
      const IchBesoin = (ch.Ebat/T.eta + (secours?0:P.aut*ch.Etot/JOURS_RECHARGE/T.eta)) / Math.min(...c.H) / (T.vCh*k);
      if(h.iCharge && IchBesoin > h.iCharge){ pb.add('charge'); return; }
      const Idech = B.Ppointe / ((h.eta||0.92) * T.vMin * k);
      let usable = ch.Ebat + (secours ? 0 : P.aut*ch.Etot);
      if(secours){
        const hc = Math.max(0, +P.coupure||0), eCoupure = ch.EnDC*Math.min(hc,12)/12 + (hc>12 ? ch.EjDC*(hc-12)/12 : 0);
        usable = Math.max(usable, eCoupure);
      }
      const nomReq = usable / (T.dod*T.vieil);
      const bat = choisirBatteries(mat, P.tech, V, nomReq, Idech, Ich);
      if(!bat){ pb.add('batterie'); return; }
      const cle = cfg.N*(cout(p)+surcout(mat,'panneaux',15000)) + bat.units*(cout(bat.m)+surcout(mat,'batteries',0)) + cout(h);
      if(!best || cle < best.cle) best = { cle, V, h, ch, Breq, pv:{ m:p, ...cfg, mode:'MPPT', ratio:1, ...t }, bat:{ ...bat, usable, nomReq, Idech, Ich }, prodMois: Y.map(y => y*cfg.Wc) };
    });
  });
  if(!best){
    r.raisons.push(pb.has('pvmax') ? 'Les panneaux nécessaires dépassent la puissance solaire maximale des onduleurs hybrides de votre matériel.'
      : pb.has('charge') ? 'Le courant de charge des onduleurs hybrides de votre matériel est trop faible pour remplir les batteries.'
      : pb.has('tension') ? 'Aucun panneau de votre matériel ne donne une tension compatible avec l\'entrée solaire des onduleurs hybrides.'
      : 'Aucune batterie compatible avec la tension des onduleurs hybrides de votre matériel.');
    return r;
  }
  Object.assign(r, { V:best.V, hyb:{ m:best.h, n:1 }, pv:best.pv, bat:best.bat });
  controlesBatterie(best.bat, T, P.tech, best.bat.Ich, best.bat.Idech, r);
  const res = finaliser(r, B, P, c, mat, best.ch, T, Y, best.Breq, best.prodMois);
  if(secours){
    res.appointAn = sum(res.deficitMois) / ETA_CHARGEUR;     // kWh/an fournis par le réseau ou le groupe
    res.infos.push(`Le réseau ou le groupe fournira environ ${Math.round(res.appointAn)} kWh par an, surtout en saison des pluies.`);
  }
  return res;
}

/* ------------------------------------------------------------------ Lignes du devis */
function trouver(mat, type, filtre, tri){ return mat.filter(m => m.type===type && filtre(m)).sort(tri)[0]; }
function ligne(m, qte, cle){ return { des: m.nom || nomAuto(m), qte, pu: m.prix||0, puIndicatif: m.prix>0 ? 0 : cout(m), cle, id: m.id||null }; }
function lignes(r, mat){
  const L = [];
  L.push(ligne(r.pv.m, r.pv.N, 'pv'));
  L.push(ligne(r.bat.m, r.bat.units, 'bat'));
  if(r.hyb) L.push(ligne(r.hyb.m, 1, 'hyb'));
  if(r.reg) L.push(ligne(r.reg.m, r.reg.n, 'reg'));
  if(r.conv) L.push(ligne(r.conv.m, 1, 'conv'));
  // Câbles : regroupés par usage et section, longueur aller + retour, +10 % de chutes
  const parCable = new Map();
  (r.cables||[]).forEach(cb => { const k = cb.m.id || nomAuto(cb.m); const x = parCable.get(k) || { m:cb.m, metres:0 }; x.metres += 2*cb.L*cb.n*1.1; parCable.set(k, x); });
  parCable.forEach(({ m, metres }) => L.push(ligne(m, Math.ceil(metres), 'cable')));
  (r.protections||[]).forEach(p => {
    const m = trouver(mat, 'protection', x => x.genre===p.genre && (x.calibre||0) >= (p.calibre||0) && (!p.vmin || (x.vmax||1e9) >= p.vmin),
                      (a,b) => (a.calibre||0)-(b.calibre||0) || (a.vmax||0)-(b.vmax||0))
           || { type:'protection', genre:p.genre, calibre:p.calibre, vmax: p.vmin ? (p.vmin<=600?600:1000) : 0, prix:0 };
    const ex = L.find(l => l.cle==='prot' && l.des===(m.nom||nomAuto(m)));
    if(ex) ex.qte += p.n; else L.push(ligne(m, p.n, 'prot'));
  });
  mat.filter(m => m.type==='autre').forEach(m => {
    const q = m.auto==='un' ? 1 : m.auto==='panneaux' ? r.pv.N : m.auto==='batteries' ? r.bat.units : 0;
    if(q > 0) L.push(ligne(m, q, 'autre'));
  });
  return L;
}

/* ------------------------------------------------------------------ Comparaison avec un groupe électrogène */
const KVA_STD = [1, 2, 2.5, 3, 3.5, 5, 6.5, 8, 10, 12, 15, 20, 30];
function economie(r, P, E){
  if(!r || !r.faisable) return null;
  const B = r.besoins, T = TECH[P.tech], an = 10;
  const kvaReq = Math.max(B.Ppointe / 0.8 / 0.8, B.Pstart / 0.8 / 1.5);    // charge ≤ 80 %, surcharge de démarrage 150 %
  const kva = KVA_STD.find(x => x >= kvaReq/1000) || Math.ceil(kvaReq/1000);
  const carbu = kva <= 8 ? 'essence' : 'gasoil';
  const F0 = carbu==='essence' ? 0.13 : 0.08, F1 = carbu==='essence' ? 0.42 : 0.25;   // L/h par kW nominal, L par kWh produit
  const kw = kva*0.8, h = Math.max(1, +E.heuresGroupe||8);
  const litresJour = F0*kw*h + F1*B.E/1000;
  const prixL = carbu==='essence' ? E.prixEssence : E.prixGasoil;
  const carburantAn = litresJour*365*prixL, entretienAn = h*365*E.entretienHeure;
  const vieGroupeH = carbu==='essence' ? 4000 : 15000;
  const groupes = Math.ceil(h*365*an / vieGroupeH);
  const prixGroupe = E.prixGroupeKva * kva;
  // Durée de vie des batteries : nombre de cycles à la profondeur réelle, et vieillissement accéléré par la chaleur (gel)
  const dodReel = Math.min(1, r.chaine.Ebat / r.bat.Wh) || T.dod;   // profondeur du cycle quotidien réel
  const cyclesAns = T.cycles * T.dodRef / Math.max(0.1, dodReel) / 365;
  const tBatt = sum(climat(P.ville).tMoy)/12 + 3;
  const calendaire = P.tech==='gel' ? T.vieCal / Math.pow(2, Math.max(0, tBatt-25)/10) : T.vieCal;
  const vieBatt = Math.max(1, Math.min(cyclesAns, calendaire));
  const ligneBat = r.lignes.find(l => l.cle==='bat'), coutBat = ligneBat ? ligneBat.qte*ligneBat.pu : 0;
  const invest = r.total, entretienSol = 0.01*invest;
  const appoint = r.appointAn ? r.appointAn * (E.prixKwhAppoint||0) : 0;
  const solaire = [invest], groupe = [prixGroupe];
  for(let y=1; y<=an; y++){
    const remplBatt = Math.floor(y / vieBatt) - Math.floor((y-1) / vieBatt);
    solaire.push(solaire[y-1] + entretienSol + appoint + remplBatt*coutBat);
    const remplGroupe = Math.floor(y*h*365 / vieGroupeH) - Math.floor((y-1)*h*365 / vieGroupeH);
    groupe.push(groupe[y-1] + carburantAn + entretienAn + remplGroupe*prixGroupe);
  }
  let retour = invest > 0 && solaire[0] <= groupe[0] ? 0 : null;
  if(invest > 0 && retour===null) for(let y=1; y<=an; y++) if(solaire[y] <= groupe[y]){ const a=solaire[y-1]-groupe[y-1], b=solaire[y]-groupe[y]; retour = (y-1) + a/(a-b); break; }
  return { kva, carbu, litresJour, litresAn: litresJour*365, carburantAn, entretienAn, prixGroupe, groupes, vieBatt, remplacementsBatt: Math.floor(an/vieBatt - 1e-9),
    co2An: litresJour*365*(carbu==='essence'?2.3:2.7), solaire, groupe, retour, economie10: groupe[an]-solaire[an], prixComplet: r.prixComplet && prixGroupe>0, an };
}

/* ------------------------------------------------------------------ Point d'entrée */
const PARAMS_DEFAUT = { ville:"N'Djaména", tech:'lithium', aut:0.5, vsys:'auto', archi:'auto', simul:1, marge:0.10,
  poussiere:0.05, pertesDc:0.03, lPv:10, lBat:2, lAc:10, reseau:false, coupure:8 };

function dimensionner(appareils, params, materiel){
  const P = { ...PARAMS_DEFAUT, ...(params||{}) };
  const c = climat(P.ville), B = besoins(appareils, P);
  if(B.vide) return { vide:true, besoins:B, climat:c, P };
  const archis = [kit12V(B, P, c, materiel), regulateurConvertisseur(B, P, c, materiel), hybride(B, P, c, materiel, false), hybride(B, P, c, materiel, true)];
  const ok = archis.filter(a => a.faisable && a.id !== 'secours').sort((a,b) => a.cle-b.cle);
  const recommandee = ok[0] || archis.find(a => a.faisable) || null;
  if(recommandee) recommandee.recommandee = true;
  let choisie = P.archi !== 'auto' ? archis.find(a => a.id===P.archi && a.faisable) : null;
  if(!choisie) choisie = recommandee;
  return { vide:false, besoins:B, climat:c, P, archis, recommandee, choisie };
}

const API = { choisirCable, IZ_AL, RHO_AL, dimensionner, besoins, chaine, economie, climat, rendementMPPT, tensionsPanneau, sectionCable, configMPPT, choisirBatteries,
  nomAuto, cls, TECH, MOIS, JOURS_MOIS, PARAMS_DEFAUT, IZ, K_TEMP_CABLE, RHO_CU, DECLASSEMENT_OND, PART_JOUR_BATT, JOURS_RECHARGE, K_CRETE, ETA_MPPT, DT_CELLULE,
  villes: () => CL.map(x => x.nom) };
G.SolaCalcul = API;
if(typeof module==='object' && module.exports) module.exports = API;
})(typeof globalThis!=='undefined' ? globalThis : this);
