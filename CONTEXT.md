# CONTEXT.md — feedback-service

> Lu au début de chaque ticket. Mis à jour après chaque ticket résolu.

## Projet

- **Nom :** feedback-service
- **Description :** Service Node/Express centralisé de capture de feedback utilisateur avec persistance SQLite et routage de tickets
- **Repo :** github.com/tawala777/feedback-service
- **Branche :** main
- **Path local :** ~/.openclaw/data/projects/feedback-service/

## Stack et commandes

| Action | Commande |
|--------|----------|
| Run dev | `npm run dev` |
| Run prod | `npm start` |
| Health | `curl http://localhost:4400/api/feedback/health` |
| PM2 | `pm2 restart feedback-service` |
| Port | `127.0.0.1:4400` |

## Architecture

```text
feedback-service/
  src/
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB + API chat + API submit + dashboard admin feedbacks + admin apps + service statique widget + planification dispatch
    db.js            — accès SQLite, migrations conversations/messages + table `apps` + table `attachments`, helpers CRUD + file de dispatch locale
    llm.js           — relais Groq (OpenAI-compatible), prompt de cadrage, fallback modèles, dégradation propre
    dispatcher.js    — drain asynchrone des conversations `pending/failed` vers les backlogs agents, payload unifié Candy/Sandy
    anthropic.js     — ancien placeholder T3, désormais inutilisé
    routing.js       — accès au routing via `getRoute(slug)` / `listApps()` depuis SQLite
  public/
    feedback-widget.js — widget flottant complet (modale chat + submit async + charte visuelle unifiée)
    new.html           — page locale de création d’un nouveau feedback (sélecteur de source + widget)
  data/              — stockage local SQLite (`conversations.db`)
```

## Conventions

