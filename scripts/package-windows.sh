#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
stage_dir="$project_dir/.package-staging/windows"
release_dir="$project_dir/release"
package_dir="$release_dir/NeoAres-win32-x64"
portable_archive_path="$release_dir/NeoAres-Windows-Portable-x64.zip"
installer_path="$release_dir/NeoAres-Windows-Setup-x64.exe"
app_version="$(cd "$project_dir" && node -p "require('./package.json').version")"

cleanup() {
  rm -rf "$stage_dir"
  rm -rf "$package_dir"
}
trap cleanup EXIT

bash "$project_dir/scripts/prepare-icons.sh"
bash "$project_dir/scripts/prepare-windows-tools.sh"

rm -rf "$stage_dir"
rm -rf "$package_dir"
rm -f "$release_dir/NeoAres-Windows-x64.zip"
rm -f "$portable_archive_path"
rm -f "$installer_path"
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
  --app-version="$app_version" \
  --app-copyright="Copyright 2026 NeoAres" \
  --win32metadata.CompanyName=NeoAres \
  --win32metadata.FileDescription=NeoAres \
  --win32metadata.ProductName=NeoAres \
  --win32metadata.InternalName=NeoAres

(
  cd "$release_dir"
  COPYFILE_DISABLE=1 zip -q -r -X "$(basename "$portable_archive_path")" "$(basename "$package_dir")"
)

if ! command -v makensis >/dev/null 2>&1; then
  echo "No se encontró makensis. Instala NSIS para construir el instalador de Windows." >&2
  echo "En macOS: brew install nsis" >&2
  exit 1
fi

package_size_kb="$(du -sk "$package_dir" | awk '{print $1}')"
makensis \
  -DAPP_VERSION="$app_version" \
  -DPACKAGE_DIR="$package_dir" \
  -DOUTPUT_FILE="$installer_path" \
  -DAPP_ICON="$project_dir/build-assets/NeoAres.ico" \
  -DINSTALL_SIZE_KB="$package_size_kb" \
  "$project_dir/scripts/windows-installer.nsi"

cleanup
trap - EXIT
bash "$project_dir/scripts/update-release-checksums.sh"
