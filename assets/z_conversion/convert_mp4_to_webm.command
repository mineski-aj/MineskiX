#!/bin/bash

cd "$(dirname "$0")"

echo "==============================="
echo "  MP4 to WebM Converter"
echo "==============================="
echo ""

# Check for ffmpeg
if ! command -v ffmpeg &> /dev/null; then
    echo "Error: ffmpeg is not installed."
    echo "Install it with: brew install ffmpeg"
    echo ""
    read -p "Press Enter to close..."
    exit 1
fi

shopt -s nullglob nocaseglob
mp4_files=(*.mp4)

if [ ${#mp4_files[@]} -eq 0 ]; then
    echo "No .mp4 files found in this folder."
    echo ""
    read -p "Press Enter to close..."
    exit 0
fi

echo "Found ${#mp4_files[@]} .mp4 file(s). Starting conversion..."
echo ""

success=0
failed=0

for file in "${mp4_files[@]}"; do
    output="${file%.*}.webm"
    echo "Converting: $file -> $output"

    ffmpeg -i "$file" \
        -c:v libvpx-vp9 \
        -crf 33 \
        -b:v 0 \
        -c:a libopus \
        -y "$output" \
        -loglevel error -stats

    if [ $? -eq 0 ]; then
        echo "  Done!"
        ((success++))
    else
        echo "  Failed!"
        ((failed++))
    fi
    echo ""
done

echo "==============================="
echo "Conversion complete!"
echo "  Succeeded: $success"
echo "  Failed:    $failed"
echo "==============================="
echo ""
read -p "Press Enter to close..."
