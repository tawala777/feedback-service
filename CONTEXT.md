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
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB
    db.js            — accès SQLite, migrations conversations/messages, helpers CRUD
    anthropic.js     — placeholder T3 (relais Anthropic)
    routing.js       — placeholder T4 (routing destinations)
  public/
    feedback-widget.js — placeholder T5/T6 (widget front)
  data/              — stockage local SQLite (`conversations.db`)
```

## Conventions

- Bind HTTP strict sur `127.0.0.1` uniquement
- Port par défaut `4400`
- Configuration runtime via `.env` local non versionné
- Base SQLite dans `data/conversations.db`
- SQLite en mode WAL
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** ticket #211 sur `main`
- **Dernier ticket :** #211 — SQLite branché avec schéma `conversations` / `messages` et health enrichi
- **Etat courant spécifique :** `data/conversations.db` est créé automatiquement au boot, SQLite tourne en WAL, et `/api/feedback/health` expose désormais `db.conversations` + `db.messages` sur `127.0.0.1:4400`
- **Prochaine étape :** T3 — endpoint `/api/feedback/chat` avec relais Anthropic et cadrage conversationnel
