import http from 'node:http';
import { Readable } from 'node:stream';

const host = process.env.LOOM_APP_HOST || '127.0.0.1';
const port = Number(process.env.LOOM_APP_PORT || 8787);
const loomBaseUrl = (process.env.LOOM_BASE_URL || 'http://127.0.0.1:8765').replace(
  /\/+$/,
  '',
);
const loomToken = process.env.LOOM_WEB_AUTH_TOKEN || '';
const allowedOrigin = process.env.LOOM_APP_ORIGIN || '*';

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Loom-Project',
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    Vary: 'Origin',
  };
}

function sendJson(response, status, value) {
  const body = JSON.stringify(value);
  response.writeHead(status, {
    ...corsHeaders(),
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

async function readBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > 20 * 1024 * 1024) {
      throw new Error('Request body exceeds 20 MB');
    }
    chunks.push(chunk);
  }
  return chunks.length ? Buffer.concat(chunks) : undefined;
}

function upstreamHeaders(request) {
  const headers = new Headers();
  const contentType = request.headers['content-type'];
  const accept = request.headers.accept;
  const project = request.headers['x-loom-project'];
  if (contentType) headers.set('content-type', contentType);
  if (accept) headers.set('accept', accept);
  if (project) headers.set('x-loom-project', project);
  if (loomToken) headers.set('authorization', `Bearer ${loomToken}`);
  return headers;
}

function responseHeaders(upstream) {
  const headers = { ...corsHeaders() };
  for (const [key, value] of upstream.headers.entries()) {
    const lower = key.toLowerCase();
    if (
      lower === 'connection' ||
      lower === 'content-encoding' ||
      lower === 'content-length' ||
      lower === 'transfer-encoding'
    ) {
      continue;
    }
    headers[key] = value;
  }
  return headers;
}

async function proxy(request, response) {
  const incomingUrl = new URL(request.url || '/', `http://${request.headers.host}`);
  if (!incomingUrl.pathname.startsWith('/api/')) {
    sendJson(response, 404, { error: 'Unknown gateway route' });
    return;
  }

  const controller = new AbortController();
  response.on('close', () => controller.abort());

  const body =
    request.method === 'GET' || request.method === 'HEAD'
      ? undefined
      : await readBody(request);
  const upstream = await fetch(`${loomBaseUrl}${incomingUrl.pathname}${incomingUrl.search}`, {
    method: request.method,
    headers: upstreamHeaders(request),
    body,
    redirect: 'manual',
    signal: controller.signal,
  });

  response.writeHead(upstream.status, responseHeaders(upstream));
  if (!upstream.body) {
    response.end();
    return;
  }
  Readable.fromWeb(upstream.body).pipe(response);
}

const server = http.createServer(async (request, response) => {
  if (request.method === 'OPTIONS') {
    response.writeHead(204, corsHeaders());
    response.end();
    return;
  }

  if (request.url === '/health') {
    try {
      const upstream = await fetch(`${loomBaseUrl}/api/projects`, {
        headers: upstreamHeaders(request),
        signal: AbortSignal.timeout(3000),
      });
      sendJson(response, upstream.ok ? 200 : 502, {
        ok: upstream.ok,
        gateway: { host, port },
        loom: { ok: upstream.ok, status: upstream.status, url: loomBaseUrl },
      });
    } catch (error) {
      sendJson(response, 502, {
        ok: false,
        gateway: { host, port },
        loom: { ok: false, url: loomBaseUrl },
        error: error instanceof Error ? error.message : String(error),
      });
    }
    return;
  }

  try {
    await proxy(request, response);
  } catch (error) {
    if (!response.headersSent) {
      sendJson(response, 502, {
        error: error instanceof Error ? error.message : String(error),
      });
    } else {
      response.destroy(error instanceof Error ? error : undefined);
    }
  }
});

server.listen(port, host, () => {
  console.log(`Loom App gateway: http://${host}:${port}`);
  console.log(`Loom backend: ${loomBaseUrl}`);
  if (host !== '127.0.0.1' && host !== '::1') {
    console.warn('Gateway is listening beyond localhost; place it behind TLS and authentication.');
  }
});
