(function() {
  'use strict';

  const scriptTag = document.currentScript || document.querySelector('script[src*="feedback-widget.js"]');
  const SOURCE = scriptTag.getAttribute('data-source') || 'unknown';
  const APP_NAME = scriptTag.getAttribute('data-app-name') || SOURCE;
  const USER_ID = scriptTag.getAttribute('data-user-id') || null;
  const SERVICE_URL = scriptTag.src.replace(/\/widget\/[^/]+$/, '');
  const USER_STORAGE_KEY = 'fb-user';

  let conversationId = null;

  const css = `
    .fb-root, .fb-root * { box-sizing: border-box; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .fb-root {
      --fb-primary: #1e40af;
      --fb-primary-dark: #1e3a8a;
      --fb-primary-soft: #dbeafe;
      --fb-surface: #ffffff;
      --fb-surface-soft: #f8fafc;
      --fb-border: #dbe3ef;
      --fb-text: #0f172a;
      --fb-text-soft: #475569;
      --fb-success: #047857;
      --fb-success-soft: #ecfdf5;
      --fb-warning: #92400e;
      --fb-warning-soft: #fff7ed;
      --fb-shadow: 0 20px 50px rgba(15, 23, 42, 0.22);
      --fb-radius: 18px;
    }
    .fb-btn {
      position: fixed; right: 24px; bottom: 24px; width: 62px; height: 62px; border-radius: 999px;
      border: 0; background: linear-gradient(135deg, var(--fb-primary) 0%, #2563eb 100%); color: #fff;
      cursor: pointer; z-index: 9999; display: inline-flex; align-items: center; justify-content: center;
      box-shadow: 0 14px 30px rgba(37, 99, 235, 0.32); transition: transform .18s ease, box-shadow .18s ease;
    }
    .fb-btn:hover { transform: translateY(-2px) scale(1.02); box-shadow: 0 18px 36px rgba(37, 99, 235, 0.38); }
    .fb-btn:active { transform: translateY(0); }
    .fb-btn svg { width: 28px; height: 28px; }
    .fb-modal-overlay {
      position: fixed; inset: 0; display: none; align-items: center; justify-content: center;
      background: rgba(15, 23, 42, 0.45); backdrop-filter: blur(4px); z-index: 10000; padding: 20px;
    }
    .fb-modal-overlay.open { display: flex; }
    .fb-modal {
      width: min(560px, 100%); height: min(720px, 92vh); background: var(--fb-surface); color: var(--fb-text);
      border: 1px solid rgba(255,255,255,.35); border-radius: 24px; box-shadow: var(--fb-shadow);
      display: flex; flex-direction: column; overflow: hidden;
    }
    .fb-header {
      position: relative;
      padding: 18px 20px; background: linear-gradient(180deg, #f8fbff 0%, #eef4ff 100%);
      border-bottom: 1px solid var(--fb-border); display: flex; justify-content: space-between; align-items: flex-start; gap: 16px;
    }
    .fb-header-main { display: flex; gap: 14px; align-items: flex-start; min-width: 0; }
    .fb-header-icon {
      width: 42px; height: 42px; border-radius: 12px; background: var(--fb-primary); color: #fff;
      display: inline-flex; align-items: center; justify-content: center; flex: 0 0 auto;
      box-shadow: 0 10px 18px rgba(30, 64, 175, 0.18);
    }
    .fb-header-icon svg { width: 20px; height: 20px; }
    .fb-header-copy h3 { margin: 0 0 4px; font-size: 17px; line-height: 1.25; color: var(--fb-text); }
    .fb-header-copy p { margin: 0; font-size: 13px; line-height: 1.45; color: var(--fb-text-soft); }
    .fb-header-top { display:flex; align-items:center; gap:8px; margin-bottom:8px; flex-wrap:wrap; }
    .fb-app-chip {
      display: inline-flex; align-items: center; gap: 6px; padding: 4px 10px;
      border-radius: 999px; background: rgba(37, 99, 235, 0.10); color: var(--fb-primary-dark);
      font-size: 11px; font-weight: 700; letter-spacing: .03em; text-transform: uppercase;
    }
    .fb-info-wrap { position: static; display:inline-flex; align-items:center; }
    .fb-info-btn {
      width: 24px; height: 24px; border-radius: 999px; border: 1px solid rgba(37,99,235,.18);
      background: rgba(255,255,255,.88); color: var(--fb-primary-dark); cursor: pointer;
      display:inline-flex; align-items:center; justify-content:center; font-size: 13px; font-weight: 700;
    }
    .fb-info-btn:hover { background:#fff; border-color: rgba(37,99,235,.35); }
    .fb-info-panel {
      position:absolute; top:calc(100% - 1px); left:16px; right:16px; width:auto;
      background:#fff; border:1px solid var(--fb-border); border-radius:14px; padding:12px 14px;
      box-shadow: 0 18px 34px rgba(15,23,42,.16); z-index:3; color:var(--fb-text);
    }
    .fb-info-panel[hidden] { display:none; }
    .fb-info-title { font-size:13px; font-weight:700; color:var(--fb-text); margin-bottom:8px; }
    .fb-info-grid { display:grid; grid-template-columns:92px 1fr; gap:6px 10px; font-size:12px; line-height:1.45; color:var(--fb-text-soft); }
    .fb-info-grid strong { color:var(--fb-text); }
    .fb-close {
      width: 36px; height: 36px; border-radius: 10px; border: 0; background: rgba(148, 163, 184, 0.12);
      color: var(--fb-text-soft); cursor: pointer; font-size: 22px; line-height: 1; flex: 0 0 auto;
    }
    .fb-close:hover { background: rgba(148, 163, 184, 0.2); color: var(--fb-text); }
    .fb-userbar {
      padding: 12px 16px; border-bottom: 1px solid var(--fb-border); background: #fff;
    }
    .fb-user-label { display:block; margin-bottom: 6px; font-size: 12px; color: var(--fb-text-soft); font-weight: 600; }
    .fb-user-input {
      width: 100%; padding: 10px 12px; border: 1px solid var(--fb-border); border-radius: 10px;
      background: var(--fb-surface-soft); color: var(--fb-text); font-size: 14px; outline: none;
    }
    .fb-user-input::placeholder { color: #94a3b8; }
    .fb-messages {
      flex: 1; overflow-y: auto; padding: 18px; background:
        radial-gradient(circle at top, rgba(219, 234, 254, 0.45), transparent 30%),
        linear-gradient(180deg, #ffffff 0%, #f8fafc 100%);
    }
    .fb-msg { max-width: 88%; margin-bottom: 12px; padding: 11px 14px; border-radius: 16px; line-height: 1.5; font-size: 14px; }
    .fb-msg.user {
      margin-left: auto; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color: #fff;
      border-bottom-right-radius: 6px; box-shadow: 0 8px 18px rgba(37,99,235,.18);
    }
    .fb-msg.assistant {
      margin-right: auto; background: #fff; color: var(--fb-text); border: 1px solid var(--fb-border);
      border-bottom-left-radius: 6px; white-space: pre-wrap; box-shadow: 0 6px 16px rgba(15,23,42,.06);
    }
    .fb-msg.system {
      margin-right: auto; background: var(--fb-warning-soft); color: var(--fb-warning); border: 1px solid #fed7aa;
      font-size: 13px; font-style: normal;
    }
    .fb-submit-bar {
      display: none; padding: 14px 16px; background: var(--fb-success-soft); border-top: 1px solid #bbf7d0;
    }
    .fb-submit-bar.show { display: block; }
    .fb-submit-copy { font-size: 12px; color: #065f46; margin: 0 0 10px; }
    .fb-submit-btn {
      width: 100%; border: 0; border-radius: 12px; background: linear-gradient(135deg, #059669 0%, #047857 100%);
      color: #fff; padding: 12px 16px; font-size: 14px; font-weight: 600; cursor: pointer;
      box-shadow: 0 10px 20px rgba(5, 150, 105, 0.2);
    }
    .fb-submit-btn:disabled { opacity: .65; cursor: not-allowed; box-shadow: none; }
    .fb-attach-list { padding: 0 16px 10px; background:#fff; display:none; gap:8px; flex-wrap:wrap; }
    .fb-attach-list.show { display:flex; }
    .fb-attach-chip { background:#eff6ff; color:#1d4ed8; border:1px solid #bfdbfe; border-radius:999px; padding:4px 10px; font-size:12px; }
    .fb-input-area {
      border-top: 1px solid var(--fb-border); padding: 14px 16px; background: #fff; display: flex; gap: 10px; align-items: flex-end;
    }
    .fb-input-wrap {
      flex: 1; border: 1px solid var(--fb-border); border-radius: 14px; background: var(--fb-surface-soft); padding: 10px 12px;
      box-shadow: inset 0 1px 1px rgba(15,23,42,.03);
    }
    .fb-input-label { display: block; margin-bottom: 6px; font-size: 11px; color: var(--fb-text-soft); text-transform: uppercase; letter-spacing: .04em; }
    .fb-input {
      width: 100%; border: 0; background: transparent; resize: none; outline: none; color: var(--fb-text);
      font-size: 14px; min-height: 42px;
    }
    .fb-input::placeholder { color: #94a3b8; }
    .fb-action-stack { display:flex; gap:10px; }
    .fb-attach {
      min-width: 52px; border:1px solid var(--fb-border); border-radius: 14px; background:#fff; color: var(--fb-text-soft);
      padding: 12px 14px; cursor:pointer; display:inline-flex; align-items:center; justify-content:center;
    }
    .fb-attach:hover { background:#f8fafc; color:var(--fb-text); }
    .fb-send {
      min-width: 108px; border: 0; border-radius: 14px; background: var(--fb-primary); color: #fff;
      padding: 12px 14px; font-weight: 600; cursor: pointer; display: inline-flex; gap: 8px; align-items: center; justify-content: center;
    }
    .fb-send svg { width: 16px; height: 16px; }
    .fb-send:hover { background: var(--fb-primary-dark); }
    .fb-send:disabled { background: #94a3b8; cursor: not-allowed; }
    @media (max-width: 640px) {
      .fb-btn { right: 16px; bottom: 16px; width: 56px; height: 56px; }
      .fb-modal { width: 100%; height: 100%; max-height: 100%; border-radius: 0; }
      .fb-modal-overlay { padding: 0; }
      .fb-input-area { flex-direction: column; align-items: stretch; }
      .fb-send { width: 100%; }
    }
  `;

  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const root = document.createElement('div');
  root.className = 'fb-root';
  document.body.appendChild(root);

  const bubbleIcon = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M7 18.5c1.1.6 2.4 1 3.8 1H19a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v10.5a2 2 0 0 0 2 2h1.2L7 22v-3.5Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="M8 10h8M8 14h5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const safeAppName = escapeHtml(APP_NAME);
  const sendIcon = `
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 12 20 4l-4 16-4.5-5L4 12Z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/>
      <path d="m11.5 15 4.5-4.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;

  const btn = document.createElement('button');
  btn.className = 'fb-btn';
  btn.type = 'button';
  btn.title = 'Signaler un bug ou une amélioration';
  btn.setAttribute('aria-label', 'Ouvrir le widget de feedback');
  btn.innerHTML = bubbleIcon;
  root.appendChild(btn);

  const overlay = document.createElement('div');
  overlay.className = 'fb-modal-overlay';
  overlay.innerHTML = `
    <div class="fb-modal" role="dialog" aria-modal="true" aria-labelledby="fb-title">
      <div class="fb-header">
        <div class="fb-header-main">
          <div class="fb-header-icon">${bubbleIcon}</div>
          <div class="fb-header-copy">
            <div class="fb-header-top">
              <div class="fb-app-chip">Application : ${safeAppName}</div>
              <div class="fb-info-wrap">
                <button class="fb-info-btn" type="button" aria-label="Voir les infos de routage" aria-expanded="false">ⓘ</button>
                <div class="fb-info-panel" hidden>
                  <div class="fb-info-title">Infos de feedback</div>
                  <div class="fb-info-content">Chargement…</div>
                </div>
              </div>
            </div>
            <h3 id="fb-title">Signaler un bug ou une amélioration</h3>
            <p>Décris le besoin. Le widget t’aide à cadrer le ticket avant envoi.</p>
          </div>
        </div>
        <button class="fb-close" type="button" aria-label="Fermer">×</button>
      </div>
      <div class="fb-userbar">
        <label class="fb-user-label" for="fb-user">Utilisateur</label>
        <input id="fb-user" class="fb-user-input" type="text" placeholder="Ton nom / email (optionnel)">
      </div>
      <div class="fb-messages"></div>
      <div class="fb-submit-bar">
        <p class="fb-submit-copy">Le cadrage est prêt. Tu peux maintenant envoyer le ticket à l’équipe.</p>
        <button class="fb-submit-btn" type="button">Envoyer le ticket</button>
      </div>
      <div class="fb-attach-list"></div>
      <div class="fb-input-area">
        <div class="fb-input-wrap">
          <label class="fb-input-label" for="fb-input">Ton message</label>
          <textarea id="fb-input" class="fb-input" rows="2" placeholder="Décris ton bug ou ton besoin..."></textarea>
        </div>
        <input class="fb-file" type="file" accept="image/*" hidden>
        <div class="fb-action-stack">
          <button class="fb-attach" type="button" title="Joindre une image">📎</button>
          <button class="fb-send" type="button">${sendIcon}<span>Envoyer</span></button>
        </div>
      </div>
    </div>`;
  root.appendChild(overlay);

  const messagesEl = overlay.querySelector('.fb-messages');
  const infoBtn = overlay.querySelector('.fb-info-btn');
  const infoPanel = overlay.querySelector('.fb-info-panel');
  const infoContent = overlay.querySelector('.fb-info-content');
  const userEl = overlay.querySelector('.fb-user-input');
  const inputEl = overlay.querySelector('.fb-input');
  const sendBtn = overlay.querySelector('.fb-send');
  const attachBtn = overlay.querySelector('.fb-attach');
  const fileEl = overlay.querySelector('.fb-file');
  const attachListEl = overlay.querySelector('.fb-attach-list');
  const submitBar = overlay.querySelector('.fb-submit-bar');
  const submitBtn = overlay.querySelector('.fb-submit-btn');
  const INTRO_MESSAGE = 'Décris ton bug ou ton amélioration. Quelques questions vont suivre pour cadrer proprement le ticket.';
  const SUCCESS_MESSAGE = '✓ Feedback enregistré, merci. Tu peux en soumettre un nouveau si besoin.';
  let routeInfo = null;
  let routeInfoLoading = false;

  function safeGetStoredUser() {
    try { return localStorage.getItem(USER_STORAGE_KEY) || ''; } catch { return ''; }
  }

  function safeSetStoredUser(value) {
    try {
      const v = String(value || '').trim();
      if (v) localStorage.setItem(USER_STORAGE_KEY, v);
      else localStorage.removeItem(USER_STORAGE_KEY);
    } catch {}
  }

  function currentUserId() {
    return userEl.value.trim() || USER_ID || null;
  }

  function modeLabel(mode) {
    if (mode === 'ticket') return 'VRAI ticket';
    if (mode === 'skip') return 'SKIP (demo), aucun ticket';
    if (mode === 'en-attente') return 'en attente';
    return 'a configurer';
  }

  function formatDestination(info) {
    const parts = [];
    if (info.agent) parts.push(info.agent);
    if (info.mission) parts.push('mission ' + info.mission);
    if (info.lot != null) parts.push('lot ' + info.lot);
    if (info.wave != null) parts.push('wave ' + info.wave);
    return parts.length ? parts.join(' . ') : '(non configurée)';
  }

  function renderRouteInfo() {
    const storedUser = safeGetStoredUser() || userEl.value.trim() || '(non renseigné)';
    if (!routeInfo) {
      infoContent.textContent = 'Chargement…';
      return;
    }
    infoContent.innerHTML = `
      <div class="fb-info-grid">
        <div><strong>Source</strong></div><div>${escapeHtml(routeInfo.source)}</div>
        <div><strong>Utilisateur</strong></div><div>${escapeHtml(storedUser)}</div>
        <div><strong>Destination</strong></div><div>${escapeHtml(formatDestination(routeInfo))}</div>
        <div><strong>Mode</strong></div><div>${escapeHtml(modeLabel(routeInfo.mode))}</div>
        <div><strong>Service</strong></div><div>${escapeHtml(routeInfo.serviceUrl)}</div>
      </div>`;
  }

  async function ensureRouteInfoLoaded() {
    if (routeInfo || routeInfoLoading) return;
    routeInfoLoading = true;
    infoContent.textContent = 'Chargement…';
    try {
      const resp = await fetch(`${SERVICE_URL}/api/feedback/route-info?source=${encodeURIComponent(SOURCE)}`);
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      routeInfo = await resp.json();
      renderRouteInfo();
    } catch (err) {
      infoContent.textContent = `Erreur : ${err.message}`;
    } finally {
      routeInfoLoading = false;
    }
  }

  function setInfoPanel(open) {
    infoPanel.hidden = !open;
    infoBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      renderRouteInfo();
      ensureRouteInfoLoaded();
    }
  }

  function appendMsg(role, content) {
    const div = document.createElement('div');
    div.className = `fb-msg ${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function showAttachment(name) {
    const chip = document.createElement('div');
    chip.className = 'fb-attach-chip';
    chip.textContent = '📷 ' + name;
    attachListEl.appendChild(chip);
    attachListEl.classList.add('show');
  }

  async function uploadFiles(files) {
    for (const file of Array.from(files || [])) {
      const fd = new FormData();
      fd.append('image', file);
      fd.append('source', SOURCE);
      if (conversationId) fd.append('conversationId', conversationId);
      const userId = currentUserId();
      if (userId) fd.append('userId', userId);
      const resp = await fetch(`${SERVICE_URL}/api/feedback/upload`, { method: 'POST', body: fd });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      conversationId = data.conversationId;
      showAttachment(data.attachment.filename);
      appendMsg('system', `Image jointe : ${data.attachment.filename}`);
    }
  }

  function resetWidgetState(successMessage) {
    conversationId = null;
    submitBar.classList.remove('show');
    submitBtn.disabled = false;
    sendBtn.disabled = false;
    attachBtn.disabled = false;
    inputEl.disabled = false;
    userEl.disabled = false;
    inputEl.value = '';
    fileEl.value = '';
    attachListEl.innerHTML = '';
    attachListEl.classList.remove('show');
    userEl.value = safeGetStoredUser() || USER_ID || '';
    messagesEl.innerHTML = '';
    if (successMessage) appendMsg('system', successMessage);
    appendMsg('system', INTRO_MESSAGE);
  }

  userEl.value = safeGetStoredUser() || USER_ID || '';
  userEl.addEventListener('input', () => { safeSetStoredUser(userEl.value); if (!infoPanel.hidden) renderRouteInfo(); });
  userEl.addEventListener('change', () => { safeSetStoredUser(userEl.value); if (!infoPanel.hidden) renderRouteInfo(); });

  infoBtn.addEventListener('click', () => setInfoPanel(infoPanel.hidden));

  btn.onclick = () => {
    overlay.classList.add('open');
    if (messagesEl.children.length === 0) {
      appendMsg('system', INTRO_MESSAGE);
      inputEl.focus();
    }
  };

  overlay.querySelector('.fb-close').onclick = () => { setInfoPanel(false); overlay.classList.remove('open'); };
  overlay.onclick = (e) => { if (e.target === overlay) { setInfoPanel(false); overlay.classList.remove('open'); } };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) { setInfoPanel(false); overlay.classList.remove('open'); }
  });

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;
    appendMsg('user', text);
    try {
      safeSetStoredUser(userEl.value);
      const resp = await fetch(`${SERVICE_URL}/api/feedback/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, source: SOURCE, userId: currentUserId(), message: text })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      const data = await resp.json();
      conversationId = data.conversationId;
      appendMsg(data.error ? 'system' : 'assistant', data.message);
      if (data.readyForSubmit) submitBar.classList.add('show');
    } catch (err) {
      appendMsg('system', `Erreur : ${err.message}`);
    } finally {
      sendBtn.disabled = false;
    }
  }

  attachBtn.onclick = () => fileEl.click();
  fileEl.addEventListener('change', async () => {
    if (!fileEl.files.length) return;
    try {
      attachBtn.disabled = true;
      await uploadFiles(fileEl.files);
      fileEl.value = '';
    } catch (err) {
      appendMsg('system', `Erreur upload image : ${err.message}`);
    } finally {
      attachBtn.disabled = false;
    }
  });
  inputEl.addEventListener('paste', async (e) => {
    const files = Array.from(e.clipboardData?.files || []).filter((f) => f.type && f.type.startsWith('image/'));
    if (!files.length) return;
    e.preventDefault();
    try {
      attachBtn.disabled = true;
      await uploadFiles(files);
    } catch (err) {
      appendMsg('system', `Erreur upload image : ${err.message}`);
    } finally {
      attachBtn.disabled = false;
    }
  });

  sendBtn.onclick = send;
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  });

  submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    try {
      safeSetStoredUser(userEl.value);
      const resp = await fetch(`${SERVICE_URL}/api/feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, userId: currentUserId() })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await resp.json();
      resetWidgetState(SUCCESS_MESSAGE);
      inputEl.focus();
    } catch (err) {
      appendMsg('system', `Erreur lors de l\'envoi : ${err.message}`);
      submitBtn.disabled = false;
    }
  };
})();
