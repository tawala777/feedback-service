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
    server.js        — bootstrap Express + CORS + health endpoint
    db.js            — placeholder T2 (SQLite)
    anthropic.js     — placeholder T3 (relais Anthropic)
    routing.js       — placeholder T4 (routing destinations)
  public/
    feedback-widget.js — placeholder T5/T6 (widget front)
  data/              — stockage local SQLite (T2)
```

## Conventions

- Bind HTTP strict sur `127.0.0.1` uniquement
- Port par défaut `4400`
- Configuration runtime via `.env` local non versionné
- Base SQLite prévue dans `data/`
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** ticket #210 sur `main`
- **Dernier ticket :** aucun avant #210
- **Etat courant spécifique :** bootstrap initial posé, dépendances installées, health endpoint en ligne sur `127.0.0.1:4400`
- **Prochaine étape :** T2 — brancher SQLite et exposer les compteurs sur le health endpoint
