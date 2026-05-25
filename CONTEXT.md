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
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB + API chat + API submit + service statique widget + planification dispatch
    db.js            — accès SQLite, migrations conversations/messages, helpers CRUD + file de dispatch locale
    llm.js           — relais Groq (OpenAI-compatible), prompt de cadrage, fallback modèles, dégradation propre
    dispatcher.js    — drain asynchrone des conversations `pending/failed` vers les backlogs agents
    anthropic.js     — ancien placeholder T3, désormais inutilisé
    routing.js       — mapping source -> destination agent / URL / métadonnées Sandy
  public/
    feedback-widget.js — placeholder T5 servi statiquement, widget complet prévu en T6
  data/              — stockage local SQLite (`conversations.db`)
```

## Conventions

- Bind HTTP strict sur `127.0.0.1` uniquement
- Port par défaut `4400`
- Configuration runtime via `.env` local non versionné
- Base SQLite dans `data/conversations.db`
- SQLite en mode WAL
- Le widget statique est servi sous `/widget/*` avec `Cache-Control: public, max-age=300`
- Les fichiers JS widget forcent `Content-Type: application/javascript; charset=utf-8`
- LLM = Groq via `openai` pointé sur `https://api.groq.com/openai/v1`
- Modèles Groq essayés dans l'ordre : `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `mixtral-8x7b-32768`
- Si Groq est indisponible, `/api/feedback/chat` répond `200` avec message de réessai et `readyForSubmit=false` (jamais de faux cadrage)
- Le submit est totalement découplé du dispatch : `/api/feedback/submit` ne fait aucun appel réseau et écrit seulement en file locale (`dispatch_status='pending'`)
- Colonnes de dispatch locales dans `conversations` : `submit_spec`, `dispatch_status`, `dispatch_attempts`, `last_dispatch_error`, `dispatched_at`
- Le dispatcher tourne toutes les 2 minutes + un passage au démarrage du process via `runDispatch()`
- Routing actuel : `bookingsExtApi`, `team-tracker`, `aam-website` -> Candy local (`http://localhost:4000/api/tickets`); `stats-v1` et `hotel-aggregator` -> Sandy via `SANDY_TICKETS_URL` (vide par défaut)
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** ticket #219 sur `main`
- **Dernier ticket :** #219 — dispatcher asynchrone des conversations `pending/failed` vers les backlogs agents
- **Etat courant spécifique :** une conversation locale `bookingsExtApi` en file est correctement dispatchée vers Candy local avec `dispatch_status='sent'`, `ticket_id` et `ticket_destination`; une conversation `stats-v1` reste `pending` sans erreur tant que `SANDY_TICKETS_URL` est vide
- **Prochaine étape :** #220 — widget complet (bouton flottant + modale chat + submit async)
