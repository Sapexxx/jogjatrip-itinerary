#!/usr/bin/env python3
"""Audit explicit foreground/background pairs; computed browser contrast is separate."""
import argparse
import pathlib
import re
import sys

ROOT = pathlib.Path(__file__).resolve().parents[1]
BASELINE = [
    ("section tag", "#b57943", "#f8f9f6"),
    ("tile description", "#7e8983", "#ffffff"),
    ("tile label", "#8c9a91", "#ffffff"),
    ("footer", "#819087", "#ffffff"),
    ("service indicator", "#87918b", "#ffffff"),
    ("summary note", "#8a918b", "#ffffff"),
    ("white on old amber", "#ffffff", "#e39c56"),
]
PAIRS = [
    ("body", "ink", "paper"),
    ("body on white", "ink", "white"),
    ("muted paper", "muted", "paper"),
    ("muted white", "muted", "white"),
    ("muted cream", "muted", "cream"),
    ("section tag", "amber-text", "paper"),
    ("section tag white", "amber-text", "white"),
    ("section tag cream", "amber-text", "cream"),
    ("primary button", "white", "green-700"),
    ("amber button", "ink", "amber-500"),
    ("hero", "white", "green-900"),
    ("hero muted", "green-100", "green-900"),
    ("success", "ok-fg", "ok-bg"),
    ("warning", "warn-fg", "warn-bg"),
    ("error", "err-fg", "err-bg"),
]
def luminance(hex_color):
    s = hex_color.lstrip("#")
    if len(s) == 3:
        s = "".join(c * 2 for c in s)
    c = [int(s[i:i+2], 16) / 255 for i in (0, 2, 4)]
    v = [x/12.92 if x <= .04045 else ((x+.055)/1.055)**2.4 for x in c]
    return sum(a*b for a,b in zip(v,(.2126,.7152,.0722)))
def ratio(a,b):
    x,y = sorted((luminance(a), luminance(b)))
    return (y+.05)/(x+.05)
def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--baseline", action="store_true")
    args = parser.parse_args()
    pairs = BASELINE
    if not args.baseline:
        tokens = dict(re.findall(r"--([\w-]+)\s*:\s*(#[0-9a-fA-F]{3,6})\s*;", (ROOT/"cloudflare/web/tokens.css").read_text()))
        pairs = [(label,tokens[a],tokens[b]) for label,a,b in PAIRS]
    failures = 0
    for label,a,b in pairs:
        r = ratio(a,b)
        failures += r < 4.5
        print(f"{'PASS' if r >= 4.5 else 'FAIL'} {label}: {r:.2f}:1 ({a} / {b})")
    print(f"{len(pairs)-failures}/{len(pairs)} declared pairs passed")
    return 1 if failures else 0
if __name__ == "__main__":
    sys.exit(main())
