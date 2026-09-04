## Opening it the first time

Nothing here is signed with a paid certificate, so macOS and Windows will each
stop you once. Neither warning means anything is wrong with the download —
only that nobody has paid to vouch for it.

### macOS

The app is signed, but not notarised, so the system says it cannot check it
for malicious software.

1. Open it once and let the warning appear, then dismiss it.
2. Go to **System Settings → Privacy & Security**, scroll to the bottom, and
   press **Open Anyway** beside the app's name.
3. Confirm once more when asked. It opens normally from then on.

Or take the download's quarantine mark off directly:

```sh
xattr -d com.apple.quarantine "/Applications/Rehearsal Space.app"
```

On macOS 14 and earlier, right-click → **Open** does the same thing. That
route was taken away in macOS 15.

Take `mac-arm64` for an Apple silicon machine and `mac-x64` for an Intel one.
Stem separation is unavailable on Intel Macs: the library demucs reads audio
with publishes no build for them.

### Windows

SmartScreen says "Windows protected your PC". Press **More info**, then
**Run anyway**.

Either the installer (`win-x64.exe`, which installs for you alone and asks for
no administrator) or the zip, which installs nothing.

### Linux

Nothing in the way. The `.deb` installs its own launcher and icons; the
AppImage runs from wherever you put it and wants libfuse2 — without it:

```sh
./rehearsal-space-*.AppImage --appimage-extract-and-run
```

---

The app fetches ffmpeg, ffprobe and yt-dlp for itself on first run, and offers
to install demucs the first time you ask for stems.
