/**
 * Next.js App Router catch-all proxy → existing Express app.
 *
 * Why this exists:
 *   Next.js 16 on Vercel claims every `/api/*` path for itself before the
 *   `vercel.json` rewrites get a chance. Earlier deployments had Express
 *   wired through `/api/server` + a rewrite, which Next.js silently
 *   shadowed — every request to `/api/auth/login` returned the framework's
 *   default `/500` HTML page without ever invoking the function.
 *
 *   Hosting the Express app inside an App Router route guarantees Next.js
 *   dispatches the request to our code natively. No rewrites, no
 *   shadowing, no surprises.
 *
 * Runtime contract:
 *   - Web `Request` comes in via Next.js. We adapt it to a Node-style
 *     IncomingMessage-ish object so the existing Express middleware chain
 *     (cors, express.json, audit log, error handler) works untouched.
 *   - A collector `ServerResponse`-ish object captures the Express
 *     output, which we then return as a Web `Response`.
 *
 *   Body parsing: Next.js already gives us the raw bytes via
 *   `request.arrayBuffer()`. We pre-parse JSON ourselves, set
 *   `req.body` directly, and mark `req._body = true` so Express's
 *   body-parser skips its own (now-empty) stream read.
 */

import { app, prepareApp } from '../../../server/app.js'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

async function handle(request) {
  const url = new URL(request.url)
  const reqId = Math.random().toString(36).slice(2, 10)
  const t0 = Date.now()

  console.log(
    `[route] ▶ ${reqId} ${request.method} ${url.pathname}${url.search} ct=${request.headers.get('content-type') || '-'}`,
  )

  // 1. Ensure MongoDB is connected. prepareApp() is idempotent — cheap on
  // every subsequent invocation thanks to the cached promise inside.
  try {
    await prepareApp()
  } catch (err) {
    console.error(`[route] ✖ ${reqId} prepareApp failed:`, err?.stack || err)
    return Response.json(
      {
        success: false,
        error: {
          code: 'STARTUP_FAILED',
          message: err?.message || 'Database connection failed',
        },
        reqId,
      },
      { status: 503 },
    )
  }

  // 2. Read the request body once. Stays out of the way for bodyless
  // methods (GET, HEAD) so we never try to consume a non-existent stream.
  let rawBody = null
  if (!['GET', 'HEAD'].includes(request.method)) {
    try {
      const ab = await request.arrayBuffer()
      if (ab && ab.byteLength > 0) rawBody = Buffer.from(ab)
    } catch (err) {
      console.error(`[route] ✖ ${reqId} body read failed:`, err)
    }
  }

  // 3. Pre-parse JSON body so the Express body-parser can skip stream
  // reads (which would yield empty bytes — see vercel-body-parsing
  // troubleshooting in commit history).
  let parsedBody
  const contentType = (request.headers.get('content-type') || '').toLowerCase()
  if (rawBody && contentType.includes('application/json')) {
    try {
      parsedBody = JSON.parse(rawBody.toString('utf8'))
    } catch {
      /* malformed JSON — let Express return BAD_JSON */
    }
  }

  // 4. Build a Node-style req. Includes the listeners Express middleware
  // poke at; methods that don't apply here resolve to no-ops.
  const headers = {}
  request.headers.forEach((v, k) => {
    headers[k.toLowerCase()] = v
  })

  const fakeReq = {
    method: request.method,
    url: url.pathname + url.search,
    originalUrl: url.pathname + url.search,
    httpVersion: '1.1',
    headers,
    rawHeaders: Object.entries(headers).flatMap(([k, v]) => [k, v]),
    // Pre-parsed body + skip flag. body-parser checks `_body` and bails
    // immediately when true.
    body: parsedBody,
    _body: parsedBody !== undefined,
    rawBody: rawBody || undefined,
    query: Object.fromEntries(url.searchParams),
    // Stream API stubs — Express occasionally calls these even on a
    // pre-parsed request.
    readable: false,
    on(event, fn) {
      if (event === 'end') setImmediate(fn)
      return this
    },
    once(event, fn) {
      if (event === 'end') setImmediate(fn)
      return this
    },
    removeListener() {
      return this
    },
    pipe() {},
    socket: { remoteAddress: headers['x-forwarded-for'] || '127.0.0.1' },
    connection: { remoteAddress: headers['x-forwarded-for'] || '127.0.0.1' },
  }

  // 5. Promise-based fakeRes that resolves when Express calls end().
  return new Promise((resolve) => {
    let status = 200
    const respHeaders = {}
    const chunks = []
    let settled = false

    const finalize = () => {
      if (settled) return
      settled = true
      const body = chunks.length ? Buffer.concat(chunks) : null
      const outHeaders = new Headers()
      for (const [k, v] of Object.entries(respHeaders)) {
        if (Array.isArray(v)) {
          for (const each of v) outHeaders.append(k, String(each))
        } else if (v !== undefined && v !== null) {
          outHeaders.set(k, String(v))
        }
      }
      console.log(
        `[route] ◀ ${reqId} ${request.method} ${url.pathname} → ${status} (${Date.now() - t0}ms)`,
      )
      resolve(new Response(body, { status, headers: outHeaders }))
    }

    const fakeRes = {
      statusCode: 200,
      headersSent: false,
      setHeader(name, value) {
        respHeaders[String(name).toLowerCase()] = value
      },
      getHeader(name) {
        return respHeaders[String(name).toLowerCase()]
      },
      removeHeader(name) {
        delete respHeaders[String(name).toLowerCase()]
      },
      getHeaders() {
        return { ...respHeaders }
      },
      writeHead(s, h) {
        status = s
        this.statusCode = s
        if (h && typeof h === 'object') {
          for (const [k, v] of Object.entries(h)) {
            respHeaders[String(k).toLowerCase()] = v
          }
        }
        this.headersSent = true
        return this
      },
      write(chunk) {
        if (chunk == null) return true
        chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        return true
      },
      end(chunk) {
        if (chunk != null) {
          chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk)))
        }
        // Express sets res.statusCode directly when it doesn't call writeHead.
        status = this.statusCode || status
        this.headersSent = true
        finalize()
        return this
      },
      // No-op event API — Express occasionally attaches listeners (notably
      // 'finish' from its own logger middleware). We don't fire them
      // explicitly because finalize() already resolves the Promise.
      on() {
        return this
      },
      once() {
        return this
      },
      removeListener() {
        return this
      },
      emit() {
        return true
      },
    }

    try {
      app(fakeReq, fakeRes)
    } catch (err) {
      console.error(`[route] ✖ ${reqId} Express threw synchronously:`, err?.stack || err)
      if (!settled) {
        settled = true
        resolve(
          Response.json(
            {
              success: false,
              error: {
                code: 'FUNCTION_ERROR',
                message: err?.message || 'Express handler crashed',
              },
              reqId,
            },
            { status: 500 },
          ),
        )
      }
    }
  })
}

export {
  handle as GET,
  handle as POST,
  handle as PUT,
  handle as PATCH,
  handle as DELETE,
  handle as OPTIONS,
  handle as HEAD,
}
