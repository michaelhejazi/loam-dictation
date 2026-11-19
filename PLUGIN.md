---
id: dictation
name: Dictation
version: 1.0.0
author: Loam contributors
api: 0
default_on: false
kind: [extension]
places: [composer.tool, settings.section]
contributes: {"settings.secret":[{"name":"GEMINI_API_KEY","label":"Gemini API key","check":"builtin:gemini"}]}
keys:
  - provider: google
    why: Transcribes and tidies what you record
overrides: []
touches:
  network:
    - host: generativelanguage.googleapis.com
      why: Sends recorded microphone audio through the app server for transcription and cleanup
    - host: browser-managed
      why: Live mode uses the browser vendor's recognition service; its endpoint is chosen by the browser
  record: read
  memory: none
  server: false
---

Dictate into the composer, expanded editor or Files editor. Reads agent/thread
names and the host's dictation terms to bias recognition. Inserts words in the
current draft; writing a file or sending a message remains the person's action.
Turning this plugin off releases the microphone and removes its controls and
settings. Saved preferences stay in place. Open Settings → Plugins → Dictation
to choose mode, polish, recording length and microphone. Live recognition may send audio to the browser vendor's
service; use recorded mode for the app server's configured transcription path.
