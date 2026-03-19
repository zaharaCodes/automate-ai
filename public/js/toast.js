/* ============================================================
   AUTOMATE AI — toast.js
   Smooth slide-in toast notifications
============================================================ */

(function() {
  // Inject styles once
  const style = document.createElement('style');
  style.textContent = `
    #toast-container {
      position: fixed;
      bottom: 24px;
      right: 24px;
      z-index: 99999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    }
    .toast {
      display: flex;
      align-items: center;
      gap: 12px;
      padding: 13px 18px;
      border-radius: 12px;
      font-family: 'Outfit', sans-serif;
      font-size: 13.5px;
      font-weight: 500;
      line-height: 1.4;
      max-width: 360px;
      pointer-events: all;
      cursor: pointer;
      box-shadow: 0 8px 32px rgba(0,0,0,0.4);
      animation: toastIn 0.35s cubic-bezier(0.16,1,0.3,1) forwards;
      position: relative;
      overflow: hidden;
    }
    .toast::after {
      content: '';
      position: absolute;
      bottom: 0; left: 0;
      height: 2px;
      background: rgba(255,255,255,0.25);
      animation: toastTimer linear forwards;
    }
    .toast.removing {
      animation: toastOut 0.28s cubic-bezier(0.4,0,1,1) forwards;
    }
    .toast-icon { flex-shrink: 0; width: 18px; height: 18px; }
    .toast-msg  { flex: 1; }

    .toast-success {
      background: #0d1f17;
      border: 1px solid rgba(16,185,129,0.3);
      color: #d1fae5;
    }
    .toast-success::after { background: #10b981; }

    .toast-error {
      background: #1f0d12;
      border: 1px solid rgba(244,63,94,0.3);
      color: #fecdd3;
    }
    .toast-error::after { background: #f43f5e; }

    .toast-info {
      background: #0d0f1f;
      border: 1px solid rgba(99,102,241,0.3);
      color: #e0e7ff;
    }
    .toast-info::after { background: #6366f1; }

    .toast-warning {
      background: #1f1a0d;
      border: 1px solid rgba(245,158,11,0.3);
      color: #fef3c7;
    }
    .toast-warning::after { background: #f59e0b; }

    @keyframes toastIn {
      from { opacity: 0; transform: translateX(24px) scale(0.95); }
      to   { opacity: 1; transform: translateX(0)    scale(1);    }
    }
    @keyframes toastOut {
      from { opacity: 1; transform: translateX(0)    scale(1);    }
      to   { opacity: 0; transform: translateX(24px) scale(0.95); }
    }
    @keyframes toastTimer {
      from { width: 100%; }
      to   { width: 0%;   }
    }
  `;
  document.head.appendChild(style);

  // Create container
  let container = document.getElementById('toast-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toast-container';
    document.body.appendChild(container);
  }

  const ICONS = {
    success: `<svg viewBox="0 0 18 18" fill="none" style="color:#10b981"><path d="M2 9l5 5 9-9" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    error:   `<svg viewBox="0 0 18 18" fill="none" style="color:#f43f5e"><path d="M9 3v6M9 13h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.8"/></svg>`,
    info:    `<svg viewBox="0 0 18 18" fill="none" style="color:#6366f1"><circle cx="9" cy="9" r="7" stroke="currentColor" stroke-width="1.8"/><path d="M9 8v5M9 6h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
    warning: `<svg viewBox="0 0 18 18" fill="none" style="color:#f59e0b"><path d="M9 2L16.5 15H1.5L9 2z" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"/><path d="M9 7v4M9 13h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  };

  function showToast(msg, type = 'info', duration = 3500) {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
      <span class="toast-icon">${ICONS[type] || ICONS.info}</span>
      <span class="toast-msg">${msg}</span>
    `;
    toast.style.setProperty('--dur', duration + 'ms');
    toast.querySelector('::after'); // trigger
    toast.style.cssText += ``;
    // Set timer animation duration
    const pseudo = document.createElement('style');
    const id = 'toast-' + Date.now();
    toast.id = id;
    pseudo.textContent = `#${id}::after { animation-duration: ${duration}ms; }`;
    document.head.appendChild(pseudo);

    toast.addEventListener('click', () => removeToast(toast, pseudo));
    container.appendChild(toast);

    setTimeout(() => removeToast(toast, pseudo), duration);
    return toast;
  }

  function removeToast(toast, styleEl) {
    if (toast._removing) return;
    toast._removing = true;
    toast.classList.add('removing');
    setTimeout(() => {
      toast.remove();
      styleEl && styleEl.remove();
    }, 280);
  }

  // Expose globally
  window.toast = {
    success: (msg, dur) => showToast(msg, 'success', dur),
    error:   (msg, dur) => showToast(msg, 'error',   dur || 4500),
    info:    (msg, dur) => showToast(msg, 'info',     dur),
    warning: (msg, dur) => showToast(msg, 'warning',  dur),
  };
})();