#!/usr/bin/env sh
#
# Puts the app in the desktop's own list, so a running window is linked to it.
#
# An AppImage is a single file and nothing on the system knows it exists. The
# desktop matches a window to a launcher by app id — on Wayland that is the
# only way, since there is no protocol for a window to carry its own icon — so
# without an installed .desktop the dock has nothing to show but the app id
# itself, which is why it reads "rehearsal-space" under a blank gear.
#
#     ./build/install-launcher.sh dist/rehearsal-space-0.1.0.AppImage
#
# The file it points at has to stay where it is; `npm run pack` empties `dist`,
# so keep the AppImage somewhere of its own and point this at that.
set -eu

APPIMAGE=${1:-}
if [ -z "$APPIMAGE" ] || [ ! -f "$APPIMAGE" ]; then
  echo "usage: $0 <path to the AppImage>" >&2
  exit 2
fi
APPIMAGE=$(cd "$(dirname "$APPIMAGE")" && pwd)/$(basename "$APPIMAGE")
HERE=$(cd "$(dirname "$0")" && pwd)

DATA=${XDG_DATA_HOME:-$HOME/.local/share}
APPS=$DATA/applications
ICONS=$DATA/icons/hicolor/512x512/apps

mkdir -p "$APPS" "$ICONS"

# The name matters: the desktop looks for a launcher named after the app id,
# which Electron takes from the executable inside the AppImage.
cat > "$APPS/rehearsal-space.desktop" <<DESKTOP
[Desktop Entry]
Type=Application
Name=Rehearsal Space
Comment=An all-in-one tool for music practice and song-writing
Exec=$APPIMAGE %U
Icon=rehearsal-space
Terminal=false
Categories=AudioVideo;Audio;
MimeType=audio/flac;audio/mpeg;audio/ogg;audio/wav;
StartupWMClass=rehearsal-space
DESKTOP

python3 - "$HERE/icon.png" "$ICONS/rehearsal-space.png" <<'PY'
import sys
from PIL import Image
Image.open(sys.argv[1]).resize((512, 512), Image.LANCZOS).save(sys.argv[2])
PY

update-desktop-database "$APPS" 2>/dev/null || true
gtk-update-icon-cache -f -t "$DATA/icons/hicolor" 2>/dev/null || true

echo "installed $APPS/rehearsal-space.desktop"
echo "installed $ICONS/rehearsal-space.png"
echo "pointing at $APPIMAGE"
