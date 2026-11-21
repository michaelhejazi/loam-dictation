// Dictation that is recorded whole and cleaned up once: the audio a person
// took on the page goes to Gemini's transcription model and comes back as the
// words they said, with the ums and the false starts taken out.
//
// The key is this plugin's server's and stays here. The browser posts bytes
// to `/x/dictation/transcribe` and gets text back; it never learns which service did it,
// and it never holds anything it could spend.
//
// **What the model is asked to do is smart mode and nothing else.** Smart mode
// is Gemini's own cleanup — disfluencies, inline self-corrections, light
// formatting — and it is what "true to the words" means here: no prompt, no
// instruction to summarise or rephrase, nothing that would give the model
// licence to write something the person did not say.
//
// **Polish is a second, separate call**, after the words are in hand and only
// when the page asks for it (`polish.js`): a text model reads the
// transcript with the whole terms list and fixes the spelling of names and the
// grammar, behind a guard that hands back the transcript as heard when the
// answer is anything but the same words, tidied. A take never fails for it.

// The largest take this route accepts, in bytes, and the one number that says
// so. A five-minute take in Opus at the 32 kbit/s the page asks for is about
// 1.2 MB; a browser that ignores the bitrate and records at 128 kbit/s makes
// about 4.8 MB. Twelve is room for either and for a longer cap later, and it is
// still well under Gemini's inline request ceiling once base64 has made it a
// third bigger.
import { keyFrom } from './http.js'
import { transcribeOpenAI, openAIPolisher, MODEL as OPENAI_MODEL } from './openai.js'
import { createPolisher, polishLevel, polishTranscript } from './polish.js'

export const TRANSCRIBE_MAX_BYTES = 12 * 1024 * 1024

export const TRANSCRIBE_MODEL = 'gemini-3.5-transcribe'

// Custom vocabulary: Gemini takes up to a thousand terms and does best with
// about a hundred. The page lets a person keep a thousand and sends as many as
// fit its header's byte cap, so the server's cap is the API's own ceiling —
// the same number as the page's — and nothing a person added is dropped here.
export const VOCABULARY_MAX_TERMS = 1000
const VOCABULARY_MAX_TERM_CHARS = 80

// How long Gemini is given, which grows with the take. A phone waiting on a
// transcription is better told "that took too long" than left waiting for ever,
// but a fifteen-minute take — the top of the page's range — is not a
// two-minute job.
//
// The take's length is read off its size, at the bitrate the page asks the
// recorder for (32 kbit/s, so 240 kB a minute). A browser that records at a
// higher rate reads as a longer take than it is and gets more time, never
// less. Fifteen minutes is 120 s + 15 × 30 s = 570 s, under the cap.
export const GEMINI_TIMEOUT_FLOOR_MS = 120_000
export const GEMINI_TIMEOUT_PER_MINUTE_MS = 30_000
export const GEMINI_TIMEOUT_MAX_MS = 600_000
export const AUDIO_BYTES_PER_MINUTE = (32_000 / 8) * 60

export function geminiTimeoutMs(bytes) {
  const minutes = Math.max(0, Number(bytes) || 0) / AUDIO_BYTES_PER_MINUTE
  return Math.min(GEMINI_TIMEOUT_MAX_MS, Math.round(GEMINI_TIMEOUT_FLOOR_MS + minutes * GEMINI_TIMEOUT_PER_MINUTE_MS))
}

// What a browser's recorder names its container, as Gemini names it. The
// codec parameter is dropped (`audio/webm;codecs=opus` is `audio/webm`), and a
// Safari that records AAC in an MP4 container is sent as `audio/m4a`, which is
// the same container under the name Gemini's list uses.
const AUDIO_TYPES = new Map([
  ['audio/webm', 'audio/webm'],
  ['audio/ogg', 'audio/ogg'],
  ['audio/opus', 'audio/opus'],
  ['audio/mp4', 'audio/m4a'],
  ['audio/m4a', 'audio/m4a'],
  ['audio/x-m4a', 'audio/m4a'],
  ['audio/aac', 'audio/aac'],
  ['audio/mpeg', 'audio/mpeg'],
  ['audio/wav', 'audio/wav'],
])

export function geminiType(contentType) {
  const bare = String(contentType ?? '').split(';')[0].trim().toLowerCase()
  return AUDIO_TYPES.get(bare) ?? null
}

