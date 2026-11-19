// Dictation that is recorded whole and cleaned up once — everything about it
// that is arithmetic rather than a microphone, so a test can hold it.
//
// The page records a take, sends it to this plugin's server (`/x/dictation/transcribe`), and puts
// the words that come back into the field at the caret. What lives here: how long a take may run and when it warns, how
// each moment of it feels and keeping the screen on while it runs, what the
// clock says, which container the recorder is asked for, what the level meter
// draws, which words the transcription is biased towards and how the terms
// note is read, and how the words are
// put into a draft that already has some.

// The longest take when nobody has said otherwise: five minutes. Settings makes
// it a person's, in whole minutes between the two bounds below, and
// `recordMaxMs()` is the one place a setting becomes a number of milliseconds.
export const RECORD_MAX_MS = 5 * 60 * 1000
export const RECORD_MINUTES_MIN = 1
export const RECORD_MINUTES_MAX = 15

// Whole minutes, inside the bounds; anything that is not a number is the
// default. A setting written by a later version, or by hand, cannot make a take
// that never stops.
export function recordMinutes(value) {
  const n = Math.round(Number(value))
  if (!Number.isFinite(n) || value === null || value === '') return RECORD_MAX_MS / 60000
  return Math.min(RECORD_MINUTES_MAX, Math.max(RECORD_MINUTES_MIN, n))
}

export function recordMaxMs(minutes) {
  return recordMinutes(minutes) * 60 * 1000
}

// How long before the end the take says it is about to stop: the clock turns to
// the warning colour and the phone gives two firm pulses (`HAPTICS.closing`).
export const RECORD_WARN_MS = 30 * 1000

// ---------------------------------------------------------------- what a take feels like

// **The one haptic language, and the only place it is written.** Three moments
// and no others, each a `navigator.vibrate()` pattern in milliseconds (on, off,
// on…). The Loam Dictate plugin for Obsidian copies these numbers exactly, so a
// take feels the same in both; change them here and say so to the plugin.
//
//   started  the mic is live: one short tap, so it is known without looking
//   closing  thirty seconds before the cap: two firm pulses, which a single
//            notification buzz cannot be mistaken for
//   capped   the app stopped the take itself: one long pulse, then cleaning.
//            A take the person stopped gets nothing — they know.
//
// Before 2026-09-29 the warning was one 60 ms buzz and the cap `[40, 60, 40]`:
// felt by nobody walking with the phone in a hand, and — the larger reason —
// sent to a page whose screen had gone off, which Chrome does not vibrate for.
export const HAPTICS = Object.freeze({
  started: 40,
  closing: Object.freeze([150, 100, 150]),
  capped: 500,
})

// Where a phone cannot buzz — no `vibrate` at all (iOS), or a `vibrate` that
// answers `false` because the browser refused it — the two later moments are a
// short soft tone instead, on the same on/off pattern. The start has no tone: a
// sound as the mic opens would be the first thing in the take.
export const TONES = Object.freeze({
  closing: Object.freeze({ hz: 880, pattern: HAPTICS.closing }),
  capped: Object.freeze({ hz: 660, pattern: [HAPTICS.capped] }),
})
export const TONE_GAIN = 0.06

// One moment, felt: the buzz if the browser takes it, else the tone where there
// is one. `vibrate` is `navigator.vibrate` bound or missing; `tone(spec)` plays
// one. Answers what it did — `'buzz'`, `'tone'` or `null` — so a test can say.
//
// `vibrate()` answering `false` is the browser saying it did not, and Chrome
// says it in two cases this app meets: a page that is hidden (the screen off),
// and a frame nobody has tapped yet. `true` is only that it was accepted — a
// phone with haptics switched off in its own settings still answers `true`, and
// nothing a page can read says otherwise.
export function feel(moment, { vibrate = null, tone = null } = {}) {
  const pattern = HAPTICS[moment]
  if (pattern === undefined) return null
  let buzzed = false
  if (typeof vibrate === 'function') {
    try {
      buzzed = vibrate(pattern) !== false
    } catch {
      buzzed = false
    }
  }
  if (buzzed) return 'buzz'
  if (!TONES[moment] || typeof tone !== 'function') return null
  try {
    tone(TONES[moment])
    return 'tone'
  } catch {
    return null
  }
}

