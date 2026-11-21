import { speechGuide } from './guide.js'
import { mount } from './engine.js'
import * as helpers from './dictate.js'
import { createPreferences } from './settings.js'
export function activate(loam) {
  loam.ui.styles.add('page/style.css')
  const store = createPreferences(loam.settings)
  const guide = speechGuide(loam, 'dictation', 'Get tidier words with a free Gemini key')
  let provider = null, revision = 0
  async function refresh() {
    const id = ++revision
    try {
      const response = await (loam.ui.host.fetch ?? fetch)('/x/dictation/status')
      if (!response.ok) return
      const status = await response.json()
      if (id === revision && status.provider && provider !== status.provider) {
        provider = status.provider; loam.ui.host.schedule()
      }
    } catch { /* Keep the last known selection through a connection failure. */ }
  }
  refresh()
  for (const event of ['speech.keys.changed', 'page.visible', 'health.changed', 'plugin.settings.opened']) loam.events.on(event, refresh)
  loam.events.on('plugin.secrets.changed', ({ id }) => { if (id === 'dictation') refresh() })
  const owners = loam.ui.host.panelHosts?.() ?? [loam.ui.host]
  const mounts = new Map(owners.map(owner => {
    const local = { rec: null, takeNotice: null,
      mics: { loaded: false, list: [], named: false, error: '' },
      termsNote: { loaded: false, found: false, path: null, url: null, terms: [], readAt: null, error: '' } }
    Object.defineProperty(local, 'dictation', { get: () => store.dictation, set: value => { store.dictation = value } })
    const context = loam.ui.extension({ host: owner, state: local, store, helpers: { ...helpers, provider: () => provider, guide,
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
  loam.places.composer.tool.add({ id: 'dictation.notice', slot: 'notice', render: context => {
    const entry = at(context)
    if (!entry) return null
    const { local, host, service } = entry
    const hint = provider === 'browser' && !local.takeNotice ? guide.link() : null
    if (context.target !== 'file') return service.takeNoticeLine() ?? hint
    if (hint) return hint
    const n = local.takeNotice
    return !n || host.activeThread() ? null : loam.ui.h('div', { class: 'listnotice inline', role: 'status' }, loam.ui.h('span', { text: n.offer ? `${n.text} · ` : n.text }), n.offer ? loam.ui.h('button', { class: 'noticerow-act', type: 'button', text: n.offer.label, onclick: service.actOnNotice }) : null)
  } })
  loam.places.settings.section.add({ id: 'dictation', group: 'plugin', worksWithoutKeys: true, title: 'Dictation preferences', render: () => mounts.get('main').service.settingsDictation({ back: false }) })
  loam.events.on('field.reset', detail => { const service = at(detail)?.service; service?.discardTake(); service?.hush() })
  loam.events.on('field.closed', detail => { const service = at(detail)?.service; if (service?.takeIn(detail.target)) service.discardTake() })
  loam.events.on('field.input', detail => at(detail)?.service.hush())
  loam.events.on('key.escape', event => { const entry = at(event); if (entry?.local.rec) { entry.service.discardTake(); event.preventDefault() } })
  loam.events.on('page.visible', () => { for (const { service } of mounts.values()) service.screen.shown() })
  loam.events.on('rendered', () => { for (const { service } of mounts.values()) service.followTake() })
  loam.events.on('plugin.settings.opened', ({ id }) => { if (id === 'dictation') { const { service } = mounts.get('main'); service.loadMicrophones(); service.loadTermsNote() } })
  const cleanup = () => { revision++; guide.close(); for (const { service, local } of mounts.values()) { service.discardTake(); service.stopLive(); service.dispose(); local.takeNotice = null } }
  loam.events.on('page.leaving', cleanup)
  return cleanup
}
