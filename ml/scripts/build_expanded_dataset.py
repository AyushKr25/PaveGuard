#!/usr/bin/env python3
"""
Build the expanded pothole detection dataset.

Merges every available source into a single YOLO dataset:

Positives (labeled pothole boxes, class 0):
  - ml/datasets/raw/pothole-yolov8/{train,valid}   (Roboflow mirror A)
  - <temp>/rupesh002/pothole.v1i.yolov4pytorch     (Roboflow mirror B)
  - <temp>/mwpd (MWPD.zip)                         (if present)

Negatives (no boxes -> background roads):
  - sections of the old assembled dataset containing empty label files

Golden test (never trained on):
  - ml/datasets/raw/pothole-yolov8/test  -> copied verbatim

Output:
  ml/datasets/pothole-expanded/{train,valid}/{images,labels}
  ml/datasets/pothole-expanded/golden/{images,labels}   (copy of the old test split)
  ml/datasets/pothole-expanded.yaml
"""

import hashlib
import shutil
import sys
from pathlib import Path

ROOT = Path.cwd()
RAW = ROOT / "ml/datasets/raw/pothole-yolov8"
OLD = ROOT / "ml/datasets/pothole"
OUT = ROOT / "ml/datasets/pothole-expanded"
DL = Path(r"C:/Users/ayush/AppData/Local/Temp/opencode/dldata")

RUPESH = DL / "rupesh002/pothole.v1i.yolov4pytorch"
MUPD = DL / "mwpd"  # extracted root, inspected at runtime

SEED = 0


