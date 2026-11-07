#!/usr/bin/env python3
"""
SmartPothole AI - Large-model training launcher v2 (CPU, auto-resume).

Trains a larger YOLO11 detector on ml/datasets/pothole-expanded.yaml.
Designed to survive interruptions (machine sleep / process kill):
  - checkpoints every N epochs (save_period)
  - on every (re)start, resumes from run weights/last.pt if present

Usage (idempotent; safe to re-run):
  python ml/training/train_v2.py [--model yolo11m.pt] [--epochs 60] ...
"""
import argparse
import sys
import time
import traceback
from pathlib import Path

from ultralytics import YOLO


def parse_args():
    ap = argparse.ArgumentParser()
    ap.add_argument("--model", default="yolo11m.pt", help="pretrained weights to start from")
    ap.add_argument("--data", default="ml/datasets/pothole-expanded.yaml")
    ap.add_argument("--epochs", type=int, default=60)
    ap.add_argument("--batch", type=int, default=32)
    ap.add_argument("--imgsz", type=int, default=640)
    ap.add_argument("--workers", type=int, default=12)
    ap.add_argument("--patience", type=int, default=15)
    ap.add_argument("--save-period", type=int, default=2)
    ap.add_argument("--project", default="ml/training/runs")
    ap.add_argument("--name", default="pothole-detect-v2-xlarge")
    ap.add_argument("--cache", default="disk")
    ap.add_argument("--log", default=r"C:\Users\ayush\AppData\Local\Temp\opencode\train-v2.log")
    return ap.parse_args()


def log(msg, path):
    line = f"[{time.strftime('%Y-%m-%d %H:%M:%S')}] {msg}"
    print(line, flush=True)
    with open(path, "a", encoding="utf-8") as f:
        f.write(line + "\n")


def norm_cache(v):
    return {"disk": "disk", "ram": "ram"}.get(v, False)


def main():
    args = parse_args()
    cache = norm_cache(args.cache)
    # Ultralytics 8.4 joins relative project paths onto runs/detect/ - always
    # pass an absolute project dir so save_dir is exactly what we expect.
    project_abs = (Path.cwd() / args.project).resolve()
    run_dir = project_abs / args.name
    last_pt = run_dir / "weights" / "last.pt"
    best_pt = run_dir / "weights" / "best.pt"

    for attempt in range(1, 200):
        try:
            if last_pt.exists():
                log(f"attempt {attempt}: RESUMING from {last_pt}", args.log)
                ym = YOLO(str(last_pt))
                ym.train(resume=True)
            else:
                log(
                    f"attempt {attempt}: fresh start model={args.model} epochs={args.epochs} "
                    f"batch={args.batch} imgsz={args.imgsz} workers={args.workers} cache={cache}",
                    args.log,
                )
                ym = YOLO(args.model)
                ym.train(
                    data=args.data,
                    epochs=args.epochs,
                    batch=args.batch,
                    imgsz=args.imgsz,
                    device="cpu",
                    workers=args.workers,
                    cache=cache,
                    patience=args.patience,
                    save_period=args.save_period,
                    project=str(project_abs),
                    name=args.name,
                    seed=0,
                    cos_lr=True,
                    plots=True,
                )
            # train() returned normally: either finished or early-stopped
            log(f"train() returned. best={best_pt.exists()} last={last_pt.exists()}", args.log)
            if best_pt.exists():
                log("TRAINING COMPLETE (best.pt present)", args.log)
                return
            log("no best.pt yet -> retrying", args.log)
        except KeyboardInterrupt:
            log("interrupted by user", args.log)
            return
        except Exception as e:
            log(f"attempt {attempt} crashed: {type(e).__name__}: {str(e)[:300]}", args.log)
            traceback.print_exc()
            time.sleep(20)
    log("gave up after max attempts", args.log)


if __name__ == "__main__":
    main()
