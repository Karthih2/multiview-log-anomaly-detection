"""Cut a large BGL log into a few smaller sample logs for uploading.

Each sample is one unbroken stretch of the original file, taken from a
different part of it. Lines are never shuffled or picked at random: the
pipeline learns from the order and timing of events, so a sample has to be a
real, continuous piece of the log.

For every sample the script picks, within its part of the file, the stretch
whose share of labelled anomalies is closest to the whole file's share, and
which also has anomalies in its last fifth (the part the pipeline holds back
for evaluation). So each sample has both normal and anomalous lines in a
realistic proportion.

Usage (from the project root):

    .venv\\Scripts\\python.exe scripts\\make_bgl_samples.py
    .venv\\Scripts\\python.exe scripts\\make_bgl_samples.py --copies 3 --lines 100000

Output goes to data/raw/samples/ with names like
    BGL_sample2of5_2005-07-09_to_2005-07-11_50000-lines_7.9pct-anomalies.log
"""
import argparse
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[1]
NORMAL_LABEL = b"-"          # first field of a BGL line that is not an alert
TAIL_FRACTION = 0.2          # share of a run the pipeline holds back as its test split
BLOCKS_PER_SAMPLE = 20       # how finely candidate start positions are spaced


def is_anomaly(line: bytes) -> bool:
    return line.split(None, 1)[0] != NORMAL_LABEL if line.strip() else False


def count_blocks(path: Path, block_lines: int) -> tuple[list[int], int]:
    """Anomaly count per block of `block_lines` lines, and the total line count."""
    counts, current, total = [], 0, 0
    with open(path, "rb") as f:
        for line in f:
            current += is_anomaly(line)
            total += 1
            if total % block_lines == 0:
                counts.append(current)
                current = 0
    return counts, total   # a final partial block is left out of the candidates


def choose_windows(counts: list[int], copies: int, block_lines: int, overall_rate: float) -> list[int]:
    """Start block of one window per region of the file."""
    tail_blocks = max(1, round(BLOCKS_PER_SAMPLE * TAIL_FRACTION))
    last_start = len(counts) - BLOCKS_PER_SAMPLE
    if last_start < copies - 1:
        raise SystemExit("The log is too short for that many samples of that size.")
    region = (last_start + 1) / copies
    starts = []
    for n in range(copies):
        candidates = range(int(n * region), max(int((n + 1) * region), int(n * region) + 1))

        def distance(start: int) -> tuple[bool, float]:
            window = counts[start:start + BLOCKS_PER_SAMPLE]
            rate = sum(window) / (BLOCKS_PER_SAMPLE * block_lines)
            has_tail = sum(window[-tail_blocks:]) > 0 and 0 < rate < 1
            return (not has_tail, abs(rate - overall_rate))   # windows with a usable tail sort first

        starts.append(min(candidates, key=distance))
    return starts


def line_date(line: bytes) -> str:
    """Third field of a BGL line is the date, written 2005.06.03."""
    return line.split(None, 3)[2].decode("ascii", "replace").replace(".", "-")


def write_samples(path: Path, out_dir: Path, starts: list[int], block_lines: int, lines: int) -> None:
    out_dir.mkdir(parents=True, exist_ok=True)
    ranges = sorted((start * block_lines, n) for n, start in enumerate(starts, 1))
    temp_paths, stats = {}, {}
    with open(path, "rb") as source:
        position = 0
        for first_line, n in ranges:
            for _ in range(first_line - position):
                source.readline()
            temp = out_dir / f"_sample{n}.part"
            anomalies, first, last = 0, b"", b""
            with open(temp, "wb") as out:
                for i in range(lines):
                    line = source.readline()
                    if i == 0:
                        first = line
                    last = line
                    anomalies += is_anomaly(line)
                    out.write(line)
            position = first_line + lines
            temp_paths[n] = temp
            stats[n] = (anomalies, line_date(first), line_date(last))

    copies = len(starts)
    for n in sorted(temp_paths):
        anomalies, first_date, last_date = stats[n]
        percent = 100 * anomalies / lines
        name = (f"{path.stem}_sample{n}of{copies}_{first_date}_to_{last_date}"
                f"_{lines}-lines_{percent:.1f}pct-anomalies.log")
        final = out_dir / name
        final.unlink(missing_ok=True)
        temp_paths[n].rename(final)
        print(f"  {name}\n      normal {lines - anomalies:,}   anomalies {anomalies:,} ({percent:.1f}%)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--source", type=Path, default=PROJECT_ROOT / "data" / "raw" / "BGL.log")
    parser.add_argument("--out", type=Path, default=PROJECT_ROOT / "data" / "raw" / "samples")
    parser.add_argument("--copies", type=int, default=5, help="how many sample files to make")
    parser.add_argument("--lines", type=int, default=50_000, help="lines per sample file")
    args = parser.parse_args()

    block_lines = args.lines // BLOCKS_PER_SAMPLE
    lines = block_lines * BLOCKS_PER_SAMPLE
    print(f"Reading {args.source} ...")
    counts, total = count_blocks(args.source, block_lines)
    overall_rate = sum(counts) / (len(counts) * block_lines)
    print(f"{total:,} lines, {100 * overall_rate:.2f}% labelled anomalies overall.")

    starts = choose_windows(counts, args.copies, block_lines, overall_rate)
    print(f"Writing {args.copies} samples of {lines:,} lines to {args.out}:")
    write_samples(args.source, args.out, starts, block_lines, lines)


if __name__ == "__main__":
    main()
