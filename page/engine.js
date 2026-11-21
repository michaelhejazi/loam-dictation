
// This plugin's own server, through Loam's plugin gateway (server/app.js).
const SERVER = '/x/dictation/'
// Mounted once. Cross-module state and operations are explicit host services.
export function mount(host, { segmentedControl }) {
const { screenKeeper, feel, playTone, recordMaxMs, recorderType, RECORD_BITS_PER_SECOND, recordPhase, pushLevel, levelOf, dictationVocabulary, vaultTerms, mergeAt, LEVEL_BARS, clock, RECORD_MINUTES_MIN, RECORD_MINUTES_MAX, readField, caretPoint, setMarkdown, fetch, h, icon, longAgo } = host


// ---------------------------------------------------------------- dictation
//
// **The field is the take.** The owner, 2026-09-29: "When I'm doing audio input,
// I'm not going to be typing at the same time, so the input box should become
// the audio UI. It should just have a check mark or an X to discard. If I hit
// the check mark, it should just insert the text into the input box, and then I
// do the normal submit." Until then a take was a card of its own above the
// composer, with Add to message, Send and Discard under the words — three
// choices where they wanted one, and a second box on top of the one they write in.
//
// So a take has three states and all three are drawn *inside* row one, in the
// footprint of the field it stands in for (`takeSurface()` below):
//
//   recording  the clock, the microphone's loudness, ✕ and ✓
//   cleaning   the take is at the plugin's server; a slow shimmer and one ✕
//   (landed)   there is no third state to draw — the words are in the field at
//              the caret, and the take is gone
//
// **What was typed is never touched until words land.** The field is hidden
// under the take, not emptied, so ✕ — at any point — is only the take going
// away; and the words are merged in at the caret read at the press, with the
// spacing `mergeAt()` decides. A take that fails leaves the field as it was and
// says so on the quiet line above the composer (`state.takeNotice`).
//
// `state.rec` is the take, in either of the mic's two ways:
//
//   { mode: 'record', phase: 'recording' | 'cleaning', target, caret,
//     started, elapsed, maxMs, levels, audio, retried }
//   { mode: 'live', phase: 'recording', target, caret, started, elapsed,
//     words, listening }
//
// `target` is which field the take stands in: `draft`, the composer's, or
// `editor`, the full-screen editor's — whichever the mic was pressed in.

// The browser's own speech input, where there is one. It is wired rather than
// drawn: a mic that opens nothing would be a button that lies. A browser
// without it gets no mic at all, which is the honest empty state.
const Recogniser = globalThis.SpeechRecognition ?? globalThis.webkitSpeechRecognition ?? null

let recogniser = null



// What the live take says, from two parts:
//
//   finals  the results the browser has settled, in the order they settled
//   interim its current guess at what is being said right now
//
// **The guess is replaced, never appended**, which is the defect this is
// written against: saying "Hi, how's it going" into the old code, which added
// every result to the field it was already in, left "HiHi howHi how isHi how
// itHi how's it going" behind. A recogniser re-sends its interim result for the
// same utterance as it sharpens, so anything that appends stacks every draft of
// a sentence on top of the last one. Seen in a real browser, 2026-09-22;
// `test/app.test.js` replays the sequence that did it.
//
// `event.resultIndex` is where the browser says this event's news begins;
// everything below it has already settled and is in `finals` — so only the
// results from that index up are read, and only the final ones among them are
// kept.
//
// **What the take shows is two inks, and what ✓ keeps is both of them.** The
// settled words are the recogniser's finals and the guess is its current interim
// result, which it goes on rewriting as it hears more — so the guess is drawn
// muted and the settled words in full ink, and a correction is something a
// person watches happen. Each utterance is trimmed and joined with one space:
// a recogniser that starts its next result without a leading space (not every
// one sends it) would otherwise glue two sentences into one word.
function liveHeard(finals, interim) {
  const tidy = (said) => said.replace(/\s+/g, ' ').trim()
  return { settled: finals.map(tidy).filter(Boolean).join(' '), guess: tidy(interim) }
}

function liveWords(heard) {
  return [heard.settled, heard.guess].filter(Boolean).join(' ')
}



// The field a take stands in.
function takeField(target) {
  return target === 'editor' ? host.editorDraft : target === 'file' ? host.fileField : host.draft
}



// Where the words will go: the caret in that field at the press, because by the
// time they come back the field has long lost it. `null` is the end.
function caretOf(field) {
  if (field === host.fileField) return host.fileField.selectionEnd ?? host.fileField.value.length
  return readField(field, caretPoint(field)).caret
}

function startLive(target) {
  if (!Recogniser || host.state.rec) return
  const field = takeField(target)
  const here = new Recogniser()
  recogniser = here
  here.lang = navigator.language || 'en-US'
  here.interimResults = true
  here.continuous = true
  const finals = []
  const liveTick = setInterval(() => {
    if (recogniser !== here || host.state.rec?.mode !== 'live') return clearInterval(liveTick)
    host.state.rec = { ...host.state.rec, elapsed: Date.now() - host.state.rec.started }
    host.schedule()
  }, 250)
  host.state.rec = {
    mode: 'live',
    phase: 'recording',
    target,
    caret: caretOf(field),
    started: Date.now(),
    elapsed: 0,
    words: '',
    heard: { settled: '', guess: '' },
    listening: true,
    stopTick: () => clearInterval(liveTick),
  }
  here.addEventListener('result', (event) => {
    if (recogniser !== here || !host.state.rec) return
    let interim = ''
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const said = event.results[i][0].transcript
      if (event.results[i].isFinal) finals.push(said)
      else interim += said
    }
    const heard = liveHeard(finals, interim)
    host.state.rec = { ...host.state.rec, heard, words: liveWords(heard) }
    host.schedule()
  })
  // A recogniser that stops by itself — a long silence, the network — leaves
  // what it heard in the field for ✓ or ✕, with the clock stopped. It does not
  // decide for the person which of the two it was.
  const ended = () => {
    if (recogniser !== here) return
    recogniser = null
    clearInterval(liveTick)
    screen.release()
    audioSessionType('playback')
    if (host.state.rec?.mode === 'live') host.state.rec = { ...host.state.rec, listening: false }
    host.schedule()
  }
  here.addEventListener('end', ended)
  here.addEventListener('error', event => {
    ended()
    if (event.error !== 'aborted' && host.state.rec?.mode === 'live' && !host.state.rec.words) {
      host.state.rec = null
      say(event.error === 'not-allowed' ? 'This browser needs microphone permission to dictate.' :
        'This browser could not recognise speech. Try again or use a server key.', { act: 'guide', label: 'Get a key' })
    }
  })
  host.captureStarted()
  audioSessionType('play-and-record')
  try { here.start() } catch {
    ended(); host.state.rec = null
    say('This browser could not start recognition.', { act: 'guide', label: 'Get a key' })
    return
  }
  screen.hold()
  sense('started')
  host.schedule()
}

