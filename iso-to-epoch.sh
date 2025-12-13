#!/usr/bin/env bash
set -e

IN_DIR="$1"
OUT_DIR="$2"

if [ -z "$IN_DIR" ] || [ -z "$OUT_DIR" ]; then
    echo "Usage: $0 <input_directory> <output_directory>"
    exit 1
fi

# macOS compatibility hook:
# uncomment the line below if you're on macOS without coreutils:
# DATE="gdate"
DATE="date"

mkdir -p "$OUT_DIR"

shopt -s nullglob

for f in "$IN_DIR"/*.ogg; do
    base=$(basename "$f" .ogg)

    # Convert ISO 8601 → epoch milliseconds
    epoch_ms=$($DATE -d "$base" +"%s%3N") || {
        echo "Skipping invalid timestamp: $base"
        continue
    }

    out_file="$OUT_DIR/$epoch_ms.ogg"

    echo "Copying:"
    echo "  $f"
    echo "  → $out_file"

    cp "$f" "$out_file"
done
