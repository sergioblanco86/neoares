#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
tool_dir="$project_dir/.tools/windows"
executable="$tool_dir/yt-dlp.exe"
checksums="$tool_dir/SHA2-256SUMS"

mkdir -p "$tool_dir"

curl --fail --location --silent --show-error \
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/yt-dlp.exe" \
  --output "$executable"
curl --fail --location --silent --show-error \
  "https://github.com/yt-dlp/yt-dlp/releases/latest/download/SHA2-256SUMS" \
  --output "$checksums"

expected="$(awk '$2 == "yt-dlp.exe" { print $1 }' "$checksums")"
actual="$(shasum -a 256 "$executable" | awk '{ print $1 }')"

if [[ -z "$expected" || "$actual" != "$expected" ]]; then
  echo "La verificación SHA-256 de yt-dlp.exe falló." >&2
  exit 1
fi
