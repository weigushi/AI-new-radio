# Deployment Specs

- When deploying to Vercel serverless, audio playback must not depend on the long-running `server/server.mjs` process, in-memory `pendingAudioStreams`, or files written under `public/` at request time. Violation: playback works locally but deployed `/api/.../stream` routes return 404, empty audio, or lose pending reply state.
- Fish Audio `/v1/tts/stream/with-timestamp` returns `text/event-stream` events with `audio_base64`, not raw audio bytes. The project API must decode those events and proxy `audio/mpeg` to browser `<audio>`. Violation: the browser receives SSE as an audio source and cannot play it.
