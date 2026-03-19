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

## Prérequis

- **GITHUB_TOKEN** : token (classic) du **compte bot**, avec le scope `repo`. Ce compte ne doit être collaborateur **que** sur les dépôts des sites clients, pas sur vos autres repos.
- **CMS_SESSION_SECRET** : chaîne aléatoire pour signer les cookies de session (en production, ne pas utiliser la valeur par défaut).
- **Netlify** : chaque site client est déployé via Netlify à partir de son dépôt (déploiement à chaque push).

## Règle d’indépendance (important)

**Le CMS est indépendant des sites clients.** Lors de toute évolution du CMS (nouvelles fonctionnalités, correctifs, refacto), il ne doit y avoir **aucune modification requise** sur les sites clients (dépôts des clients, mockup, etc.). Le CMS lit et écrit uniquement `content.json` dans le repo du client ; c’est au site client de décider comment il affiche ces données. Les mises à jour du CMS ne doivent jamais imposer de changer le code des sites clients.

## Structure du contenu (adaptable)

Le fichier `content.json` à la racine du dépôt peut contenir **tout ou partie** des sections : hero, about, services, contact. Le CMS détecte les sections présentes et n’édite que celles-là ; l’ordre d’affichage est donné par `sectionOrder` (ou ordre par défaut). Voir **`PROMPT-CMS-COMPATIBLE.md`** (à la racine du repo) pour le prompt à donner à une IA qui développe un site client compatible.