function stopLive() {
  screen.release()
  host.state.rec?.stopTick?.()
  const here = recogniser
  recogniser = null
  audioSessionType('playback')
  if (!here) return
  try {
    here.stop()
  } catch {
    /* already stopped */
  }
}



// ------------------------------------------- dictation, recorded whole

// The mic's other way of working, and the one it uses by default: the whole
// take is recorded, sent to this plugin's server (`/x/dictation/transcribe`) when it stops, and the
// words come back cleaned — the ums and false starts gone, what was said kept.
//
// **Which of the two the mic is, is decided here and only here.** It is the
// person's, from Settings: `record` by default, `browser` if they asked for the
// browser's own live recognition. A choice this browser cannot honour gives way
// to the one it can — a browser that cannot record falls back to recognition
// whatever was chosen — and a browser with neither has no mic. Read at every
// press, so a change in Settings is the next press and needs no reload.
function canRecord() {
  return Boolean(globalThis.MediaRecorder && globalThis.navigator?.mediaDevices?.getUserMedia)
}

function dictationMode() {
  if (host.provider?.() === 'browser') return Recogniser ? 'browser' : null
  if (host.state.dictation.mode === 'browser' && Recogniser) return 'browser'
  if (canRecord()) return 'record'
  if (Recogniser) return 'browser'
  return null
}

let recording = null

 // { recorder, stream, context, analyser, bytes, chunks, started, tick, warned, cancelled }

// The screen, kept on from the press until the take stops recording — by ✓,
// ✕, the cap, a microphone that would not open, or the chat being left, every
// one of which comes through `release()`, `stopLive()` or `discardTake()`.
const screen = screenKeeper(globalThis.navigator?.wakeLock)



// WebKit can retain its recording audio category after capture stops. Return
// it to playback at the capture boundary, without waiting for transcription.
// Other browsers manage this themselves; the optional API must never stop a take.
const audioSessionType = host.audioSessionType

// One of the three moments in `HAPTICS`, felt: a buzz where the browser takes
// one, and at the two later moments a soft tone on the take's own audio context
// where it does not. `here` is the recording the tone plays on; a tone at the
// cap keeps that context open until it has finished (`release()`).
function sense(moment, here = null) {
  const nav = globalThis.navigator
  const vibrate = typeof nav?.vibrate === 'function' ? (pattern) => nav.vibrate(pattern) : null
  const context = here?.context
  const tone =
    context && typeof context.createOscillator === 'function'
      ? (spec) => {
          const ends = playTone(context, spec)
          here.toneUntil = Date.now() + Math.max(0, ends - context.currentTime) * 1000
        }
      : null
  return feel(moment, { vibrate, tone })
}

async function startRecording(target) {
  if (host.state.rec) return
  const caret = caretOf(takeField(target))
  // The cap is read at the press and kept with the take, so a change in
  // Settings while it records is the next take's and not this one's.
  const maxMs = recordMaxMs(host.state.dictation.maxMinutes)
  const take = { mode: 'record', provider: host.provider?.(), phase: 'recording', target, caret, started: Date.now(), elapsed: 0, maxMs, levels: [], audio: null, retried: false, capture: {} }
  host.state.rec = take
  host.captureStarted()
  audioSessionType('play-and-record')
  screen.hold()
  host.schedule()

  let stream
  try {
    stream = await openMicrophone(host.state.dictation.deviceId)
  } catch (err) {
    // Discarded while the permission prompt was up: there is nothing to say.
    if (host.state.rec !== take) return
    host.state.rec = null
    screen.release()
    audioSessionType('playback')
    say(
      err?.name === 'NotAllowedError'
        ? 'The microphone is not allowed for this page. Allow it in the browser’s site settings and try again.'
        : `The microphone could not be opened${err?.message ? `: ${err.message}` : '.'}`,
    )
    restoreField(take)
    return
  }
  // Closed while the permission prompt was up.
  if (host.state.rec !== take) {
    for (const track of stream.getTracks?.() ?? []) track.stop()
    return
  }

  const mimeType = recorderType(globalThis.MediaRecorder.isTypeSupported?.bind(globalThis.MediaRecorder))
  const options = { audioBitsPerSecond: RECORD_BITS_PER_SECOND }
  if (mimeType) options.mimeType = mimeType
  const recorder = new globalThis.MediaRecorder(stream, options)
  const here = { recorder, stream, chunks: [], started: Date.now(), warned: false, cancelled: false }
  recording = here
  host.state.rec = { ...take, started: here.started }

  // The level meter. An analyser is a nicety: a browser without one records
  // just the same and draws its bars at rest.
  try {
    const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext
    if (Context) {
      here.context = new Context()
      here.source = here.context.createMediaStreamSource(stream)
      here.analyser = here.context.createAnalyser()
      here.analyser.fftSize = 512
      here.bytes = new Uint8Array(here.analyser.fftSize)
      here.source.connect(here.analyser)
    }
  } catch {
    here.analyser = null
  }

  recorder.addEventListener('dataavailable', (event) => {
    if (event.data && event.data.size > 0) here.chunks.push(event.data)
  })
  recorder.addEventListener('stop', () => {
    release(here)
    if (here.cancelled || host.state.rec?.capture !== take.capture) return
    const type = recorder.mimeType || mimeType || 'audio/webm'
    const audio = new Blob(here.chunks, { type })
    host.state.rec = { ...host.state.rec, phase: 'cleaning', audio, elapsed: Date.now() - here.started }
    host.schedule()
    transcribeTake()
  })

  here.tick = setInterval(() => tickRecording(here), 100)
  recorder.start(1000)
  sense('started')
  host.schedule()
}



