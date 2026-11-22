// Dictation's routes, served by its own server at `/x/dictation/` (Loam's
// plugin gateway takes the prefix off, so these paths start at `/`):
//
//   POST /transcribe   a take in, the words out: a multipart form (`audio`,
//                      `terms` as a JSON list, `polish`), or the audio bytes
//                      alone with the terms in `x-vocabulary`
//   GET  /terms        the vault's dictation terms note, read fresh; 404 none
//
// Until Dictation 1.1.0 these were Loam's own (`/api/transcribe`, and the
// broker's `/v1/dictation-terms`); a plugin now carries its own server half.

import http from 'node:http'
import { sendJson, readRaw } from './http.js'
import { TRANSCRIBE_MAX_BYTES, tooBig } from './transcribe.js'
import { readTerms, termsVaultPath } from './terms.js'

// What a multipart take carries beyond its audio: the terms, a thousand of
// at most eighty characters, as JSON, with the envelope's own lines.
const TERMS_BODY_BYTES = 256 * 1024

export function createDictationServer({ config, transcriber, log = { info() {}, warn() {}, error() {} } }) {
  // One line per take, for counting them: sizes, timings, counts and the
  // outcome. Never the audio, never the words, never the terms themselves.
  async function transcribe(req, res) {
    const form = /^multipart\/form-data/i.test(String(req.headers['content-type'] ?? ''))
    let audio = await readRaw(req, form ? TRANSCRIBE_MAX_BYTES + TERMS_BODY_BYTES : TRANSCRIBE_MAX_BYTES)
    let contentType = req.headers['content-type']
    let vocabulary = vocabularyHeader(req.headers['x-vocabulary'])
    let polish = 'off'
    if (form && audio !== null) {
      const take = await takeForm(audio, contentType)
      if (!take) return sendJson(res, 400, { error: 'The recording did not arrive as a take: there was no audio part in it.' })
      ;({ audio, contentType, vocabulary, polish } = take)
    }
    if (audio === null) {
      log.warn({ event: 'transcribe', bytes: Number(req.headers['content-length']) || null,
        mime: req.headers['content-type'] ?? null, outcome: 'error', status: 413, error: tooBig() })
      return sendJson(res, 413, { error: tooBig() })
    }
    const out = await transcriber.transcribe({ audio, contentType, vocabulary, polish, expectedProvider: req.headers['x-speech-provider'] })
    const report = { event: 'transcribe', status: out.status, ...out.report }
    if (report.outcome === 'error') log.warn(report)
    else log.info(report)
    return sendJson(res, out.status, out.body)
  }

  async function route(req, res) {
    const url = new URL(req.url, 'http://plugin.invalid')
    const rest = url.pathname.replace(/\/+$/, '') || '/'
    if (rest === '/status' && req.method === 'GET') return sendJson(res, 200, { provider: await transcriber.provider() })
    if (rest === '/up' && req.method === 'GET') return sendJson(res, 200, { ok: true })
    if (rest === '/transcribe' && req.method === 'POST') return await transcribe(req, res)
    if (rest === '/terms' && req.method === 'GET') {
      const note = await readTerms(config.terms)
      if (!note) return sendJson(res, 404, { error: 'There is no dictation terms note on this box.', path: termsVaultPath(config.terms) })
      return sendJson(res, 200, note)
    }
    return sendJson(res, 404, { error: 'Dictation has no such route.' })
  }

  const server = http.createServer((req, res) => {
    route(req, res).catch((err) => {
      log.error({ event: 'request', path: req.url, message: String(err?.message ?? err) })
      if (!res.headersSent) sendJson(res, 500, { error: 'Dictation failed to answer this.' })
      else res.destroy()
    })
  })
  return { server }
}

// The terms a take is biased towards, as the page sent them. Anything that
// does not read as a list is no list: biasing is a help, never a refusal.
function vocabularyHeader(value) {
  if (!value) return []
  try {
    const parsed = JSON.parse(decodeURIComponent(String(value)))
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

// A multipart take, read by the platform's own form parser: the audio part's
// bytes and type, the terms and the polish level. `null` with no audio part.
async function takeForm(body, contentType) {
  let form
  try {
    form = await new Response(body, { headers: { 'content-type': contentType } }).formData()
  } catch {
    return null
  }
  const audio = form.get('audio')
  if (!audio || typeof audio === 'string') return null
  let vocabulary = []
  try {
    const parsed = JSON.parse(String(form.get('terms') ?? '[]'))
    if (Array.isArray(parsed)) vocabulary = parsed
  } catch {
    /* biasing is a help, never a refusal */
  }
  const polish = String(form.get('polish') ?? 'off')
  return { audio: Buffer.from(await audio.arrayBuffer()), contentType: audio.type, vocabulary, polish }
}
