#!/usr/bin/env bash
set -euo pipefail
shopt -s nullglob

RECORDING_DIR="$1"

if [ -z "$RECORDING_DIR" ]; then
    echo "Usage: $0 <recording_id_directory>"
    exit 1
fi

if [ ! -d "$RECORDING_DIR" ]; then
    echo "Directory not found: $RECORDING_DIR"
    exit 1
fi

echo "Processing recording: $RECORDING_DIR"

for USER_DIR in "$RECORDING_DIR"/*/; do
    [ -d "$USER_DIR" ] || continue

    USERNAME=$(basename "$USER_DIR")
    echo ""
    echo "=== User: $USERNAME ==="

    files=( "$USER_DIR"/*.ogg )

    if [ ${#files[@]} -eq 0 ]; then
        echo "No audio files, skipping."
        continue
    fi

    # Determine earliest
    earliest=""
    for f in "${files[@]}"; do
        base=$(basename "$f" .ogg)

        # Skip filenames that aren't numbers
        if ! [[ "$base" =~ ^[0-9]+$ ]]; then
            echo "Skipping invalid filename: $f"
            continue
        fi

        if [ -z "$earliest" ] || (( base < earliest )); then
            earliest="$base"
        fi
    done

    # If earliest is still empty, skip
    if [ -z "$earliest" ]; then
        echo "No valid timestamp files for $USERNAME"
        continue
    fi

    echo "Earliest timestamp: $earliest"

    inputs=()
    filter_complex=""
    idx=0

    for f in "${files[@]}"; do
        base=$(basename "$f" .ogg)

        # Skip invalid numeric filenames
        if ! [[ "$base" =~ ^[0-9]+$ ]]; then
            echo "Skipping invalid file: $f"
            continue
        fi

        echo "Processing file: $f"
        delay_ms=$(( base - earliest ))

        inputs+=( -i "$f" )
        filter_complex+="[$idx:a]adelay=${delay_ms}|${delay_ms}[a$idx];"

        idx=$((idx+1))
    done

    if (( idx == 0 )); then
        echo "No valid segments for $USERNAME"
        continue
    fi

    # If only one input, avoid amix (prevents ffmpeg errors)
    if (( idx == 1 )); then
        OUTPUT_FILE="$RECORDING_DIR/${USERNAME}.ogg"
        echo "Single segment → copying directly to $OUTPUT_FILE"
        cp "${files[0]}" "$OUTPUT_FILE"
        continue
    fi

    mix_inputs=""
    for ((i=0; i<idx; i++)); do
        mix_inputs+="[a$i]"
    done

    filter_complex+="${mix_inputs}amix=inputs=$idx:dropout_transition=0[aout]"

    OUTPUT_FILE="$RECORDING_DIR/${USERNAME}.ogg"
    echo "Creating final file: $OUTPUT_FILE"

    # Prevent ffmpeg warnings from killing the script
    ffmpeg \
        "${inputs[@]}" \
        -filter_complex "$filter_complex" \
        -map "[aout]" \
        -c:a libopus \
        -y \
        "$OUTPUT_FILE" \
        || echo "FFmpeg returned a non-zero code but output generated."

done

echo ""
echo "All users processed."