def file_hash(p: Path) -> str:
    h = hashlib.md5()
    with open(p, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def collect_sources():
    """Yield (image_path, label_path_or_None, source_name) for every usable image."""
    sources = []

    for split in ("train", "valid"):
        img_dir = RAW / split / "images"
        lbl_dir = RAW / split / "labels"
        for img in sorted(img_dir.glob("*")):
            if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                continue
            sources.append((img, lbl_dir / (img.stem + ".txt"), f"raw-{split}"))

    if RUPESH.exists():
        for split in ("train", "valid"):
            img_dir = RUPESH / split / "images"
            lbl_dir = RUPESH / split / "labels"
            for img in sorted(img_dir.glob("*")):
                if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    continue
                sources.append((img, lbl_dir / (img.stem + ".txt"), f"rupesh-{split}"))
    else:
        print(f"  [skip] rupesh002 not found at {RUPESH}")

    if MUPD.exists():
        found = _collect_mwpd()
        sources.extend(found)
        print(f"  mwpd: {len(found)} images")
    else:
        print("  [skip] mwpd not present")

    return sources


def _collect_mwpd():
    """Best-effort collect images+labels from the MWPD extraction.

    Supports YOLO-relatives (images/labels pairs at any depth) and
    flat folders where images sit next to identically-stemmed .txt files.
    """
    out = []
    img_ext = {".jpg", ".jpeg", ".png", ".webp"}
    # depth scan for images/<...> folders with a sibling labels folder
    for img_dir in MUPD.rglob("images"):
        lbl_dir = img_dir.parent / "labels"
        if not lbl_dir.exists():
            continue
        n = 0
        for img in sorted(img_dir.glob("*")):
            if img.suffix.lower() not in img_ext:
                continue
            out.append((img, lbl_dir / (img.stem + ".txt"), "mwpd"))
            n += 1
        if n:
            print(f"    mwpd dir {img_dir.relative_to(MUPD)}: {n}")
    return out


def main():
    import random

    print("Collecting source images ...")
    sources = collect_sources()
    print(f"raw/rupesh/mwpd candidates: {len(sources)}")

    # Split into positives and negatives based on label content
    positives, negatives, seen = [], [], {}
    for img, lbl, src in sources:
        h = file_hash(img)
        if h in seen:
            continue  # dedupe identical files across mirrors
        seen[h] = str(img)

        has_boxes = lbl is not None and lbl.exists() and lbl.stat().st_size > 1
        if has_boxes:
            positives.append((img, lbl, src))
        else:
            negatives.append((img, None, src))

    # Negatives from the old assembled dataset (empty/missing labels)
    if OLD.exists():
        extra_neg = 0
        for split in ("train", "valid"):
            img_dir = OLD / split / "images"
            lbl_dir = OLD / split / "labels"
            for img in sorted(img_dir.glob("*")):
                if img.suffix.lower() not in {".jpg", ".jpeg", ".png", ".webp"}:
                    continue
                h = file_hash(img)
                if h in seen:
                    continue
                seen[h] = str(img)
                lbl = lbl_dir / (img.stem + ".txt")
                if not lbl.exists() or lbl.stat().st_size <= 1:
                    negatives.append((img, None, f"old-{split}"))
                    extra_neg += 1
        print(f"  old-dataset negatives: {extra_neg}")

    print(f"positives: {len(positives)}  negatives: {len(negatives)}")

    # Deterministic split: 90% train / 10% valid for each group
    random.seed(SEED)
    random.shuffle(positives)
    random.shuffle(negatives)
    p_val = max(1, int(len(positives) * 0.10))
    n_val = max(1, int(len(negatives) * 0.10))
    train_items = positives[:len(positives) - p_val] + negatives[:len(negatives) - n_val]
    val_items = positives[len(positives) - p_val:] + negatives[len(negatives) - n_val:]

    # Build output dirs
    for sub in ("train", "valid", "golden"):
        (OUT / sub / "images").mkdir(parents=True, exist_ok=True)
        (OUT / sub / "labels").mkdir(parents=True, exist_ok=True)
        for f in (OUT / sub / "images").glob("*"):
            f.unlink()
        for f in (OUT / sub / "labels").glob("*"):
            f.unlink()

    def stage(items, split):
        used = set()
        w_img = OUT / split / "images"
        w_lbl = OUT / split / "labels"
        for img, lbl, src in items:
            src_tag = src.split("-")[0][:5]
            dst_img = w_img / f"{src_tag}_{img.name}"
            if dst_img.name in used:
                continue
            used.add(dst_img.name)
            shutil.copy2(img, dst_img)
            if lbl is not None and lbl.exists():
                shutil.copy2(lbl, w_lbl / f"{src_tag}_{img.stem}.txt")

    stage(train_items, "train")
    stage(val_items, "valid")

    # Golden test = old raw test split, copied verbatim
    for img in sorted((RAW / "test" / "images").glob("*")):
        shutil.copy2(img, OUT / "golden" / "images" / img.name)
    for lbl in sorted((RAW / "test" / "labels").glob("*")):
        shutil.copy2(lbl, OUT / "golden" / "labels" / lbl.name)

    golden_n = len([f for f in (OUT / "golden" / "images").glob("*") if f.is_file()])

    # Dataset yaml
    yaml_text = f"""# SmartPothole AI - Expanded pothole detection dataset (YOLO format)
#
# Merged from:
#   - Roboflow mirror A (Ryukijano/Pothole-detection-Yolov8, CC BY 4.0)
#   - Roboflow mirror B (rupesh002/pothole-detection-dataset)
#   - MWPD (sumadixSk/pothole-dataset)  [optional, if present]
# Plus background/negative road images. Content-hash deduped.
#
# The 'golden' split is the original, never-trained-on test set
# and is used only for final before/after evaluation.

path: {OUT.as_posix()}
train: train/images
val: valid/images
test: golden/images

nc: 1
names:
  0: pothole
"""
    (ROOT / "ml/datasets/pothole-expanded.yaml").write_text(yaml_text)

    tr_imgs = len([f for f in (OUT / "train" / "images").glob("*") if f.is_file()])
    tr_lbls = len([f for f in (OUT / "train" / "labels").glob("*") if f.is_file()])
    va_imgs = len([f for f in (OUT / "valid" / "images").glob("*") if f.is_file()])
    va_lbls = len([f for f in (OUT / "valid" / "labels").glob("*") if f.is_file()])
    tr_boxes = sum(1 for f in (OUT / "train" / "labels").glob("*.txt") if f.stat().st_size > 1)
    va_boxes = sum(1 for f in (OUT / "valid" / "labels").glob("*.txt") if f.stat().st_size > 1)

    print()
    print("=== Expanded dataset ready ===")
    print(f"  train : {tr_imgs} images ({tr_lbls} label files, {tr_boxes} with boxes)")
    print(f"  valid : {va_imgs} images ({va_lbls} label files, {va_boxes} with boxes)")
    print(f"  golden: {golden_n} images")
    print(f"  yaml  : ml/datasets/pothole-expanded.yaml")


if __name__ == "__main__":
    main()