// The microphone Settings chose, or the system's own. A chosen one that has
// gone — unplugged, or a browser that has renamed its ids — is not a take that
// fails: it is the default, which is what a person without a choice gets.
async function openMicrophone(deviceId) {
  const media = globalThis.navigator.mediaDevices
  if (!deviceId) return media.getUserMedia({ audio: true })
  try {
    return await media.getUserMedia({ audio: { deviceId: { exact: deviceId } } })
  } catch (err) {
    if (err?.name !== 'OverconstrainedError' && err?.name !== 'NotFoundError') throw err
    return media.getUserMedia({ audio: true })
  }
}



// Ten times a second: the clock, the meter, the warning and the cap. The cap is
// ✓ — the take stops and goes to be cleaned, exactly as if it had been pressed.
function tickRecording(here) {
  if (recording !== here || !host.state.rec || host.state.rec.phase !== 'recording') return
  const elapsed = Date.now() - here.started
  const phase = recordPhase(elapsed, host.state.rec.maxMs)
  let level = 0
  if (here.analyser) {
    here.analyser.getByteTimeDomainData(here.bytes)
    level = levelOf(here.bytes)
  }
  host.state.rec = { ...host.state.rec, elapsed, levels: pushLevel(host.state.rec.levels, level) }
  if (phase === 'closing' && !here.warned) {
    here.warned = true
    sense('closing', here)
  }
  if (phase === 'over') {
    sense('capped', here)
    stopRecording()
    return
  }
  host.schedule()
}

function stopRecording() {
  const here = recording
  if (!here) return
  // Final bytes arrive asynchronously. Playback and capture need not wait for
  // that event, much less for the network request that follows it.
  if (host.state.rec) host.state.rec = { ...host.state.rec, phase: 'cleaning' }
  try {
    if (here.recorder.state !== 'inactive') here.recorder.stop()
  } finally {
    release(here)
  }
  host.schedule()
}



// The microphone, the meter and the timer, let go of. The browser's recording
// light goes out when the last track stops.
function release(here) {
  // Called at the stop action and again at the recorder's eventual stop event.
  // A late event must not switch a newer recording back into playback mode.
  if (here.released) return
  here.released = true
  clearInterval(here.tick)
  screen.release()
  for (const track of here.stream?.getTracks?.() ?? []) track.stop()
  here.source?.disconnect?.()
  here.analyser?.disconnect?.()
  audioSessionType('playback')
  // A tone the cap is still sounding finishes before its context goes.
  const close = () => {
    try {
      here.context?.close?.()?.catch?.(() => {})
    } catch {
      /* already closed */
    }
  }
  const left = (here.toneUntil ?? 0) - Date.now()
  if (left > 0) setTimeout(close, left)
  else close()
  if (recording === here) recording = null
}



// The words the take is biased towards: the person's own, from the terms
// note, then who is being spoken to, what the chat is called, and the names in
// the last few things said in it. `dictationVocabulary()` merges and caps them.
function vocabularyNow(extra = []) {
  const thread = host.activeThread()
  return thread ? dictationVocabulary({ agentName: host.threads.defaultName(), agentId: thread.thread.default, title: thread.thread.title, texts: thread.messages.slice(-8).map((m) => m.text), extra }) : dictationVocabulary({ extra })
}



