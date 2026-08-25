import subprocess
import sys
from pathlib import Path


def convert_mp4_to_webm(folder: str):
    folder_path = Path(folder)

    if not folder_path.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    mp4_files = list(folder_path.glob("*.mp4")) + list(folder_path.glob("*.MP4"))

    if not mp4_files:
        print("No .mp4 files found in the folder.")
        return

    print(f"Found {len(mp4_files)} .mp4 file(s). Starting conversion...\n")

    success, failed = 0, []

    for mp4_file in mp4_files:
        output_file = mp4_file.with_suffix(".webm")
        print(f"Converting: {mp4_file.name} -> {output_file.name}")

        cmd = [
            "ffmpeg",
            "-i", str(mp4_file),
            "-c:v", "libvpx-vp9",
            "-crf", "33",
            "-b:v", "0",
            "-c:a", "libopus",
            "-y",
            str(output_file)
        ]

        result = subprocess.run(cmd, capture_output=True, text=True)

        if result.returncode == 0:
            print(f"  Done!\n")
            success += 1
        else:
            print(f"  Failed! Error:\n{result.stderr[-500:]}\n")
            failed.append(mp4_file.name)

    print(f"Conversion complete: {success} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed files:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    convert_mp4_to_webm(folder)
