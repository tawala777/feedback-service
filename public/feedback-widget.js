(function() {
  'use strict';

  const scriptTag = document.currentScript
    || document.querySelector('script[src*="feedback-widget.js"]');
  const SOURCE = scriptTag.getAttribute('data-source') || 'unknown';
  const USER_ID = scriptTag.getAttribute('data-user-id') || null;
  const SERVICE_URL = scriptTag.src.replace(/\/widget\/[^/]+$/, '');

  let conversationId = null;

  const css = `
    .fb-btn { position: fixed; bottom: 20px; right: 20px; width: 56px; height: 56px;
      border-radius: 50%; background: #2563eb; color: #fff; border: none; font-size: 24px;
      cursor: pointer; z-index: 9999; box-shadow: 0 4px 12px rgba(0,0,0,0.2); }
    .fb-btn:hover { background: #1d4ed8; }
    .fb-modal-overlay { position: fixed; inset: 0; background: rgba(0,0,0,0.4); display: none;
      align-items: center; justify-content: center; z-index: 10000; }
    .fb-modal-overlay.open { display: flex; }
    .fb-modal { background: #fff; width: 480px; max-width: 95vw; height: 600px; max-height: 90vh;
      border-radius: 8px; display: flex; flex-direction: column; box-shadow: 0 8px 32px rgba(0,0,0,0.3); overflow: hidden; }
    .fb-header { padding: 12px 16px; background: #f3f4f6; border-bottom: 1px solid #e5e7eb;
      display: flex; justify-content: space-between; align-items: center; }
    .fb-header h3 { margin: 0; font-size: 16px; color: #111827; }
    .fb-close { background: none; border: none; font-size: 22px; cursor: pointer; color: #6b7280; }
    .fb-messages { flex: 1; overflow-y: auto; padding: 16px; }
    .fb-msg { margin-bottom: 12px; padding: 8px 12px; border-radius: 8px; max-width: 85%; }
    .fb-msg.user { background: #dbeafe; margin-left: auto; }
    .fb-msg.assistant { background: #f3f4f6; margin-right: auto; white-space: pre-wrap; }
    .fb-msg.system { background: #fef3c7; font-style: italic; font-size: 13px; }
    .fb-input-area { border-top: 1px solid #e5e7eb; padding: 12px; display: flex; gap: 8px; }
    .fb-input { flex: 1; padding: 8px 12px; border: 1px solid #d1d5db; border-radius: 6px;
      font-family: inherit; font-size: 14px; resize: none; }
    .fb-send { background: #2563eb; color: #fff; border: none; padding: 8px 16px; border-radius: 6px; cursor: pointer; }
    .fb-send:disabled { background: #9ca3af; cursor: not-allowed; }
    .fb-submit-bar { padding: 12px 16px; background: #ecfdf5; border-top: 1px solid #d1fae5; display: none; }
    .fb-submit-bar.show { display: block; }
    .fb-submit-btn { background: #059669; color: #fff; border: none; padding: 10px 16px; border-radius: 6px; cursor: pointer; width: 100%; }
  `;
  const style = document.createElement('style');
  style.textContent = css;
  document.head.appendChild(style);

  const btn = document.createElement('button');
  btn.className = 'fb-btn';
  btn.innerHTML = '💬';
  btn.title = 'Signaler un bug ou une amélioration';
  document.body.appendChild(btn);

  const overlay = document.createElement('div');
  overlay.className = 'fb-modal-overlay';
  overlay.innerHTML = `
    <div class="fb-modal">
      <div class="fb-header">
        <h3>Signaler un bug ou une amélioration</h3>
        <button class="fb-close">×</button>
      </div>
      <div class="fb-messages"></div>
      <div class="fb-submit-bar"><button class="fb-submit-btn">Envoyer le ticket</button></div>
      <div class="fb-input-area">
        <textarea class="fb-input" rows="2" placeholder="Décris ton bug ou ton besoin..."></textarea>
        <button class="fb-send">Envoyer</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  const messagesEl = overlay.querySelector('.fb-messages');
  const inputEl = overlay.querySelector('.fb-input');
  const sendBtn = overlay.querySelector('.fb-send');
  const submitBar = overlay.querySelector('.fb-submit-bar');
  const submitBtn = overlay.querySelector('.fb-submit-btn');

  function appendMsg(role, content) {
    const div = document.createElement('div');
    div.className = `fb-msg ${role}`;
    div.textContent = content;
    messagesEl.appendChild(div);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  btn.onclick = () => {
    overlay.classList.add('open');
    if (messagesEl.children.length === 0) {
      appendMsg('system', 'Décris ton bug ou ton amélioration. Quelques questions vont suivre pour cadrer.');
      inputEl.focus();
    }
  };
  overlay.querySelector('.fb-close').onclick = () => overlay.classList.remove('open');
  overlay.onclick = (e) => { if (e.target === overlay) overlay.classList.remove('open'); };
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && overlay.classList.contains('open')) overlay.classList.remove('open');
  });

  async function send() {
    const text = inputEl.value.trim();
    if (!text) return;
    inputEl.value = '';
    sendBtn.disabled = true;
    appendMsg('user', text);
    try {
      const resp = await fetch(`${SERVICE_URL}/api/feedback/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId, source: SOURCE, userId: USER_ID, message: text })
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
  sendBtn.onclick = send;
  inputEl.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); }
  });

  submitBtn.onclick = async () => {
    submitBtn.disabled = true;
    try {
      const resp = await fetch(`${SERVICE_URL}/api/feedback/submit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ conversationId })
      });
      if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
      await resp.json();
      appendMsg('system', '✓ Feedback enregistré, merci. Il sera transmis à l\'équipe.');
      submitBar.classList.remove('show');
      sendBtn.disabled = true;
      inputEl.disabled = true;
    } catch (err) {
      appendMsg('system', `Erreur lors de l\'envoi : ${err.message}`);
      submitBtn.disabled = false;
    }
  };
})();