// The take to this plugin's server (`/x/dictation/transcribe`), and what comes back: the words land, or the
// field is given back as it was and the quiet line says why. A take cancelled
// while it was away is aborted, and whatever answers late is not this take's.
//
// The take goes as a form: the audio, and the terms as a JSON list beside it,
// in the body — a header held about 380 terms and a note can hold a thousand.
async function transcribeTake() {
  const take = host.state.rec
  if (!take?.audio) return
  const abort = typeof AbortController === 'function' ? new AbortController() : null
  take.abort = () => abort?.abort()
  take.noteTerms ??= await noteTermsFor(take)
  if (host.state.rec !== take) return
  let words = null
  let failed = null
  let needsKey = false
  let polish = null
  try {
    const form = new FormData()
    form.append('audio', take.audio, 'take')
    form.append('terms', JSON.stringify(vocabularyNow(take.noteTerms)))
    form.append('polish', host.state.dictation.polish)
    const res = await fetch(`${SERVER}transcribe`, { method: 'POST', headers: take.provider ? { 'x-speech-provider': take.provider } : {}, body: form, signal: abort?.signal })
    const body = await res.json().catch(() => null)
    if (res.ok) {
      words = String(body?.text ?? '').trim()
      polish = body?.polish ?? null
    }
    // The server's own answer for a take with nothing said in it.
    else if (res.status === 422) words = ''
    else {
      failed = body?.error ?? `The recording could not be transcribed (${res.status}).`
      needsKey = res.status === 503 && /gemini api key/i.test(failed)
    }
  } catch (err) {
    failed = err?.message || 'The recording did not reach this app.'
  }
  if (host.state.rec !== take) return
  host.state.rec = null
  if (failed !== null) {
    if (needsKey) {
      // No key is not a take that failed: say what is missing and where it goes.
      const reach = typeof host.goSettings === 'function'
      say(reach ? NEEDS_KEY : `${NEEDS_KEY} Add one in Settings › Plugins › Dictation.`, reach ? { act: 'settings', label: 'Add a key', detail: failed } : null)
    } else {
      say(/OpenAI|Google|Gemini|provider changed/i.test(failed) ? failed : TAKE_FAILED, take.retried ? null : { act: 'retry', label: 'Retry', take, detail: failed })
    }
    restoreField(take)
  } else if (words === '') {
    say(TAKE_EMPTY, { act: 'again', label: 'Try again', target: take.target })
    restoreField(take)
  } else {
    land(take, words)
    // Polish that fell back has still landed the words, as heard; the quiet
    // line says why it did not run, and offers nothing.
    if (polish && polish.ran === false) {
      host.state.takeNotice = { text: `Polish did not run: ${polish.why ?? 'no reason given'}`, offer: null, quiet: true }
    }
  }
}

const TAKE_FAILED = 'Couldn’t clean that take'

const TAKE_EMPTY = 'Heard no words'

const NO_TERMS_NOTE = 'No terms note yet'



// ------------------------------------------- the terms note

// The person's names and terms live in one note in the vault, which the
// Obsidian plugin reads too, so a take here and a take there are biased
// towards the same list. The page cannot see the vault; the plugin's own
// server reads the note fresh each time (`/x/dictation/terms`) and the page
// takes its terms (`vaultTerms()`). Before 2026-09-30
// each device kept a list of its own in Settings, and the lists drifted.
//
// A `404` is no note, and a `405` something older still: both are no vault
// terms, and neither is a fault. Anything
// else keeps the last good answer, says so on the Dictation page, and a take
// goes ahead with what there is.
async function loadTermsNote() {
  try {
    const res = await fetch(`${SERVER}terms`, { headers: { accept: 'application/json' } })
    const out = await res.json().catch(() => null)
    if (!res.ok) throw Object.assign(new Error(out?.error || `The vault’s terms could not be read (${res.status}).`), { status: res.status })
    host.state.termsNote = {
      loaded: true,
      found: true,
      path: out?.source ?? out?.path ?? null,
      url: out?.obsidian_url ?? null,
      terms: vaultTerms(out),
      readAt: Date.now(),
      error: '',
    }
  } catch (err) {
    if (err.status === 404 || err.status === 405) {
      host.state.termsNote = { loaded: true, found: false, path: null, url: null, terms: [], readAt: null, error: '' }
    } else {
      host.state.termsNote = { ...host.state.termsNote, loaded: true, error: err.message || 'The vault’s terms could not be read.' }
    }
  }
  host.schedule()
  return host.state.termsNote
}



// How long a take that is ready to send waits for the note: the fetch starts
// at the press, so it has normally answered long before. **A take is never held
// for the note** — past this it goes without terms.
const NOTE_WAIT_MS = 3000



// The note's terms for one take, read afresh at its press (`pressMic()`). With
// none, the quiet line says so once a page load, and the take goes anyway.
let saidNoNote = false

async function noteTermsFor(take) {
  const asked = take.note ?? loadTermsNote()
  const note = await Promise.race([asked, new Promise((resolve) => setTimeout(() => resolve(null), NOTE_WAIT_MS))])
  if (note?.found) return note.terms
  if (!saidNoNote && host.state.rec === take) {
    saidNoNote = true
    host.state.takeNotice = { text: NO_TERMS_NOTE, offer: null, quiet: true }
  }
  return []
}



// The one thing the quiet line says about a take that did not land, and the one
// thing it offers. Any other action drops it (`hush()`), which is the whole of
// its lifetime: the typed text was never touched, so there is nothing to undo.
function say(text, offer = null) {
  host.state.takeNotice = { text, offer }
  host.schedule()
}

function hush() {
  if (!host.state.takeNotice) return
  host.state.takeNotice = null
  host.schedule()
}



// Retry sends the same take once more; a second failure says so with nothing
// to offer, and the audio goes with it. Try again is a new take — the same
// silence sent again would be heard as the same silence.
function actOnNotice() {
  const offer = host.state.takeNotice?.offer
  host.state.takeNotice = null
  host.schedule()
  if (!offer) return
  if (offer.act === 'guide') return host.guide.open()
  if (offer.act === 'settings') {
    host.goSettings?.('plugins', 'dictation')
    return
  }
  if (host.state.rec) return
  if (offer.act === 'again') {
    pressMic(offer.target ?? 'draft')
    return
  }
  host.state.rec = { ...offer.take, phase: 'cleaning', retried: true, abort: null }
  transcribeTake()
}



// ✓. Recording, it stops and the take goes to be cleaned; live, the words the
// browser heard are the words, and they land now.
function keepTake() {
  const take = host.state.rec
  if (!take || take.phase !== 'recording') return
  if (take.mode === 'record') {
    stopRecording()
    return
  }
  stopLive()
  if (take.words === '') {
    host.state.rec = null
    restoreField(take)
    host.schedule()
    return
  }
  land(take, take.words)
}



