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
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB + API chat + service statique widget
    db.js            — accès SQLite, migrations conversations/messages, helpers CRUD
    llm.js           — relais Groq (OpenAI-compatible), prompt de cadrage, fallback modèles, dégradation propre
    anthropic.js     — ancien placeholder T3, désormais inutilisé
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
- LLM = Groq via `openai` pointé sur `https://api.groq.com/openai/v1`
- Modèles Groq essayés dans l'ordre : `llama-3.3-70b-versatile`, `llama-3.1-70b-versatile`, `mixtral-8x7b-32768`
- Si Groq est indisponible, `/api/feedback/chat` répond `200` avec message de réessai et `readyForSubmit=false` (jamais de faux cadrage)
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** aucun
- **Dernier ticket :** #217 — endpoint `/api/feedback/chat` v2 via Groq avec prompt de cadrage et `submitSpec`
- **Etat courant spécifique :** `/api/feedback/chat` crée/reprend une conversation, persiste les messages user/assistant, interroge Groq via `src/llm.js`, retourne `readyForSubmit` + `submitSpec` quand `[READY_FOR_SUBMIT]` est présent, et dégrade proprement avec message de réessai si le LLM est indisponible
- **Prochaine étape :** #218 — endpoint `/api/feedback/submit` v2 (persistance locale + mise en file dispatch, zéro réseau)
