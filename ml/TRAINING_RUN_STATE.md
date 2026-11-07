# Large-Model Training Run — State & Resume Guide

Everything needed to stop this work at any point and resume later with zero loss.

## Current run (v2 — the "much larger model" retrain)

| Item | Value |
|---|---|
| Goal | Fix under-detection (missed potholes) in image / video / live modes |
| Model | `yolo11m.pt` (COCO-pretrained, ~20M params — ~8x the deployed nano) |
| Dataset | `ml/datasets/pothole-expanded.yaml` — 3707 train / 411 valid (positives ~3953, ~4.9x original; sources: raw mirror + rupesh002 + MWPD, content-hash deduped, seed 0) |
| Golden test | `ml/datasets/pothole-expanded/golden/` (100 imgs) — NEVER trained on; used only for honest before/after eval |
| Hparams | epochs 45 (early stop patience 12), batch 16, imgsz 640, CPU, workers 6, cos_lr, seed 0, save_period 2 |
| Pace | ~55–75 min/epoch on this machine → full run ≈ 1.7–2.5 days |
| Run dir | `ml/training/runs/pothole-detect-v2-xlarge/` |
| Baseline to beat | deployed nano on golden split: mAP50 **0.361**, mAP50-95 **0.115**, P **0.504**, R **0.349**; image recall 91%/85%/74% @ conf 0.15/0.25/0.35 |

## Checkpoints (all under `ml/training/runs/pothole-detect-v2-xlarge/weights/`)

| File | Meaning |
|---|---|
| `last.pt` | End of the most recent completed epoch — **the resume point**, rewritten every epoch |
| `best.pt` | Best validation mAP seen so far — usable for deployment at ANY time, improves as training progresses |
| `epoch2.pt`, `epoch4.pt`, … | Milestone snapshots every 2 epochs (safety net if `last.pt` ever corrupts) |

**Resume tested end-to-end (2026-11-07):** trainer killed mid-epoch-2 → watchdog relaunched it → log shows `RESUMING from ...last.pt` → training continued at epoch 2 without restarting.

## How to resume (3 options)

1. **Do nothing** — the watchdog (`train-watchdog.ps1`, launched detached) relaunches training automatically within ~5 min if the process dies, resuming from `last.pt`. It exits itself once training completes (`best.pt` final + `train()` returned).
2. **Manual resume** (after killing everything, reboot, etc.):
   ```powershell
   cd "C:\Users\ayush\OneDrive\Desktop\AI Pothole Detection"
   Start-Process -FilePath python -ArgumentList ('"{0}" --model yolo11m.pt --data "{1}\ml\datasets\pothole-expanded.yaml" --epochs 45 --batch 16 --workers 6 --cache none --save-period 2' -f "$PWD\ml\training\train_v2.py", $PWD) -WindowStyle Hidden
   ```
   The wrapper detects `weights/last.pt` and calls `YOLO(last.pt).train(resume=True)` — continues at the exact epoch it stopped.
3. **Watchdog restart**:
   ```powershell
   Start-Process powershell -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','C:\Users\ayush\AppData\Local\Temp\opencode\train-watchdog.ps1' -WindowStyle Hidden
   ```

## How to check progress

```powershell
Get-Content ml\training\runs\pothole-detect-v2-xlarge\results.csv -Tail 5   # per-epoch metrics
Get-Content C:\Users\ayush\AppData\Local\Temp\opencode\train-v2-out.log -Tail 3
Get-Content C:\Users\ayush\AppData\Local\Temp\opencode\train-v2.log         # launcher/resume history
Get-Content C:\Users\ayush\AppData\Local\Temp\opencode\watchdog.log -Tail 5 # auto-restart history
```

## How to stop everything cleanly (safe anytime)

```powershell
Get-CimInstance Win32_Process -Filter "Name='powershell.exe'" | Where-Object { $_.CommandLine -like '*train-watchdog*' } | Stop-Process -Force
Get-CimInstance Win32_Process -Filter "Name='python.exe'" | Where-Object { $_.CommandLine -like '*train_v2*' } | Stop-Process -Force
```
Killing mid-epoch loses only the in-flight epoch (at most ~1h); `last.pt` from the previous epoch is intact.

## After training (or anytime best.pt beats baseline) — evaluation & deployment

1. Evaluate vs baseline (golden split, same protocol):
   ```powershell
   cd "C:\Users\ayush\OneDrive\Desktop\AI Pothole Detection"
   python C:\Users\ayush\AppData\Local\Temp\opencode\eval_candidate.py --model ml\training\runs\pothole-detect-v2-xlarge\weights\best.pt
   ```
   (eval script also at pattern in temp dir; compares against baseline numbers above)
2. If better: back up old weights → deploy → restart service:
   ```powershell
   Copy-Item ai-service\models\best.pt ai-service\models\best-nano-v1.pt
   Copy-Item ml\training\runs\pothole-detect-v2-xlarge\weights\best.pt ai-service\models\best.pt -Force
   # restart AI service (uvicorn on :8000), then verify /api/ai/health + image/video/live e2e
   ```
3. Retune operating points from the golden P/R sweep (conf default in `ai-service/.env` → `AI_CONFIDENCE_THRESHOLD`), considering TTA / larger inference imgsz for small potholes; re-verify e2e.
4. Update `ml/TRAINING_RESULTS.md` with v2 honest numbers; commit scripts + docs (dataset itself stays local, gitignored).

## Services (independent of training)

- Frontend :3000 — `npm run dev` (frontend/)
- AI service :8000 — uvicorn `app.main:app` (ai-service/) — stays live during training; inference is slower under CPU contention but works.
- Frontend proxy: `/api/ai/*` → AI service (secret via `X-AI-Service-Secret`).

## Notes

- `ml/datasets/pothole-expanded*` is gitignored (rebuild with `python ml/scripts/build_expanded_dataset.py`; raw sources cached in `%TEMP%\opencode\dldata`).
- Nothing about this run blocks normal app usage; the deployed nano keeps serving until the new model is evaluated and swapped in.
