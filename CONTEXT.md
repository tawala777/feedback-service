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
    server.js        — bootstrap Express + CORS + health endpoint enrichi DB + API chat + API submit + dashboard admin + service statique widget + planification dispatch
    db.js            — accès SQLite, migrations conversations/messages, helpers CRUD + file de dispatch locale
    llm.js           — relais Groq (OpenAI-compatible), prompt de cadrage, fallback modèles, dégradation propre
    dispatcher.js    — drain asynchrone des conversations `pending/failed` vers les backlogs agents
    anthropic.js     — ancien placeholder T3, désormais inutilisé
    routing.js       — mapping source -> destination agent / URL / métadonnées Sandy
  public/
    feedback-widget.js — widget flottant complet (modale chat + submit async + charte visuelle unifiée)
    test.html          — page locale de validation manuelle du widget
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
- Le widget utilise `document.currentScript` avec fallback `querySelector('script[src*="feedback-widget.js"]')`
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
- `/admin/feedbacks` affiche jusqu'à 200 conversations avec états : `draft`, `finalisé`, `en file`, `échec (retry)`, `envoyé`
- Pour les lignes `envoyé`, le dashboard tente de lire le ticket agent courant et affiche son statut brut (`open`, `resolved`, `http 404`, `unreachable`, etc.) sans jamais casser la page
- PM2 process name: `feedback-service`

## Etat courant

- **Travail en cours :** aucun
- **Dernier ticket :** #224 — réinitialisation du widget après submit sans reload
- **Etat courant spécifique :** après submit réussi, le widget reste immédiatement réutilisable sans reload : confirmation visible, input réactivé, `conversationId` remise à `null`, historique remplacé par un nouveau prompt de départ; validation navigateur OK sur `/widget/test.html`
- **Prochaine étape :** aucun ticket feedback-service ouvert
