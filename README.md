# CMS — Édition de site

Application permettant à **chaque client** de modifier **uniquement son site** (textes et images dans `content.json`) puis de publier en un clic (commit + push GitHub → déploiement Netlify).

- **Un mot de passe par projet** : le client ne saisit que le mot de passe qui lui a été communiqué ; il n’a pas accès aux autres projets.
- **Token GitHub** : utilise un compte GitHub dédié (bot) ajouté **uniquement en collaborateur sur les dépôts des sites clients**, pour limiter l’accès.

## Démarrage

```bash
cd cms-app
cp .env.example .env
# Éditer .env : CMS_SESSION_SECRET, GITHUB_TOKEN
npm install
npm run dev
```

Ouvrir **http://localhost:3000**. Le client entre le **mot de passe de son projet** et accède directement à l’édition de son site.

## Ajouter un nouveau projet (nouveau client)

1. **Créer le dépôt** du site client (avec `content.json` à la racine) et y ajouter le **compte GitHub bot** en collaborateur.

2. **Générer le hash du mot de passe** que vous allez donner au client :
   ```bash
   npm run hash-password "motDePasseDuClient"
   ```
   Copier la chaîne affichée (ex. `$2b$10$...`).

3. **Ajouter le projet** dans `data/projects.json` :
   ```json
   {
     "repo": "owner/repo-du-client",
     "passwordHash": "$2b$10$...",
     "siteUrl": "https://site-du-client.netlify.app",
     "name": "Nom du client ou du site"
   }
   ```

4. Commit, push, et redéployer le CMS. Donner au client l’URL du CMS et le mot de passe choisi.

## Prévisualisation = site déployé (pixel-identique)

Si le projet a une **`siteUrl`** dans `projects.json`, le dashboard affiche **le vrai site** dans une iframe (`?cmsEmbed=1`) et pousse le `content.json` en **postMessage** : le rendu est le même que sur Netlify (HTML/CSS du client).

**À faire sur chaque site client** (une fois, dans le dépôt du site) : utiliser la version à jour de `mockup-site/js/app.js` qui gère `cmsEmbed=1` (pas de `fetch` du JSON dans l’iframe ; contenu fourni par le CMS). Après merge + déploiement, l’aperçu et le site public restent alignés.

Sans `siteUrl`, seul le gabarit d’édition React (`SitePreview`) est affiché.

**Note** : si l’iframe reste vide, vérifiez les en-têtes du site (`X-Frame-Options` / CSP `frame-ancestors`) : ils doivent autoriser l’URL du CMS en parent.

## Prérequis

- **GITHUB_TOKEN** : token (classic) du **compte bot**, avec le scope `repo`. Ce compte ne doit être collaborateur **que** sur les dépôts des sites clients, pas sur vos autres repos.
- **CMS_SESSION_SECRET** : chaîne aléatoire pour signer les cookies de session (en production, ne pas utiliser la valeur par défaut).
- **Netlify** : chaque site client est déployé via Netlify à partir de son dépôt (déploiement à chaque push).

## Règle d’indépendance (important)

**Le CMS est indépendant des sites clients.** Lors de toute évolution du CMS (nouvelles fonctionnalités, correctifs, refacto), il ne doit y avoir **aucune modification requise** sur les sites clients (dépôts des clients, mockup, etc.). Le CMS lit et écrit uniquement `content.json` dans le repo du client ; c’est au site client de décider comment il affiche ces données. Les mises à jour du CMS ne doivent jamais imposer de changer le code des sites clients.

## Structure du contenu (adaptable)

Le fichier `content.json` à la racine du dépôt peut contenir **tout ou partie** des sections : hero, about, services, contact. Le CMS détecte les sections présentes et n’édite que celles-là ; l’ordre d’affichage est donné par `sectionOrder` (ou ordre par défaut). Voir **`PROMPT-CMS-COMPATIBLE.md`** (à la racine du dépôt parent `CMS/`, à côté de `cms-app/`) : prompt complet pour une IA (schéma JSON, `cmsEmbed`, `postMessage`, IDs DOM, multi-pages, iframe).

Sous **Cursor**, les règles **`.cursor/rules/cms-compatible-client-sites.mdc`** et **`content-json-cms-client.mdc`** (racine du workspace) rappellent d’appliquer ce prompt sur `mockup-site/` et les `content.json`. Vous pouvez aussi **copier `PROMPT-CMS-COMPATIBLE.md` dans le dépôt du site client** pour que l’IA du projet client ait le contrat sous la main.
