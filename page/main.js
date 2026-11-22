import { speechGuide } from './guide.js'
import { mount } from './engine.js'
import * as helpers from './dictate.js'
import { createPreferences } from './settings.js'
export function activate(loam) {
  loam.ui.styles.add('page/style.css')
  const store = createPreferences(loam.settings)
  const guide = speechGuide(loam, 'dictation', 'Get tidier words with a free Gemini key')
  const suggestionKey = 'gemini-suggestion', settingsPath = '/plugins/dictation/settings'
  let provider = null, revision = 0, suggestion = null
  const dismissedKey = 'gemini-suggestion-dismissed'
  let dismissed = loam.settings.get(dismissedKey, false), saving = null, pending = null, settingsRead = 0
  const api = async (...args) => loam.ui.host.api(...args)
  const redraw = () => loam.ui.host.schedule()
  function updateSuggestion() {
    const ticket = ++settingsRead
    return api('GET', settingsPath).then(result => {
      if (ticket !== settingsRead || result.values?.[suggestionKey] !== 'hidden') return
      dismissed = true
      pending = null
      closeSuggestion()
    }).catch(() => {})
  }
  function saveSuggestion() {
    if (saving) return saving
    settingsRead++
    saving = api('PATCH', settingsPath, { values: { [suggestionKey]: 'hidden' } })
      .then(() => loam.settings.set('gemini-dismissal-saved', true))
      .catch(() => {})
      .finally(() => { saving = null })
    return saving
  }
  function closeSuggestion() {
    if (!suggestion) return
    suggestion = null
    redraw()
  }
  function showSuggestion(entry, target) {
    if (dismissed || suggestion || pending || provider !== 'browser') return
    const offer = { entry, target }
    pending = offer
    // Read again so another device's dismissal also follows an already-open tab.
    updateSuggestion().then(() => {
      if (pending !== offer || dismissed || provider !== 'browser') return
      suggestion = offer
      pending = null
      redraw()
    })
  }
  async function refresh() {
    const id = ++revision
    try {
      const response = await (loam.ui.host.fetch ?? fetch)('/x/dictation/status')
      if (!response.ok) return
      const status = await response.json()
      if (id === revision && status.provider && provider !== status.provider) {
        provider = status.provider
        if (provider !== 'browser') { pending = null; closeSuggestion() }
        redraw()
      }
    } catch { /* Keep the last known selection through a connection failure. */ }
  }
  refresh()
  updateSuggestion()
  for (const event of ['speech.keys.changed', 'page.visible', 'health.changed', 'plugin.settings.opened']) loam.events.on(event, refresh)
  loam.events.on('page.visible', () => {
    if (loam.settings.get(dismissedKey, false) && !loam.settings.get('gemini-dismissal-saved', false)) saveSuggestion()
    else updateSuggestion()
  })
  loam.events.on('plugin.secrets.changed', ({ id }) => { if (id === 'dictation') refresh() })
  const owners = loam.ui.host.panelHosts?.() ?? [loam.ui.host]
  const mounts = new Map(owners.map(owner => {
    const local = { rec: null, takeNotice: null,
      mics: { loaded: false, list: [], named: false, error: '' },
      termsNote: { loaded: false, found: false, path: null, vaultPath: null, terms: [], readAt: null, error: '' } }
    Object.defineProperty(local, 'dictation', { get: () => store.dictation, set: value => { store.dictation = value } })
    const context = loam.ui.extension({ host: owner, state: local, store, helpers: { ...helpers, provider: () => provider, guide,
      browserTakeLanded: target => showSuggestion(owner.panelId ?? 'main', target),
      captureStarted: () => loam.events.emit('audio.capture', {}),
    } })
    const host = context.host, service = context.attach(mount(host, loam.ui))
    return [owner.panelId ?? 'main', { local, host, service }]
  }))
  const at = context => mounts.get(context?.host?.panelId ?? context?.panel ?? 'main')
  loam.places.composer.tool.add({ id: 'dictation.state', slot: 'state', render: context => {
    const take = at(context)?.service.takeIn(context.target)
    return take ? { active: true, phase: take.phase, level: take.levels?.at(-1) ?? 0 } : null
  } })
  loam.places.composer.tool.add({ id: 'dictation.microphone', slot: 'microphone', render: context => {
    const service = at(context)?.service
    return service && (service.dictationMode() || provider === 'browser') ? service.micButton(context.target) : null
  } })
  loam.places.composer.tool.add({ id: 'dictation.take', slot: 'take', render: context => {
    const service = at(context)?.service, take = service?.takeIn(context.target)
    return take ? service.takeSurface(take) : null
  } })
  function suggestionFor(context) {
    if (!suggestion || suggestion.entry !== (context?.host?.panelId ?? context?.panel ?? 'main') || suggestion.target !== context.target) return null
    const { h, icon } = loam.ui
    return h('aside', { class: 'dictation-suggestion', 'aria-label': 'Dictation tip' },
      h('span', { class: 'dictation-suggestion-copy', text: 'No Gemini key, so your browser did this dictation.' }),
      guide.link('Add free key'),
      h('button', { class: 'iconbtn ghost', type: 'button', 'aria-label': 'Don’t show again', title: 'Don’t show again',
        onclick: () => {
          dismissed = true
          loam.settings.set(dismissedKey, true)
          closeSuggestion()
          saveSuggestion()
        } }, icon.close(14)))
  }
  loam.places.composer.tool.add({ id: 'dictation.suggestion', slot: 'advice', render: suggestionFor })
  loam.places.composer.tool.add({ id: 'dictation.notice', slot: 'notice', render: context => {
    const entry = at(context)
    if (!entry) return null
    const { local, host, service } = entry
    if (context.target !== 'file') return service.takeNoticeLine()
    const n = local.takeNotice
    if (!n) return suggestionFor(context)
    return host.activeThread() ? null : loam.ui.h('div', { class: 'listnotice inline', role: 'status' }, loam.ui.h('span', { text: n.offer ? `${n.text} · ` : n.text }), n.offer ? loam.ui.h('button', { class: 'noticerow-act', type: 'button', text: n.offer.label, onclick: service.actOnNotice }) : null)
  } })
  loam.places.settings.section.add({ id: 'dictation', group: 'plugin', worksWithoutKeys: true, title: 'Dictation preferences', render: () => mounts.get('main').service.settingsDictation({ back: false }) })
  loam.events.on('field.reset', detail => { clearFieldSuggestion(detail); const service = at(detail)?.service; service?.discardTake(); service?.hush() })
  loam.events.on('field.closed', detail => { clearFieldSuggestion(detail); const service = at(detail)?.service; if (service?.takeIn(detail.target)) service.discardTake() })
  function clearFieldSuggestion({ host, target }) {
    const panel = host?.panelId ?? 'main'
    if (pending?.entry === panel && (!target || pending.target === target)) pending = null
    if (suggestion?.entry === panel && (!target || suggestion.target === target)) closeSuggestion()
  }
  loam.events.on('field.input', detail => { clearFieldSuggestion(detail); at(detail)?.service.hush() })
  loam.events.on('key.escape', event => { const entry = at(event); if (entry?.local.rec) { entry.service.discardTake(); event.preventDefault() } })
  loam.events.on('page.visible', () => { for (const { service } of mounts.values()) service.screen.shown() })
  loam.events.on('rendered', () => { for (const { service } of mounts.values()) service.followTake() })
  function loadPreferences() {
    const { service } = mounts.get('main')
    service.loadMicrophones()
    service.loadTermsNote()
  }
  loam.events.on('plugin.settings.opened', ({ id }) => { if (id === 'dictation') loadPreferences() })
  const sheet = loam.ui.host.state.sheet
  if (sheet?.kind === 'settings' && sheet.page === 'plugins' && sheet.provider === 'dictation') loadPreferences()
  const cleanup = () => { revision++; settingsRead++; pending = null; closeSuggestion(); guide.close(); for (const { service, local } of mounts.values()) { service.discardTake(); service.stopLive(); service.dispose(); local.takeNotice = null } }
  loam.events.on('page.leaving', cleanup)
  return cleanup
}
