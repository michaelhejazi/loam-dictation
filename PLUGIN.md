---
id: dictation
name: Dictation
version: 1.2.6
author: Michael Hejazi
api: 0
default_on: false
kind: [extension]
description: "Talk instead of typing: say it, and tidy words land in your draft."
screenshots:
  - {src: assets/shots/dictation-recording.webp, src_dark: assets/shots/dictation-recording-dark.webp, caption: "Press the mic and talk. Take your time; it listens."}
  - {src: assets/shots/dictation-landed.webp, src_dark: assets/shots/dictation-landed-dark.webp, caption: "Your words land in the draft, tidied. Sending is still yours."}
  - {src: assets/shots/dictation-polish.webp, src_dark: assets/shots/dictation-polish-dark.webp, caption: "Choose how much it tidies: Off, Light or Full."}
  - {src: assets/shots/dictation-guide.webp, src_dark: assets/shots/dictation-guide-dark.webp, caption: "Add one shared Gemini key in Settings."}
icon: assets/icon.webp
places: [composer.tool, settings.section, app.overlay]
keys:
  - provider: google
    optional: true
    why: Transcribes and tidies what you record
  - provider: openai
    optional: true
    why: Transcribes recordings and tidies the words when there is no Google key
overrides: []
contributes: {"settings.entry":[{"key":"gemini-suggestion","label":"Gemini key suggestion","choices":["available","hidden"],"default":"available","labels":{"available":"Offer after dictation","hidden":"Keep hidden"},"advanced":true}]}
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

In Settings › Plugins › Dictation, choose Record first to create or open your Names and terms note in Files. Add one name or term per line. Each recording reads the note fresh and sends the terms to the transcriber. As you speak uses browser recognition without Polish or the terms note.

## What you need, and what leaves your server

Loam uses a Google key first, then an OpenAI key, then the browser. A provider error stays with that provider. Open Settings › Plugins › Dictation to see the provider. After a browser take, the composer explains that it used browser speech and offers a free Gemini key for better results. Choose Don’t show again to dismiss the offer on all your devices. The guide remains available in Dictation preferences. To use the guide, sign in to Google AI Studio, create a key and paste it in the guide. Loam checks it and saves it in Settings › Connections › API keys for both plugins.

Eligible projects get a free quota without setting up billing. Google may use free-tier audio and text to improve its products. Check [availability](https://aistudio.google.com/docs/available-regions) and [your limits](https://aistudio.google.com/rate-limit).

## What it touches

Recording sends audio and vocabulary to the selected provider. As you speak may use the browser vendor’s speech service.

Create terms note writes the configured terms note in your vault when you press the button. Existing notes open in Files.
