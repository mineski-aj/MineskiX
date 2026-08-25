import subprocess
import sys
from pathlib import Path


def convert_mov_to_webm(folder: str):
    folder_path = Path(folder)

    if not folder_path.is_dir():
        print(f"Error: '{folder}' is not a valid directory.")
        sys.exit(1)

    mov_files = list(folder_path.glob("*.mov")) + list(folder_path.glob("*.MOV"))

    if not mov_files:
        print("No .mov files found in the folder.")
        return

    print(f"Found {len(mov_files)} .mov file(s). Starting conversion...\n")

    success, failed = 0, []

    for mov_file in mov_files:
        output_file = mov_file.with_suffix(".webm")
        print(f"Converting: {mov_file.name} -> {output_file.name}")

        # Always use yuva420p — handles both alpha and non-alpha sources safely
        # auto-alt-ref 0 is required for VP9 alpha encoding
        cmd = [
            "ffmpeg",
            "-i", str(mov_file),
            "-vf", "format=yuva420p",
            "-c:v", "libvpx-vp9",
            "-crf", "33",
            "-b:v", "0",
            "-auto-alt-ref", "0",
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
            failed.append(mov_file.name)

    print(f"Conversion complete: {success} succeeded, {len(failed)} failed.")
    if failed:
        print("Failed files:")
        for f in failed:
            print(f"  - {f}")


if __name__ == "__main__":
    folder = sys.argv[1] if len(sys.argv) > 1 else "."
    convert_mov_to_webm(folder)
