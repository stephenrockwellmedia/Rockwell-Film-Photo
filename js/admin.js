// Memory Wall admin
// Auth: password sent as Bearer token to /api/admin/* endpoints.
// Server validates against ADMIN_PASSWORD secret.

const PASS_KEY = 'rfp_admin_pass';

const loginGate = document.getElementById('loginGate');
const adminApp = document.getElementById('adminApp');
const passInput = document.getElementById('adminPass');
const loginBtn = document.getElementById('adminLogin');
const errEl = document.getElementById('adminErr');
const logoutBtn = document.getElementById('logoutBtn');
const refreshBtn = document.getElementById('refreshBtn');
const backBtn = document.getElementById('backBtn');

const weddingsView = document.getElementById('weddingsView');
const photosView = document.getElementById('photosView');
const weddingList = document.getElementById('weddingList');
const noWeddings = document.getElementById('noWeddings');
const photoGrid = document.getElementById('photoGrid');
const noPhotos = document.getElementById('noPhotos');
const photosTitle = document.getElementById('photosTitle');

const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightboxContent');
const lightboxClose = document.getElementById('lightboxClose');

let currentWedding = null;

function getPass() { return sessionStorage.getItem(PASS_KEY); }
function setPass(p) { sessionStorage.setItem(PASS_KEY, p); }
function clearPass() { sessionStorage.removeItem(PASS_KEY); }

function authHeaders() {
  return { 'Authorization': 'Bearer ' + (getPass() || '') };
}

function prettyName(slug) {
  return slug.split('-').filter(Boolean)
    .map(w => w[0].toUpperCase() + w.slice(1))
    .join(' & ');
}

// ── Auth ──
async function tryLogin(password) {
  const res = await fetch('/api/admin/weddings', {
    headers: { 'Authorization': 'Bearer ' + password }
  });
  return res.ok;
}

loginBtn.addEventListener('click', async () => {
  const pwd = passInput.value;
  if (!pwd) return;
  errEl.hidden = true;
  loginBtn.disabled = true;
  try {
    const ok = await tryLogin(pwd);
    if (!ok) {
      errEl.textContent = 'Incorrect password.';
      errEl.hidden = false;
      passInput.value = '';
      passInput.focus();
      return;
    }
    setPass(pwd);
    showApp();
  } catch (err) {
    errEl.textContent = err.message || 'Login failed.';
    errEl.hidden = false;
  } finally {
    loginBtn.disabled = false;
  }
});

passInput.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') loginBtn.click();
});

logoutBtn.addEventListener('click', () => {
  clearPass();
  location.reload();
});

// ── Views ──
function showApp() {
  loginGate.hidden = true;
  adminApp.hidden = false;
  loadWeddings();
}

function showWeddings() {
  weddingsView.hidden = false;
  photosView.hidden = true;
  currentWedding = null;
}

function showPhotos(slug) {
  weddingsView.hidden = true;
  photosView.hidden = false;
  currentWedding = slug;
  photosTitle.textContent = prettyName(slug);
  loadPhotos(slug);
}

backBtn.addEventListener('click', showWeddings);
refreshBtn.addEventListener('click', loadWeddings);

// ── Data ──
async function loadWeddings() {
  weddingList.innerHTML = '<p class="ad-empty">Loading…</p>';
  noWeddings.hidden = true;
  try {
    const res = await fetch('/api/admin/weddings', { headers: authHeaders() });
    if (res.status === 401) { clearPass(); location.reload(); return; }
    if (!res.ok) throw new Error('Failed to load');
    const data = await res.json();
    if (!data.length) {
      weddingList.innerHTML = '';
      noWeddings.hidden = false;
      return;
    }
    weddingList.innerHTML = data.map(w => {
      const dateStr = w.lastUpload
        ? new Date(w.lastUpload).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })
        : '—';
      return `<div class="ad-wedding-card" data-slug="${w.id}">
        <div class="ad-wedding-name">${prettyName(w.id)}</div>
        <div class="ad-wedding-meta">/${w.id} · last upload ${dateStr}</div>
        <span class="ad-wedding-count">${w.count} ${w.count === 1 ? 'photo' : 'photos'}</span>
      </div>`;
    }).join('');
  } catch (err) {
    weddingList.innerHTML = `<p class="ad-empty">${err.message}</p>`;
  }
}

weddingList.addEventListener('click', (e) => {
  const card = e.target.closest('.ad-wedding-card');
  if (!card) return;
  showPhotos(card.dataset.slug);
});

async function loadPhotos(slug) {
  photoGrid.innerHTML = '<p class="ad-empty">Loading…</p>';
  noPhotos.hidden = true;
  try {
    const res = await fetch('/api/admin/photos?w=' + encodeURIComponent(slug), { headers: authHeaders() });
    if (res.status === 401) { clearPass(); location.reload(); return; }
    if (!res.ok) throw new Error('Failed to load');
    const items = await res.json();
    if (!items.length) {
      photoGrid.innerHTML = '';
      noPhotos.hidden = false;
      return;
    }
    photoGrid.innerHTML = items.map(item => {
      const isVideo = (item.type || '').startsWith('video/');
      const inner = isVideo
        ? `<video src="${item.url}" muted playsinline preload="metadata"></video>`
        : `<img src="${item.url}" alt="" loading="lazy" />`;
      return `<div class="ad-photo${isVideo ? ' video' : ''}" data-key="${item.key}" data-url="${item.url}" data-type="${isVideo ? 'video' : 'image'}">
        ${inner}
        <button class="ad-photo-del" data-key="${item.key}" aria-label="Delete">×</button>
      </div>`;
    }).join('');
  } catch (err) {
    photoGrid.innerHTML = `<p class="ad-empty">${err.message}</p>`;
  }
}

photoGrid.addEventListener('click', async (e) => {
  const del = e.target.closest('.ad-photo-del');
  if (del) {
    e.stopPropagation();
    const key = del.dataset.key;
    if (!confirm('Permanently delete this photo? This cannot be undone.')) return;
    del.disabled = true;
    try {
      const res = await fetch('/api/admin/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ key })
      });
      if (!res.ok) throw new Error('Delete failed');
      del.closest('.ad-photo').remove();
    } catch (err) {
      alert(err.message || 'Delete failed');
      del.disabled = false;
    }
    return;
  }

  const tile = e.target.closest('.ad-photo');
  if (!tile) return;
  const url = tile.dataset.url;
  const type = tile.dataset.type;
  lightboxContent.innerHTML = type === 'video'
    ? `<video src="${url}" controls autoplay playsinline></video>`
    : `<img src="${url}" alt="" />`;
  lightbox.hidden = false;
});

lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => { if (e.target === lightbox) closeLightbox(); });
function closeLightbox() {
  lightbox.hidden = true;
  lightboxContent.innerHTML = '';
}

// ── Init ──
(async function init() {
  const pwd = getPass();
  if (pwd && await tryLogin(pwd)) {
    showApp();
  } else {
    clearPass();
    passInput.focus();
  }
})();