// A tone on an AudioContext that is already running — the take's own, the one
// its level meter reads through, so no second context is opened and none has to
// be unlocked by a tap. A sine with a few milliseconds of ramp at each edge, so
// it is a soft beep and not a click. Answers when it will have finished, in the
// context's seconds.
export function playTone(context, { hz, pattern }, gain = TONE_GAIN) {
  let at = context.currentTime
  pattern.forEach((ms, i) => {
    const seconds = ms / 1000
    if (i % 2 === 0) {
      const osc = context.createOscillator()
      const amp = context.createGain()
      osc.frequency.value = hz
      amp.gain.setValueAtTime(0, at)
      amp.gain.linearRampToValueAtTime(gain, at + 0.01)
      amp.gain.setValueAtTime(gain, at + Math.max(0.01, seconds - 0.02))
      amp.gain.linearRampToValueAtTime(0, at + seconds)
      osc.connect(amp)
      amp.connect(context.destination)
      osc.start(at)
      osc.stop(at + seconds)
    }
    at += seconds
  })
  return at
}

// How long a pattern runs, in milliseconds.
export function patternMs(pattern) {
  return [].concat(pattern).reduce((sum, ms) => sum + ms, 0)
}

// ---------------------------------------------------------------- the screen

// The screen kept on while a take records, in both modes. The browser drops a
// wake lock whenever the page is hidden, so `shown()` asks again if it is still
// wanted; `release()` is every way out, and is safe to call when nothing is
// held. A request still in flight when the take ends is let go as it arrives.
// Where there is no `navigator.wakeLock`, all of it does nothing and says
// nothing. `wakeLock` is the browser's, or a test's.
export function screenKeeper(wakeLock) {
  let wanted = false
  let sentinel = null
  let asking = null

  const ask = () => {
    if (!wakeLock?.request || asking || sentinel) return
    const here = Promise.resolve()
      .then(() => wakeLock.request('screen'))
      .then(
        (got) => {
          if (asking === here) asking = null
          if (!wanted) {
            got?.release?.()?.catch?.(() => {})
            return
          }
          sentinel = got ?? null
          // The browser releasing it by itself (the page hidden) is not the take
          // ending: forget it, so the next `shown()` asks again.
          got?.addEventListener?.('release', () => {
            if (sentinel === got) sentinel = null
          })
        },
        () => {
          // Refused — a battery saver, a page not visible. Nothing to say.
          if (asking === here) asking = null
        },
      )
    asking = here
  }

  return {
    hold() {
      wanted = true
      ask()
    },
    shown() {
      if (wanted) ask()
    },
    release() {
      wanted = false
      const held = sentinel
      sentinel = null
      try {
        held?.release?.()?.catch?.(() => {})
      } catch {
        /* already released */
      }
    },
    get held() {
      return sentinel !== null
    },
  }
}

// The bitrate the recorder is asked for. Speech in Opus is clear at 32 kbit/s,
// and five minutes of it is about 1.2 MB — far under the server's cap.
export const RECORD_BITS_PER_SECOND = 32000

// How many bars the level meter keeps and draws, newest on the right: one a
// tenth of a second, which is a little under ten seconds of loudness. Enough to
// fill the width of a desktop's field at 3px a bar and 3px between; a phone's
// narrower field shows the newest of them and cuts the oldest off the left.
export const LEVEL_BARS = 96

// What a take is doing, from how long it has run.
//
//   recording  under way
//   closing    inside the last RECORD_WARN_MS: say it is about to stop
//   over       at the cap: stop it
export function recordPhase(elapsedMs, maxMs = RECORD_MAX_MS, warnMs = RECORD_WARN_MS) {
  if (elapsedMs >= maxMs) return 'over'
  if (elapsedMs >= maxMs - warnMs) return 'closing'
  return 'recording'
}

// "0:07", "4:31". Minutes are not padded; a take is never an hour.
export function clock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(total / 60)
  const seconds = total % 60
  return `${minutes}:${String(seconds).padStart(2, '0')}`
}

// The container a recorder is asked for, best first: Opus in WebM (Chrome,
// Firefox, newer Safari), Opus in Ogg, then the MP4 an older Safari records.
// `null` is "let the browser choose", and the server reads whatever it names.
const RECORDER_TYPES = ['audio/webm;codecs=opus', 'audio/webm', 'audio/ogg;codecs=opus', 'audio/mp4']

