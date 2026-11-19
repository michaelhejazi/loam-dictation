// Dictation's server, started by Loam when the plugin is on
// (docs/plugins.md, "Server plugins"): it listens on 127.0.0.1:$PORT and is
// reached by the page at `/x/dictation/`. Its key is the Google key Loam
// resolves for it (`LOAM_PLUGIN_KEYS`, from Settings › Connections › API
// keys); the browser never holds it.

import { readConfig } from './config.js'
import { createTranscriber } from './transcribe.js'
import { createDictationServer } from './app.js'
import { createLog, keyFrom } from './http.js'

const config = readConfig()
const log = createLog({ level: config.logLevel })
const transcriber = createTranscriber(config, { getKey: keyFrom(config.keysFile, 'GEMINI_API_KEY') })
const { server } = createDictationServer({ config, transcriber, log })
server.listen(config.port, '127.0.0.1', () => log.info({ event: 'listening', port: server.address().port }))
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => server.close(() => process.exit(0)))
