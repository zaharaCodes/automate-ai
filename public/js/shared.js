/* ============================================================
   AUTOMATE AI — shared.js
============================================================ */

const API = window.location.origin;

/* ── Loader ───────────────────────────────────────────────── */
const loader = document.getElementById('loader');
const ldMsg  = document.getElementById('ldMsg');
const MSGS   = ['Initializing...', 'Connecting to AI...', 'Loading tools...', 'Ready.'];
let mi = 0;
const mi_iv = setInterval(() => {
  mi++;
  if (mi < MSGS.length && ldMsg) ldMsg.textContent = MSGS[mi];
}, 480);
window.addEventListener('load', () => {
  setTimeout(() => {
    clearInterval(mi_iv);
    if (ldMsg) ldMsg.textContent = 'Ready.';
    setTimeout(() => loader && loader.classList.add('out'), 350);
  }, 1900);
});

/* ── Nav scroll ───────────────────────────────────────────── */
const nav = document.querySelector('.nav');
if (nav) {
  const onScroll = () => nav.classList.toggle('scrolled', window.scrollY > 10);
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();
}

/* ── Auth ─────────────────────────────────────────────────── */
function getToken()  { return localStorage.getItem('am_token'); }
function getUser()   { try { return JSON.parse(localStorage.getItem('am_user')); } catch { return null; } }
function saveAuth(token, user) {
  localStorage.setItem('am_token', token);
  localStorage.setItem('am_user', JSON.stringify(user));
}
function clearAuth() {
  localStorage.removeItem('am_token');
  localStorage.removeItem('am_user');
}
function isLoggedIn() { return !!(getToken() && getUser()); }

/* ── Guest tracking — reset daily ────────────────────────── */
const GUEST_LIMIT = 3;
const today = new Date().toDateString();
if (localStorage.getItem('am_guest_reset') !== today) {
  localStorage.setItem('am_guest_count', '0');
  localStorage.setItem('am_guest_reset', today);
}
function getGuestCount()       { return parseInt(localStorage.getItem('am_guest_count') || '0'); }
function incrementGuestCount() { const n = getGuestCount() + 1; localStorage.setItem('am_guest_count', String(n)); return n; }
function guestLimitReached()   { return !isLoggedIn() && getGuestCount() >= GUEST_LIMIT; }

/* ── History ──────────────────────────────────────────────── */
function saveToHistory(type, input, output) {
  if (!isLoggedIn()) return;
  let hist = [];
  try { hist = JSON.parse(localStorage.getItem('am_history') || '[]'); } catch {}
  hist.unshift({ id: Date.now(), type, input: String(input).slice(0, 120), output, date: new Date().toLocaleString() });
  localStorage.setItem('am_history', JSON.stringify(hist.slice(0, 50)));
}
function getHistory() { try { return JSON.parse(localStorage.getItem('am_history') || '[]'); } catch { return []; } }

/* ── Nav UI ───────────────────────────────────────────────── */
function updateNav() {
  const user    = getUser();
  const guestEl = document.getElementById('navGuest');
  const userEl  = document.getElementById('navUser');
  const infoEl  = document.getElementById('navUserInfo');
  if (isLoggedIn() && user) {
    guestEl && guestEl.classList.add('hidden');
    userEl  && userEl.classList.remove('hidden');
    if (infoEl) infoEl.textContent = user.name.split(' ')[0].toLowerCase();
  } else {
    guestEl && guestEl.classList.remove('hidden');
    userEl  && userEl.classList.add('hidden');
  }
}

document.addEventListener('DOMContentLoaded', () => {
  updateNav();
  const logoutBtn = document.getElementById('logoutBtn');
  if (logoutBtn) logoutBtn.addEventListener('click', () => { clearAuth(); window.location.href = '/'; });
  const navLoginBtn    = document.getElementById('navLoginBtn');
  const navRegisterBtn = document.getElementById('navRegisterBtn');
  if (navLoginBtn)    navLoginBtn.addEventListener('click',    () => window.location.href = '/pages/auth.html?tab=login');
  if (navRegisterBtn) navRegisterBtn.addEventListener('click', () => window.location.href = '/pages/auth.html?tab=register');

  // If logged in, show dashboard link in nav user area
  if (isLoggedIn()) {
    const userEl = document.getElementById('navUser');
    if (userEl && !document.getElementById('dashLink')) {
      const dashLink = document.createElement('a');
      dashLink.id = 'dashLink';
      dashLink.href = '/pages/dashboard.html';
      dashLink.className = 'btn btn-ghost';
      dashLink.style.cssText = 'font-size:13px;padding:7px 13px;text-decoration:none';
      dashLink.textContent = 'Dashboard';
      userEl.insertBefore(dashLink, userEl.firstChild);
    }
  }
});

/* ── API call ─────────────────────────────────────────────── */
async function apiCall(endpoint, body, method = 'POST') {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;
  const res = await fetch(API + endpoint, {
    method, headers,
    body: body ? JSON.stringify(body) : undefined
  });
  return res.json();
}