export function recorderType(isTypeSupported) {
  if (typeof isTypeSupported !== 'function') return null
  for (const type of RECORDER_TYPES) {
    try {
      if (isTypeSupported(type)) return type
    } catch {
      /* a browser that throws on the question has answered it */
    }
  }
  return null
}

// How loud one slice of the microphone is, 0 to 1, from an analyser's
// time-domain bytes (128 is silence). Scaled up because speech rarely comes
// near full scale, and a meter that barely moves reads as a meter that is not
// listening.
export function levelOf(bytes) {
  if (!bytes || bytes.length === 0) return 0
  let sum = 0
  for (const b of bytes) {
    const v = (b - 128) / 128
    sum += v * v
  }
  return Math.min(1, Math.sqrt(sum / bytes.length) * 4)
}

// The meter's newest reading on the right, oldest falling off the left.
export function pushLevel(levels, level, bars = LEVEL_BARS) {
  const next = [...levels, level]
  return next.length > bars ? next.slice(next.length - bars) : next
}

// ---------------------------------------------------------------- biasing

// Words that are capitalised because of where they sit, not because they are
// names: a proper-noun guess that let these through would bias the model
// towards "The" and "I".
const COMMON = new Set(
  (
    'I Im Ill Ive Id A An The This That These Those It Its If In On At To Of Or And But So As Is Are Was Were Be ' +
    'Yes No Not Ok Okay Hi Hello Thanks Thank Please Sure Also Then There Here What When Where Why How Who Which ' +
    'We You He She They My Your Our Their Me Us Them Do Does Did Done Can Could Would Should Will Just Now ' +
    'Let Lets Maybe Some Any All Each Every One Two Three First Next Last After Before For From With Without ' +
    'Monday Tuesday Wednesday Thursday Friday Saturday Sunday Today Tomorrow Yesterday Good Great Right Well'
  )
    .split(' ')
    .map((w) => w.toLowerCase()),
)

