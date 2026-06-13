# Audio Worklets

Required (compiled from TypeScript sources in frontend/src/lib/audio/worklets/):
- rnnoise-worklet.js
- limiter-worklet.js

Build: compile the .ts sources to vanilla JS and place here.
These are loaded via `new AudioWorkletNode()` at runtime.
