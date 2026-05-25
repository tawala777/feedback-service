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
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB + service statique widget
    db.js            — accès SQLite, migrations conversations/messages, helpers CRUD
    anthropic.js     — placeholder T3 (relais Anthropic)
    routing.js       — placeholder T4 (routing destinations)
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
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** ticket #214 sur `main`
- **Dernier ticket :** #214 — widget statique servi sous `/widget/feedback-widget.js` avec cache 5 min et CORS validé
- **Etat courant spécifique :** `/widget/feedback-widget.js` répond en `200` avec `Content-Type: application/javascript; charset=utf-8` et `Cache-Control: public, max-age=300`; le préflight CORS vers `/api/feedback/chat` est OK pour `http://localhost:5200`
- **Prochaine étape :** #217 — endpoint `/api/feedback/chat` v2 via Groq (`src/llm.js`) avec dégradation propre si le LLM est indisponible