// ✕, at any point, and Escape: the take goes and the field is what it held
// before the press — which it still is, because nothing was written to it.
function discardTake() {
  const take = host.state.rec
  if (!take) return
  screen.release()
  if (take.mode === 'live') stopLive()
  if (recording) {
    recording.cancelled = true
    stopRecording()
  }
  if (take.phase === 'recording') audioSessionType('playback')
  take.abort?.()
  host.state.rec = null
  restoreField(take)
  host.schedule()
}



// The words, into the field at the caret the take was started at, beside
// whatever was already typed there. Nothing typed is replaced; the caret ends
// after the words, in the field, and the send is ready because there is now
// something to send.
function land(take, words) {
  const field = takeField(take.target)
  // Files' editor is a plain field: the words go in at the caret, and are an
  // edit like any typed one, saved after the same pause.
  if (field === host.fileField) {
    const next = mergeAt(host.fileField.value, take.caret, words)
    host.fileField.value = next.md
    host.state.rec = null
    host.files.edit(next.md)
    refocus(field, next.md, next.caret)
    return
  }
  const next = mergeAt(field.value, take.caret, words)
  setMarkdown(field, next.md)
  if (take.target === 'editor') host.draft.value = host.editorDraft.value
  host.state.rec = null
  host.growDraft()
  host.saveDraft()
  host.schedule()
  refocus(field, next.md, next.caret)
}



// The field comes back from under the take on the next draw, so the caret is put
// in it after that — where it was, or after the words that just landed.
function restoreField(take) {
  const field = takeField(take.target)
  refocus(field, field.value, take.caret ?? field.value.length)
}

function refocus(field, md, caret) {
  const session = host.activeThread()
  setTimeout(() => {
    // The field may have been sent, edited or left before this deferred caret
    // placement runs. Restoring its old markdown would undo that newer action.
    if (host.state.rec || host.activeThread() !== session || !field.isConnected || field.value !== md) return
    field.focus?.()
    if (field === host.fileField) return host.fileField.setSelectionRange?.(caret, caret)
    setMarkdown(field, md, caret)
    // Measured now and not at the landing: a field that was hidden under the
    // take has no height to measure.
    if (field === host.draft) host.growDraft()
  }, 0)
}



// What starts a take. Only a press that starts something asks which way to
// start it; what is under way is finished by the two controls in the field.
function pressMic(target = 'draft') {
  if (host.state.rec) return
  hush()
  if (host.provider && !host.provider()) return say('Checking the speech provider. Try the microphone again in a moment.')
  if (host.provider?.() === 'browser' && !Recogniser) return say('This browser has no speech recognition. A free Gemini key enables recording.', { act: 'guide', label: 'Get a key' })
  if (dictationMode() === 'record') {
    // The note is asked for now, while the person speaks, and waited on only
    // when the take is ready to go. Live has no terms to give: the browser's
    // own recogniser takes none this page can rely on.
    const note = loadTermsNote()
    note.catch(() => {})
    startRecording(target)
    if (host.state.rec?.mode === 'record') host.state.rec.note = note
  } else startLive(target)
}



// The take, drawn in the field it stands in. One row, the field's own height:
// the clock on the left, the middle, and the two controls on the right.
//
// **The middle is the microphone.** Recording, it is the design's `loamWave`
// bars, but live: one bar per tenth of a second, newest on the right, their
// height the loudness, centred on the field's middle line — so silence is a row
// of low bars and not an empty field. Cleaning, the same bars settle flat and a
// slow sweep crosses them. Live mode has no bars: the field is the live
// transcript. The owner, 2026-09-29: "That UI difference is very important for the
// user to know that this is happening live and they can see the text coming
// out, whether it's correct or not." So the words stream in as the recogniser
// hears them — settled words in full ink, its running guess muted, and a caret
// after them while it listens — and the middle follows the newest line.
//
// A press on either control does not move the focus: the `mousedown` is
// cancelled, as it is on the mic.
function takeSurface(take) {
  const cleaning = take.phase === 'cleaning'
  const closing = take.mode === 'record' && !cleaning && recordPhase(take.elapsed, take.maxMs) !== 'recording'
  const still = (e) => e.preventDefault?.()
  const middle =
    take.mode === 'live'
      ? h(
          'div',
          { class: `take-words${take.words ? '' : ' empty'}`, key: 'take-words', 'aria-live': 'polite' },
          take.words
            ? [
                take.heard.settled ? h('span', { class: 'said', key: 'said', text: take.heard.settled }) : null,
                take.heard.guess
                  ? h('span', { class: 'guess', key: 'guess', text: `${take.heard.settled ? ' ' : ''}${take.heard.guess}` })
                  : null,
              ]
            : h('span', { key: 'hint', text: take.listening ? 'Listening…' : 'Heard nothing' }),
          take.listening ? h('span', { class: 'take-caret', key: 'caret', 'aria-hidden': 'true' }) : null,
        )
      : h(
          'span',
          { class: 'take-bars', 'aria-hidden': 'true' },
          // Newest first, because the row runs right to left: when a phone is
          // too narrow for every bar, it is the oldest that are cut off.
          ...Array.from({ length: LEVEL_BARS }, (_, i) => {
            const level = cleaning ? 0 : (take.levels[take.levels.length - 1 - i] ?? 0)
            return h('i', { style: { height: `${cleaning ? 4 : Math.max(3, Math.round(3 + level * 23))}px` } })
          }),
        )
  return h(
    'div',
    {
      class: `take ${take.mode} ${take.phase}${closing ? ' closing' : ''}`,
      key: 'take',
      role: 'group',
      'aria-label': cleaning ? 'Cleaning the dictation' : 'Dictating',
    },
    h('span', { class: 'take-clock', text: cleaning ? 'Cleaning…' : clock(take.elapsed) }),
    middle,
    h(
      'span',
      { class: 'take-controls' },
      h(
        'button',
        {
          class: 'takebtn discard',
          type: 'button',
          title: cleaning ? 'Cancel' : 'Discard',
          'aria-label': cleaning ? 'Cancel' : 'Discard',
          onmousedown: still,
          onclick: discardTake,
        },
        icon.close(13),
      ),
      cleaning
        ? null
        : h(
            'button',
            { class: 'takebtn keep', type: 'button', title: 'Keep', 'aria-label': 'Keep', onmousedown: still, onclick: keepTake },
            icon.check(15),
          ),
    ),
  )
}



