// Worker entry — routes API endpoints, otherwise serves static assets.
// Bindings:
//   WALL_BUCKET     R2 bucket "memorywall"
//   R2_PUBLIC_URL   public bucket URL
//   ADMIN_PASSWORD  secret (set via Cloudflare dashboard)
//   ASSETS          static assets binding

const REPORT_THRESHOLD = 2;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const p = url.pathname;
    const m = request.method;

    if (p === '/api/wall/upload' && m === 'POST') return uploadHandler(request, env);
    if (p === '/api/wall/list'   && m === 'GET')  return listHandler(url, env);
    if (p === '/api/wall/delete' && m === 'POST') return deleteHandler(request, env);
    if (p === '/api/wall/report' && m === 'POST') return reportHandler(request, env);

    if (p === '/api/admin/weddings' && m === 'GET')  return requireAdmin(request, env, () => adminWeddings(env));
    if (p === '/api/admin/photos'   && m === 'GET')  return requireAdmin(request, env, () => adminPhotos(url, env));
    if (p === '/api/admin/delete'   && m === 'POST') return requireAdmin(request, env, () => adminDelete(request, env));

    return env.ASSETS.fetch(request);
  }
};

async function uploadHandler(request, env) {
  try {
    const fd = await request.formData();
    const file = fd.get('file');
    const wRaw = (fd.get('w') || '').toString();
    const w = wRaw.toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (!file || typeof file === 'string') return json({ error: 'no file' }, 400);
    if (!w) return json({ error: 'missing wedding id' }, 400);
    if (file.size > 100 * 1024 * 1024) return json({ error: 'file too large' }, 413);

    const ext = (file.name || '').split('.').pop()?.toLowerCase().slice(0, 5) || 'bin';
    const id = crypto.randomUUID();
    const token = crypto.randomUUID();
    const key = `wall/${w}/${Date.now()}-${id}.${ext}`;

    await env.WALL_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable'
      },
      customMetadata: { token }
    });

    return json({ ok: true, key, token });
  } catch (err) {
    return json({ error: err.message || 'upload failed' }, 500);
  }
}

async function listHandler(url, env) {
  const wRaw = url.searchParams.get('w') || '';
  const w = wRaw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!w) return json({ error: 'missing wedding id' }, 400);

  const items = await listWedding(env, w);
  return new Response(JSON.stringify(items), {
    headers: { 'content-type': 'application/json', 'cache-control': 'no-store' }
  });
}

async function listWedding(env, w) {
  const prefix = `wall/${w}/`;
  const out = [];
  let cursor;
  do {
    const list = await env.WALL_BUCKET.list({ prefix, cursor, limit: 1000 });
    for (const obj of list.objects) {
      out.push({
        key: obj.key,
        url: `${env.R2_PUBLIC_URL}/${obj.key}`,
        type: obj.httpMetadata?.contentType || 'image/jpeg',
        uploaded: obj.uploaded
      });
    }
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);
  out.sort((a, b) => new Date(a.uploaded) - new Date(b.uploaded));
  return out;
}

async function deleteHandler(request, env) {
  try {
    const { key, token } = await request.json();
    if (!key || !token) return json({ error: 'missing key or token' }, 400);
    if (!validKey(key)) return json({ error: 'bad key' }, 400);

    const head = await env.WALL_BUCKET.head(key);
    if (!head) return json({ error: 'not found' }, 404);

    const stored = head.customMetadata?.token;
    if (!stored || stored !== token) return json({ error: 'forbidden' }, 403);

    await env.WALL_BUCKET.delete(key);
    await deleteReportMarkers(env, key);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || 'delete failed' }, 500);
  }
}

async function reportHandler(request, env) {
  try {
    const { key, reporterId } = await request.json();
    if (!key || !reporterId) return json({ error: 'missing key or reporterId' }, 400);
    if (!validKey(key)) return json({ error: 'bad key' }, 400);
    const reporter = String(reporterId).replace(/[^a-zA-Z0-9-]/g, '').slice(0, 64);
    if (!reporter) return json({ error: 'bad reporterId' }, 400);

    const head = await env.WALL_BUCKET.head(key);
    if (!head) return json({ error: 'not found' }, 404);

    await env.WALL_BUCKET.put(`reports/${key}/${reporter}`, '');

    const reports = await env.WALL_BUCKET.list({ prefix: `reports/${key}/`, limit: 1000 });
    const count = reports.objects.length;

    let deleted = false;
    if (count >= REPORT_THRESHOLD) {
      await env.WALL_BUCKET.delete(key);
      for (const obj of reports.objects) {
        await env.WALL_BUCKET.delete(obj.key);
      }
      deleted = true;
    }

    return json({ ok: true, reports: count, deleted });
  } catch (err) {
    return json({ error: err.message || 'report failed' }, 500);
  }
}

async function requireAdmin(request, env, fn) {
  if (!env.ADMIN_PASSWORD) return json({ error: 'admin not configured' }, 503);
  const auth = request.headers.get('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token || token !== env.ADMIN_PASSWORD) return json({ error: 'unauthorized' }, 401);
  return fn();
}

async function adminWeddings(env) {
  const byWedding = {};
  let cursor;
  do {
    const list = await env.WALL_BUCKET.list({ prefix: 'wall/', cursor, limit: 1000 });
    for (const obj of list.objects) {
      const parts = obj.key.split('/');
      if (parts.length < 3) continue;
      const w = parts[1];
      if (!byWedding[w]) byWedding[w] = { id: w, count: 0, lastUpload: null };
      byWedding[w].count++;
      const u = new Date(obj.uploaded);
      if (!byWedding[w].lastUpload || new Date(byWedding[w].lastUpload) < u) {
        byWedding[w].lastUpload = obj.uploaded;
      }
    }
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);

  const arr = Object.values(byWedding).sort(
    (a, b) => new Date(b.lastUpload) - new Date(a.lastUpload)
  );
  return json(arr);
}

async function adminPhotos(url, env) {
  const w = (url.searchParams.get('w') || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!w) return json({ error: 'missing w' }, 400);
  const items = await listWedding(env, w);
  items.reverse();
  return json(items);
}

async function adminDelete(request, env) {
  const { key } = await request.json();
  if (!validKey(key)) return json({ error: 'bad key' }, 400);
  await env.WALL_BUCKET.delete(key);
  await deleteReportMarkers(env, key);
  return json({ ok: true });
}

async function deleteReportMarkers(env, key) {
  const reports = await env.WALL_BUCKET.list({ prefix: `reports/${key}/`, limit: 1000 });
  for (const obj of reports.objects) {
    await env.WALL_BUCKET.delete(obj.key);
  }
}

function validKey(key) {
  return typeof key === 'string' && key.startsWith('wall/') && !key.includes('..');
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
