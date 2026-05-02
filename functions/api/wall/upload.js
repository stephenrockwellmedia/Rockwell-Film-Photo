// Cloudflare Pages Function — POST /api/wall/upload
// Accepts multipart form: file, w (weddingId), type
// Writes to R2 binding WALL_BUCKET under wall/{w}/...

export async function onRequestPost({ request, env }) {
  try {
    const fd = await request.formData();
    const file = fd.get('file');
    const wRaw = (fd.get('w') || '').toString();
    const w = wRaw.toLowerCase().replace(/[^a-z0-9-]/g, '');

    if (!file || typeof file === 'string') {
      return json({ error: 'no file' }, 400);
    }
    if (!w) return json({ error: 'missing wedding id' }, 400);

    // 100 MB hard cap
    if (file.size > 100 * 1024 * 1024) {
      return json({ error: 'file too large' }, 413);
    }

    const ext = (file.name || '').split('.').pop()?.toLowerCase().slice(0, 5) || 'bin';
    const id = crypto.randomUUID();
    const key = `wall/${w}/${Date.now()}-${id}.${ext}`;

    await env.WALL_BUCKET.put(key, file.stream(), {
      httpMetadata: {
        contentType: file.type || 'application/octet-stream',
        cacheControl: 'public, max-age=31536000, immutable',
      },
    });

    return json({ ok: true, key });
  } catch (err) {
    return json({ error: err.message || 'upload failed' }, 500);
  }
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