// A live take's words grow past the six lines the middle has room for, and the
// line being heard is the one to see: the middle is kept at its end, as a
// transcript follows a reply.
function followTake() {
  if (host.state.rec?.mode !== 'live') return
  const words = host.root.querySelector?.('.take-words')
  if (words && words.scrollHeight > words.clientHeight) words.scrollTop = words.scrollHeight
}



// The take in this field, if there is one.
function takeIn(target) {
  return host.state.rec && host.state.rec.target === target ? host.state.rec : null
}



// The notice row's words for a take that did not land, and its one offer. It
// outranks the rest of the ladder while it stands, because it is about the
// thing the person just did.
function takeNoticeLine() {
  const notice = host.state.takeNotice
  if (!notice) return null
  const offer = notice.offer, tone = notice.quiet || offer?.act === 'again' ? 'quiet' : 'bad'
  return h('div', { class: 'noticerow takenote ' + tone, role: 'status', title: offer?.detail ?? null },
    h('span', { text: notice.text + (offer ? ' · ' : '') }), offer ? h('button', { class: 'noticerow-act', type: 'button', text: offer.label, onclick: actOnNotice }) : null)
}



// The mic starts a take in the field beside it, and that is all it does: once a
// take is going it is disabled with the rest of its row, because the take is
// finished by the ✕ and the ✓ inside the field and not by the button that
// started it.
//
// A press does not take the caret out of the field, for the same reason as the
// expand glyph's: the caret is where the words will go.
function micButton(target) {
  return h(
    'button',
    {
      class: 'roundmic',
      type: 'button',
      disabled: Boolean(host.state.rec),
      title: 'Dictate',
      'aria-label': 'Dictate',
      onmousedown: (e) => e.preventDefault?.(),
      onclick: () => pressMic(target),
    },
    icon.mic(16),
  )
}




// ------------------------------------------------------ settings, dictation

// How the mic works on this device: which of its two ways, the longest take,
// and which microphone. All three are this device's and are in the store
// (`store.dictation`); every control writes the whole setting back through
// `setDictation()` and the mic reads it at its next press, so nothing here
// needs a reload. The names a take is biased towards are not this device's:
// they are the terms note's, and the page only says where it is.
const MODES = [
  {
    id: 'record',
    label: 'Record first',
    note: 'Finish speaking, then get a tidied transcript.',
  },
  {
    id: 'browser',
    label: 'As you speak',
    note: 'Words appear while you speak, without cleanup.',
  },
]



// Polish, the second pass over a recorded take on the server (`src/polish.js`):
// the same three levels and the same words as the Obsidian plugin Spoken.
const POLISH = [
  { id: 'off', label: 'Off', note: 'Keep your words, with fillers removed.' },
  { id: 'light', label: 'Light', note: 'Tidy grammar and names, keeping every sentence.' },
  { id: 'full', label: 'Full', note: 'Tidy and organize sentences, paragraphs and lists.' },
]

function setDictation(change) {
  host.store.dictation = { ...host.state.dictation, ...change }
  host.state.dictation = host.store.dictation
  host.schedule()
}



// What the stepper's card says about the end of a take. The tone is said here
// and has no setting of its own: it is only ever what a phone that cannot buzz
// gets instead.
const RECORD_CAP_NOTE =
  'A buzz or tone warns you 30 seconds before stopping.'




// The microphones the browser will list. Until the microphone has been allowed
// once, a browser lists them without names — and Chrome lists one with no id at
// all — so a device with no id is not a choice, and a list with no names says
// so and offers the one thing that fixes it.
async function loadMicrophones() {
  const media = globalThis.navigator?.mediaDevices
  if (!media?.enumerateDevices) {
    host.state.mics = { loaded: true, list: [], named: false, error: '' }
    host.schedule()
    return
  }
  try {
    const devices = await media.enumerateDevices()
    const inputs = devices.filter((d) => d.kind === 'audioinput')
    // `default` and `communications` are Chrome's names for whichever device
    // the system has picked, which is the "System default" row already.
    const list = inputs
      .filter((d) => d.deviceId && d.deviceId !== 'default' && d.deviceId !== 'communications')
      .map((d, i) => ({ id: d.deviceId, label: d.label || `Microphone ${i + 1}` }))
    host.state.mics = { loaded: true, list, named: inputs.some((d) => d.label), error: '' }
  } catch (err) {
    host.state.mics = { loaded: true, list: [], named: false, error: `The browser would not list its microphones${err?.message ? `: ${err.message}` : '.'}` }
  }
  host.schedule()
}



// Asking for the microphone once, and letting it straight go, is what makes a
// browser name its devices. The permission prompt is the browser's.
async function allowMicrophone() {
  try {
    const stream = await globalThis.navigator.mediaDevices.getUserMedia({ audio: true })
    for (const track of stream.getTracks?.() ?? []) track.stop()
  } catch (err) {
    host.state.mics = {
      ...host.state.mics,
      error:
        err?.name === 'NotAllowedError'
          ? 'The microphone is not allowed for this page. Allow it in the browser’s site settings.'
          : `The microphone could not be opened${err?.message ? `: ${err.message}` : '.'}`,
    }
    host.schedule()
    return
  }
  await loadMicrophones()
}

