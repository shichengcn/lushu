const SHARE_TTL_SECONDS = 60 * 60 * 24 * 30
const MAX_SHARE_BYTES = 2 * 1024 * 1024

function json(data, init = {}) {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      ...init.headers,
    },
  })
}

function createShareId() {
  const bytes = crypto.getRandomValues(new Uint8Array(9))
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url)

    if (url.pathname === '/api/shares' && request.method === 'POST') {
      const contentLength = Number(request.headers.get('content-length') || 0)
      if (contentLength > MAX_SHARE_BYTES) {
        return json({ error: 'share_too_large' }, { status: 413 })
      }

      const body = await request.text()
      if (new TextEncoder().encode(body).byteLength > MAX_SHARE_BYTES) {
        return json({ error: 'share_too_large' }, { status: 413 })
      }

      try {
        const roadbook = JSON.parse(body)
        if (!roadbook?.title || !Array.isArray(roadbook?.days) || !roadbook.days.length) {
          return json({ error: 'invalid_roadbook' }, { status: 400 })
        }
      } catch {
        return json({ error: 'invalid_json' }, { status: 400 })
      }

      const id = createShareId()
      await env.SHARES.put(id, body, { expirationTtl: SHARE_TTL_SECONDS })
      return json({ id, expiresIn: SHARE_TTL_SECONDS }, { status: 201 })
    }

    if (url.pathname.startsWith('/api/shares/') && request.method === 'GET') {
      const id = url.pathname.slice('/api/shares/'.length)
      if (!/^[a-zA-Z0-9_-]{8,64}$/.test(id)) {
        return json({ error: 'invalid_share_id' }, { status: 400 })
      }
      const roadbook = await env.SHARES.get(id)
      return roadbook
        ? new Response(roadbook, {
            headers: {
              'content-type': 'application/json; charset=utf-8',
              'cache-control': 'public, max-age=300',
            },
          })
        : json({ error: 'share_not_found' }, { status: 404 })
    }

    if (url.pathname.startsWith('/api/')) {
      return json({ error: 'not_found' }, { status: 404 })
    }

    return env.ASSETS.fetch(request)
  },
}