/* ── Guest gate — check BEFORE call, increment AFTER success ─
   Usage:
     if (!guestGate()) return;          // check
     const data = await apiCall(...);
     if (!data.success) throw ...;
     guestGateSuccess();                // only count on success
─────────────────────────────────────────────────────────────── */
function guestGate() {
  if (isLoggedIn()) return true;
  if (guestLimitReached()) {
    showGuestWall();
    return false;
  }
  return true;
}

function guestGateSuccess() {
  if (isLoggedIn()) return;
  const n = incrementGuestCount();
  const remaining = GUEST_LIMIT - n;
  if (remaining > 0) showGuestBadge(remaining);
  else showGuestWall();
}

function showGuestBadge(remaining) {
  let b = document.getElementById('guestBadge');
  if (!b) {
    b = document.createElement('div');
    b.id = 'guestBadge';
    b.style.cssText = `
      position:fixed;bottom:24px;right:24px;
      background:#16161f;border:1px solid rgba(255,255,255,0.1);
      border-radius:10px;padding:10px 16px;
      font-family:'Outfit',sans-serif;font-size:13px;color:#9090a8;
      z-index:900;animation:fadeInB 0.3s ease;
    `;
    const s = document.createElement('style');
    s.textContent = '@keyframes fadeInB{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}';
    document.head.appendChild(s);
    document.body.appendChild(b);
  }
  b.innerHTML = `<span style="color:#ededf5;font-weight:600">${remaining}</span> free ${remaining === 1 ? 'try' : 'tries'} left today · <a href="/pages/auth.html?tab=register" style="color:#6366f1;text-decoration:none;font-weight:600">Sign up for 100/day →</a>`;
  clearTimeout(b._t);
  b._t = setTimeout(() => b && b.remove(), 5000);
}

function showGuestWall() {
  if (document.getElementById('guestWall')) return;
  const wall = document.createElement('div');
  wall.id = 'guestWall';
  wall.style.cssText = `
    position:fixed;bottom:24px;left:50%;transform:translateX(-50%);
    background:#0f0f18;border:1px solid rgba(99,102,241,0.45);
    border-radius:14px;padding:20px 24px 20px 24px;z-index:9999;
    display:flex;align-items:center;gap:20px;
    box-shadow:0 20px 60px rgba(0,0,0,0.7);
    font-family:'Outfit',sans-serif;
    animation:slideUp3 0.35s cubic-bezier(0.16,1,0.3,1);
    max-width:92vw;flex-wrap:wrap;
  `;
  wall.innerHTML = `
    <style>@keyframes slideUp3{from{opacity:0;transform:translate(-50%,24px)}to{opacity:1;transform:translate(-50%,0)}}</style>
    <div>
      <div style="font-size:15px;font-weight:700;color:#ededf5;margin-bottom:4px">You've used your 3 free tries for today</div>
      <div style="font-size:13px;color:#9090a8">Sign up free to get <strong style="color:#ededf5">100 requests/day</strong> and save your results</div>
    </div>
    <div style="display:flex;gap:8px;flex-shrink:0">
      <a href="/pages/auth.html?tab=register" style="padding:10px 18px;background:#6366f1;color:#fff;border-radius:8px;font-size:13px;font-weight:700;text-decoration:none;white-space:nowrap">Sign up free</a>
      <a href="/pages/auth.html?tab=login"    style="padding:10px 18px;background:transparent;color:#9090a8;border:1px solid rgba(255,255,255,0.1);border-radius:8px;font-size:13px;font-weight:600;text-decoration:none;white-space:nowrap">Sign in</a>
    </div>
    <button onclick="document.getElementById('guestWall').remove()" style="position:absolute;top:10px;right:12px;background:none;border:none;color:#505068;cursor:pointer;font-size:20px;line-height:1">×</button>
  `;
  document.body.appendChild(wall);
}

/* ── Button loading ───────────────────────────────────────── */
function btnLoading(btn, yes, label = '') {
  if (yes) { btn._orig = btn.innerHTML; btn.disabled = true; btn.innerHTML = `<span class="spinner"></span> Working...`; }
  else { btn.disabled = false; btn.innerHTML = label || btn._orig || ''; }
}

/* ── Copy ─────────────────────────────────────────────────── */
function copyText(text, btn) {
  navigator.clipboard.writeText(text).then(() => {
    const orig = btn.innerHTML;
    btn.innerHTML = '✓ Copied';
    btn.style.color = 'var(--green)';
    setTimeout(() => { btn.innerHTML = orig; btn.style.color = ''; }, 1800);
  });
}

/* ── Expose ───────────────────────────────────────────────── */
window.isLoggedIn      = isLoggedIn;
window.getUser         = getUser;
window.getToken        = getToken;
window.saveAuth        = saveAuth;
window.clearAuth       = clearAuth;
window.apiCall         = apiCall;
window.btnLoading      = btnLoading;
window.copyText        = copyText;
window.guestGate       = guestGate;
window.guestGateSuccess = guestGateSuccess;
window.showGuestWall   = showGuestWall;
window.saveToHistory   = saveToHistory;
window.getHistory      = getHistory;