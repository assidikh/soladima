# CLAUDE.md — SolaDima

## 0. Instructions des contributeurs — à traiter en début de session

Le fichier `instructions.txt` (importé ci-dessous, donc chargé automatiquement)
contient les demandes laissées par les contributeurs. Au début de chaque
session :

1. Faire `git pull` pour récupérer les dernières instructions, puis relire la
   section « À FAIRE » de `instructions.txt`.
2. S'il y a des instructions en attente, les **résumer à l'utilisateur** et
   les appliquer, en respectant toutes les règles de ce fichier (HTML/CSS/JS
   uniquement, données propres à chaque utilisateur, tests).
3. Une instruction ambiguë, risquée (suppression de données, changement de
   méthode de calcul) ou contraire à ces règles n'est pas appliquée telle
   quelle : poser la question à l'utilisateur.
4. Une fois traitée, déplacer l'instruction sous « FAIT » avec la date et un
   court compte rendu (fichiers modifiés, tests passés).
5. Lancer les tests (§ 1 bis), puis demander à l'utilisateur avant de
   pousser sur `main` (un push publie l'application).

@instructions.txt

## 1. Règle n° 1 : HTML, CSS et JavaScript uniquement

Le projet s'écrit **exclusivement en HTML, CSS et JavaScript** (JavaScript
natif du navigateur). Aucun autre langage : pas de Python, PHP, TypeScript,
Sass, ni de framework qui demande une compilation (React, Vue, etc.). Pas de
`npm install` ni de dépendance à télécharger : l'application doit s'ouvrir
telle quelle dans un navigateur. Les seuls outils de développement admis sont
eux aussi en JavaScript (ex. `outils/serveur-dev.mjs`, lancé avec Node).

## 2. Ce qu'est l'application

PWA de **dimensionnement préliminaire d'un système solaire autonome** (panneaux,
batteries, onduleur, régulateur MPPT) et de **création de devis** (PDF, images
WhatsApp), pour les installateurs de N'Djaména (F CFA, indicatif +235).

- `index.html` : styles et balisage. Les bibliothèques jsPDF 2.5.1 et
  html2canvas y sont **intégrées** pour fonctionner hors ligne ; ne pas les
  remplacer par des liens CDN.
- `app.js` : interface. Navigation : **Accueil** (présentation, nouveau client, dimensionnement rapide, bouton « Installer » visible seulement dans le navigateur), **Clients** (liste simple → fiche du client → onglets Fiche / Besoins / Système / Devis), **Matériel**, **Plus** (réglages, à propos). Les clients sont enregistrés automatiquement. Migration des données v1.
- `calcul.js` : **moteur de dimensionnement**, sans accès à la page, testable
  seul. Point d'entrée `SolaCalcul.dimensionner(appareils, params, materiel)`.
- `donnees.js` : appareils courants et catalogue par défaut (valeurs typiques).
- `climat.js` : **fichier généré** par `outils/generer-climat.mjs` (PVGIS +
  NASA POWER, 24 villes du Tchad). Ne pas le modifier à la main.
- `sw.js` : service worker (cache hors ligne) ; la liste `FILES` doit contenir
  tout fichier ajouté.
- `manifest.webmanifest`, `icon-192.png`, `icon-512.png` : installation.

### Méthode de calcul (à préserver)

Bilan énergétique au **mois le plus défavorable** de la ville (PVGIS), avec une
chaîne de rendements explicite : température des panneaux (PVGIS), poussière,
câbles, MPPT ou PWM (P ≈ Imp × V batterie), rendement et **consommation à vide**
de l'onduleur sur 24 h, rendement des batteries, profondeur de décharge,
vieillissement. Quatre architectures comparées : kit 12 V, régulateur +
convertisseur, onduleur hybride, hybride + secours. Contrôles : tension des
chaînes à froid (Voc) et à chaud (Vmp), courants de charge et de décharge des
batteries, sections de câbles (chute de tension et courant admissible ≥ calibre
de la protection), protections. Toute constante nouvelle est nommée en tête de
`calcul.js` avec sa justification.

## 1 bis. Tests — à lancer avant chaque commit

- `node --test tests/` : tests du moteur (doivent tous passer).
- http://localhost:8080/tests/interface.html : test de l'interface et de la
  migration des données v1 (doit afficher « 0 échoués »).
- `node outils/valider-pvgis.mjs` (internet) : simulation horaire PVGIS des
  systèmes proposés. Critère : ≲ 10 % de jours « batterie vide » au pire mois,
  ≲ 2 % sur l'année, avec la réserve par défaut (nuit + ½ jour).

## 2 bis. Auteur et droits

Auteur : **Aboubakar Assidikh Youssouf** (aboubakarassidikh@gmail.com). © 2026 SolaDima, tous droits réservés (voir `LICENSE`). Garder la mention dans l'accueil et la section « À propos ».

## 3. Données : propres à chaque utilisateur

Aucun serveur, aucun compte. Tout est stocké dans le `localStorage` du
navigateur de chaque utilisateur (clés préfixées `soladima_`). Chaque téléphone a
donc ses propres dossiers, matériel, prix et réglages ; personne ne voit les
données d'un autre. À préserver :

- ne jamais ajouter d'envoi de données vers un serveur ;
- garder le préfixe `soladima_` sur toute nouvelle clé (d'autres applications
  partagent le domaine `assidikh.github.io`) ;
- en cas de changement de format, rester compatible avec les données déjà
  enregistrées (valeurs par défaut à la lecture, comme `chargerEtude()`).

## 4. Développement

- Lancer `node outils/serveur-dev.mjs` puis ouvrir http://localhost:8080 dans Chrome.
- Le service worker sert les fichiers depuis son cache : dans Chrome, DevTools →
  *Application* → *Service workers*, cocher **Update on reload** pendant le
  développement, sinon les modifications n'apparaissent pas.
- **À chaque mise en ligne**, incrémenter `VERSION` dans `sw.js` (v1 → v2…),
  sinon les téléphones gardent l'ancienne version.
- Tester à la largeur d'un téléphone (DevTools → mode appareil) : l'application
  est conçue en premier pour mobile.

## 5. Publication

La branche `main` est publiée par GitHub Pages sur
https://assidikh.github.io/soladima/. Un `git push` sur `main` met donc
l'application en ligne pour tous les utilisateurs : vérifier en local avant.