function devicesChanged() {
  if (host.state.sheet?.kind === 'settings' && host.state.sheet.page === 'plugins' && host.pluginSettingsUI?.st.selected?.id === 'dictation') loadMicrophones()
}
globalThis.navigator?.mediaDevices?.addEventListener?.('devicechange', devicesChanged)



// What is left of the list this device kept before the vault's note
// (2026-09-25 to 09-30). Nothing reads it; it is shown on the Dictation page
// until the person copies it into the note or forgets it.
async function copyOldTerms() {
  if (!(await host.copyWithCue('oldterms', host.state.dictation.terms.join('\n')))) {
    host.state.termsNote = { ...host.state.termsNote, error: 'The browser would not copy. Select the terms and copy them by hand.' }
    host.schedule()
  }
}

function forgetOldTerms() {
  host.store.dictation = { ...host.store.dictation, terms: [] }
  host.state.dictation = host.store.dictation
  host.schedule()
}



// The fourth card: where the terms live, not the terms. The note's path opens
// it in Obsidian when the host sends a link.
function termsCard() {
  const n = host.state.termsNote
  let body
  if (!n.loaded) body = [h('div', { class: 'note', text: 'Reading the vault’s terms…' })]
  else if (n.found) {
    body = [
      n.url
        ? h('a', { href: n.url, class: 'loginlink termsnote', text: n.path ?? 'The terms note' })
        : h('div', { class: 'mono termsnote', text: n.path ?? 'The terms note' }),
      h('div', {
        class: 'setrow-sub termsmeta',
        text: [
          n.terms.length === 1 ? '1 term' : `${n.terms.length} terms`,
          `read ${longAgo(Date.now() - n.readAt)} ago`,
        ].join(' · '),
      }),
      h('div', { class: 'note', text: 'Edit the note in Obsidian; every take reads it fresh.' }),
    ]
  } else if (n.error) body = []
  else body = [h('div', { class: 'note', text: TERMS_NOT_CONNECTED })]
  const old = host.state.dictation.terms
  return h(
    'div',
    { class: 'card' },
    h('div', { class: 'kicker', text: 'Names and terms' }),
    ...body,
    n.error ? h('div', { class: 'note warn', text: n.error }) : null,
    old.length > 0
      ? h(
          'div',
          { class: 'setupvalue oldterms' },
          h('div', { class: 'setup-who' }, h('div', { class: 'setrow-sub', text: 'Saved on this device before' }), h('div', { class: 'mono setup-text', text: old.join(', ') })),
          h('button', { type: 'button', class: 'chip', text: host.copied === 'oldterms' ? 'Copied' : 'Copy', onclick: copyOldTerms }),
          h('button', { type: 'button', class: 'chip forget', text: 'Forget', onclick: forgetOldTerms }),
        )
      : null,
  )
}

const NEEDS_KEY = 'Dictation needs a Gemini API key.'

const TERMS_NOT_CONNECTED = 'No names and terms note yet. Add one to your vault to help dictation spell your names.'

