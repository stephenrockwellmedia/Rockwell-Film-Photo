// Memory Wall — guest gallery & upload
// URL pattern: /wall.html?w=sarah-james

const params = new URLSearchParams(location.search);
const weddingId = (params.get('w') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');

const titleEl = document.getElementById('coupleName');
const fileInput = document.getElementById('fileInput');
const uploadLabel = document.getElementById('uploadLabel');
const progressBox = document.getElementById('uploadProgress');
const progressFill = document.getElementById('uploadFill');
const progressStatus = document.getElementById('uploadStatus');
const gallery = document.getElementById('gallery');
const emptyState = document.getElementById('emptyState');
const lightbox = document.getElementById('lightbox');
const lightboxContent = document.getElementById('lightboxContent');
const lightboxClose = document.getElementById('lightboxClose');

if (!weddingId) {
  document.body.innerHTML = '<div style="text-align:center;padding:80px 20px;color:#b8b3a4;font-family:Montserrat,sans-serif;"><p style="font-family:\'Cormorant Garamond\',serif;font-size:2rem;color:#c9a84c;margin-bottom:12px;">Invalid Link</p><p>This Memory Wall link is missing a wedding ID.</p></div>';
  throw new Error('missing wedding id');
}

// Pretty title from slug ("sarah-james" → "Sarah & James")
titleEl.textContent = weddingId
  .split('-')
  .filter(Boolean)
  .map(w => w[0].toUpperCase() + w.slice(1))
  .join(' & ');

// ─────────────────────────────────────────────────────────────
// Image compression — canvas resize to max 1920px, JPEG q=0.82
// ─────────────────────────────────────────────────────────────
function compressImage(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = (e) => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const MAX = 1920;
        let { width, height } = img;
        if (width > MAX || height > MAX) {
          const ratio = Math.min(MAX / width, MAX / height);
          width = Math.round(width * ratio);
          height = Math.round(height * ratio);
        }
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, width, height);
        canvas.toBlob(
          (blob) => blob ? resolve(blob) : reject(new Error('compress failed')),
          'image/jpeg',
          0.82
        );
      };
      img.src = e.target.result;
    };
    reader.readAsDataURL(file);
  });
}

// ─────────────────────────────────────────────────────────────
// Upload
// ─────────────────────────────────────────────────────────────
const MAX_VIDEO_BYTES = 100 * 1024 * 1024; // 100 MB

async function uploadOne(file, index, total) {
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) throw new Error('Unsupported file type');
  if (isVideo && file.size > MAX_VIDEO_BYTES) {
    throw new Error('Video too large (max 100MB)');
  }

  progressStatus.textContent = `Preparing ${index + 1} of ${total}…`;

  const body = isImage ? await compressImage(file) : file;
  const filename = (file.name || 'upload')
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(-80);

  const fd = new FormData();
  fd.append('file', body, filename);
  fd.append('w', weddingId);
  fd.append('type', isImage ? 'image' : 'video');

  progressStatus.textContent = `Uploading ${index + 1} of ${total}…`;

  const res = await fetch('/api/wall/upload', { method: 'POST', body: fd });
  if (!res.ok) {
    const txt = await res.text().catch(() => '');
    throw new Error(`Upload failed (${res.status}) ${txt}`);
  }
  const data = await res.json();
  if (data.key && data.token) saveOwnership(data.key, data.token);
}

// Track which uploads belong to this browser
const OWN_KEY = `wall_${weddingId}_owned`;
function loadOwned() {
  try { return JSON.parse(localStorage.getItem(OWN_KEY) || '{}'); }
  catch { return {}; }
}
function saveOwnership(key, token) {
  const owned = loadOwned();
  owned[key] = token;
  localStorage.setItem(OWN_KEY, JSON.stringify(owned));
}
function clearOwnership(key) {
  const owned = loadOwned();
  delete owned[key];
  localStorage.setItem(OWN_KEY, JSON.stringify(owned));
}

// Stable per-browser reporter ID for dedup
function getReporterId() {
  let id = localStorage.getItem('wall_reporter_id');
  if (!id) {
    id = (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(36).slice(2));
    localStorage.setItem('wall_reporter_id', id);
  }
  return id;
}

// Track which photos this browser already reported (so we hide the option)
const REPORTED_KEY = `wall_${weddingId}_reported`;
function loadReported() {
  try { return JSON.parse(localStorage.getItem(REPORTED_KEY) || '{}'); }
  catch { return {}; }
}
function markReported(key) {
  const r = loadReported();
  r[key] = true;
  localStorage.setItem(REPORTED_KEY, JSON.stringify(r));
}

