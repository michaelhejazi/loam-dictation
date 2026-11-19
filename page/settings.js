import { recordMinutes, VOCABULARY_MAX_TERMS } from './dictate.js'
// What an unset or unreadable setting is: the recorded, cleaned take, five
// minutes, the system's own microphone, Light polish, no old terms.
export const DICTATION_DEFAULTS = Object.freeze({ mode: 'record', maxMinutes: 5, deviceId: null, polish: 'light', terms: [] })
const POLISH_LEVELS = ['off', 'light', 'full']

export function dictationSettings(held) {
  const value = held && typeof held === 'object' ? held : {}
  return {
    mode: value.mode === 'browser' ? 'browser' : 'record',
    maxMinutes: recordMinutes(value.maxMinutes),
    deviceId: typeof value.deviceId === 'string' && value.deviceId !== '' ? value.deviceId : null,
    polish: POLISH_LEVELS.includes(value.polish) ? value.polish : DICTATION_DEFAULTS.polish,
    terms: Array.isArray(value.terms) ? value.terms.filter((t) => typeof t === 'string' && t.trim() !== '').slice(0, VOCABULARY_MAX_TERMS) : [],
  }
}


export function createPreferences(settings) {
  const held = settings.device('loam-ui.dictation', dictationSettings)
  return { get dictation() { return held.value }, set dictation(value) { held.value = value } }
}
