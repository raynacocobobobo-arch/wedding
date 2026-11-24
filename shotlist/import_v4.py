#!/usr/bin/env python3
"""Audit and import the Enwan V4 shotlist into this directory, without touching the parent site."""
import argparse
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import shutil
import stat
import tempfile
from urllib.parse import unquote, urlsplit
from zipfile import ZipFile
from html.parser import HTMLParser

DEST = Path(__file__).resolve().parent
RESERVED = {"import_v4.py", "IMPORT.md", "v4-audit.json"}
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".webp", ".gif", ".bmp", ".svg", ".avif"}

def safe_name(name):
    if "\\" in name or name.startswith("/") or ":" in name or any(ord(c) < 32 for c in name):
        raise ValueError("Unsafe ZIP path: " + repr(name))
    parts = name.rstrip("/").split("/")
    if any(p in ("", ".", "..") for p in parts):
        raise ValueError("Unsafe ZIP path: " + repr(name))
    return "/".join(parts)

def inventory(z, v4):
    files = {}
    seen = set()
    total = 0
    for entry in z.infolist():
        name = safe_name(entry.filename)
        if stat.S_ISLNK(entry.external_attr >> 16):
            raise ValueError("Symbolic links not allowed: " + name)
        if entry.is_dir():
            continue
        if name.casefold() in seen:
            raise ValueError("Duplicate or case-conflicting path: " + name)
        seen.add(name.casefold())
        if entry.flag_bits & 1:
            raise ValueError("Encrypted entry: " + name)
        total += entry.file_size
        if total > 2_000_000_000:
            raise ValueError("Uncompressed size exceeds 2 GB")
        files[name] = entry
    roots = []
    for name in files:
        if name.endswith("index.html") and PurePosixPath(name).name == "index.html":
            prefix = name[:-len("index.html")]
            if prefix + "data.js" in files or prefix + "data-bride.js" in files:
                if not v4 or prefix + "v4-guide-data.json" in files:
                    roots.append(prefix)
    if len(roots) != 1:
        raise ValueError("Expected exactly one shotlist root; got " + repr(roots))
    root = roots[0]
    return {k[len(root):]: v for k, v in files.items() if k.startswith(root)}

def digest(z, entry):
    h = hashlib.sha256()
    with z.open(entry) as src:
        for chunk in iter(lambda: src.read(1024 * 1024), b""):
            h.update(chunk)
    return h.hexdigest()

class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.refs = []
    def handle_starttag(self, tag, attrs):
        for key, value in attrs:
            if value and ((key == "src" and tag in ("img", "script", "source")) or
                          (key == "href" and tag in ("a", "link"))):
                self.refs.append(value)

def local_path(value, origin=""):
    parsed = urlsplit(value)
    if parsed.scheme or parsed.netloc or not parsed.path:
        return None
    value = unquote(parsed.path)
    if value.startswith("/"):
        return None
    p = PurePosixPath(origin).parent / value
    stack = []
    for part in p.parts:
        if part == "..":
            if not stack:
                raise ValueError("Reference escapes site root: " + value)
            stack.pop()
        elif part != ".":
            stack.append(part)
    return "/".join(stack)

