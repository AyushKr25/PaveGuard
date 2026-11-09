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

## Interim golden-split evals (never-trained golden, imgsz 640, conf sweep iou 0.45)

Baseline (deployed nano): mAP50 0.361 | mAP50-95 0.115 | P 0.504 | R 0.349 | image recall 91%/85%/74% @ conf 0.15/0.25/0.35

| Checkpoint | mAP50 | mAP50-95 | P | R | recall@0.15/0.25/0.35 |
|---|---|---|---|---|---|
| epoch-6 best.pt (2026-11-08) | 0.361 | 0.133 | 0.477 | 0.372 | 96% / 78% / 60% |
| epoch-10/11 best.pt (2026-11-08) | 0.401 | 0.170 | 0.495 | 0.375 | 90% / 77% / 65% |

FP on valid-split backgrounds (16 imgs, imgsz 640): nano 0/16 @0.25 (1/16 @0.10-0.20) vs
v2 2/16 @0.25, 4/16 @0.20, 6/16 @0.15, 6/16 @0.10. v2 is better-calibrated (probability
mass shifted to lower conf) -> NOT deployed at interim stage; deploy when operating-point
recall AND precision clearly dominate, then retune conf (likely 0.15-0.20) with FP re-check.

## Reliability lessons (2026-11-09)

- **Keep the laptop PLUGGED IN while training runs.** Overnight holes (~11.5h) happened
  twice because the machine was unplugged: battery drain -> critical-battery hibernate
  overrides the keep-awake assertion; a second unplug event also killed processes.
- System keep-awake (SetThreadExecutionState ES_SYSTEM_REQUIRED) is asserted by the
  watchdog while training runs — it prevents idle sleep but NOT critical-battery
  hibernate, and it is cleared as soon as training completes.
- Watchdog runs detached AND as scheduled task 'PaveGuard-TrainWatchdog' (every 5 min,
  battery-allowed, unlimited runtime, lockfile single-instance). If both die, relaunch
  with the manual resume command below, or `schtasks /Run /TN PaveGuard-TrainWatchdog`.
- Position: training resumed 2026-11-09 13:50 from epoch 12 (val mAP50 0.503); epoch 13 re-running.

Deploy only when the operating-point numbers (recall @0.25 with acceptable precision) clearly beat baseline.

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
