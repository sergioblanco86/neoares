#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage_dir="$project_dir/.package-staging/macos"
release_dir="$project_dir/release"
app_version="$(cd "$project_dir" && node -p "require('./package.json').version")"
modern_electron_version="44.4.3"
compatibility_electron_version="43.7.1"

cleanup() {
  rm -rf "$stage_dir"
  rm -rf "$release_dir/NeoAres-darwin-arm64"
  rm -rf "$release_dir/NeoAres-darwin-universal"
}
trap cleanup EXIT

bash "$project_dir/scripts/prepare-icons.sh"
bash "$project_dir/scripts/prepare-macos-tools.sh"

cleanup
mkdir -p "$stage_dir/.tools"

cp "$project_dir/package.json" "$stage_dir/package.json"
cp -R "$project_dir/dist" "$stage_dir/dist"
cp -R "$project_dir/dist-electron" "$stage_dir/dist-electron"
cp "$project_dir/.tools/macos/yt-dlp" "$stage_dir/.tools/yt-dlp"

package_variant() {
  local architecture="$1"
  local electron_version="$2"
  local archive_name="$3"
  local package_dir="$release_dir/NeoAres-darwin-$architecture"
  local archive_path="$release_dir/$archive_name"

  rm -rf "$package_dir"
  rm -f "$archive_path"

  "$project_dir/node_modules/.bin/electron-packager" "$stage_dir" NeoAres \
    --platform=darwin \
    --arch="$architecture" \
    --electron-version="$electron_version" \
    --out="$release_dir" \
    --overwrite \
    --no-asar \
    --no-prune \
    --icon="$project_dir/build-assets/NeoAres.icns" \
    --app-version="$app_version" \
    --app-copyright="Copyright 2026 NeoAres" \
    --app-bundle-id=app.neoares.desktop

  local resources_dir="$package_dir/NeoAres.app/Contents/Resources"
  local info_plist="$package_dir/NeoAres.app/Contents/Info.plist"
  mv "$resources_dir/electron.icns" "$resources_dir/NeoAres.icns"
  plutil -replace CFBundleIconFile -string NeoAres.icns "$info_plist"

  codesign --force --deep --sign - "$package_dir/NeoAres.app"
  ditto -c -k --sequesterRsrc --keepParent "$package_dir/NeoAres.app" "$archive_path"
  rm -rf "$package_dir"
}

# Latest runtime: Apple Silicon, macOS 13 Ventura or later.
package_variant "arm64" "$modern_electron_version" "NeoAres-macOS-arm64.zip"

# Compatibility runtime: one universal app for Intel and Apple Silicon,
# with macOS 12 Monterey as the minimum supported system.
package_variant "universal" "$compatibility_electron_version" "NeoAres-macOS-Universal.zip"

cleanup
trap - EXIT
bash "$project_dir/scripts/update-release-checksums.sh"