// The terms the page sent, cleaned: strings only, trimmed, no repeats, none
// too long to be a name, and no more than the cap. Polish reads them all and
// asks for no cap.
export function cleanVocabulary(terms, max = VOCABULARY_MAX_TERMS) {
  if (!Array.isArray(terms)) return []
  const out = []
  const seen = new Set()
  for (const term of terms) {
    if (typeof term !== 'string') continue
    const said = term.replace(/\s+/g, ' ').trim()
    if (said === '' || said.length > VOCABULARY_MAX_TERM_CHARS) continue
    const key = said.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(said)
    if (out.length >= max) break
  }
  return out
}

// The request, whole. Inline rather than through the Files API: a take under
// the cap above is small enough to go in the body, and inline is one request
// where the Files API is an upload, a reference and a file left on Google's
// side to expire. The Interactions API takes an audio item with base64 `data`.
export function geminiRequest({ audio, mimeType, vocabulary }) {
  const transcription = { mode: 'smart' }
  if (vocabulary.length > 0) transcription.custom_vocabulary = vocabulary
  return {
    model: TRANSCRIBE_MODEL,
    input: [{ type: 'audio', mime_type: mimeType, data: Buffer.from(audio).toString('base64') }],
    generation_config: { transcription_config: transcription },
  }
}

// The words, out of the interaction. Only the model's own output: the steps
// can also carry the input back, and an audio item read as text would be
// nothing, or worse.
export function transcriptOf(interaction) {
  const parts = []
  for (const step of interaction?.steps ?? []) {
    if (step?.type !== 'model_output') continue
    for (const item of step.content ?? []) {
      if (item?.type === 'text' && typeof item.text === 'string') parts.push(item.text)
    }
  }
  return parts.join('\n').trim()
}

// A refusal as a sentence the page can show, and the status to send it with.
class Refusal extends Error {
  constructor(status, message, outcome = 'error') {
    super(message)
    this.status = status
    this.outcome = outcome
  }
}

