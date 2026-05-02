// Worker entry — routes API endpoints, otherwise serves static assets.
// Bindings (configured in dashboard):
//   WALL_BUCKET    R2 bucket "memorywall"
//   R2_PUBLIC_URL  e.g. https://pub-xxxx.r2.dev
//   ASSETS         Static assets binding (declared in wrangler.jsonc)

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === '/api/wall/upload' && request.method === 'POST') {
      return uploadHandler(request, env);
    }
    if (url.pathname === '/api/wall/list' && request.method === 'GET') {
      return listHandler(request, env);
    }
    if (url.pathname === '/api/wall/delete' && request.method === 'POST') {
      return deleteHandler(request, env);
    }

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

async function listHandler(request, env) {
  const url = new URL(request.url);
  const wRaw = url.searchParams.get('w') || '';
  const w = wRaw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!w) return json({ error: 'missing wedding id' }, 400);

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

  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store'
    }
  });
}

async function deleteHandler(request, env) {
  try {
    const { key, token } = await request.json();
    if (!key || !token) return json({ error: 'missing key or token' }, 400);
    if (!key.startsWith('wall/') || key.includes('..')) return json({ error: 'bad key' }, 400);

    const head = await env.WALL_BUCKET.head(key);
    if (!head) return json({ error: 'not found' }, 404);

    const stored = head.customMetadata?.token;
    if (!stored || stored !== token) return json({ error: 'forbidden' }, 403);

    await env.WALL_BUCKET.delete(key);
    return json({ ok: true });
  } catch (err) {
    return json({ error: err.message || 'delete failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' }
  });
}
