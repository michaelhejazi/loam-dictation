# Dictation

Talk instead of typing. A microphone joins the composer, the expanded editor
and the Files editor: press it, speak, and your words land in the draft,
tidied the way you choose. Sending the message or saving the file is still
yours to do.

## Two ways to dictate

- **Record first** (the default). Your take is recorded, then sent through
  your Loam's own server to Google's Gemini, which writes it down and tidies
  it. **Polish** chooses how much: *Off* keeps your words with the fillers
  removed, *Light* tidies grammar and names and keeps every sentence, *Full*
  tidies and organises sentences, paragraphs and lists.
- **As you speak**. Your browser's own speech recognition writes as you talk.
  Your browser chooses where that audio goes (often its maker's service), so
  use Record first when you want it to go only through your Loam.

Names and terms help it hear you: the names of your agents and threads, and
the terms in your vault's dictation terms note, which it reads fresh for
every take. Edit the note in Obsidian or in Files.

## What you need

A Google (Gemini) API key for Record first, saved once in Settings ›
Connections › API keys (or a key of Dictation's own in its settings). As you
speak needs no key, only a browser that offers speech recognition.

## What it touches

- **Your microphone**, only while you are recording. Turning the plugin off
  releases it.
- **generativelanguage.googleapis.com**: a recorded take goes there through
  your Loam's server, which holds the key. The browser never sees the key.
- **Your browser's recognition service**, in As you speak only.
- **Conversation records, read only**: your agents' and threads' names, to
  bias what it hears. It never sends a message for you.

## Settings

Settings › Plugins › Dictation: the mode, the polish, the longest recording
(1 to 15 minutes, 5 unless you change it), and which microphone. They are kept in this browser, so each
device has its own, and they stay if you turn the plugin off and on again.

## Getting it

In your Loam, open Settings › Market, find Dictation, and press **Install**.
Or install it from Settings › Plugins with its link:

```
https://github.com/michaelhejazi/loam-dictation/tree/v1.0.1
```

## For builders

[PLUGIN.md](PLUGIN.md) is its manifest. It is page code only, plain ES
modules with no build step: `page/main.js` registers the composer's tools and
the settings section through Loam's plugin interface (API 0), and
`page/engine.js` is the recorder and its states. The transcription itself is
your Loam server's `/api/transcribe`, which has the key; this plugin holds
none. Loam's own repository runs this plugin's tests against its copy in
`plugins/_listed/dictation/`.

## Made by

Michael Hejazi. Under the AGPL-3.0 ([LICENSE](LICENSE)), as Loam is.
