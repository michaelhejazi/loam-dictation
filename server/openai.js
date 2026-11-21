import { openAIText } from './openai-text.js'
import { PolishError, polishPrompt, polishInput, POLISH_WAIT_MS } from './polish.js'

export const MODEL = 'gpt-transcribe'

export async function transcribeOpenAI({ audio, mimeType, terms, key, timeout, fetchImpl }) {
  const form = new FormData()
  const ext = { 'audio/mpeg': 'mp3', 'audio/m4a': 'm4a', 'audio/opus': 'ogg' }[mimeType] ?? mimeType.slice(6)
  form.set('file', new Blob([audio], { type: mimeType }), 'recording.' + ext)
  form.set('model', MODEL)
  const keywords = terms.filter(term => !/[<>]/.test(term))
  for (const term of keywords) form.append('keywords[]', term)
  const response = await fetchImpl('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST', headers: { authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(timeout),
  })
  if (!response.ok) throw Object.assign(new Error(`OpenAI refused the recording (HTTP ${response.status}).`), { status: response.status })
  return { text: String((await response.json()).text ?? '').trim(), biased: keywords.length > 0 }
}

export function openAIPolisher(key, fetchImpl) {
  return { async polish(transcript, level, terms) {
    try {
      return await openAIText({ key, fetchImpl, instructions: polishPrompt(level), input: polishInput(transcript, terms), signal: AbortSignal.timeout(POLISH_WAIT_MS) })
    } catch (error) {
      throw new PolishError(error.message.startsWith('OpenAI') ? error.message : 'OpenAI did not answer the polish request.')
    }
  } }
}
