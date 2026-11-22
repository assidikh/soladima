/* app.js — interface de SolaDima. Le calcul est dans calcul.js, les données dans climat.js et donnees.js. */
'use strict';
/* ============================================================
   Données et utilitaires
   ============================================================ */
const K = { etat:'soladima_etat_v1', dos:'soladima_dossiers_v1', mat:'soladima_materiel_v1', reg:'soladima_reglages_v1', cpt:'soladima_compteur_v1', dark:'soladima_dark' };
const { PRESETS, specPanneau, specBatterie, specConvertisseur } = DONNEES;
const SC = SolaCalcul;
const $ = id => document.getElementById(id);
const lire = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k)); return v ?? d; } catch(e){ return d; } };
const ecrire = (k, v) => { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ toast('Stockage plein ou bloqué'); return false; } };
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt = n => (Number(n)||0).toLocaleString('fr-FR').replace(/[  ]/g,' ');
const f1 = n => (Math.round((Number(n)||0)*10)/10).toLocaleString('fr-FR').replace(/[  ]/g,' ');
const f2 = n => (Math.round((Number(n)||0)*100)/100).toLocaleString('fr-FR').replace(/[  ]/g,' ');
const arr = n => fmt(Math.round(Number(n)||0));
const uid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2,6);
const p2 = n => String(n).padStart(2,'0');
function aujourdhui(){ const d=new Date(); return d.getFullYear()+'-'+p2(d.getMonth()+1)+'-'+p2(d.getDate()); }
const dCourt = d => d ? d.split('-').reverse().join('/') : '';
function toast(msg){ const t=$('toast'); t.textContent=msg; t.classList.add('show'); clearTimeout(toast._t); toast._t=setTimeout(()=>t.classList.remove('show'),2500); }

let reglages = { nom:'', adresse:'', pied:'', note:'Devis valable 15 jours. Prix donnés à titre préliminaire, à confirmer après visite technique.', indicatif:'235', logo:'',
  ville:"N'Djaména", tech:'lithium', aut:0.5, poussiere:0.05, marge:0.10, simul:1,
  prixEssence:700, prixGasoil:800, prixGroupeKva:0, entretienHeure:100, prixKwhAppoint:0, catalogue:0 };
let materiel = [], dossiers = [], S = null, vueCourante = 'besoins', nonEnregistre = false, versionMat = 0;

/* ---------- Fenêtre (avec bouton Retour d'Android) ---------- */
let sheetOpen = false;
function openSheet(html){ $('sh').innerHTML = html; $('sh').scrollTop = 0; $('ov').classList.add('open'); if(!sheetOpen){ sheetOpen = true; try{ history.pushState({sh:1},''); }catch(e){} } }
function closeSheet(fromPop){ $('ov').classList.remove('open'); if(sheetOpen){ sheetOpen = false; if(!fromPop){ try{ history.back(); }catch(e){} } } }
window.addEventListener('popstate', ()=>{ if(sheetOpen) closeSheet(true); });
function toggleDark(){ document.body.classList.toggle('dark'); try{ localStorage.setItem(K.dark, document.body.classList.contains('dark')?'1':'0'); }catch(e){} if(vueCourante==='systeme') renderResultats(); }

/* ============================================================
   Matériel : types, champs et migration des anciennes données
   ============================================================ */
const TYPES = { panneau:'Panneaux solaires', batterie:'Batteries', hybride:'Onduleurs hybrides (tout-en-un)', convertisseur:'Convertisseurs (onduleurs séparés)',
  regulateur:'Régulateurs PWM / MPPT', cable:'Câbles (prix au mètre)', protection:'Protections', autre:'Autres (supports, installation…)' };
const GENRES = { fusible_dc:'Fusible / disjoncteur DC (batterie)', sect_pv:'Interrupteur-sectionneur DC (panneaux)', fusible_pv:'Fusible de chaîne PV',
  parafoudre_pv:'Parafoudre DC (panneaux)', disj_ac:'Disjoncteur différentiel 30 mA', terre:'Kit de mise à la terre' };
