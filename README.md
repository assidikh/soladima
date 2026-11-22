# ☀️ SolaDima

Application pour les installateurs solaires : on saisit les appareils du client,
l'application calcule ses **besoins en énergie**, propose un **système solaire
autonome** (panneaux, batteries, onduleur, régulateur MPPT) et produit le
**devis** en PDF ou en images à envoyer par WhatsApp.

## 📱 Ouvrir l'application

👉 **https://assidikh.github.io/soladima/**

Le lien s'ouvre dans le navigateur de n'importe quel téléphone ou ordinateur.
Aucun compte n'est nécessaire.

## 📲 L'installer sur le téléphone

**Android (Chrome)** : ouvrir le lien, toucher le menu **⋮** puis
**« Installer l'application »** (ou « Ajouter à l'écran d'accueil »).

**iPhone (Safari)** : ouvrir le lien dans Safari, toucher le bouton
**Partager** puis **« Sur l'écran d'accueil »**.

Une fois installée, SolaDima s'ouvre comme une application et **fonctionne sans
internet**.

## 🔒 Vos données restent sur votre téléphone

Chaque utilisateur a ses propres données : dossiers clients, matériel, prix et
réglages sont enregistrés **uniquement dans le navigateur de l'appareil**. Rien
n'est envoyé sur internet et personne d'autre n'y a accès.

Conséquence : les données ne passent pas d'un téléphone à l'autre toutes
seules. Utilisez **Plus → Sauvegarde → ⬇ Sauvegarder** régulièrement, et
**⬆ Restaurer** sur le nouveau téléphone. Effacer les données du navigateur
efface aussi celles de SolaDima.

## Fonctionnement

1. **Besoins** : la ville du client et ses appareils (puissance, heures par
   jour réparties entre le jour et la nuit avec une barre, démarrage des
   moteurs, usage ponctuel, existe en 12 V). Un appareil saisi librement
   (« congélateur », « Lampe 15 W », « clim 1,5 CV »…) est reconnu et des
   valeurs courantes sont proposées.
2. **Système** : quatre solutions comparées, avec leur prix :
   - **kit 12 V** sans onduleur (régulateur et batterie, appareils en 12 V) ;
   - **régulateur** (PWM ou MPPT) **+ convertisseur** séparé ;
   - **onduleur hybride tout-en-un** (pas de régulateur ni de convertisseur en plus) ;
   - **hybride + secours** du réseau SNE ou d'un groupe.

   Pour la solution retenue : câblage des panneaux, batteries, production mois
   par mois, câbles et protections, et comparaison avec un groupe électrogène
   sur 10 ans.
3. **Devis** : lignes et prix, remise, conditions ; export PDF / WhatsApp avec
   le bilan de consommation et la note de calcul.
4. **Matériel** : votre catalogue, avec une icône et une fiche descriptive
   pour chaque article, les caractéristiques des fiches techniques et un
   **prix minimum et maximum**. Des prix indicatifs du marché (relevés en
   novembre 2026) sont proposés : remplacez-les par vos prix. Le devis
   utilise au choix le prix minimum, moyen ou maximum. Les câbles précisent
   l'âme (souple / rigide) et le métal (cuivre / aluminium).
5. **Plus** : dossiers, entreprise, logo, valeurs par défaut, prix du
   carburant, sauvegarde.

## D'où viennent les chiffres

- **Ensoleillement** : PVGIS (Commission européenne), mois par mois, pour
  24 villes du Tchad ; le calcul retient le mois le plus faible (août dans le
  sud et le centre). **Températures** : NASA POWER.
- Le calcul tient compte de la chaleur sur les panneaux, de la poussière, des
  câbles, du type de régulateur, de la consommation à vide de l'onduleur, du
  rendement et du vieillissement des batteries.
- Il vérifie les tensions des panneaux par matin froid et en plein soleil,
  les courants des batteries, et calcule les sections de câbles et les
  protections.
- **Vérification** : les systèmes proposés ont été simulés heure par heure sur
  16 années de météo réelle avec PVGIS. Avec la réserve conseillée (nuit +
  ½ jour), la batterie se vide moins de 2 % des jours sur l'année (au plus
  ~10 % des jours d'août).

Le dimensionnement reste **préliminaire** : ombrage, état du toit et qualité
réelle du matériel se vérifient lors de la visite technique.

## Contribuer

Le projet s'écrit uniquement en **HTML, CSS et JavaScript**, sans dépendance à
installer. Voir [CLAUDE.md](CLAUDE.md) pour les règles.

```bash
git clone https://github.com/assidikh/soladima.git
cd soladima
node outils/serveur-dev.mjs      # puis ouvrir http://localhost:8080
```

Tests : `node --test tests/` (moteur de calcul) et
http://localhost:8080/tests/interface.html (interface).

Pendant le développement, dans Chrome : DevTools → *Application* →
*Service workers* → cocher **Update on reload**. Avant chaque mise en ligne,
incrémenter `VERSION` dans `sw.js`.

## Auteur et droits

Créé par **Aboubakar Assidikh Youssouf** — contact :
aboubakarassidikh@gmail.com

© 2026 SolaDima. Tous droits réservés. L'utilisation de l'application est
autorisée ; le code et les contenus ne peuvent être copiés, modifiés ni
redistribués sans l'accord écrit de l'auteur (voir [LICENSE](LICENSE)).