function settingsDictation({ back = true } = {}) {
  const d = host.state.dictation
  const mode = dictationMode()
  const browserOnly = host.provider?.() === 'browser'
  const can = { record: !browserOnly && canRecord(), browser: Boolean(Recogniser) }
  const chosen = MODES.find((m) => m.id === d.mode)
  const minutes = d.maxMinutes
  const mics = host.state.mics
  const chosenGone = d.deviceId && mics.loaded && !mics.list.some((m) => m.id === d.deviceId)
  const micRow = (id, label, sub = null) =>
    h(
      'button',
      { key: id ?? 'default', class: 'setrow', onclick: () => setDictation({ deviceId: id }) },
      h('div', { class: 'setrow-who' }, h('div', { class: 'setrow-title', text: label }), sub ? h('div', { class: 'setrow-sub', text: sub }) : null),
      (d.deviceId ?? null) === id ? h('span', { class: 'setrow-value' }, icon.check(14)) : null,
    )

  return [
    host.guide?.settings(mode === 'browser' ? 'browser' : host.provider?.()),
    back ? host.settingsBack('Settings', 'root') : null,
    back ? host.settingsHead('Dictation', 'For this device.') : h('p', { class: 'note', text: 'Dictation preferences for this device.' }),

    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Mode' }),
      segmentedControl({ label: 'Dictation mode', options: MODES.map(m => ({ ...m, disabled: !can[m.id] })), value: browserOnly ? 'browser' : d.mode, choose: id => setDictation({ mode: id }) }),
      h('div', { class: 'note', text: browserOnly ? (Recogniser ? 'Your browser recognises the words as you speak.' : 'A server key enables Record first on this device.') : chosen.note }),
      // The choice stands, and says when this browser cannot honour it.
      !browserOnly && mode !== null && mode !== d.mode
        ? h('div', { class: 'note warn', text: `This browser cannot do that, so the mic uses ${mode === 'record' ? 'Record first' : 'As you speak'}.` })
        : null,
      mode === null ? h('div', { class: 'note warn', text: 'Speech input is unavailable in this browser.' }) : null,
    ),

    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Polish' }),
      browserOnly ? null : segmentedControl({ label: 'Polish', options: POLISH.map(p => ({ ...p, disabled: d.mode !== 'record' })), value: d.polish, choose: id => setDictation({ polish: id }) }),
      h('div', { class: 'note', text: browserOnly ? 'A server key enables Polish.' : d.mode === 'record' ? POLISH.find((p) => p.id === d.polish).note : 'Polish is available with Record first.' }),
    ),

    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Longest recording' }),
      h(
        'div',
        { class: 'stepper' },
        // Each press reads the setting as it is now, not as it was drawn: two
        // taps before a redraw are two minutes, not one twice.
        h('button', {
          type: 'button',
          class: 'stepbtn',
          title: 'Shorter',
          disabled: minutes <= RECORD_MINUTES_MIN,
          onclick: () => setDictation({ maxMinutes: host.state.dictation.maxMinutes - 1 }),
        }, icon.minus(16)),
        h('span', { class: 'stepvalue', role: 'status', text: `${minutes} min` }),
        h('button', {
          type: 'button',
          class: 'stepbtn',
          title: 'Longer',
          disabled: minutes >= RECORD_MINUTES_MAX,
          onclick: () => setDictation({ maxMinutes: host.state.dictation.maxMinutes + 1 }),
        }, icon.plus(16)),
      ),
      h('div', { class: 'note', text: RECORD_CAP_NOTE }),
    ),

    h(
      'div',
      { class: 'card' },
      h('div', { class: 'kicker', text: 'Microphone' }),
      h(
        'div',
        { class: 'rows inset' },
        micRow(null, 'System default'),
        ...mics.list.map((m) => micRow(m.id, m.label)),
        chosenGone ? micRow(d.deviceId, 'The one chosen before', 'Not connected — the system default is used') : null,
      ),
      mics.loaded && !mics.named && can.record
        ? h(
            'div',
            { class: 'micallow' },
            h('div', { class: 'note', text: 'Allow access to choose a microphone.' }),
            h('button', { type: 'button', class: 'chip', text: 'Allow the microphone', onclick: allowMicrophone }),
          )
        : null,
      mics.error ? h('div', { class: 'note warn', text: mics.error }) : null,
      h('div', { class: 'note', text: 'Record first uses this microphone; As you speak uses the system default.' }),
    ),

    termsCard(),
  ]
}
return Object.defineProperties({}, {
    dispose: { value: () => globalThis.navigator?.mediaDevices?.removeEventListener?.('devicechange', devicesChanged) },
    Recogniser: { enumerable: true, get: () => Recogniser },
    recogniser: { enumerable: true, get: () => recogniser, set: value => { recogniser = value } },
    liveHeard: { enumerable: true, get: () => liveHeard },
    liveWords: { enumerable: true, get: () => liveWords },
    takeField: { enumerable: true, get: () => takeField },
    caretOf: { enumerable: true, get: () => caretOf },
    startLive: { enumerable: true, get: () => startLive },
    stopLive: { enumerable: true, get: () => stopLive },
    canRecord: { enumerable: true, get: () => canRecord },
    dictationMode: { enumerable: true, get: () => dictationMode },
    recording: { enumerable: true, get: () => recording, set: value => { recording = value } },
    screen: { enumerable: true, get: () => screen },
    audioSessionType: { enumerable: true, get: () => audioSessionType },
    sense: { enumerable: true, get: () => sense },
    startRecording: { enumerable: true, get: () => startRecording },
    openMicrophone: { enumerable: true, get: () => openMicrophone },
    tickRecording: { enumerable: true, get: () => tickRecording },
    stopRecording: { enumerable: true, get: () => stopRecording },
    release: { enumerable: true, get: () => release },
    vocabularyNow: { enumerable: true, get: () => vocabularyNow },
    transcribeTake: { enumerable: true, get: () => transcribeTake },
    TAKE_FAILED: { enumerable: true, get: () => TAKE_FAILED },
    TAKE_EMPTY: { enumerable: true, get: () => TAKE_EMPTY },
    NO_TERMS_NOTE: { enumerable: true, get: () => NO_TERMS_NOTE },
    loadTermsNote: { enumerable: true, get: () => loadTermsNote },
    NOTE_WAIT_MS: { enumerable: true, get: () => NOTE_WAIT_MS },
    saidNoNote: { enumerable: true, get: () => saidNoNote, set: value => { saidNoNote = value } },
    noteTermsFor: { enumerable: true, get: () => noteTermsFor },
    say: { enumerable: true, get: () => say },
    hush: { enumerable: true, get: () => hush },
    actOnNotice: { enumerable: true, get: () => actOnNotice },
    keepTake: { enumerable: true, get: () => keepTake },
    discardTake: { enumerable: true, get: () => discardTake },
    land: { enumerable: true, get: () => land },
    restoreField: { enumerable: true, get: () => restoreField },
    refocus: { enumerable: true, get: () => refocus },
    pressMic: { enumerable: true, get: () => pressMic },
    takeSurface: { enumerable: true, get: () => takeSurface },
    followTake: { enumerable: true, get: () => followTake },
    takeIn: { enumerable: true, get: () => takeIn },
    takeNoticeLine: { enumerable: true, get: () => takeNoticeLine },
    micButton: { enumerable: true, get: () => micButton },
    MODES: { enumerable: true, get: () => MODES },
    POLISH: { enumerable: true, get: () => POLISH },
    setDictation: { enumerable: true, get: () => setDictation },
    RECORD_CAP_NOTE: { enumerable: true, get: () => RECORD_CAP_NOTE },
    loadMicrophones: { enumerable: true, get: () => loadMicrophones },
    allowMicrophone: { enumerable: true, get: () => allowMicrophone },
    copyOldTerms: { enumerable: true, get: () => copyOldTerms },
    forgetOldTerms: { enumerable: true, get: () => forgetOldTerms },
    termsCard: { enumerable: true, get: () => termsCard },
    TERMS_NOT_CONNECTED: { enumerable: true, get: () => TERMS_NOT_CONNECTED },
    settingsDictation: { enumerable: true, get: () => settingsDictation }
})
}