- Bind HTTP strict sur `127.0.0.1` uniquement
- Port par défaut `4400`
- Configuration runtime via `.env` local non versionné
- Base SQLite dans `data/conversations.db`
- SQLite en mode WAL
- Le routing des apps n'est plus codé en dur : table SQLite `apps` + helper `getRoute(slug)`
- Seed initial de `apps` : `bookingsExtApi`, `team-tracker`, `aam-website`, `stats-v1`, `hotel-aggregator`
- L'app système `demo` est garantie au boot via `upsertApp(...)` avec `skip=1`, `configured=1`, `active=1` pour la page locale `/widget/new.html`
- `listApps()` / `getApp()` / `discoverApp()` / `upsertApp()` vivent dans `src/db.js`; `routing.js` ne contient plus de mapping statique
- Une source inconnue n'est plus rejetée au dispatch : elle est auto-créée dans `apps` avec `configured=0`, sans destination, et le feedback reste `pending` tant qu'un dev n'est pas assigné
- Une source avec `skip=1` est consommée par le dispatcher en `dispatch_status='skipped'` et ne crée jamais de ticket backlog
- Une conversation soumise avec une spec strictement identique (`type + title + description`) à une conversation plus ancienne de la même source est marquée en doublon léger : `dispatch_status='skipped'`, `duplicate_of=<id original>`, `duplicate_reason` renseigné
- Le dispatcher envoie désormais un payload unifié à Candy ET Sandy : `title`, `description`, `priority`, `mission`, `lot`, `wave`, `createdBy`
- La `description` dispatchée n'est plus un simple résumé : elle inclut aussi `Utilisateur déclaré`, `## Transcript complet` (tous les tours user/assistant) et `## Captures jointes` si des images existent
- La `description` du ticket dispatché embarque désormais `Conversation + detail : <service>/admin/feedbacks/<conversationId>` puis un bloc `Conversation complete` contenant tous les messages `user`/`assistant` horodatés dans l'ordre
- Le lien de détail injecté dans les tickets utilise `FEEDBACK_SERVICE_URL` ou `SERVICE_URL` si défini, sinon fallback `http://localhost:4400`
- Le widget statique est servi sous `/widget/*` avec `Cache-Control: public, max-age=300`
- Les fichiers JS widget forcent `Content-Type: application/javascript; charset=utf-8`
- Le widget utilise `document.currentScript` avec fallback `querySelector('script[src*="feedback-widget.js"]')`
- Le header du widget affiche explicitement le nom de l'application : `data-app-name` si fourni, sinon fallback sur `data-source`
- Le widget expose un champ `Utilisateur` (optionnel) persisté en `localStorage` sous `fb-user`, renvoyé à `/api/feedback/chat` et `/api/feedback/submit`, puis affiché dans la colonne `User` de l'admin
- Le widget supporte aussi les images : bouton `📎` (fichier) + collage presse-papier image dans le textarea, upload via `POST /api/feedback/upload`, stockage disque sous `public/uploads/feedback/`
- Charte widget actuelle : palette bleu nuit / bleu vif / neutres froids, bouton flottant circulaire avec icône bulle SVG, header de modale avec tuile icône, CTA primaires en dégradé, bulles user bleues et assistant blanches bordées
- Le widget soumet le chat vers `/api/feedback/chat` puis, quand `readyForSubmit=true`, affiche un bouton "Envoyer le ticket" qui appelle `/api/feedback/submit`
- Après submit réussi, le widget se réinitialise immédiatement : nouvelle `conversationId=null`, messages réinitialisés, champs re-réactivés, bouton submit masqué, et confirmation visible avant un nouveau cycle
- Après submit réussi, le widget affiche seulement une confirmation (`✓ Feedback enregistré, merci.`) — jamais d'ID de ticket
- LLM = Groq via `openai` pointé sur `https://api.groq.com/openai/v1`
- Modèles Groq essayés dans l'ordre : `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `mixtral-8x7b-32768`
- Si Groq est indisponible, `/api/feedback/chat` répond `200` avec message de réessai et `readyForSubmit=false` (jamais de faux cadrage)
- Le submit est totalement découplé du dispatch : `/api/feedback/submit` ne fait aucun appel réseau et écrit seulement en file locale (`dispatch_status='pending'`)
- Colonnes de dispatch locales dans `conversations` : `submit_spec`, `dispatch_status`, `dispatch_attempts`, `last_dispatch_error`, `dispatched_at`
- Le dispatcher tourne toutes les 2 minutes + un passage au démarrage du process via `runDispatch()`
- Routing actuel : `bookingsExtApi`, `team-tracker`, `aam-website` -> Candy local (`http://localhost:4000/api/tickets`); `stats-v1` et `hotel-aggregator` -> Sandy via `SANDY_TICKETS_URL` (vide par défaut)
- Une barre de navigation commune `Feedbacks | Apps | New` est rendue en haut de `/admin/feedbacks`, `/admin/feedbacks/:id` et `/admin/apps`, avec mise en évidence de la page courante
- Cette nav expose aussi un badge `env` à droite : au survol/clic, un panneau lazy-loadé lit `/api/admin/env` et affiche la config runtime du service sans jamais exposer de secret en clair
- `/admin/feedbacks` affiche jusqu'à 200 conversations avec états : `draft`, `finalisé`, `en file`, `échec (retry)`, `envoyé`
- Chaque ligne de `/admin/feedbacks` pointe vers `/admin/feedbacks/:id`
- `/admin/feedbacks/:id` affiche l'échange complet, les captures jointes (`attachments`), la spec soumise (`submit_spec`) et l'état ticket enrichi si disponible
- Pour les lignes `envoyé`, la liste et le détail tentent de lire le ticket agent courant, affichent son statut brut (`open`, `resolved`, `http 404`, `unreachable`, etc.) et rendent `ticket_destination` cliquable vers l'endpoint ticket correspondant
- Pour les lignes `failed`, la liste montre l'erreur complète en rouge + compteur `tentatives/5`, et la vue détail affiche un bouton `Re-poster`
- Pour les lignes `skipped` issues d'un doublon, la liste montre un badge/lien `Doublon · voir original`, et la vue détail affiche un bloc `Doublon détecté` avec lien vers l'original
- `POST /admin/feedbacks/:id/redispatch` est limité aux conversations `failed` : il remet `pending`, remet les compteurs à zéro, puis le dispatcher la reprend au cycle suivant
- `/api/admin/apps` expose les apps en JSON ; `POST /api/admin/apps` crée/édite une app et recalcule `configured` selon la présence d'un `agent`
- `/api/admin/env` expose un snapshot de diagnostic sans secret : port, serviceUrl, CORS, `SANDY_TICKETS_URL`, config LLM Groq (modèles/baseUrl/maxTokens/temp + booléen `apiKeyConfigured`), booléen `anthropicKeyConfigured`, compteurs DB, intervalle dispatcher, `NODE_ENV`
- `/admin/apps` affiche le tableau des apps + un formulaire simple de configuration, avec badge visible `⚠ à configurer` quand `configured=0`
- Le champ `ticket_url` du formulaire admin utilise un placeholder explicitement indicatif (`ex. ... — vide = non routé`) et les placeholders y sont rendus en italique/gris léger pour éviter la confusion avec une valeur réellement saisie
- Chaque ligne de `/admin/apps` propose désormais un bouton `Éditer` qui pré-remplit immédiatement le formulaire du bas (édition rapide inline, sans nouvelle page)
- Le tableau `apps` wrappe désormais `ticket_url` et garde la colonne `État` visible sans scroll horizontal sur un écran standard
- `public/new.html` ne met plus `data-source` en dur : la page résout la source via `?source=<slug>` + `/api/admin/apps`, puis injecte dynamiquement le widget avec `data-source` et `data-app-name`
- `public/new.html` affiche un sélecteur `Application cible`, recharge la page sur `?source=<slug>` au changement, et expose un lien discret `← Admin` vers `/admin/feedbacks`
- Défaut de `public/new.html` : `demo`; choisir `bookingsExtApi` / `team-tracker` / `aam-website` crée un vrai ticket Candy, `stats-v1` / `hotel-aggregator` restent `pending` tant que Sandy n'est pas branché, `demo` finit en `skipped`
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** aucun
- **Dernier ticket :** #254 — badge `env` + panneau de config admin
- **Etat courant spécifique :** l’admin expose maintenant un badge `env` à droite de la nav ; il charge paresseusement `/api/admin/env`, affiche la config utile du service (sans secret) dans un panneau hover/click, et reste atteignable sans zone morte entre badge et panneau
- **Prochaine étape :** #255 — panneau `ⓘ` dans le widget avec source/user/destination/mode