// The candidates for a name in a run of text: a capitalised word that is not
// at the start of a sentence, or a word with a capital inside it (MuseBot,
// iPhone), or an acronym of two to six capitals. Code spans and URLs are not
// speech and are skipped.
export function properNouns(text) {
  const out = []
  const clean = String(text ?? '')
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
  const words = clean.split(/\s+/)
  let sentenceStart = true
  for (const raw of words) {
    const word = raw.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '').replace(/[’']s$/u, '')
    const startsSentence = sentenceStart
    sentenceStart = /[.!?:]["')\]]*$/.test(raw) || raw === ''
    if (word.length < 2 || !/^\p{L}/u.test(word)) continue
    const inner = /\p{Ll}\p{Lu}/u.test(word)
    const acronym = /^\p{Lu}{2,6}$/u.test(word)
    const capital = /^\p{Lu}\p{Ll}/u.test(word)
    if (COMMON.has(word.toLowerCase().replace(/[’']/g, ''))) continue
    if (inner || acronym || (capital && !startsSentence)) out.push(word)
  }
  return out
}

// The terms a take is biased towards, in the order they matter: the person's
// own, from the terms note, first, then the automatic seed — the agent's own
// name, the chat's title, the names in what was said lately. **This is the one
// function that decides it**, so the list is an argument here and not a second
// place that knows about biasing.
//
// Two ceilings. The seed is at most VOCABULARY_TERMS, the hundred Gemini does
// best with. The whole is at most VOCABULARY_MAX_TERMS, Gemini's own limit. The
// person's list comes first, so it is the seed that gives way. The list goes in
// the take's body, so there is no header's byte budget to fit any more (until
// 2026-09-30 it rode in `x-vocabulary`, and 6000 bytes held about 380 terms).
//
// `texts` is the last few turns' words, newest last; a name said often and
// recently outranks one said once long ago.
export const VOCABULARY_TERMS = 100
export const VOCABULARY_MAX_TERMS = 1000
export const VOCABULARY_TERM_CHARS = 80

// One term as a person wrote it: spaces collapsed, ends trimmed, and nothing
// longer than a name. `null` is nothing worth keeping.
export function cleanTerm(term) {
  const said = String(term ?? '').replace(/\s+/g, ' ').trim()
  return said === '' || said.length > VOCABULARY_TERM_CHARS ? null : said
}

// **The terms in the vault's note, as the host answers them.** A host that
// parses the note sends `terms`, already read by the rule below; one from
// 2026-09-30 sends the note whole as `text`, and the page reads it by that
// rule itself. Either way: once each in any case, first spelling kept, in the
// note's order, and no more than Gemini takes.
export function vaultTerms(answer) {
  if (!Array.isArray(answer?.terms)) return parseTermsNote(answer?.text)
  const out = []
  const seen = new Set()
  for (const term of answer.terms) {
    const said = typeof term === 'string' ? cleanTerm(term) : null
    if (!said || seen.has(said.toLowerCase())) continue
    seen.add(said.toLowerCase())
    out.push(said)
    if (out.length >= VOCABULARY_MAX_TERMS) break
  }
  return out
}

// **The terms note, read by its own rule** — the one the Obsidian plugin reads
// it by, stated in the note's host: one term per line; YAML frontmatter,
// headings, `%% %%` comments and blank lines ignored; a leading list marker
// stripped; a line with commas is several terms. Once each in any case, first
// spelling kept, in the note's order, and no more than Gemini takes.
export function parseTermsNote(text) {
  const lines = String(text ?? '').replace(/\r\n?/g, '\n').replace(/%%[\s\S]*?%%/g, '').split('\n')
  // Frontmatter is only ever the note's opening block, fenced by `---`.
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((line, i) => i > 0 && line.trim() === '---')
    if (end > 0) lines.splice(0, end + 1)
  }
  const out = []
  const seen = new Set()
  for (const line of lines) {
    const bare = line.trim()
    if (bare === '' || /^#{1,6}(\s|$)/.test(bare)) continue
    const item = bare.replace(/^(?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?/, '')
    for (const part of item.split(',')) {
      const said = cleanTerm(part)
      if (!said || seen.has(said.toLowerCase())) continue
      seen.add(said.toLowerCase())
      out.push(said)
      if (out.length >= VOCABULARY_MAX_TERMS) return out
    }
  }
  return out
}

export function dictationVocabulary({ agentName = null, agentId = null, title = null, texts = [], extra = [] } = {}) {
  const own = []
  const out = []
  const seen = new Set()
  const add = (term, into = out) => {
    const said = cleanTerm(term)
    if (!said) return
    const key = said.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    into.push(said)
  }
  for (const term of extra ?? []) add(term, own)
  add(agentName)
  if (agentId && agentId.toLowerCase() !== String(agentName ?? '').toLowerCase()) add(agentId)
  for (const word of properNouns(title ?? '')) add(word)
  // Also the title's capitalised first word, which properNouns() reads as the
  // start of a sentence: a chat called "Ada's deploy" is about Ada.
  const lead = /^\s*(\p{Lu}[\p{L}\p{N}-]+)/u.exec(title ?? '')
  if (lead && !COMMON.has(lead[1].toLowerCase())) add(lead[1])

  const counts = new Map()
  texts.forEach((text, i) => {
    for (const word of properNouns(text)) {
      const key = word.toLowerCase()
      const had = counts.get(key)
      // Weighted by how recent: the last text counts most.
      const weight = 1 + i / Math.max(1, texts.length)
      counts.set(key, { word: had?.word ?? word, score: (had?.score ?? 0) + weight })
    }
  })
  for (const { word } of [...counts.values()].sort((a, b) => b.score - a.score)) add(word)

  // In order until the ceiling, so what gives way is the end: the seed's least
  // weighty names before any of the person's own.
  return [...own, ...out.slice(0, VOCABULARY_TERMS)].slice(0, VOCABULARY_MAX_TERMS)
}

// ---------------------------------------------------------------- the draft

// Words put into a draft at the caret, with a space either side where the
// draft needs one — so "see you" + caret + "tomorrow" with "at the office" said
// in between reads as a sentence, and nothing typed is replaced. A caret the
// page could not read is the end of the draft.
export function mergeAt(md, caret, said) {
  const text = String(md ?? '')
  const words = String(said ?? '').trim()
  const at = caret === null || caret === undefined ? text.length : Math.max(0, Math.min(Number(caret) || 0, text.length))
  if (words === '') return { md: text, caret: at }
  const before = text.slice(0, at)
  const after = text.slice(at)
  const lead = before === '' || /\s$/.test(before) ? '' : ' '
  const tail = after === '' || /^\s/.test(after) ? '' : ' '
  const insert = `${lead}${words}${tail}`
  return { md: `${before}${insert}${after}`, caret: before.length + lead.length + words.length }
}
