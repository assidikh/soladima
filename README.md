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

1. **Besoins** : appareils du client (liste d'appareils courants, puissance,
   heures par jour, usage de jour ou de nuit).
2. **Système** : dimensionnement automatique, à partir de votre propre
   matériel.
3. **Devis** : lignes et prix, remise, conditions, export PDF / WhatsApp.
4. **Matériel** : votre catalogue et **vos prix** (à renseigner au départ).
5. **Plus** : dossiers enregistrés, informations de l'entreprise, logo,
   sauvegarde.

Le dimensionnement est **préliminaire** : il ne remplace pas une visite
technique (câbles, protections, ombrage, inclinaison, câblage des panneaux ne
sont pas calculés).

## Contribuer

Le projet s'écrit uniquement en **HTML, CSS et JavaScript**, sans dépendance à
installer. Voir [CLAUDE.md](CLAUDE.md) pour les règles.

```bash
git clone https://github.com/assidikh/soladima.git
cd soladima
node outils/serveur-dev.mjs      # puis ouvrir http://localhost:8080
```

Pendant le développement, dans Chrome : DevTools → *Application* →
*Service workers* → cocher **Update on reload**. Avant chaque mise en ligne,
incrémenter `VERSION` dans `sw.js`.
