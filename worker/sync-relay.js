const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
const CODE_TTL_SECONDS = 7 * 24 * 60 * 60
const MAX_PAYLOAD_LENGTH = 450_000

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
      'Cache-Control': 'no-store',
    },
  })
}

function createCode() {
  const random = crypto.getRandomValues(new Uint8Array(12))
  const value = Array.from(random, (byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('')
  return `DLUT-${value.slice(0, 4)}-${value.slice(4, 8)}-${value.slice(8)}`
}

function codeFromPath(pathname) {
  const code = decodeURIComponent(pathname.split('/').filter(Boolean).at(-1) || '').toUpperCase()
  return /^DLUT-(?:[A-Z2-9]{4}-){2}[A-Z2-9]{4}$/.test(code) ? code : null
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return json({}, 204)

    if (request.method === 'POST') {
      let body
      try {
        body = await request.json()
      } catch {
        return json({ error: 'invalid_json' }, 400)
      }
      if (typeof body.payload !== 'string' || !body.payload.startsWith('DLUTSYNC:')) {
        return json({ error: 'invalid_payload' }, 400)
      }
      if (body.payload.length > MAX_PAYLOAD_LENGTH) return json({ error: 'too_large' }, 413)

      // A collision is extremely unlikely, but never overwrite an existing transfer.
      let code
      for (let attempt = 0; attempt < 4; attempt += 1) {
        const candidate = createCode()
        if ((await env.SYNC_CODES.get(candidate)) === null) {
          code = candidate
          break
        }
      }
      if (!code) return json({ error: 'code_generation_failed' }, 503)
      await env.SYNC_CODES.put(code, body.payload, { expirationTtl: CODE_TTL_SECONDS })
      return json({ code, expiresIn: CODE_TTL_SECONDS }, 201)
    }

    if (request.method === 'GET') {
      const code = codeFromPath(new URL(request.url).pathname)
      if (!code) return json({ error: 'invalid_code' }, 400)
      const payload = await env.SYNC_CODES.get(code)
      return payload === null ? json({ error: 'not_found' }, 404) : json({ payload })
    }

    return json({ error: 'method_not_allowed' }, 405)
  },
}
