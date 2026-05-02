// Cloudflare Pages Function — GET /api/wall/list?w=sarah-james
// Lists every object under wall/{w}/ from R2 binding WALL_BUCKET.
// Returns [{ url, key, type, uploaded }] sorted oldest → newest.

export async function onRequestGet({ request, env }) {
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
        uploaded: obj.uploaded,
      });
    }
    cursor = list.truncated ? list.cursor : null;
  } while (cursor);

  out.sort((a, b) => new Date(a.uploaded) - new Date(b.uploaded));

  return new Response(JSON.stringify(out), {
    headers: {
      'content-type': 'application/json',
      'cache-control': 'no-store',
    },
  });
}

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}
