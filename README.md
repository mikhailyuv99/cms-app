# CMS — Édition de site

Application permettant aux clients de modifier le contenu de leur site (textes et images dans `content.json`) puis de publier en un clic (commit + push GitHub → déploiement Netlify).

## Démarrage

```bash
cd cms-app
cp .env.example .env
# Éditer .env : CMS_PASSWORD et GITHUB_TOKEN
npm install
npm run dev
```

Ouvrir **http://localhost:3000**.

- **Connexion :** mot de passe défini dans `CMS_PASSWORD` (par défaut `demo` si non défini).
- **Charger un projet :** entrer l’URL du dépôt GitHub (ex. `owner/repo`) et optionnellement l’URL du site.
- Le dépôt doit contenir un fichier **`content.json`** à la racine (même structure que le mockup-site).
- **Modifications terminées :** envoie les changements sur GitHub ; Netlify redéploie automatiquement si le site est connecté au dépôt.

## Prérequis

- **GITHUB_TOKEN :** un token GitHub avec le scope `repo`, dont le compte a accès en écriture aux dépôts clients (collaborateur ou propriétaire).
- **Netlify :** chaque site client doit être déployé via Netlify à partir du même dépôt (déploiement déclenché à chaque push).

## Structure du contenu

Le fichier `content.json` attendu dans chaque dépôt suit le schéma du mockup (hero, about, services, contact). Voir `mockup-site/content.json`.
