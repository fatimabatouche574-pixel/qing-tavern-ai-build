import http from 'node:http';

const port = Number(process.env.PORT || 8787);
const allowList = (process.env.QT_PROXY_ALLOW || '').split(',').map((x) => x.trim()).filter(Boolean);

function corsHeaders(type = 'application/json; charset=utf-8') {
  return {
    'content-type': type,
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'POST,OPTIONS',
    'access-control-allow-headers': 'content-type,authorization,x-api-key,anthropic-version,http-referer,x-title'
  };
}

function send(res, status, data, type = 'application/json; charset=utf-8') {
  res.writeHead(status, corsHeaders(type));
  res.end(typeof data === 'string' ? data : JSON.stringify(data));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

function checkAllowed(target) {
  if (allowList.length && !allowList.includes(target.hostname)) {
    throw new Error(`Host is not in QT_PROXY_ALLOW: ${target.hostname}`);
  }
}

function forwardHeaders(headers) {
  const blocked = new Set(['host', 'origin', 'referer', 'content-length', 'connection']);
  const out = {};
  for (const [key, value] of Object.entries(headers)) {
    if (!blocked.has(key.toLowerCase()) && value != null) out[key] = value;
  }
  return out;
}

http.createServer(async (req, res) => {
  if (req.method === 'OPTIONS') return send(res, 204, '');
  if (req.method !== 'POST') return send(res, 404, { error: 'Use POST /proxy?url=https://api.example.com/...' });
  try {
    const requestUrl = new URL(req.url, `http://${req.headers.host}`);
    const rawBody = await readBody(req);

    if (requestUrl.pathname === '/proxy' && requestUrl.searchParams.get('url')) {
      const target = new URL(requestUrl.searchParams.get('url'));
      checkAllowed(target);
      const upstream = await fetch(target, {
        method: 'POST',
        headers: forwardHeaders(req.headers),
        body: rawBody
      });
      const text = await upstream.text();
      return send(res, upstream.status, text, upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
    }

    if (requestUrl.pathname !== '/proxy') return send(res, 404, { error: 'Use POST /proxy' });
    const payload = JSON.parse(rawBody.toString('utf8'));
    const target = new URL(payload.url);
    checkAllowed(target);
    const upstream = await fetch(target, {
      method: payload.method || 'POST',
      headers: payload.headers || {},
      body: payload.body || undefined
    });
    const text = await upstream.text();
    return send(res, upstream.status, text, upstream.headers.get('content-type') || 'text/plain; charset=utf-8');
  } catch (error) {
    return send(res, 500, { error: error.message || String(error) });
  }
}).listen(port, () => {
  console.log(`QingTavern optional CORS proxy: http://localhost:${port}/proxy?url=https://api.example.com/v1/chat/completions`);
  console.log('Set QT_PROXY_ALLOW=api.example.com,openrouter.ai for a safer host allow-list.');
});