export function createTranscriber(config, { fetchImpl = fetch, getKey = async () => config.geminiApiKey || '', getOpenAIKey = keyFrom(config.keysFile, 'OPENAI_API_KEY'), polisher = createPolisher(config, { fetchImpl, getKey }) } = {}) {
  const endpoint = `${config.geminiUrl}/v1beta/interactions`

  async function provider() {
    if (await getKey()) return 'google'
    return (await getOpenAIKey()) ? 'openai' : 'browser'
  }

  async function call(body, timeoutMs) {
    let res
    try {
      res = await fetchImpl(endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-goog-api-key': await getKey() },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(timeoutMs),
      })
    } catch (err) {
      if (err?.name === 'TimeoutError') {
        throw new Refusal(504, 'Gemini took too long to transcribe this. Try again, or send a shorter take.')
      }
      throw new Refusal(502, `Gemini could not be reached: ${err?.message ?? err}`)
    }
    const text = await res.text()
    let parsed = null
    try {
      parsed = JSON.parse(text)
    } catch {
      /* an error page that is not JSON; the status says enough */
    }
    return { status: res.status, ok: res.ok, body: parsed }
  }

  function saysVocabulary(out) {
    return /vocab/i.test(String(out.body?.error?.message ?? ''))
  }

  return {
    provider,
    get configured() {
      return Boolean(config.geminiApiKey)
    },

    // → `{ status, body, report }`, always, never a throw: every way this can
    // go wrong is a sentence for the page. `report` is the take's log line —
    // counts, timings and the outcome, and nothing that was said or sent.
    //
    // `polish` is the level the page asked for, `off` when it asked for none.
    // The answer's `polish` says what happened, when it was asked for:
    // `{level, ran}`, and `why` when it fell back, a reason to show beside
    // words that landed anyway.
    async transcribe({ audio, contentType, vocabulary, polish = 'off', expectedProvider }) {
      const report = {
        bytes: audio?.length ?? 0,
        mime: contentType ?? null,
        gemini_ms: null,
        gemini_status: null,
        timeout_ms: null,
        chars: null,
        biased: false,
        terms: 0,
        retried_without_terms: false,
        polish: polishLevel(polish),
        polish_ms: null,
        polish_ran: null,
        polish_why: null,
        outcome: 'ok',
      }
      // The calls to Gemini, timed together: a retry is part of the same take.
      const timed = async (body) => {
        const started = performance.now()
        try {
          const out = await call(body, report.timeout_ms)
          report.gemini_status = out.status
          return out
        } finally {
          report.gemini_ms = (report.gemini_ms ?? 0) + Math.round(performance.now() - started)
        }
      }
      try {
        const selected = await provider()
        if (expectedProvider && expectedProvider !== selected) throw new Refusal(409, 'The speech provider changed. Start a new recording.')
        if (selected === 'browser') {
          throw new Refusal(503, 'Dictation needs a Gemini API key. Add a Google key under API keys, in Settings › Connections.')
        }
        if (!audio || audio.length === 0) {
          throw new Refusal(400, 'The recording was empty, so there was nothing to transcribe.')
        }
        if (audio.length > TRANSCRIBE_MAX_BYTES) {
          throw new Refusal(413, tooBig())
        }
        const mimeType = geminiType(contentType)
        if (!mimeType) {
          throw new Refusal(415, `This browser recorded ${contentType || 'an unnamed type'}, which cannot be transcribed.`)
        }
        const terms = cleanVocabulary(vocabulary)
        report.terms = terms.length
        report.timeout_ms = geminiTimeoutMs(audio.length)

        let text, biased
        let polishWith = polisher
        if (selected === 'openai') {
          const key = await getOpenAIKey()
          try {
            ;({ text, biased } = await transcribeOpenAI({ audio, mimeType, terms, key, timeout: report.timeout_ms, fetchImpl }))
          } catch (err) {
            throw new Refusal(err.status === 429 ? 429 : 502, err.status ? err.message : 'OpenAI could not finish the transcription.')
          }
          polishWith = openAIPolisher(key, fetchImpl)
        } else {
          let out = await timed(geminiRequest({ audio, mimeType, vocabulary: terms }))
          biased = terms.length > 0
          report.biased = biased
          // Smart mode and custom vocabulary are documented as going together;
          // should the model ever refuse the pair, the cleanup is the thing to
          // keep, so the take is sent again without the terms rather than lost.
          if (out.status === 400 && biased && saysVocabulary(out)) {
            out = await timed(geminiRequest({ audio, mimeType, vocabulary: [] }))
            biased = false
            report.biased = false
            report.retried_without_terms = true
          }
          if (!out.ok) {
            const said = out.body?.error?.message
            if (out.status === 429) {
              throw new Refusal(429, `Gemini is refusing more transcriptions for now${said ? `: ${said}` : '.'}`)
            }
            throw new Refusal(502, `Gemini could not transcribe this (${out.status})${said ? `: ${said}` : '.'}`)
          }
          if (out.body?.status && out.body.status !== 'completed') {
            throw new Refusal(502, `Gemini did not finish transcribing this (${out.body.status}).`)
          }
          text = transcriptOf(out.body)
        }
        report.biased = biased
        report.chars = text.length
        if (text === '') {
          throw new Refusal(422, selected === 'openai' ? 'OpenAI heard no words in this recording.' : 'Gemini heard no words in this recording.', 'heard-no-words')
        }
        const level = polishLevel(polish)
        const started = performance.now()
        const polished = await polishTranscript(polishWith, text, level, cleanVocabulary(vocabulary, Infinity))
        if (selected === 'openai' && polished.why) polished.why = polished.why.replace(/^Gemini/, 'OpenAI')
        if (level !== 'off') {
          report.polish_ms = Math.round(performance.now() - started)
          report.polish_ran = polished.ran
          // The reason, unless it would quote a word of the answer: the log
          // line holds nothing that was said.
          if (!polished.ran) report.polish_why = polished.why.startsWith('the answer had "') ? 'a name that wasn’t said' : polished.why
        }
        const body = { text: polished.text, biased, model: selected === 'openai' ? OPENAI_MODEL : TRANSCRIBE_MODEL }
        if (level !== 'off') body.polish = polished.ran ? { level, ran: true } : { level, ran: false, why: polished.why }
        return { status: 200, body, report }
      } catch (err) {
        if (err instanceof Refusal) {
          report.outcome = err.outcome
          if (err.outcome === 'error') report.error = err.message
          return { status: err.status, body: { error: err.message }, report }
        }
        throw err
      }
    },
  }
}

export function tooBig() {
  return `The recording is over ${Math.round(TRANSCRIBE_MAX_BYTES / (1024 * 1024))} MB, which is more than Dictation will transcribe.`
}
