#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage_dir="$project_dir/.package-staging/windows"
release_dir="$project_dir/release"
package_dir="$release_dir/NeoAres-win32-x64"
archive_path="$release_dir/NeoAres-Windows-x64.zip"

bash "$project_dir/scripts/prepare-icons.sh"
bash "$project_dir/scripts/prepare-windows-tools.sh"

rm -rf "$stage_dir"
rm -rf "$package_dir"
rm -f "$archive_path"
mkdir -p "$stage_dir/.tools"

cp "$project_dir/package.json" "$stage_dir/package.json"
cp -R "$project_dir/dist" "$stage_dir/dist"
cp -R "$project_dir/dist-electron" "$stage_dir/dist-electron"
cp "$project_dir/.tools/windows/yt-dlp.exe" "$stage_dir/.tools/yt-dlp.exe"

"$project_dir/node_modules/.bin/electron-packager" "$stage_dir" NeoAres \
  --platform=win32 \
  --arch=x64 \
  --electron-version=44.4.3 \
  --out="$release_dir" \
  --overwrite \
  --no-asar \
  --no-prune \
  --icon="$project_dir/build-assets/NeoAres.ico" \
  --app-version=0.1.0 \
  --app-copyright="Copyright 2026 NeoAres" \
  --win32metadata.CompanyName=NeoAres \
  --win32metadata.FileDescription=NeoAres \
  --win32metadata.ProductName=NeoAres \
  --win32metadata.InternalName=NeoAres

ditto -c -k --keepParent "$package_dir" "$archive_path"

rm -rf "$package_dir"
rm -rf "$stage_dir"
