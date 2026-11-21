---
id: dictation
name: Dictation
version: 1.2.0
author: Michael Hejazi
api: 0
kind: [extension]
description: "Talk instead of typing: say it, and tidy words land in your draft."
screenshots:
  - {src: assets/shots/dictation-recording.webp, src_dark: assets/shots/dictation-recording-dark.webp, caption: "Press the mic and talk. Take your time; it listens."}
  - {src: assets/shots/dictation-landed.webp, src_dark: assets/shots/dictation-landed-dark.webp, caption: "Your words land in the draft, tidied. Sending is still yours."}
  - {src: assets/shots/dictation-polish.webp, src_dark: assets/shots/dictation-polish-dark.webp, caption: "Choose how much it tidies: Off, Light or Full."}
  - {src: assets/shots/dictation-guide.webp, src_dark: assets/shots/dictation-guide-dark.webp, caption: "Add one shared Gemini key in Settings."}
icon: assets/icon.svg
places: [composer.tool, settings.section, app.overlay]
keys:
  - provider: google
    optional: true
    why: Transcribes and tidies what you record
  - provider: openai
    optional: true
    why: Transcribes recordings and tidies the words when there is no Google key
overrides: []
touches:
  network:
    - host: api.openai.com
      why: Transcribes recordings and tidies the words with the OpenAI key when there is no Google key
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

## How to use it

Press the microphone in the composer or Files and speak. Press ✓ to keep the words. With no key, As you speak uses your browser’s recognition. Browser support varies. Record first and Polish use a server key.

## What you need, and what leaves your server

Loam uses a Google key first, then an OpenAI key, then the browser. A provider error stays with that provider. Open Settings › Plugins › Dictation to see the provider. Follow the free Gemini key link, sign in to Google AI Studio, create a key and paste it in the guide. Loam checks it and saves it in Settings › Connections › API keys for both plugins.

Eligible projects get a free quota without setting up billing. Google may use free-tier audio and text to improve its products. Check [availability](https://aistudio.google.com/docs/available-regions) and [your limits](https://aistudio.google.com/rate-limit).

## What it touches

Recording sends audio and vocabulary to the selected provider. As you speak may use the browser vendor’s speech service.
