#!/bin/bash
set -euo pipefail

project_dir="$(cd "$(dirname "$0")/.." && pwd)"
release_dir="$project_dir/release"

artifacts=(
  "NeoAres-macOS-arm64.zip"
  "NeoAres-macOS-Universal.zip"
  "NeoAres-Windows-Portable-x64.zip"
  "NeoAres-Windows-Setup-x64.exe"
)
available=()

for artifact in "${artifacts[@]}"; do
  if [[ -f "$release_dir/$artifact" ]]; then
    available+=("$artifact")
  fi
done

if [[ ${#available[@]} -eq 0 ]]; then
  echo "No hay artefactos en $release_dir para calcular checksums." >&2
  exit 1
fi

(
  cd "$release_dir"
  shasum -a 256 "${available[@]}" > SHA256SUMS.txt
)