async function handleFiles(files) {
  if (!files.length) return;
  uploadLabel.classList.add('uploading');
  progressBox.hidden = false;
  progressStatus.classList.remove('error', 'success');
  progressFill.style.width = '0%';

  let done = 0;
  try {
    for (let i = 0; i < files.length; i++) {
      await uploadOne(files[i], i, files.length);
      done++;
      progressFill.style.width = `${(done / files.length) * 100}%`;
    }
    progressStatus.textContent = `${done} uploaded ✓`;
    progressStatus.classList.add('success');
    await loadGallery();
  } catch (err) {
    progressStatus.textContent = err.message || 'Upload error';
    progressStatus.classList.add('error');
  } finally {
    uploadLabel.classList.remove('uploading');
    fileInput.value = '';
    setTimeout(() => { progressBox.hidden = true; }, 2500);
  }
}

fileInput.addEventListener('change', (e) => handleFiles(Array.from(e.target.files || [])));

// ─────────────────────────────────────────────────────────────
// Gallery
// ─────────────────────────────────────────────────────────────
let lastKeys = '';

async function loadGallery() {
  try {
    const res = await fetch(`/api/wall/list?w=${encodeURIComponent(weddingId)}`);
    if (!res.ok) return;
    const items = await res.json();

    const sig = items.map(i => i.key).join('|');
    if (sig === lastKeys) return;
    lastKeys = sig;

    if (!items.length) {
      gallery.innerHTML = '';
      emptyState.hidden = false;
      return;
    }
    emptyState.hidden = true;

    const owned = loadOwned();
    const reported = loadReported();
    gallery.innerHTML = items.map((item, i) => {
      const isVideo = (item.type || '').startsWith('video/');
      const delay = `style="animation-delay:${Math.min(i, 20) * 0.03}s"`;
      const isOwn = !!owned[item.key];
      const isReported = !!reported[item.key];
      const cornerBtn = isOwn
        ? `<button class="w-tile-del" data-key="${item.key}" aria-label="Delete">×</button>`
        : (isReported
          ? ''
          : `<button class="w-tile-menu" data-key="${item.key}" aria-label="More">⋮</button>`);
      if (isVideo) {
        return `<div class="w-tile video" data-url="${item.url}" data-type="video" data-key="${item.key}" ${delay}>
          <video src="${item.url}" muted playsinline preload="metadata"></video>
          ${cornerBtn}
        </div>`;
      }
      return `<div class="w-tile" data-url="${item.url}" data-type="image" data-key="${item.key}" ${delay}>
        <img src="${item.url}" alt="" loading="lazy" />
        ${cornerBtn}
      </div>`;
    }).join('');
  } catch (err) {
    console.error('gallery load failed', err);
  }
}

// Tile click — report, delete, or open lightbox
gallery.addEventListener('click', async (e) => {
  const reportBtn = e.target.closest('.w-tile-menu');
  if (reportBtn) {
    e.stopPropagation();
    const key = reportBtn.dataset.key;
    if (!confirm('Report this photo as inappropriate? After 2 reports it will be removed automatically.')) return;
    reportBtn.disabled = true;
    try {
      const res = await fetch('/api/wall/report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, reporterId: getReporterId() })
      });
      if (!res.ok) throw new Error('Report failed');
      const data = await res.json();
      markReported(key);
      if (data.deleted) {
        alert('Thanks — that photo received enough reports and was removed.');
      } else {
        alert('Reported. Thanks.');
      }
      lastKeys = '';
      await loadGallery();
    } catch (err) {
      alert(err.message || 'Report failed');
      reportBtn.disabled = false;
    }
    return;
  }

  const delBtn = e.target.closest('.w-tile-del');
  if (delBtn) {
    e.stopPropagation();
    const key = delBtn.dataset.key;
    const owned = loadOwned();
    const token = owned[key];
    if (!token) return;
    if (!confirm('Delete this from the wall?')) return;
    delBtn.disabled = true;
    try {
      const res = await fetch('/api/wall/delete', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ key, token })
      });
      if (!res.ok) throw new Error('Delete failed');
      clearOwnership(key);
      lastKeys = '';
      await loadGallery();
    } catch (err) {
      alert(err.message || 'Delete failed');
      delBtn.disabled = false;
    }
    return;
  }

  const tile = e.target.closest('.w-tile');
  if (!tile) return;
  const url = tile.dataset.url;
  const type = tile.dataset.type;
  lightboxContent.innerHTML = type === 'video'
    ? `<video src="${url}" controls autoplay playsinline></video>`
    : `<img src="${url}" alt="" />`;
  lightbox.hidden = false;
});
lightboxClose.addEventListener('click', closeLightbox);
lightbox.addEventListener('click', (e) => {
  if (e.target === lightbox) closeLightbox();
});
function closeLightbox() {
  lightbox.hidden = true;
  lightboxContent.innerHTML = '';
}

// Initial + poll every 10s
loadGallery();
setInterval(loadGallery, 10000);
