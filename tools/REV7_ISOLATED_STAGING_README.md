# QCTP Private Runtime Updater REV7

REV7 builds and verifies the Day 1 audio patch in a disposable isolated clone. It never runs `npm ci` against the active PX13 runtime checkout, so a running gateway or locked `node_modules/@esbuild/win32-x64/esbuild.exe` cannot block dependency installation.

For the audio-only recovery, REV7 leaves the current gateway process and active `node_modules` untouched, atomically replaces only the verified `dist` package, and requires the live gateway to serve the exact candidate identity before reporting PASS. On failure, the previous `dist` package is restored.

Release authority remains `ZERO_RELEASE`.
