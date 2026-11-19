# Dictation

<!-- loam:hero -->
**Talk instead of typing: say it, and tidy words land in your draft.**
<!-- /loam:hero -->

A plugin for [Loam](https://github.com/loamhq/loam). Press the microphone,
speak, and your words land in the draft, tidied the way you like. Sending the
message or saving the file is still yours to do.

<!-- loam:gallery -->
![Press the mic and talk. Take your time; it listens](assets/shots/dictation-recording.webp)
*Press the mic and talk. Take your time; it listens.*

![Your words land in the draft, tidied. Sending is still yours](assets/shots/dictation-landed.webp)
*Your words land in the draft, tidied. Sending is still yours.*

![Choose how much it tidies: Off, Light or Full](assets/shots/dictation-polish.webp)
*Choose how much it tidies: Off, Light or Full.*
<!-- /loam:gallery -->

## What you can do

- **Talk anywhere you type**: the composer, the bigger editor, and notes in
  Files.
- **Get tidy words, not a transcript.** *Polish* chooses how much: *Off*
  keeps your words with the fillers removed, *Light* tidies grammar and names
  and keeps every sentence, *Full* tidies and organises sentences, paragraphs
  and lists.
- **Be understood.** It knows the names of your agents and threads, and the
  terms in your dictation terms note (edit it in Files or in Obsidian).
- **Record first, or watch it write as you speak.** Record first (the
  default) is recorded, then written down and tidied. As you speak uses your
  browser's own speech recognition and writes while you talk.

## How to use it

1. Get it from **Settings › Market › Dictation**.
2. Add a Google (Gemini) key in **Settings › Connections › API keys**.
3. Press the microphone in the composer and talk; press ✓ when you're done.

## What you need, and what leaves your server

A Google (Gemini) API key for Record first, saved once in Loam (or one for
Dictation alone, with "use a different key" on the same page). As you speak
needs no key, only a browser that offers speech recognition.

Your recording goes to Google from your own Loam server, only when you finish
a take, and your key never reaches the browser. As you speak sends audio to
whatever service your browser uses, so choose Record first when you want it
to go only through your Loam.

---

## Technical details

### What it touches

- **Your microphone**, only while you are recording. Turning the plugin off
  releases it.
- **generativelanguage.googleapis.com**: a recorded take goes there from
  this plugin's own server on your Loam, which holds the key. The browser
  never sees the key.
- **Your browser's recognition service**, in As you speak only.
- **Conversation records, read only**: your agents' and threads' names, to
  bias what it hears. It never sends a message for you.

### Settings

Settings › Plugins › Dictation: the mode, the polish, the longest recording
(1 to 15 minutes, 5 unless you change it), and which microphone. They are
kept in this browser, so each device has its own, and they stay if you turn
the plugin off and on again. The terms note is read fresh for every take.

### Install from a link

In Settings › Plugins, with its link:

```
https://github.com/michaelhejazi/loam-dictation/tree/v1.1.2
```

### For builders

[PLUGIN.md](PLUGIN.md) is its manifest. Plain ES modules with no build step
and no dependency: `page/main.js` registers the composer's tools and the
settings section through Loam's plugin interface (API 0), and
`page/engine.js` is the recorder and its states. `server/` is its own small
server (Node's standard library), which Loam runs while the plugin is on and
reaches at `/x/dictation/`: `POST transcribe` takes a take and answers the
words, and `GET terms` reads your vault's terms note. It holds the key; the
page holds none. Needs Loam 0.2.3 or later. Loam's own repository runs this
plugin's tests against its copy in `plugins/_listed/dictation/`. The pictures
are from Loam's demo world (`app/tools/capture-plugin-shots.mjs`).

## Made by

Michael Hejazi. Under the AGPL-3.0 ([LICENSE](LICENSE)), as Loam is.
