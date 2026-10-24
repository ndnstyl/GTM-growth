#!/usr/bin/env bash
# Render each wide GTM SVG to a looping GIF: exact frames from headless Chromium, then a two-pass palette GIF.
set -euo pipefail
cd "$(dirname "$0")/.."
FPS=12; WIDTH=960
mkdir -p dist/gif
for name in gtm-stack gtm-agents gtm-skills gtm-loops gtm-automations; do
  tmp="$(mktemp -d)"
  node build/render_frames.mjs "dist/svg/${name}.svg" "$tmp" "$FPS"
  ffmpeg -v error -y -framerate "$FPS" -i "$tmp/f%04d.png" -vf "scale=${WIDTH}:-1:flags=lanczos,palettegen=max_colors=96:stats_mode=diff" "$tmp/pal.png"
  ffmpeg -v error -y -framerate "$FPS" -i "$tmp/f%04d.png" -i "$tmp/pal.png" \
    -lavfi "scale=${WIDTH}:-1:flags=lanczos[x];[x][1:v]paletteuse=dither=bayer:bayer_scale=4:diff_mode=rectangle" -loop 0 "dist/gif/${name}.gif"
  test -s "dist/gif/${name}.gif" || { echo "empty gif for $name" >&2; exit 1; }
  rm -rf "$tmp"
  ls -l "dist/gif/${name}.gif"
done
