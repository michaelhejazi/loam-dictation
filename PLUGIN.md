---
id: dictation
name: Dictation
version: 1.1.3
author: Michael Hejazi
api: 0
kind: [extension]
description: "Talk instead of typing: say it, and tidy words land in your draft."
screenshots:
  - {src: assets/shots/dictation-recording.webp, src_dark: assets/shots/dictation-recording-dark.webp, caption: "Press the mic and talk. Take your time; it listens."}
  - {src: assets/shots/dictation-landed.webp, src_dark: assets/shots/dictation-landed-dark.webp, caption: "Your words land in the draft, tidied. Sending is still yours."}
  - {src: assets/shots/dictation-polish.webp, src_dark: assets/shots/dictation-polish-dark.webp, caption: "Choose how much it tidies: Off, Light or Full."}
icon: assets/icon.svg
places: [composer.tool, settings.section]
keys:
  - provider: google
    why: Transcribes and tidies what you record
overrides: []
touches:
  network:
    - host: generativelanguage.googleapis.com
      why: Sends recorded microphone audio from its own server for transcription and cleanup
    - host: browser-managed
      why: Live mode uses the browser vendor's recognition service; its endpoint is chosen by the browser
  record: read
  memory: none
  server: true
server:
  run: node server/main.js
---

Press the microphone in the composer, say what you want to say, and your
words land in the draft, tidied up. Sending the message or saving the file is
still yours to do.

## What you can do

- **Talk anywhere you type**: the composer, the bigger editor, and notes in
  Files.
- **Get tidy words, not a transcript.** *Polish* takes out the ums and fixes
  names and grammar: Off, Light or Full.
- **Be understood.** It knows your agents' and threads' names, and any terms
  you add to your dictation terms note.
- **Record first, or watch it write as you speak**, whichever suits you.

## How to use it

1. Add a Google (Gemini) key in **Settings › Connections › API keys**.
2. Press the microphone, and talk.
3. Press ✓ when you're done. Your words land in the draft.

---

## Technical details

Record first sends the take to this plugin's own server (`/x/dictation/`),
which sends it to Google's Gemini with the key and answers the words; the
page never holds the key. As you speak uses the browser's own speech
recognition, whose service the browser chooses. It reads the agents' and
threads' names and the vault's terms note (`GET terms`) to bias what it
hears. Turning it off releases the microphone and removes its controls; your
preferences (mode, polish, longest recording, microphone) are kept in this
browser.