def audit(z, entries, baseline=None):
    errors, warnings = [], []
    for required in ("index.html", "v4-guide.html", "v4-guide-data.json", "data.js", "data-bride.js"):
        if required not in entries:
            errors.append("Missing file: " + required)
    for key in entries:
        if key in RESERVED:
            errors.append("Archive conflicts with import helper: " + key)
    hashes = {name: digest(z, e) for name, e in entries.items()}
    report = {"files": len(entries), "image_files": sum(PurePosixPath(k).suffix.lower() in IMAGE_EXT for k in entries),
              "baseline_verified": False}
    if baseline:
        with ZipFile(baseline) as old:
            original = inventory(old, False)
            removed = [name for name in original if name not in entries]
            changed = [name for name in original if name in entries and name != "index.html" and
                       digest(old, original[name]) != hashes[name]]
            report.update({"baseline_files": len(original), "removed_original_files": removed,
                           "changed_original_files_excluding_index": changed,
                           "baseline_verified": not removed and not changed})
            if removed or changed:
                errors.append("Original V3 files are missing or changed; import blocked.")
    else:
        warnings.append("No V3 ZIP provided. Original-file preservation is not independently verified.")
    cards = json.loads(z.read(entries["v4-guide-data.json"])) if "v4-guide-data.json" in entries else []
    if not isinstance(cards, list):
        raise ValueError("V4 manifest must be a list")
    ids = set()
    categories = {}
    empty, short, repeated, excess = [], [], [], []
    used = set()
    for card in cards:
        cid = str(card.get("id", ""))
        if not cid or cid in ids:
            errors.append("Missing or duplicate card ID: " + cid)
        ids.add(cid)
        cat = str(card.get("cat", ""))
        categories[cat] = categories.get(cat, 0) + 1
        images = card.get("images", [])
        if not isinstance(images, list):
            errors.append(cid + ": images must be a list")
            continue
        if not images:
            empty.append(cid)
        elif len(images) < 4:
            short.append(cid)
        elif len(images) > 5:
            excess.append(cid)
        image_hashes = []
        for ref in images:
            path = local_path(ref)
            if path is None or path not in entries or PurePosixPath(path).suffix.lower() not in IMAGE_EXT:
                errors.append(cid + ": missing or invalid image " + str(ref))
            else:
                used.add(path)
                image_hashes.append(hashes[path])
        if len(set(image_hashes)) != len(image_hashes):
            repeated.append(cid)
    for page in ("index.html", "v4-guide.html"):
        if page not in entries:
            continue
        html = z.read(entries[page]).decode("utf-8-sig")
        parser = References()
        parser.feed(html)
        for ref in parser.refs:
            path = local_path(ref, page)
            if path and path not in entries and path + "/index.html" not in entries:
                errors.append(page + ": broken local reference " + ref)
        if page == "index.html" and "v4-guide.html" not in parser.refs:
            errors.append("Home page missing V4 guide link")
    sw = z.read(entries["sw.js"]).decode("utf-8", errors="replace") if "sw.js" in entries else ""
    if "v4-guide.html" not in sw or "v4-assets/" not in sw:
        warnings.append("V4 guide and assets are not explicitly listed in service-worker source. Full offline coverage requires device testing.")
    if empty or short or excess:
        warnings.append("Some cards do not meet the 4–5 image target; inspect card IDs below.")
    if repeated:
        warnings.append("Some cards contain byte-identical images.")
    report.update({"cards": len(cards), "categories": categories, "unique_referenced_images": len(used),
                   "unique_referenced_image_hashes": len({hashes[p] for p in used}),
                   "empty_cards": empty, "under_four_images": short, "over_five_images": excess,
                   "duplicate_image_cards": repeated, "errors": errors, "warnings": warnings,
                   "visual_review": "Not automated: verify action relevance, diversity, and continuous-frame order manually."})
    return report, hashes

def import_site(z, entries, hashes):
    # Stage all files before moving them. Only write within this dedicated subdirectory.
    with tempfile.TemporaryDirectory(prefix="enwan-v4-") as temp:
        stage = Path(temp)
        for name, info in entries.items():
            out = stage / name
            out.parent.mkdir(parents=True, exist_ok=True)
            with z.open(info) as src, out.open("wb") as dst:
                shutil.copyfileobj(src, dst)
        # Refuse overwriting different existing files or traversing symbolic links.
        for name in entries:
            target = DEST / name
            if any(p.is_symlink() for p in [target, *target.parents] if p != DEST.parent):
                raise ValueError("Symlink in destination: " + name)
            if target.exists() and (not target.is_file() or hashlib.sha256(target.read_bytes()).hexdigest() != hashes[name]):
                raise ValueError("Different existing destination file; backup and resolve manually: " + name)
            for parent in target.parents:
                if parent == DEST:
                    break
                if parent.exists() and not parent.is_dir():
                    raise ValueError("Non-directory destination parent: " + str(parent))
        for name in entries:
            target = DEST / name
            target.parent.mkdir(parents=True, exist_ok=True)
            if not target.exists():
                shutil.copy2(stage / name, target)

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("v4_zip", type=Path)
    parser.add_argument("--baseline", type=Path, help="V3 ZIP for exact original-file comparison")
    parser.add_argument("--apply", action="store_true", help="Import into shotlist/ after successful audit")
    args = parser.parse_args()
    with ZipFile(args.v4_zip) as z:
        entries = inventory(z, True)
        report, hashes = audit(z, entries, args.baseline)
        print(json.dumps(report, ensure_ascii=False, indent=2))
        if report["errors"]:
            raise SystemExit("Audit failed; no files imported.")
        if args.apply:
            if not report["baseline_verified"]:
                raise SystemExit("Provide --baseline for an import that verifies preservation.")
            import_site(z, entries, hashes)
            (DEST / "v4-audit.json").write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
            print("Imported into", DEST, "\nReview warnings, then commit the shotlist directory.")

if __name__ == "__main__":
    main()
