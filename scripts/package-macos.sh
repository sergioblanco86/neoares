#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage_dir="$project_dir/.package-staging/macos"
release_dir="$project_dir/release"
package_dir="$release_dir/NeoAres-darwin-arm64"
archive_path="$release_dir/NeoAres-macOS-arm64.zip"

bash "$project_dir/scripts/prepare-icons.sh"
bash "$project_dir/scripts/prepare-macos-tools.sh"

rm -rf "$stage_dir"
rm -rf "$package_dir"
rm -f "$archive_path"
mkdir -p "$stage_dir/.tools"

cp "$project_dir/package.json" "$stage_dir/package.json"
cp -R "$project_dir/dist" "$stage_dir/dist"
cp -R "$project_dir/dist-electron" "$stage_dir/dist-electron"
cp "$project_dir/.tools/macos/yt-dlp" "$stage_dir/.tools/yt-dlp"

"$project_dir/node_modules/.bin/electron-packager" "$stage_dir" NeoAres \
  --platform=darwin \
  --arch=arm64 \
  --electron-version=44.4.3 \
  --out="$release_dir" \
  --overwrite \
  --no-asar \
  --no-prune \
  --icon="$project_dir/build-assets/NeoAres.icns" \
  --app-version=0.1.0 \
  --app-copyright="Copyright 2026 NeoAres" \
  --app-bundle-id=app.neoares.desktop

resources_dir="$package_dir/NeoAres.app/Contents/Resources"
info_plist="$package_dir/NeoAres.app/Contents/Info.plist"
mv "$resources_dir/electron.icns" "$resources_dir/NeoAres.icns"
plutil -replace CFBundleIconFile -string NeoAres.icns "$info_plist"

codesign --force --deep --sign - "$package_dir/NeoAres.app"
ditto -c -k --sequesterRsrc --keepParent "$package_dir/NeoAres.app" "$archive_path"

rm -rf "$package_dir"
rm -rf "$stage_dir"