// [clé, libellé, pas] — champs numériques de chaque type
const CHAMPS = {
  panneau: [['w','Puissance (Wc)',1],['voc','Tension à vide Voc (V)',0.1],['vmp','Tension Vmp (V)',0.1],['isc','Courant Isc (A)',0.01],['imp','Courant Imp (A)',0.01],['bVoc','Coefficient Voc (%/°C)',0.01],['gP','Coefficient Pmax (%/°C)',0.01]],
  batterie: [['v','Tension (V)',0.1],['ah','Capacité (Ah)',1],['iCh','Courant de charge max (A)',1],['iDech','Courant de décharge max (A)',1]],
  regulateur: [['a','Courant de charge (A)',1],['vocMax','Tension panneaux max (V)',1]],
  convertisseur: [['w','Puissance (W)',1],['surge','Surcharge au démarrage (× la puissance)',0.1],['idle','Consommation à vide (W)',1],['eta','Rendement (0 à 1)',0.01]],
  hybride: [['w','Puissance (W)',1],['pvMax','Puissance solaire max (W)',1],['vocMax','Tension panneaux max Voc (V)',1],['mpptMin','Plage MPPT : minimum (V)',1],['mpptMax','Plage MPPT : maximum (V)',1],['iCharge','Courant de charge solaire max (A)',1],['idle','Consommation à vide (W)',1],['surge','Surcharge au démarrage (× la puissance)',0.1],['eta','Rendement (0 à 1)',0.01]],
  cable: [['section','Section (mm²)',0.5]],
  protection: [['calibre','Calibre (A)',1],['vmax','Tension max (V, 0 si sans objet)',1]],
  autre: []
};
const nomAuto = m => SC.nomAuto(m);
const cleMat = m => [m.type, m.techno, m.tech, m.w, m.v, m.ah, m.a, m.onde, m.usage, m.section, m.genre, m.calibre, m.vmax, m.nom && m.type==='autre' ? m.nom : ''].join('|');
function migrerMateriel(L){
  const ancienNom = /^(Panneau solaire \d|Batterie (lithium|gel)|Onduleur pur sinus|Régulateur solaire MPPT \d+ A$|Onduleur hybride \d+ W \d+ V \(MPPT)/;
  L.forEach(m => {
    if(m.type==='onduleur'){ m.type = 'convertisseur'; Object.assign(m, { ...specConvertisseur(m.w,'pur'), ...m, type:'convertisseur' }); m.onde = m.onde||'pur'; }
    if(m.type==='panneau' && !(m.voc>0)) Object.assign(m, specPanneau(m.w||400), { w:m.w });
    if(m.type==='batterie' && !(m.iCh>0)) Object.assign(m, specBatterie(m.tech, m.v, m.ah));
    if(m.type==='regulateur' && !m.techno){ m.techno = 'mppt'; m.vocMax = m.a<=40 ? 100 : 150; m.tensions = m.a<=40 ? [12,24] : [12,24,48]; }
    if(m.type==='convertisseur'){ const d = specConvertisseur(m.w, m.onde); for(const k in d) if(m[k]===undefined) m[k] = d[k]; }
    if(m.type!=='autre' && (!m.nom || ancienNom.test(m.nom))) m.nom = nomAuto(m);
  });
  if(reglages.catalogue < 2){
    const exist = new Set(L.map(cleMat));
    DONNEES.materielParDefaut().forEach(m => { const x = { id:uid('m'), prix:0, ...m }; x.nom = x.nom || nomAuto(x); if(!exist.has(cleMat(x))) L.push(x); });
    reglages.catalogue = 2; ecrire(K.reg, reglages);
  }
  return L;
}
function materielParDefaut(){ return DONNEES.materielParDefaut().map(m => { const x = { id:uid('m'), prix:0, ...m }; x.nom = x.nom || nomAuto(x); return x; }); }
const mat = t => materiel.filter(m => m.type===t);

/* ============================================================
   Dossier (étude) en cours
   ============================================================ */
function prochainNumero(){ const n = lire(K.cpt, 0) + 1; ecrire(K.cpt, n); return 'SD-' + String(n).padStart(3,'0'); }
function paramsDefaut(){
  return { ...SC.PARAMS_DEFAUT, ville:reglages.ville, tech:reglages.tech, aut:reglages.aut, poussiere:reglages.poussiere, marge:reglages.marge, simul:reglages.simul, heuresGroupe:0 };
}
function nouvelleEtude(){
  return { id:null, v:2, num:prochainNumero(), date:aujourdhui(), client:'', tel:'', lieu:'', appareils:[], params: paramsDefaut(),
    devis:{ objet:'Installation d’un système solaire autonome', remise:0, note:reglages.note, bilan:true, noteCalcul:true, lines:[], sig:'' } };
}
const preset = nom => PRESETS.find(p => p[0].toLowerCase() === String(nom||'').trim().toLowerCase());
function migrerEtude(d){
  if(d.v === 2) return d;
  d.appareils = (d.appareils||[]).map(a => {
    if(a.hJ !== undefined) return a;
    const h = +a.h||0, per = a.per||'mixte', p = preset(a.nom), sg = DONNEES.suggerer(a.nom);
    // Appareil non prévu : on reprend le démarrage et l'usage reconnus d'après son nom (ex. « congélateur » → compresseur)
    const dem = p ? p[4] : sg ? sg.dem : ((a.surge||1) > 1 ? 3 : 1);
    return { nom:a.nom, qte:a.qte, w:a.w, hJ: per==='jour' ? h : per==='nuit' ? 0 : h/2, hN: per==='nuit' ? h : per==='jour' ? 0 : h/2,
      dem, ponctuel: p ? p[5] : sg ? sg.ponctuel : false, dc12: p ? p[6] : sg ? sg.dc12 : false };
  });
  const o = d.params || {};
  d.params = { ...paramsDefaut(), tech:o.tech||'lithium', aut: o.aut!==undefined ? o.aut : 0.5, vsys:o.vsys||'auto', marge: o.marge!==undefined ? o.marge : 0.1 };
  d.devis = { noteCalcul:true, ...(d.devis||{}) };
  d.v = 2; return d;
}
function save(){ nonEnregistre = true; ecrire(K.etat, S); }
function chargerEtude(d){
  S = migrerEtude(JSON.parse(JSON.stringify(d)));
  S.params = { ...paramsDefaut(), ...(S.params||{}) };
  S.devis = { objet:'', remise:0, note:'', bilan:true, noteCalcul:true, lines:[], sig:'', ...(S.devis||{}) };
  S.appareils = S.appareils || [];
  $('cNom').value = S.client||''; $('cTel').value = S.tel||''; $('cLieu').value = S.lieu||'';
  remplirVilles(); ecrire(K.etat, S); nonEnregistre = false;
  renderAppareils(); refreshAll();
}
function refreshAll(){ renderBesoinsRes(); if(vueCourante==='systeme') initSysteme(); if(vueCourante==='devis') initDevis(); majBarre(); }
function remplirVilles(){
  $('cVille').innerHTML = SC.villes().map(v => `<option ${v===S.params.ville?'selected':''}>${esc(v)}</option>`).join('');
}
function setVille(v){ S.params.ville = v; save(); renderBesoinsRes(); majBarre(); }

/* ---------- Calcul (mis en cache : la page le demande plusieurs fois par affichage) ---------- */
let _cache = { cle:null, r:null };
function calculer(){
  const cle = JSON.stringify([S.appareils, S.params, versionMat]);
  if(_cache.cle !== cle) _cache = { cle, r: SC.dimensionner(S.appareils, S.params, materiel) };
  return _cache.r;
}
// Heures de marche d'un groupe qui rendrait le même service : la plus longue utilisation d'un appareil
// (hors appareils permanents comme une box), entre 4 et 24 h
function heuresGroupeSuggere(){
  const h = S.appareils.filter(a => a.qte>0 && a.w>0).map(a => (+a.hJ||0)+(+a.hN||0)).filter(x => x < 20);
  return h.length ? Math.min(24, Math.max(4, Math.ceil(Math.max(...h)))) : 8;
}
const heuresGroupe = () => S.params.heuresGroupe > 0 ? S.params.heuresGroupe : heuresGroupeSuggere();
const optionsEco = () => ({ heuresGroupe: heuresGroupe(), prixEssence: reglages.prixEssence, prixGasoil: reglages.prixGasoil,
  entretienHeure: reglages.entretienHeure, prixGroupeKva: reglages.prixGroupeKva, prixKwhAppoint: reglages.prixKwhAppoint });

/* ============================================================
   Navigation
   ============================================================ */
const TITRES = { besoins:'Besoins énergétiques', systeme:'Dimensionnement', devis:'Devis', materiel:'Mon matériel', plus:'Dossiers et réglages' };
function vue(n){
  vueCourante = n;
  document.querySelectorAll('.view').forEach(v=>v.classList.remove('active'));
  $('v-'+n).classList.add('active');
  document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active', b.dataset.v===n));
  $('titre').textContent = TITRES[n];
  if(n==='besoins') renderBesoinsRes();
  if(n==='systeme') initSysteme();
  if(n==='devis') initDevis();
  if(n==='materiel') renderMateriel();
  if(n==='plus') initPlus();
  majBarre(); window.scrollTo(0,0);
}
function majBarre(){
  const b = $('actionbar'); b.style.display = 'flex';
  if(vueCourante==='besoins'){
    const r = calculer();
    b.innerHTML = `<div class="info"><small>Consommation par jour</small><b>${r.vide?'—':f2(r.besoins.E/1000)+' kWh'}</b></div><button class="btn go" onclick="vue('systeme')">Dimensionner ›</button>`;
  } else if(vueCourante==='systeme'){
    const r = calculer(), a = r.choisie;
    b.innerHTML = `<div class="info"><small>${a?esc(a.nom):'Solaire proposé'}</small><b>${!a?'—':f2(a.pv.Wc/1000)+' kWc · '+f2(a.bat.Wh/1000)+' kWh'}</b></div><button class="btn go" onclick="vue('devis')">Faire le devis ›</button>`;
  } else if(vueCourante==='devis'){
    b.innerHTML = `<button class="btn wa" onclick="envoyerWhatsApp()">📤 WhatsApp</button><button class="btn" onclick="genererPDF()">📄 PDF</button>`;
  } else b.style.display = 'none';
}

/* ============================================================
   BESOINS : appareils
   ============================================================ */
const DEMARRAGES = [[1,'Normal'],[1.3,'Inverter ×1,3'],[3,'Moteur ×3'],[5,'Compresseur ×5']];
function majDatalistAp(){ $('dlAp').innerHTML = PRESETS.map(p=>`<option value="${esc(p[0])}">`).join(''); }
function renderAppareils(){
  const box = $('listeAp');
  if(!S.appareils.length){ box.innerHTML = '<div class="empty">Aucun appareil.<br>Appuyez sur « Appareils courants » pour choisir vite, ou ajoutez-en un à la main.</div>'; return; }
  box.innerHTML = S.appareils.map((a,i)=>`
    <div class="ap" data-i="${i}">
      <label style="margin-top:0">Appareil</label>
      <input type="text" class="des" list="dlAp" value="${esc(a.nom)}" placeholder="Ex : Réfrigérateur" />
      <div class="row">
        <div><label>Quantité</label><input type="number" class="qte" inputmode="decimal" value="${esc(a.qte)}" /></div>
        <div><label>Puissance (W)</label><input type="number" class="w" inputmode="decimal" value="${esc(a.w)}" /></div>
      </div>
      <label>Heures d'utilisation par jour</label>
      <input type="number" class="htot" inputmode="decimal" step="0.5" min="0" max="24" value="${esc(+(((+a.hJ||0)+(+a.hN||0)).toFixed(2)))}" />
      ${barreJourNuit(a)}
      ${blocSuggestion(a, i)}
      <label>Démarrage</label>
      <div class="chips">${DEMARRAGES.map(([v,t])=>`<button class="chip ${Math.abs((a.dem||1)-v)<0.01?'on':''}" onclick="setAp(${i},'dem',${v})">${t}</button>`).join('')}</div>
      <label class="coche"><input type="checkbox" ${a.ponctuel?'checked':''} onchange="setAp(${i},'ponctuel',this.checked)"> Usage ponctuel (fer, bouilloire, pompe…)</label>
      <label class="coche"><input type="checkbox" ${a.dc12?'checked':''} onchange="setAp(${i},'dc12',this.checked)"> Existe en 12 V (courant continu)</label>
      <div class="foot"><button class="iconbtn" onclick="supprimerAppareil(${i})" aria-label="Supprimer">🗑</button><div class="tot"><span class="wh">${fmt(a.qte*a.w*((+a.hJ||0)+(+a.hN||0)))}</span>&nbsp;Wh/jour</div></div>
    </div>`).join('');
}
/* ---------- Répartition jour / nuit ----------
   Une journée a 12 h de jour (6 h – 18 h) et 12 h de nuit : un appareil ne peut pas dépasser 12 h dans chaque
   période. La barre déplace les heures entre le jour (à gauche) et la nuit (à droite). */
const bornesNuit = tot => ({ min: Math.max(0, tot-12), max: Math.min(tot, 12) });
const hFr = h => String(+(+h).toFixed(2)).replace('.', ',') + ' h';
function barreJourNuit(a){
  const tot = (+a.hJ||0)+(+a.hN||0), b = bornesNuit(tot), fixe = b.max - b.min < 0.01;
  return `<div class="repart">
    <span class="rj">☀ Jour <b>${hFr(a.hJ||0)}</b></span>
    <input type="range" class="hrep" min="${b.min}" max="${b.max}" step="0.25" value="${+a.hN||0}" ${fixe?'disabled':''} aria-label="Répartition des heures entre le jour et la nuit" />
    <span class="rn">🌙 Nuit <b>${hFr(a.hN||0)}</b></span>
  </div>`;
}
function majRepartition(el, a){
  const tot = (+a.hJ||0)+(+a.hN||0), b = bornesNuit(tot), r = el.querySelector('.hrep');
  r.min = b.min; r.max = b.max; r.value = a.hN; r.disabled = b.max - b.min < 0.01;
  el.querySelector('.rj b').textContent = hFr(a.hJ); el.querySelector('.rn b').textContent = hFr(a.hN);
}
/* ---------- Suggestions d'après le nom de l'appareil ---------- */
function ecartsSuggestion(a){
  const s = DONNEES.suggerer(a.nom); if(!s) return null;
  const diff = [];
  if(!(a.w > 0)) diff.push('w');
  if(!((+a.hJ||0)+(+a.hN||0) > 0)) diff.push('h');
  if(!a.manuel && Math.abs((a.dem||1) - s.dem) > 0.01) diff.push('dem');
  if(!a.manuel && !!a.ponctuel !== s.ponctuel) diff.push('ponctuel');
  return { s, diff };
}
function blocSuggestion(a, i){
  const e = ecartsSuggestion(a); if(!e || !e.diff.length) return '';
  const s = e.s, dem = DEMARRAGES.find(x => Math.abs(x[0]-s.dem) < 0.01)?.[1] || '';
  return `<div class="sugg">💡 Pour un ${esc(s.categorie)}, valeurs courantes : <b>${fmt(s.w)} W</b>, ${hFr(s.hJ+s.hN)}/jour (${hFr(s.hJ)} jour, ${hFr(s.hN)} nuit), démarrage ${esc(dem.toLowerCase())}${s.ponctuel?', usage ponctuel':''}.
    <button class="btn small" onclick="appliquerSuggestion(${i})">Appliquer</button></div>`;
}
// Remplit ce qui est vide ; corrige le démarrage et l'usage ponctuel tant que l'utilisateur ne les a pas choisis lui-même
function appliquerSuggestion(i, silencieux){
  const a = S.appareils[i], e = ecartsSuggestion(a); if(!e) return;
  const s = e.s;
  if(!(a.w > 0)) a.w = s.w;                                         // jamais d'écrasement d'une puissance saisie
  if(!((+a.hJ||0)+(+a.hN||0) > 0)){ a.hJ = s.hJ; a.hN = s.hN; }      // ni d'heures saisies
  if(!a.manuel){ a.dem = s.dem; a.ponctuel = s.ponctuel; a.dc12 = s.dc12; }
  renderAppareils(); renderBesoinsRes(); majBarre(); save();
  if(!silencieux) toast('Valeurs appliquées : ajustez-les si besoin');
}
$('listeAp').addEventListener('input', e=>{
  const el = e.target.closest('.ap'); if(!el) return;
  const a = S.appareils[+el.dataset.i], c = e.target.classList, n = Math.max(0, parseFloat(e.target.value)||0);
  if(c.contains('des')) a.nom = e.target.value;
  if(c.contains('qte')) a.qte = n; if(c.contains('w')) a.w = n;
  if(c.contains('htot')){
    // On garde la même proportion jour/nuit, puis on respecte la limite de 12 h par période
    const tot = Math.min(24, n), ancien = (+a.hJ||0)+(+a.hN||0), partNuit = ancien > 0 ? (+a.hN||0)/ancien : 0.5;
    const b = bornesNuit(tot); a.hN = Math.min(b.max, Math.max(b.min, Math.round(tot*partNuit*4)/4)); a.hJ = +(tot - a.hN).toFixed(2);
    majRepartition(el, a);
  }
  if(c.contains('hrep')){ const tot = (+a.hJ||0)+(+a.hN||0); a.hN = parseFloat(e.target.value)||0; a.hJ = +(tot - a.hN).toFixed(2); majRepartition(el, a); }
  el.querySelector('.wh').textContent = fmt(a.qte*a.w*((+a.hJ||0)+(+a.hN||0)));
  renderBesoinsRes(); majBarre(); save();
});
$('listeAp').addEventListener('change', e=>{
  const el = e.target.closest('.ap'); if(!el) return;
  const i = +el.dataset.i, a = S.appareils[i];
  if(e.target.classList.contains('des')){
    const p = preset(a.nom);
    if(p && !a.w){ Object.assign(a, depuisPreset(p), { qte:a.qte||1 }); renderAppareils(); renderBesoinsRes(); majBarre(); save(); return; }
    // Nom libre reconnu : on remplit les champs encore vides avec les valeurs courantes
    if(DONNEES.suggerer(a.nom) && (!(a.w>0) || !((+a.hJ||0)+(+a.hN||0)>0))) appliquerSuggestion(i, true);
    else renderAppareils();
  }
  if(e.target.classList.contains('w') || e.target.classList.contains('htot')) renderAppareils();
});
const depuisPreset = p => ({ nom:p[0], qte:1, w:p[1], hJ:p[2], hN:p[3], dem:p[4], ponctuel:p[5], dc12:p[6] });
function ajouterAppareil(){
  S.appareils.push({ nom:'', qte:1, w:0, hJ:0, hN:0, dem:1, ponctuel:false, dc12:false });
  renderAppareils(); renderBesoinsRes(); majBarre(); save();
  const l = document.querySelectorAll('#listeAp .des'); l[l.length-1]?.focus();
}
function supprimerAppareil(i){ S.appareils.splice(i,1); renderAppareils(); renderBesoinsRes(); majBarre(); save(); }
function setAp(i,k,v){ S.appareils[i][k] = v; S.appareils[i].manuel = true; renderAppareils(); renderBesoinsRes(); majBarre(); save(); }

function ouvrirPresets(){
  openSheet(`<div class="shh"><b>Appareils courants</b><button class="iconbtn" onclick="closeSheet()">✕</button></div>
    <p class="muted small" style="margin:0 0 6px">Touchez un appareil pour l'ajouter. Les puissances et durées sont indicatives : ajustez-les pour chaque client.</p>
    <input id="rechPre" type="text" placeholder="🔍 Rechercher…" oninput="renderPresets()" /><div id="listePre"></div>`);
  renderPresets();
}
function renderPresets(){
  const q = ($('rechPre')?.value||'').toLowerCase();
  const items = PRESETS.map((p,i)=>({p,i})).filter(x=>x.p[0].toLowerCase().includes(q));
  $('listePre').innerHTML = items.length ? items.map(({p,i})=>{
    const n = S.appareils.filter(a=>a.nom===p[0]).reduce((s,a)=>s+a.qte,0);
    return `<div class="art" onclick="ajouterPreset(${i})"><div class="info"><b>${esc(p[0])}</b><small>${fmt(p[1])} W · ${f1(p[2])} h jour + ${f1(p[3])} h nuit${p[6]?' · existe en 12 V':''}</small></div>${n?`<span class="tt" style="color:var(--primary)">× ${n}</span>`:''}<span class="iconbtn">＋</span></div>`;
  }).join('') : '<div class="empty">Aucun résultat.</div>';
}
function ajouterPreset(i){
  const p = PRESETS[i], ex = S.appareils.find(a=>a.nom===p[0] && a.w===p[1] && a.hJ===p[2] && a.hN===p[3]);
  if(ex) ex.qte += 1; else S.appareils.push(depuisPreset(p));
  renderAppareils(); renderBesoinsRes(); majBarre(); renderPresets(); save();
}
function renderBesoinsRes(){
  const r = calculer(), box = $('resBesoins');
  if(r.vide){ box.innerHTML = '<h2>Bilan de consommation</h2><div class="empty">Ajoutez des appareils pour voir le bilan.</div>'; return; }
  const B = r.besoins;
  box.innerHTML = `<h2>Bilan de consommation</h2>
    <div class="bignum"><div><small>Énergie par jour</small><b>${f2(B.E/1000)} kWh</b></div><div><small>Puissance installée</small><b>${fmt(B.Pinst)} W</b></div>
    <div><small>Dont de jour ☀</small><b>${f2(B.Ej/1000)} kWh</b></div><div><small>Dont de nuit 🌙</small><b>${f2(B.En/1000)} kWh</b></div>
    <div><small>Pointe (en même temps)</small><b>${arr(B.Ppointe)} W</b></div><div><small>Au démarrage d'un moteur</small><b>${arr(B.Pstart)} W</b></div></div>
    <p class="muted small" style="margin:8px 0 0">Les appareils « ponctuels » ne sont jamais comptés plusieurs à la fois dans la pointe. Ensoleillement : ${esc(r.climat.nom)}.</p>`;
}

/* ============================================================
   SYSTÈME
   ============================================================ */
const AUTONOMIES = [[0,'Nuit seulement'],[0.5,'Nuit + ½ jour'],[1,'Nuit + 1 jour'],[2,'Nuit + 2 jours']];
function initSysteme(){
  const P = S.params, chips = (id, liste, k) => $(id).innerHTML = liste.map(([v,t])=>`<button class="chip ${String(P[k])===String(v)?'on':''}" onclick="setParam('${k}',${typeof v==='number'?v:`'${v}'`})">${t}</button>`).join('');
  chips('chTech', [['lithium','Lithium (LiFePO4)'],['gel','Gel / AGM']], 'tech');
  chips('chAut', AUTONOMIES, 'aut');
  chips('chV', [['auto','Automatique'],[12,'12 V'],[24,'24 V'],[48,'48 V']], 'vsys');
  $('chSecours').innerHTML = [[false,'Aucun'],[true,'Réseau SNE ou groupe']].map(([v,t])=>`<button class="chip ${!!P.reseau===v?'on':''}" onclick="setParam('reseau',${v})">${t}</button>`).join('');
  $('boxCoupure').style.display = P.reseau ? 'block' : 'none';
  $('pCoupure').value = P.coupure; $('pLpv').value = P.lPv; $('pLbat').value = P.lBat; $('pLac').value = P.lAc; $('pHg').value = P.heuresGroupe > 0 ? P.heuresGroupe : ''; $('pHg').placeholder = heuresGroupeSuggere() + ' h (suggéré)';
  $('pPous').value = Math.round(P.poussiere*100); $('pMarge').value = Math.round(P.marge*100); $('pSimul').value = Math.round(P.simul*100);
  renderResultats();
}
function setParam(k,v){ S.params[k] = v; save(); initSysteme(); majBarre(); }
function majParam(k,val,div,min){ const n = parseFloat(val); if(isNaN(n) || n < (min??0)) return; S.params[k] = n/div; save(); renderResultats(); majBarre(); }
function choisirArchi(id){ S.params.archi = id; save(); renderResultats(); majBarre(); toast('Solution retenue pour le devis'); }

function renderResultats(){
  const r = calculer();
  ['sysComparaison','sysResultats','sysProduction','sysCables','sysEco'].forEach(id => $(id).style.display = r.vide ? 'none' : 'block');
  if(r.vide){ $('sysComparaison').style.display='block'; $('sysComparaison').innerHTML = '<h2>Solutions possibles</h2><div class="empty">Ajoutez d\'abord les appareils du client dans l\'onglet Besoins.</div>'; return; }
  renderComparaison(r); renderDetail(r); renderProduction(r); renderCables(r); renderEco(r);
}
function resumeArchi(a){
  if(!a.faisable) return '';
  const p = [`${a.pv.N} × ${a.pv.m.w} Wc`, `${a.bat.units} batt. (${f2(a.bat.Wh/1000)} kWh)`];
  if(a.hyb) p.push(`hybride ${fmt(a.hyb.m.w)} W`);
  if(a.reg) p.push(`${a.reg.n} régul. ${a.reg.m.techno==='pwm'?'PWM':'MPPT'} ${a.reg.m.a} A`);
  if(a.conv) p.push(`convert. ${fmt(a.conv.m.w)} W`);
  return p.join(' · ') + ` · ${a.V} V`;
}
function renderComparaison(r){
  $('sysComparaison').innerHTML = `<h2>Solutions possibles</h2>
    <p class="muted small" style="margin:0 0 8px">Touchez une solution pour la retenir dans le devis. ${r.choisie && r.choisie.prixComplet ? '' : 'Tant que des prix manquent, le classement utilise des prix indicatifs internes.'}</p>
    ${r.archis.map(a => `<div class="solu ${a.faisable?'':'non'} ${r.choisie===a?'sel':''}" ${a.faisable?`onclick="choisirArchi('${a.id}')"`:''}>
      <div class="solu-t"><b>${esc(a.nom)}</b>${a.recommandee?'<span class="badge ok">Recommandée</span>':''}${r.choisie===a?'<span class="badge sel">Retenue</span>':''}</div>
      ${a.faisable ? `<small>${esc(resumeArchi(a))}</small><div class="solu-p">${a.prixComplet?fmt(a.total)+' F CFA':'Prix incomplets'}</div>`
                   : `<small>✖ ${esc(a.raisons.join(' '))}</small>`}
    </div>`).join('')}`;
}
function renderDetail(r){
  const a = r.choisie, box = $('sysResultats');
  if(!a){ box.innerHTML = '<h2>Système proposé</h2><div class="alert">Aucune solution possible avec votre matériel actuel. Ajoutez des références dans l\'onglet Matériel.</div>'; return; }
  const T = SC.TECH[r.P.tech], c = r.climat, pv = a.pv;
  const vMax = a.hyb ? a.hyb.m.vocMax : a.reg.m.vocMax;
  const manque = a.lignes.filter(l=>!l.pu).length;
  box.innerHTML = `<h2>Système proposé : ${esc(a.nom)}</h2>
    <p class="muted small" style="margin:0 0 6px">${esc(a.description)}</p>
    <div class="res"><div class="ic">🔆</div><div class="tx"><b>${pv.N} × ${esc(pv.m.nom)}</b><small>${fmt(pv.Wc)} Wc · ${pv.ns} en série × ${pv.np} en parallèle${a.reg&&a.reg.n>1?` (répartis sur ${a.reg.n} régulateurs)`:''} · inclinaison ${c.angle}° plein sud<br>
      Tension d'une chaîne : ${f1(pv.vocF*pv.ns)} V à vide par matin froid (max ${vMax} V) · ${f1(pv.vmpC*pv.ns)} V en plein soleil à ${Math.round(pv.tcMax)} °C${pv.mode==='PWM'?`<br>Régulateur PWM : ${Math.round(pv.ratio*100)} % de la puissance des panneaux est utilisée`:''}</small></div></div>
    <div class="res"><div class="ic">🔋</div><div class="tx"><b>${a.bat.units} × ${esc(a.bat.m.nom)}</b><small>${a.bat.series>1?`${a.bat.series} en série × `:''}${a.bat.par} en parallèle · ${f2(a.bat.Wh/1000)} kWh installés · ${f2(a.bat.usable/1000)} kWh utiles nécessaires (${AUTONOMIES.find(x=>x[0]===r.P.aut)?.[1]||''})<br>
      Décharge ${Math.round(T.dod*100)} % max · courant de décharge ${arr(a.bat.Idech)} A · de charge ${arr(a.bat.Ich)} A</small></div></div>
    ${a.hyb?`<div class="res"><div class="ic">⚡</div><div class="tx"><b>${esc(a.hyb.m.nom)}</b><small>Pointe ${arr(a.besoins.Ppointe)} W, démarrage ${arr(a.besoins.Pstart)} W · consommation à vide ${a.hyb.m.idle} W (${f2(a.chaine.idleWh/1000)} kWh/jour) · système ${a.V} V</small></div></div>`:''}
    ${a.reg?`<div class="res"><div class="ic">🎛️</div><div class="tx"><b>${a.reg.n} × ${esc(a.reg.m.nom)}</b><small>Courant de charge des panneaux : ${arr(a.reg.Ich)} A · système ${a.V} V</small></div></div>`:''}
    ${a.conv?`<div class="res"><div class="ic">⚡</div><div class="tx"><b>${esc(a.conv.m.nom)}</b><small>Pointe ${arr(a.besoins.Ppointe)} W, démarrage ${arr(a.besoins.Pstart)} W · consommation à vide ${a.conv.m.idle} W (${f2(a.chaine.idleWh/1000)} kWh/jour)</small></div></div>`:''}
    <div class="bignum" style="margin-top:10px"><div><small>Consommation des appareils</small><b>${f2(a.besoins.E/1000)} kWh/j</b></div><div><small>À fournir par les panneaux</small><b>${f2(a.besoinNet/1000)} kWh/j</b></div>
      <div><small>Production en ${SC.MOIS[a.moisCritique].toLowerCase()} (mois critique)</small><b>${f2(a.prodMois[a.moisCritique]/1000)} kWh/j</b></div><div><small>Production sur l'année</small><b>${fmt(Math.round(a.prodAn))} kWh</b></div></div>
    ${manque?`<div class="alert">⚠ ${manque} ligne(s) sans prix : renseignez vos prix dans l'onglet Matériel.</div>`:''}
    ${a.warns.map(w=>`<div class="alert">⚠ ${esc(w)}</div>`).join('')}
    ${a.infos.map(w=>`<div class="alert info">ℹ ${esc(w)}</div>`).join('')}`;
}

/* ---------- Graphique : production mensuelle et besoin ---------- */
function renderProduction(r){
  const a = r.choisie, box = $('sysProduction');
  if(!a){ box.style.display = 'none'; return; }
  const v = a.prodMois.map(x => x/1000), besoin = a.besoinNet/1000;
  const W = 340, H = 180, g = 34, d = 8, h0 = 22, base = H - 22, haut = base - h0;
  const max = Math.max(besoin*1.25, ...v) * 1.05, y = x => base - x/max*haut;
  const pas = Math.max(0.5, Math.ceil(max/4*2)/2), bw = (W - g - d)/12, larg = bw - 4;
  let s = '';
  for(let t = 0; t <= max; t += pas) s += `<line x1="${g}" x2="${W-d}" y1="${y(t)}" y2="${y(t)}" class="grille"/><text x="${g-5}" y="${y(t)+4}" text-anchor="end" class="axe">${f1(t)}</text>`;
  v.forEach((x,i) => {
    const X = g + i*bw + 2, Y = y(x), hh = base - Y, rr = Math.min(4, hh);
    s += `<path d="M${X},${base} V${Y+rr} q0,-${rr} ${rr},-${rr} H${X+larg-rr} q${rr},0 ${rr},${rr} V${base} Z" class="barre ${a.couverture[i]<1?'deficit':''}" onclick="infoMois(${i})"><title>${SC.MOIS[i]} : ${f2(x)} kWh/j (${Math.round(a.couverture[i]*100)} % du besoin)</title></path>`;
    s += `<rect x="${X-2}" y="${h0}" width="${bw}" height="${haut}" fill="transparent" onclick="infoMois(${i})"/>`;
    s += `<text x="${X+larg/2}" y="${H-6}" text-anchor="middle" class="axe">${SC.MOIS[i][0]}</text>`;
  });
  s += `<line x1="${g}" x2="${W-d}" y1="${y(besoin)}" y2="${y(besoin)}" class="besoin"/><text x="${W-d}" y="${y(besoin)-5}" text-anchor="end" class="etiq">Besoin ${f2(besoin)} kWh/j</text>`;
  box.innerHTML = `<h2>Production mois par mois (${esc(r.climat.nom)})</h2>
    <svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="Production solaire de chaque mois comparée au besoin journalier">${s}</svg>
    <p class="muted small" id="infoMois" style="margin:4px 0 0">Touchez un mois pour voir le détail. kWh par jour, panneaux inclinés à ${r.climat.angle}° plein sud.</p>
    <details><summary>Voir les chiffres</summary><table class="tab"><tr><th>Mois</th><th class="r">Ensoleillement</th><th class="r">Production</th><th class="r">Couverture</th></tr>
    ${v.map((x,i)=>`<tr><td>${SC.MOIS[i]}</td><td class="r">${f2(r.climat.H[i])} kWh/m²</td><td class="r">${f2(x)} kWh/j</td><td class="r">${Math.round(a.couverture[i]*100)} %</td></tr>`).join('')}</table>
    <p>Source : PVGIS (Commission européenne), moyennes 2005-2020. Les jours très nuageux sont couverts par la réserve des batteries.</p></details>
    ${r.P.reseau && a.id==='secours' ? `<p class="muted small">Énergie d'appoint du réseau ou du groupe : ${fmt(Math.round(a.appointAn||0))} kWh par an.</p>` : ''}`;
}
function infoMois(i){
  const a = calculer().choisie; if(!a) return;
  $('infoMois').textContent = `${SC.MOIS[i]} : production ${f2(a.prodMois[i]/1000)} kWh/jour, soit ${Math.round(a.couverture[i]*100)} % du besoin (${f2(a.besoinNet/1000)} kWh/jour).`;
}

/* ---------- Câbles et protections ---------- */
function renderCables(r){
  const a = r.choisie, box = $('sysCables');
  if(!a){ box.style.display = 'none'; return; }
  box.innerHTML = `<h2>Câbles et protections</h2>
    <table class="tab"><tr><th>Liaison</th><th class="r">Courant</th><th class="r">Longueur</th><th class="r">Section</th></tr>
    ${a.cables.map(c=>`<tr><td>${esc(c.lien)}${c.n>1?` (×${c.n})`:''}</td><td class="r">${f1(c.I)} A</td><td class="r">${f1(c.L)} m</td><td class="r"><b>${String(c.S).replace('.',',')} mm²</b></td></tr>`).join('')}</table>
    <p class="muted small">Cuivre, chute de tension limitée à 3 % côté panneaux, 1,5 à 2 % côté batterie ; courant admissible corrigé pour 40 °C. Longueurs aller simple (réglables plus bas).</p>
    ${a.protections.map(p=>`<div class="res"><div class="ic">🛡️</div><div class="tx"><b>${esc(GENRES[p.genre])}${p.calibre?` ${p.calibre} A`:''}${p.n>1?` × ${p.n}`:''}</b><small>${esc(p.pourquoi)}${p.vmin?` · tension ≥ ${Math.ceil(p.vmin)} V DC`:''}</small></div></div>`).join('')}`;
}

/* ---------- Comparaison avec un groupe électrogène ---------- */
function renderEco(r){
  const a = r.choisie, box = $('sysEco');
  if(!a){ box.style.display = 'none'; return; }
  const e = SC.economie(a, r.P, optionsEco());
  const manque = [];
  if(!a.prixComplet) manque.push('les prix du matériel (onglet Matériel)');
  if(!(reglages.prixGroupeKva > 0)) manque.push('le prix d\'un groupe (onglet Plus)');
  let graph = '';
  const complet = a.prixComplet && a.total > 0;          // sans tous les prix, le coût du solaire serait sous-estimé
  if(complet){
    const W = 340, H = 190, g = 40, d = 64, h0 = 14, base = H - 24, haut = base - h0;
    const max = Math.max(...e.solaire, ...e.groupe) * 1.05, y = v => base - v/max*haut, x = i => g + i*(W-g-d)/e.an;
    const pas = Math.pow(10, Math.floor(Math.log10(max/4))) * ([1,2,5].find(m => max/4 <= m*Math.pow(10, Math.floor(Math.log10(max/4)))) || 10);
    let s = '';
    for(let t=0; t<=max; t+=pas) s += `<line x1="${g}" x2="${W-d}" y1="${y(t)}" y2="${y(t)}" class="grille"/><text x="${g-5}" y="${y(t)+4}" text-anchor="end" class="axe">${f1(t/1e6)}</text>`;
    for(let i=0;i<=e.an;i+=2) s += `<text x="${x(i)}" y="${H-8}" text-anchor="middle" class="axe">${i}</text>`;
    const ligne = (v, cl) => `<polyline points="${v.map((t,i)=>x(i)+','+y(t)).join(' ')}" class="${cl}"/>` + v.map((t,i)=>`<circle cx="${x(i)}" cy="${y(t)}" r="7" fill="transparent"><title>Année ${i} : ${fmt(Math.round(t))} F CFA</title></circle>`).join('');
    s += ligne(e.groupe, 'c-groupe') + ligne(e.solaire, 'c-solaire');
    s += `<text x="${W-d+6}" y="${y(e.groupe[e.an])+4}" class="etiq">Groupe</text><text x="${W-d+6}" y="${y(e.solaire[e.an])+4}" class="etiq">Solaire</text>`;
    graph = `<svg viewBox="0 0 ${W} ${H}" class="graph" role="img" aria-label="Coût cumulé sur 10 ans, solaire et groupe électrogène">${s}</svg>
      <div class="legende"><span><i class="k-solaire"></i>Solaire</span><span><i class="k-groupe"></i>Groupe électrogène</span><span class="muted">millions de F CFA cumulés, par année</span></div>`;
  }
  box.innerHTML = `<h2>Comparaison avec un groupe électrogène</h2>
    <p class="muted small" style="margin:0 0 8px">Même consommation fournie par un groupe ${e.carbu==='essence'?'à essence':'diesel'} de ${String(e.kva).replace('.',',')} kVA tournant ${heuresGroupe()} h par jour.</p>
    <div class="bignum"><div><small>Carburant</small><b>${f1(e.litresJour)} L/jour</b></div><div><small>Coût carburant</small><b>${fmt(Math.round(e.carburantAn/1000)*1000)} F/an</b></div>
      <div><small>Durée de vie des batteries</small><b>≈ ${f1(e.vieBatt)} ans</b></div><div><small>CO₂ évité</small><b>${f1(e.co2An/1000)} t/an</b></div></div>
    ${graph}
    ${complet && e.retour!==null ? `<div class="alert info">ℹ Le solaire devient moins cher que le groupe après <b>${f1(e.retour)} an(s)</b>. Économie sur 10 ans : <b>${fmt(Math.round(e.economie10/1000)*1000)} F CFA</b>${e.remplacementsBatt?`, en comptant ${e.remplacementsBatt} remplacement(s) des batteries`:''}.</div>`
      : complet ? `<div class="alert">Sur 10 ans, le groupe reste moins cher dans ces conditions.</div>` : ''}
    ${manque.length?`<div class="alert">Pour comparer les coûts sur 10 ans, renseignez ${manque.join(' et ')}.</div>`:''}
    <p class="muted small">Prix du carburant : essence ${fmt(reglages.prixEssence)} F/L, gasoil ${fmt(reglages.prixGasoil)} F/L (modifiables dans Plus). Consommation du groupe estimée d'après des valeurs typiques de petits groupes.</p>`;
}

/* ============================================================
   DEVIS
   ============================================================ */
function lignesAuto(){ const a = calculer().choisie; return a ? a.lignes : []; }
const sigDe = L => JSON.stringify(L.map(l=>[l.des,l.qte,l.pu]));
function initDevis(){
  $('dNum').value = S.num||''; $('dDate').value = S.date||''; $('dObjet').value = S.devis.objet||'';
  $('dRemise').value = S.devis.remise||''; $('dNote').value = S.devis.note||''; $('dBilan').checked = !!S.devis.bilan; $('dCalcul').checked = !!S.devis.noteCalcul;
  if(!S.devis.lines.length && lignesAuto().length) regenererLignes(false);
  renderLignesDevis(); majBanner();
}
function majBanner(){
  const L = lignesAuto(), box = $('bannerSig');
  box.innerHTML = (L.length && S.devis.lines.some(l=>l.auto) && S.devis.sig && S.devis.sig!==sigDe(L))
    ? `<div class="alert" style="margin:0 0 14px">Le dimensionnement ou vos prix ont changé depuis la création de ces lignes. <button class="btn small" style="margin-top:8px" onclick="regenererLignes(true)">↻ Mettre à jour les lignes</button></div>` : '';
}
function regenererLignes(confirmer){
  const L = lignesAuto();
  if(!L.length) return toast('Ajoutez d\'abord des appareils');
  if(confirmer && S.devis.lines.some(l=>l.auto && l.edite) && !confirm('Les lignes automatiques que vous avez modifiées seront remplacées. Continuer ?')) return;
  const manuelles = S.devis.lines.filter(l=>!l.auto);
  S.devis.lines = [...L.map(l=>({id:uid('l'), des:l.des, qte:l.qte, pu:l.pu, auto:true, edite:false})), ...manuelles];
  S.devis.sig = sigDe(L); save();
  if(vueCourante==='devis'){ renderLignesDevis(); majBanner(); }
  if(confirmer) toast('Lignes mises à jour ✅');
}
function renderLignesDevis(){
  const box = $('lignesDevis');
  if(!S.devis.lines.length){ box.innerHTML = '<div class="empty">Aucune ligne.<br>Ajoutez des appareils puis revenez ici, ou ajoutez des lignes à la main.</div>'; majTotaux(); return; }
  box.innerHTML = S.devis.lines.map((l,i)=>`
    <div class="ap ${l.pu?'':'warn'}" data-i="${i}">
      <label style="margin-top:0">Désignation</label>
      <input type="text" class="des" value="${esc(l.des)}" />
      <div class="row">
        <div><label>Quantité</label><input type="number" class="qte" inputmode="decimal" value="${esc(l.qte)}" /></div>
        <div><label>Prix unitaire</label><input type="number" class="pu" inputmode="decimal" value="${l.pu?esc(l.pu):''}" placeholder="0" /></div>
      </div>
      <div class="foot"><button class="iconbtn" onclick="supprimerLigne(${i})" aria-label="Supprimer">🗑</button><div class="tot"><span class="pt">${fmt(l.qte*l.pu)}</span></div></div>
      ${l.pu?'':'<div class="small" style="color:var(--warn);margin-top:6px">⚠ Prix à renseigner</div>'}
    </div>`).join('');
  majTotaux();
}
$('lignesDevis').addEventListener('input', e=>{
  const el = e.target.closest('.ap'); if(!el) return;
  const l = S.devis.lines[+el.dataset.i], c = e.target.classList;
  if(c.contains('des')) l.des = e.target.value;
  if(c.contains('qte')) l.qte = parseFloat(e.target.value)||0;
  if(c.contains('pu')){ l.pu = parseFloat(e.target.value)||0; el.classList.toggle('warn', !l.pu); }
  l.edite = true;
  el.querySelector('.pt').textContent = fmt(l.qte*l.pu); majTotaux(); save();
});
function ajouterLigne(){ S.devis.lines.push({id:uid('l'), des:'', qte:1, pu:0, auto:false}); renderLignesDevis(); save(); const l = document.querySelectorAll('#lignesDevis .des'); l[l.length-1]?.focus(); }
function supprimerLigne(i){ S.devis.lines.splice(i,1); renderLignesDevis(); save(); majBanner(); }
function totalLignes(){ return S.devis.lines.reduce((s,l)=>s+l.qte*l.pu,0); }
function totalNet(){ const t = totalLignes(); return Math.max(0, t - Math.min(S.devis.remise||0, t)); }
function majTotaux(){
  const t = totalLignes(), rem = Math.min(S.devis.remise||0, t);
  $('totaux').innerHTML = (rem ? `<div class="tot muted"><span>Sous-total</span><span>${fmt(t)} F CFA</span></div><div class="tot muted"><span>Remise</span><span>− ${fmt(rem)} F CFA</span></div>` : '')
    + `<div class="tot big"><span>Total</span><span>${fmt(t-rem)} F CFA</span></div>`;
}
function ouvrirPickerMateriel(){
  openSheet(`<div class="shh"><b>Ajouter depuis mon matériel</b><button class="iconbtn" onclick="closeSheet()">✕</button></div>
    <input id="rechPk" type="text" placeholder="🔍 Rechercher…" oninput="renderPicker()" /><div id="listePk"></div>`);
  renderPicker();
}
function renderPicker(){
  const q = ($('rechPk')?.value||'').toLowerCase();
  const L = materiel.filter(m=>m.nom.toLowerCase().includes(q));
  $('listePk').innerHTML = L.length ? L.map(m=>`<div class="art" onclick="ajouterDepuisMateriel('${m.id}')"><div class="info"><b>${esc(m.nom)}</b><small>${esc(TYPES[m.type])}</small></div><div class="tt ${m.prix?'':'miss'}">${m.prix?fmt(m.prix):'prix ?'}</div><span class="iconbtn">＋</span></div>`).join('') : '<div class="empty">Aucun article.</div>';
}
function ajouterDepuisMateriel(id){
  const m = materiel.find(x=>x.id===id); if(!m) return;
  S.devis.lines.push({id:uid('l'), des:m.nom, qte:1, pu:m.prix||0, auto:false}); save(); renderLignesDevis(); closeSheet(); toast('Ligne ajoutée ✅');
}

/* ============================================================
   MATÉRIEL
   ============================================================ */
function specTexte(m){
  switch(m.type){
    case 'panneau': return `${fmt(m.w)} Wc · Voc ${f1(m.voc)} V · Vmp ${f1(m.vmp)} V · Isc ${f2(m.isc)} A`;
    case 'batterie': return `${m.tech==='lithium'?'Lithium':'Gel / AGM'} · ${String(m.v).replace('.',',')} V · ${m.ah} Ah · ${f2(m.v*m.ah/1000)} kWh · charge ${m.iCh} A / décharge ${m.iDech} A`;
    case 'regulateur': return `${m.techno==='pwm'?'PWM':'MPPT'} · ${m.a} A · panneaux ${m.vocMax} V max · ${(m.tensions||[]).join('/')} V`;
    case 'convertisseur': return `${fmt(m.w)} W · ${m.v} V · ${m.onde==='modifie'?'onde modifiée':'pur sinus'} · à vide ${m.idle} W`;
    case 'hybride': return `${fmt(m.w)} W · ${m.v} V · PV ${fmt(m.pvMax)} W, ${m.vocMax} V max, MPPT ${m.mpptMin}–${m.mpptMax} V · charge ${m.iCharge} A · à vide ${m.idle} W`;
    case 'cable': return `${String(m.section).replace('.',',')} mm² · ${m.usage==='pv'?'solaire (panneaux)':m.usage==='ac'?'230 V':'batterie (courant continu)'} · prix au mètre`;
    case 'protection': return `${GENRES[m.genre]||''}${m.calibre?` · ${m.calibre} A`:''}${m.vmax?` · ${m.vmax} V`:''}`;
    default: return m.auto==='un' ? 'Ajouté au devis (1)' : m.auto==='panneaux' ? 'Ajouté au devis (× nombre de panneaux)' : m.auto==='batteries' ? 'Ajouté au devis (× nombre de batteries)' : 'Ajout manuel';
  }
}
const ordreMat = m => m.w||m.a||m.ah||m.section||m.calibre||m.vmax||0;
function renderMateriel(){
  const sans = materiel.filter(m=>!m.prix).length;
  $('matBox').innerHTML = `
    <p class="muted small" style="margin:0 0 10px">Renseignez vos références, leurs caractéristiques (fiche technique) et vos prix. L'application choisit le matériel dans cette liste pour le dimensionnement et chiffre le devis avec vos prix.</p>
    ${sans?`<div class="alert" style="margin:0 0 10px">⚠ ${sans} article(s) sans prix. Touchez un article pour saisir son prix.</div>`:''}
    <button class="btn" onclick="ouvrirMateriel(null)">＋ Ajouter un article</button>
    ${Object.keys(TYPES).map(t=>{
      const L = mat(t).sort((a,b)=>String(a.techno||a.tech||a.genre||a.usage||'').localeCompare(String(b.techno||b.tech||b.genre||b.usage||'')) || (a.v||0)-(b.v||0) || ordreMat(a)-ordreMat(b) || a.nom.localeCompare(b.nom,'fr'));
      return `<details class="grpd"><summary class="grp">${TYPES[t]} <span class="muted">(${L.length})</span></summary>` + (L.length ? L.map(m=>`<div class="art" onclick="ouvrirMateriel('${m.id}')"><div class="info"><b>${esc(m.nom)}</b><small>${esc(specTexte(m))}</small></div><div class="tt ${m.prix?'':'miss'}">${m.prix?fmt(m.prix):'prix ?'}</div></div>`).join('') : '<div class="empty small">Aucun article.</div>') + '</details>';
    }).join('')}`;
}
let editMat = null;
/* Valeurs typiques proposées dans les fiches : quand on change la puissance d'un panneau, la capacité d'une
   batterie…, les caractéristiques qui en dépendent sont recalculées, tant que l'utilisateur ne les a pas saisies. */
const DEPENDANCES = {
  panneau: e => specPanneau(e.w||0),
  batterie: e => specBatterie(e.tech, e.v||12, e.ah||100),
  convertisseur: e => specConvertisseur(e.w||1000, e.onde),
  hybride: e => DONNEES.specHybride(e.w||3000, e.v||24),
  regulateur: e => DONNEES.specRegulateur(e.techno, e.a||30)
};
const PILOTES = { panneau:['w'], batterie:['v','ah'], convertisseur:['w'], hybride:['w'], regulateur:['a'] };
function proposerDependants(){
  const e = editMat, f = DEPENDANCES[e.type]; if(!f || !e._auto) return;
  const s = f(e);
  for(const k in s) if(e._auto.includes(k)){ e[k] = s[k]; const el = $('em_'+k); if(el) el.value = s[k]; }
}
function champsAuto(type){ const f = DEPENDANCES[type]; return f ? Object.keys(f({ ...DEFAUTS_TYPE[type]() })) : []; }
function ouvrirMateriel(id){
  const m = id ? materiel.find(x=>x.id===id) : null;
  editMat = m ? { ...JSON.parse(JSON.stringify(m)), _auto:[] } : { id:null, type:'panneau', nom:'', prix:0, w:450, ...specPanneau(450), _auto: champsAuto('panneau') };
  openSheet(`<div class="shh"><b>${m?'Modifier l\'article':'Nouvel article'}</b><button class="iconbtn" onclick="closeSheet()">✕</button></div>
    ${m?'':`<label style="margin-top:0">Type</label><div class="chips" id="emType"></div>`}
    <div id="emChamps"></div>
    <p class="muted small">Les valeurs en <i>italique</i> sont des valeurs typiques proposées d'après ce que vous avez saisi. Remplacez-les par celles de la fiche technique : le calcul en dépend directement.</p>
    <button class="btn" style="margin-top:14px" onclick="enregistrerMateriel()">💾 Enregistrer</button>
    ${m?`<button class="btn danger" style="margin-top:8px" onclick="supprimerMateriel('${m.id}')">🗑 Supprimer</button>`:''}`);
  renderChampsMat();
}
const DEFAUTS_TYPE = {
  panneau: () => ({ w:450, ...specPanneau(450) }), batterie: () => ({ tech:'lithium', v:25.6, ah:100, ...specBatterie('lithium',25.6,100) }),
  regulateur: () => ({ techno:'mppt', a:60, vocMax:150, tensions:[12,24,48] }), convertisseur: () => ({ w:3000, v:24, ...specConvertisseur(3000,'pur') }),
  hybride: () => ({ w:3500, v:24, pvMax:4000, vocMax:500, mpptMin:120, mpptMax:450, iCharge:100, idle:40, surge:2, eta:0.92 }),
  cable: () => ({ usage:'dc', section:16 }), protection: () => ({ genre:'fusible_dc', calibre:100, vmax:0 }), autre: () => ({ auto:'non' })
};
function changerType(t){ lireChampsMat(); editMat = { id:null, type:t, nom:'', prix:editMat.prix||0, ...DEFAUTS_TYPE[t](), _auto: champsAuto(t) }; renderChampsMat(); }
function choixEdit(k, v){ lireChampsMat(); editMat[k] = v; renderChampsMat(); proposerDependants(); renderChampsMat(); }
function basculerTension(v){ lireChampsMat(); const t = new Set(editMat.tensions||[]); t.has(v) ? t.delete(v) : t.add(v); editMat.tensions = [...t].sort((a,b)=>a-b); renderChampsMat(); }
function renderChampsMat(){
  const e = editMat, chip = (k, v, t) => `<button class="chip ${e[k]===v?'on':''}" onclick="choixEdit('${k}',${typeof v==='string'?`'${v}'`:v})">${t}</button>`;
  if($('emType')) $('emType').innerHTML = Object.entries(TYPES).map(([t,n])=>`<button class="chip ${e.type===t?'on':''}" onclick="changerType('${t}')">${esc(n.split(' (')[0])}</button>`).join('');
  let h = `<label>Nom (laissez vide pour un nom automatique)</label><input id="emNom" type="text" value="${esc(e.nom)}" placeholder="${esc(e.type==='autre'?'Ex : Transport':nomAuto(e))}" />`;
  if(e.type==='batterie') h += `<label>Technologie</label><div class="chips">${chip('tech','lithium','Lithium')}${chip('tech','gel','Gel / AGM')}</div>`;
  if(e.type==='regulateur') h += `<label>Technologie</label><div class="chips">${chip('techno','pwm','PWM (simple)')}${chip('techno','mppt','MPPT')}</div>
    <label>Tensions de batterie acceptées</label><div class="chips">${[12,24,48].map(v=>`<button class="chip ${(e.tensions||[]).includes(v)?'on':''}" onclick="basculerTension(${v})">${v} V</button>`).join('')}</div>`;
  if(e.type==='convertisseur') h += `<label>Forme d'onde</label><div class="chips">${chip('onde','pur','Pur sinus')}${chip('onde','modifie','Onde modifiée')}</div>`;
  if(e.type==='convertisseur' || e.type==='hybride') h += `<label>Tension de batterie</label><div class="chips">${[12,24,48].map(v=>chip('v',v,v+' V')).join('')}</div>`;
  if(e.type==='cable') h += `<label>Usage</label><div class="chips">${chip('usage','pv','Panneaux')}${chip('usage','dc','Batterie')}${chip('usage','ac','230 V')}</div>`;
  if(e.type==='protection') h += `<label>Genre</label><select id="emGenre" onchange="choixEdit('genre',this.value)">${Object.entries(GENRES).map(([k,t])=>`<option value="${k}" ${e.genre===k?'selected':''}>${esc(t)}</option>`).join('')}</select>`;
  if(e.type==='autre') h += `<label>Ajout automatique au devis</label><div class="chips">${[['non','Non'],['un','1 fois'],['panneaux','× panneaux'],['batteries','× batteries']].map(([v,t])=>chip('auto',v,t)).join('')}</div>`;
  const ch = CHAMPS[e.type] || [];
  for(let i=0;i<ch.length;i+=2){
    h += '<div class="row">' + ch.slice(i,i+2).map(([k,l,s])=>`<div><label>${esc(l)}</label><input id="em_${k}" class="${(e._auto||[]).includes(k)?'auto':''}" type="number" inputmode="decimal" step="${s}" value="${e[k]??''}" /></div>`).join('') + '</div>';
  }
  h += `<label>Prix unitaire (F CFA${e.type==='cable'?' par mètre':''})</label><input id="emPrix" type="number" inputmode="decimal" value="${e.prix||''}" placeholder="0" />`;
  $('emChamps').innerHTML = h;
}
// Saisie dans une fiche : un champ « pilote » recalcule les valeurs proposées ; un champ modifié à la main n'est plus recalculé
document.addEventListener('input', ev => {
  const t = ev.target; if(!editMat || !t.id || !t.id.startsWith('em_') || !$('emChamps')?.contains(t)) return;
  const k = t.id.slice(3);
  if((PILOTES[editMat.type]||[]).includes(k)){ lireChampsMat(); proposerDependants(); }
  else if(editMat._auto && editMat._auto.includes(k)){ editMat._auto = editMat._auto.filter(x => x!==k); t.classList.remove('auto'); }
});
function lireChampsMat(){
  const e = editMat;
  if($('emNom')) e.nom = $('emNom').value.trim();
  if($('emPrix')) e.prix = parseFloat($('emPrix').value)||0;
  (CHAMPS[e.type]||[]).forEach(([k]) => { const el = $('em_'+k); if(el && el.value!=='' && !isNaN(parseFloat(el.value))) e[k] = parseFloat(el.value); });
}
function enregistrerMateriel(){
  lireChampsMat(); const e = editMat;
  const manque = (CHAMPS[e.type]||[]).filter(([k]) => !['bVoc','gP','vmax'].includes(k) && !(e[k] > 0));
  if(manque.length && e.type!=='protection') return toast('À renseigner : ' + manque[0][1]);
  if(e.type==='autre' && !e.nom) return toast('Écrivez le nom de l\'article');
  if(e.type==='regulateur' && !(e.tensions||[]).length) return toast('Choisissez au moins une tension');
  if(e.type==='hybride' && !(e.mpptMin < e.mpptMax && e.mpptMax <= e.vocMax)) return toast('Plage MPPT incohérente (min < max ≤ Voc max)');
  if(e.type==='panneau' && !(e.vmp < e.voc && e.imp < e.isc)) return toast('Il faut Vmp < Voc et Imp < Isc');
  if(e.type==='panneau'){ if(e.bVoc===undefined) e.bVoc = -0.28; if(e.gP===undefined) e.gP = -0.36; }
  if(!e.nom) e.nom = nomAuto(e);
  delete e._auto;
  if(e.id){ const i = materiel.findIndex(m=>m.id===e.id); materiel[i] = e; } else { e.id = uid('m'); materiel.push(e); }
  ecrire(K.mat, materiel); versionMat++; renderMateriel(); closeSheet(); toast('Article enregistré ✅');
}
function supprimerMateriel(id){
  const m = materiel.find(x=>x.id===id); if(!m || !confirm('Supprimer « '+m.nom+' » ?')) return;
  materiel = materiel.filter(x=>x.id!==id); ecrire(K.mat, materiel); versionMat++; renderMateriel(); closeSheet();
}

/* ============================================================
   DOCUMENTS : devis, bilan et note de calcul (image / PDF)
   ============================================================ */
function enTete(){
  const r = reglages;
  return `<div class="brand">${r.logo?`<img src="${r.logo}">`:''}${r.nom.trim()?`<div class="bn">${esc(r.nom.trim())}</div>`:''}${r.adresse.trim()?`<div class="ba">${esc(r.adresse.trim())}</div>`:''}</div>`;
}
function piedDoc(){ return reglages.pied.trim() ? `<div class="foot">${esc(reglages.pied.trim())}</div>` : ''; }
function docDevis(){
  const r = calculer(), a = r.choisie, t = totalLignes(), rem = Math.min(S.devis.remise||0, t), L = S.devis.lines.filter(l=>l.des.trim()||l.pu);
  const sys = !a ? '' : `<div class="sys"><div><small>Puissance solaire</small><b>${f2(a.pv.Wc/1000)} kWc · ${a.pv.N} panneau${a.pv.N>1?'x':''}</b></div>
    <div><small>Stockage</small><b>${f2(a.bat.Wh/1000)} kWh · ${a.bat.units} batterie${a.bat.units>1?'s':''}</b></div>
    <div><small>${a.hyb?'Onduleur hybride':a.conv?'Convertisseur':'Sortie'}</small><b>${a.hyb?fmt(a.hyb.m.w)+' W':a.conv?fmt(a.conv.m.w)+' W':'12 V continu'} · ${a.V} V</b></div>
    <div><small>Production (mois le plus faible)</small><b>${f2(a.prodMois[a.moisCritique]/1000)} kWh / jour</b></div></div>`;
  return `<div class="top">${enTete()}<div class="ttl"><h3>DEVIS</h3><div>N° ${esc(S.num)}</div><div>${esc(dCourt(S.date))}</div></div></div>
    <div class="cl"><b>Client :</b> ${esc(S.client)}${S.tel?`<br><b>Tél :</b> ${esc(S.tel)}`:''}${S.lieu||S.params.ville?`<br><b>Site :</b> ${esc([S.lieu, S.params.ville].filter(Boolean).join(', '))}`:''}</div>
    ${S.devis.objet.trim()?`<div class="objet"><b>Objet :</b> ${esc(S.devis.objet.trim())}</div>`:''}${sys}
    <table><thead><tr><th>Désignation</th><th class="r">Qté</th><th class="r">P.U.</th><th class="r">Total</th></tr></thead><tbody>
    ${L.map(l=>`<tr><td>${esc(l.des)}</td><td class="r">${fmt(l.qte)}</td><td class="r">${fmt(l.pu)}</td><td class="r">${fmt(l.qte*l.pu)}</td></tr>`).join('')}</tbody></table>
    <div class="sum">${rem?`<div><span>Sous-total</span><span>${fmt(t)}</span></div><div><span>Remise</span><span>− ${fmt(rem)}</span></div>`:''}<div class="grand"><span>TOTAL</span><span>${fmt(t-rem)} F CFA</span></div></div>
    ${S.devis.note.trim()?`<div class="note">${esc(S.devis.note.trim())}</div>`:''}
    <div class="disc">Dimensionnement préliminaire établi à partir des appareils déclarés par le client et des données d'ensoleillement PVGIS de ${esc(r.climat.nom)}, à confirmer après visite technique.</div>${piedDoc()}`;
}
function docBilan(){
  const r = calculer(), ap = S.appareils.filter(a=>a.qte>0 && a.w>0), B = r.besoins;
  return `<div class="top">${enTete()}<div class="ttl"><h3>BILAN</h3><div>Devis N° ${esc(S.num)}</div><div>${esc(dCourt(S.date))}</div></div></div>
    <div class="cl"><b>Client :</b> ${esc(S.client)}${S.lieu?`<br><b>Site :</b> ${esc(S.lieu)}`:''}</div>
    <h4>Consommation du client</h4>
    <table><thead><tr><th>Appareil</th><th class="r">Qté</th><th class="r">Puissance</th><th class="r">H jour</th><th class="r">H nuit</th><th class="r">Wh/jour</th></tr></thead><tbody>
    ${ap.map(a=>`<tr><td>${esc(a.nom)}</td><td class="r">${fmt(a.qte)}</td><td class="r">${fmt(a.w)} W</td><td class="r">${f1(a.hJ)}</td><td class="r">${f1(a.hN)}</td><td class="r">${fmt(a.qte*a.w*((+a.hJ||0)+(+a.hN||0)))}</td></tr>`).join('')}</tbody></table>
    ${r.vide?'':`<div class="sum" style="width:70%"><div class="grand"><span>Total par jour</span><span>${fmt(B.E)} Wh</span></div>
      <div><span>dont de jour</span><span>${fmt(B.Ej)} Wh</span></div><div><span>dont de nuit</span><span>${fmt(B.En)} Wh</span></div>
      <div><span>Puissance de pointe</span><span>${arr(B.Ppointe)} W</span></div><div><span>Au démarrage d'un moteur</span><span>${arr(B.Pstart)} W</span></div></div>`}
    <div class="disc">Dimensionnement préliminaire, à confirmer après visite technique.</div>${piedDoc()}`;
}
function docNoteCalcul(){
  const r = calculer(), a = r.choisie, P = r.P, T = SC.TECH[P.tech], c = r.climat;
  if(!a) return '';
  const ond = a.hyb || a.conv;
  return `<div class="top">${enTete()}<div class="ttl"><h3>NOTE DE CALCUL</h3><div>Devis N° ${esc(S.num)}</div><div>${esc(dCourt(S.date))}</div></div></div>
    <h4>1. Site et ensoleillement</h4>
    <div class="note">${esc(c.nom)} (${f2(c.lat)}° N, ${f2(c.lon)}° E). Panneaux inclinés à ${c.angle}° plein sud. Ensoleillement du mois le plus faible (${SC.MOIS[a.moisCritique]}) : ${f2(c.H[a.moisCritique])} kWh/m²/jour ; moyenne annuelle ${f2(c.H.reduce((s,x)=>s+x,0)/12)} kWh/m²/jour. Source : PVGIS 5.2 (Commission européenne), moyennes 2005-2020 ; températures NASA POWER (jusqu'à ${Math.round(Math.max(...c.tMax))} °C).</div>
    <h4>2. Besoins</h4>
    <div class="note">Consommation des appareils : ${fmt(a.besoins.E)} Wh/jour (jour ${fmt(a.besoins.Ej)}, nuit ${fmt(a.besoins.En)}). Pointe : ${arr(a.besoins.Ppointe)} W ; appel au démarrage : ${arr(a.besoins.Pstart)} W.
${ond?`Rendement de l'onduleur ${Math.round((ond.m.eta||0.9)*100)} % et consommation à vide ${ond.m.idle} W pendant 24 h (${fmt(a.chaine.idleWh)} Wh/jour).`:'Appareils en 12 V : pas d\'onduleur.'}
Énergie à fournir par les panneaux : ${fmt(Math.round(a.besoinNet))} Wh/jour (passage par la batterie, rendement ${Math.round(T.eta*100)} %, reconstitution de la réserve en ${SC.JOURS_RECHARGE} jours), plus ${Math.round(P.marge*100)} % de marge.</div>
    <h4>3. Panneaux</h4>
    <div class="note">${a.pv.N} × ${esc(a.pv.m.nom)} = ${fmt(a.pv.Wc)} Wc, câblés ${a.pv.ns} en série × ${a.pv.np} en parallèle.
Pertes prises en compte : température, incidence et spectre (PVGIS), poussière ${Math.round(P.poussiere*100)} %, câbles ${Math.round(P.pertesDc*100)} %, conversion ${a.pv.mode==='PWM'?'PWM (panneaux ramenés à la tension de la batterie : '+Math.round(a.pv.ratio*100)+' % de la puissance utilisée)':'MPPT 4 %'}.
Production au mois critique : ${fmt(Math.round(a.prodMois[a.moisCritique]))} Wh/jour (${Math.round(a.couverture[a.moisCritique]*100)} % du besoin).
Tension d'une chaîne : ${f1(a.pv.vocF*a.pv.ns)} V à vide par matin froid (cellules à ${Math.round(a.pv.tcMin)} °C), ${f1(a.pv.vmpC*a.pv.ns)} V en fonctionnement à ${Math.round(a.pv.tcMax)} °C.</div>
    <h4>4. Batteries</h4>
    <div class="note">${a.bat.units} × ${esc(a.bat.m.nom)} (${a.bat.series} en série × ${a.bat.par} en parallèle) = ${fmt(a.bat.Wh)} Wh, système ${a.V} V.
Énergie utile nécessaire : ${fmt(Math.round(a.bat.usable))} Wh (${(AUTONOMIES.find(x=>x[0]===P.aut)||['',''])[1].toLowerCase()}). Profondeur de décharge maximale ${Math.round(T.dod*100)} %, vieillissement ${Math.round((1-T.vieil)*100)} % : capacité minimale ${fmt(Math.round(a.bat.nomReq))} Wh.
Courant de décharge ${arr(a.bat.Idech)} A, de charge ${arr(a.bat.Ich)} A, vérifiés par rapport aux limites des batteries.</div>
    <h4>5. Câbles et protections</h4>
    <table><thead><tr><th>Liaison</th><th class="r">Courant</th><th class="r">Longueur</th><th class="r">Section</th><th class="r">Chute</th></tr></thead><tbody>
    ${a.cables.map(x=>`<tr><td>${esc(x.lien)}</td><td class="r">${f1(x.I)} A</td><td class="r">${f1(x.L)} m</td><td class="r">${String(x.S).replace('.',',')} mm²</td><td class="r">${f1(x.dv*100)} %</td></tr>`).join('')}</tbody></table>
    <div class="note">${a.protections.map(p=>`${GENRES[p.genre]}${p.calibre?' '+p.calibre+' A':''}${p.n>1?' × '+p.n:''}`).join(' ; ')}.</div>
    ${a.warns.length?`<h4>Points d'attention</h4><div class="note">${a.warns.map(esc).join('\n')}</div>`:''}
    <div class="disc">Méthode : bilan énergétique au mois le plus défavorable ; validée par simulation horaire PVGIS (systèmes autonomes). Dimensionnement préliminaire à confirmer après visite technique.</div>${piedDoc()}`;
}
function verifierDevis(){
  if(!S.devis.lines.some(l=>l.des.trim()||l.pu)){ toast('Le devis est vide'); return false; }
  if(S.devis.lines.some(l=>(l.des.trim()||l.qte) && !l.pu) && !confirm('Certaines lignes n\'ont pas de prix. Créer le document quand même ?')) return false;
  return true;
}
async function capturer(html){
  if(typeof html2canvas==='undefined') throw new Error('lib');
  const box = $('sheet'); box.innerHTML = html;
  await Promise.all([...box.querySelectorAll('img')].map(i=>i.complete?1:new Promise(r=>{i.onload=i.onerror=r;})));
  return html2canvas(box, { scale:2, backgroundColor:'#ffffff', useCORS:true });
}
async function creerPages(){
  const pages = [['Devis', docDevis()]];
  if(S.devis.bilan && S.appareils.some(a=>a.qte>0&&a.w>0)) pages.push(['Bilan', docBilan()]);
  if(S.devis.noteCalcul && calculer().choisie) pages.push(['Note_de_calcul', docNoteCalcul()]);
  const out = []; for(const [n,h] of pages) out.push([n, await capturer(h)]); return out;
}
const nomFichier = (base,ext) => `${base}_${(S.client||'client').trim().replace(/[^\w\-]+/g,'_')}.${ext}`;
const blobDe = c => new Promise(r=>c.toBlob(r,'image/png'));
function telecharger(blob, nom){ const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = nom; document.body.appendChild(a); a.click(); a.remove(); setTimeout(()=>URL.revokeObjectURL(a.href), 4000); }
async function envoyerWhatsApp(){
  if(!verifierDevis()) return; toast('Création des images…');
  try{
    const pages = await creerPages(), files = [];
    for(const [n,c] of pages) files.push(new File([await blobDe(c)], nomFichier(n,'png'), {type:'image/png'}));
    const texte = `Bonjour ${S.client||''}, voici votre devis N° ${S.num} d'un montant de ${fmt(totalNet())} F CFA.`;
    if(navigator.canShare && navigator.canShare({files})){ try{ await navigator.share({files, text:texte}); return; }catch(e){ if(e.name==='AbortError') return; } }
    files.forEach(f=>telecharger(f, f.name));
    let tel = (S.tel||'').replace(/\D/g,''); if(tel && reglages.indicatif && !tel.startsWith(reglages.indicatif) && tel.length<=9) tel = reglages.indicatif + tel;
    toast('Images enregistrées. Joignez-les dans WhatsApp.');
    setTimeout(()=>window.open((tel?'https://wa.me/'+tel:'https://wa.me/')+'?text='+encodeURIComponent(texte),'_blank'), 900);
  }catch(e){ toast('Impossible de créer les images'); }
}
async function genererPDF(){
  if(!verifierDevis()) return; toast('Création du PDF…');
  try{
    const pages = await creerPages(), { jsPDF } = window.jspdf, doc = new jsPDF({unit:'pt', format:'a4'});
    const W = doc.internal.pageSize.getWidth(), H = doc.internal.pageSize.getHeight();
    pages.forEach(([n,c],k)=>{
      if(k>0) doc.addPage();
      const imgH = c.height*W/c.width, data = c.toDataURL('image/jpeg',0.95); let y = 0;
      doc.addImage(data,'JPEG',0,y,W,imgH);
      while(imgH+y > H+1){ y -= H; doc.addPage(); doc.addImage(data,'JPEG',0,y,W,imgH); }
    });
    doc.save(nomFichier('Devis','pdf'));
  }catch(e){ toast('Impossible de créer le PDF'); }
}

/* ============================================================
   DOSSIERS, RÉGLAGES, SAUVEGARDE
   ============================================================ */
function enregistrerDossier(){
  if(!S.client.trim() && !S.appareils.length) return toast('Le dossier est vide');
  const copie = JSON.parse(JSON.stringify(S)); copie.maj = Date.now();
  const i = S.id ? dossiers.findIndex(d=>d.id===S.id) : -1;
  if(i>=0) dossiers[i] = copie; else { S.id = uid('d'); copie.id = S.id; dossiers.unshift(copie); }
  if(ecrire(K.dos, dossiers)){ ecrire(K.etat, S); nonEnregistre = false; toast(i>=0 ? 'Dossier mis à jour ✅' : 'Dossier enregistré ✅'); if(vueCourante==='plus') renderDossiers(); }
}
function dossierVide(){ return !S.client.trim() && !S.appareils.length && !S.devis.lines.length; }
function nouveauDossier(){
  if(!dossierVide() && nonEnregistre && !confirm('Commencer un nouveau dossier ? Les modifications non enregistrées du dossier en cours seront perdues.')) return;
  chargerEtude(nouvelleEtude()); vue('besoins');
}
const energieDossier = d => (d.appareils||[]).reduce((s,a)=>s+a.qte*a.w*(a.hJ!==undefined ? (+a.hJ||0)+(+a.hN||0) : (+a.h||0)),0);
function renderDossiers(){
  const q = ($('rechDos')?.value||'').toLowerCase();
  const L = [...dossiers].sort((a,b)=>(b.maj||0)-(a.maj||0)).filter(d=>((d.client||'')+' '+(d.lieu||'')+' '+(d.num||'')).toLowerCase().includes(q));
  $('listeDos').innerHTML = L.length ? L.map(d=>{
    const e = energieDossier(d), tot = ((d.devis||{}).lines||[]).reduce((s,l)=>s+l.qte*l.pu,0);
    return `<div class="art" onclick="ouvrirDossier('${d.id}')"><div class="info"><b>${esc(d.client||'Sans nom')}${d.id===S.id?'<span class="badge ok">En cours</span>':''}</b><small>${esc(d.num||'')} · ${esc(dCourt(d.date))}${d.lieu?' · '+esc(d.lieu):''} · ${f2(e/1000)} kWh/j</small></div><div class="tt">${tot?fmt(tot):''}</div><button class="iconbtn" onclick="event.stopPropagation();supprimerDossier('${d.id}')" aria-label="Supprimer">🗑</button></div>`;
  }).join('') : '<div class="empty">Aucun dossier enregistré.<br>Appuyez sur 💾 en haut de l\'écran pour enregistrer le dossier en cours.</div>';
}
function ouvrirDossier(id){
  const d = dossiers.find(x=>x.id===id); if(!d) return;
  if(d.id!==S.id && !dossierVide() && nonEnregistre && !confirm('Ouvrir ce dossier ? Les modifications non enregistrées du dossier en cours seront perdues.')) return;
  chargerEtude(d); vue('besoins'); toast('Dossier ouvert ✅');
}
function supprimerDossier(id){
  const d = dossiers.find(x=>x.id===id); if(!d || !confirm('Supprimer le dossier de « '+(d.client||'Sans nom')+' » ?')) return;
  dossiers = dossiers.filter(x=>x.id!==id); ecrire(K.dos, dossiers); if(S.id===id){ S.id = null; ecrire(K.etat, S); } renderDossiers();
}
function initPlus(){
  $('rNom').value = reglages.nom; $('rAdresse').value = reglages.adresse; $('rPied').value = reglages.pied; $('rNote').value = reglages.note; $('rIndicatif').value = reglages.indicatif; majLogo();
  $('dfVille').innerHTML = SC.villes().map(v => `<option ${v===reglages.ville?'selected':''}>${esc(v)}</option>`).join('');
  $('dfTech').value = reglages.tech; $('dfAut').value = String(reglages.aut);
  $('dfPous').value = Math.round(reglages.poussiere*100); $('dfMarge').value = Math.round(reglages.marge*100); $('dfSimul').value = Math.round(reglages.simul*100);
  $('ePrixEss').value = reglages.prixEssence; $('ePrixGas').value = reglages.prixGasoil; $('ePrixGroupe').value = reglages.prixGroupeKva||''; $('eEntretien').value = reglages.entretienHeure; $('eAppoint').value = reglages.prixKwhAppoint||'';
  renderDossiers();
}
function sauverReglages(){ reglages.nom = $('rNom').value; reglages.adresse = $('rAdresse').value; reglages.pied = $('rPied').value; reglages.note = $('rNote').value; reglages.indicatif = $('rIndicatif').value.replace(/\D/g,''); ecrire(K.reg, reglages); }
function majDefaut(k,val,div){ const n = typeof val==='string' && isNaN(parseFloat(val)) ? val : parseFloat(val)/(div||1); if(typeof n==='number' && (isNaN(n) || n<0)) return; reglages[k] = n; ecrire(K.reg, reglages); }
function choisirLogo(e){
  const f = e.target.files[0]; if(!f) return;
  const r = new FileReader();
  r.onload = ev => { const img = new Image(); img.onload = () => {
    const max = 360, s = Math.min(1, max/Math.max(img.width,img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width*s); c.height = Math.round(img.height*s);
    const x = c.getContext('2d'); x.fillStyle = '#fff'; x.fillRect(0,0,c.width,c.height); x.drawImage(img,0,0,c.width,c.height);
    reglages.logo = c.toDataURL('image/png'); ecrire(K.reg, reglages); majLogo(); toast('Logo enregistré ✅'); };
    img.src = ev.target.result; };
  r.readAsDataURL(f); e.target.value = '';
}
function retirerLogo(){ reglages.logo = ''; ecrire(K.reg, reglages); majLogo(); }
function majLogo(){ const p = $('logo-preview'); p.src = reglages.logo||''; p.style.display = reglages.logo ? 'block' : 'none'; }
function exporterSauvegarde(){ telecharger(new Blob([JSON.stringify({appli:'soladima', version:2, materiel, dossiers, reglages}, null, 1)], {type:'application/json'}), `sauvegarde-soladima-${aujourdhui()}.json`); }
function importerSauvegarde(e){
  const f = e.target.files[0]; if(!f) return; const r = new FileReader();
  r.onload = ev => { try{
    const d = JSON.parse(ev.target.result); if(!Array.isArray(d.materiel) && !Array.isArray(d.dossiers)) throw new Error('format');
    if(!confirm('Remplacer les données actuelles par cette sauvegarde ?')) return;
    if(d.reglages) reglages = {...reglages, ...d.reglages};
    if(!d.version || d.version < 2) reglages.catalogue = 0;
    if(Array.isArray(d.materiel)) materiel = migrerMateriel(d.materiel);
    if(Array.isArray(d.dossiers)) dossiers = d.dossiers.map(migrerEtude);
    ecrire(K.mat, materiel); ecrire(K.dos, dossiers); ecrire(K.reg, reglages); versionMat++; initPlus(); toast('Sauvegarde restaurée ✅');
  }catch(err){ toast('Fichier invalide'); } };
  r.readAsText(f); e.target.value = '';
}

/* ============================================================
   Démarrage
   ============================================================ */
(function init(){
  try{ if(localStorage.getItem(K.dark)==='1') document.body.classList.add('dark'); }catch(e){}
  reglages = {...reglages, ...lire(K.reg, {})};
  if(reglages.simul === 0.8) reglages.simul = 1;                // ancienne valeur par défaut (v1)
  materiel = lire(K.mat, null);
  if(!Array.isArray(materiel) || !materiel.length){ materiel = materielParDefaut(); reglages.catalogue = 2; ecrire(K.reg, reglages); }
  else materiel = migrerMateriel(materiel);
  ecrire(K.mat, materiel);
  dossiers = lire(K.dos, []).map(migrerEtude); ecrire(K.dos, dossiers);
  majDatalistAp();
  const e = lire(K.etat, null);
  chargerEtude(e && Array.isArray(e.appareils) ? e : nouvelleEtude());
  const h = location.hash.slice(1);                              // ex. index.html#systeme ouvre directement un onglet
  vue(TITRES[h] ? h : 'besoins');
})();

/* ---------- Installation / hors ligne (PWA) ---------- */
if('serviceWorker' in navigator && /^https?:$/.test(location.protocol)){
  window.addEventListener('load', ()=>{ navigator.serviceWorker.register('sw.js').catch(()=>{}); });
}
