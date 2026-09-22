#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
asset_dir="$project_dir/build-assets"
iconset_dir="$asset_dir/NeoAres.iconset"
mac_source="$project_dir/logos/macOsIcon.png"
windows_source="$project_dir/logos/windowsIcon.png"

mkdir -p "$iconset_dir"

sips -z 16 16 "$mac_source" --out "$iconset_dir/icon_16x16.png" >/dev/null
sips -z 32 32 "$mac_source" --out "$iconset_dir/icon_16x16@2x.png" >/dev/null
sips -z 32 32 "$mac_source" --out "$iconset_dir/icon_32x32.png" >/dev/null
sips -z 64 64 "$mac_source" --out "$iconset_dir/icon_32x32@2x.png" >/dev/null
sips -z 128 128 "$mac_source" --out "$iconset_dir/icon_128x128.png" >/dev/null
sips -z 256 256 "$mac_source" --out "$iconset_dir/icon_128x128@2x.png" >/dev/null
sips -z 256 256 "$mac_source" --out "$iconset_dir/icon_256x256.png" >/dev/null
sips -z 512 512 "$mac_source" --out "$iconset_dir/icon_256x256@2x.png" >/dev/null
sips -z 512 512 "$mac_source" --out "$iconset_dir/icon_512x512.png" >/dev/null
sips -z 1024 1024 "$mac_source" --out "$iconset_dir/icon_512x512@2x.png" >/dev/null

iconutil -c icns "$iconset_dir" -o "$asset_dir/NeoAres.icns"
"$project_dir/.tools/venv/bin/python" "$project_dir/scripts/create-windows-icon.py" \
  "$windows_source" "$asset_dir/NeoAres.ico"
