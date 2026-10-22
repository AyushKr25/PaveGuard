# Pothole Detection Model — Training Results (v1, 2026-10-15)

The first real trained model for SmartPothole AI. Replaces the DEMO mock
detector (which faked one pothole in every frame — the reason clean roads
showed detections).

## Data

| Split | Positive (pothole) | Negative (clean road, empty labels) | Total |
|-------|-------------------:|------------------------------------:|------:|
| train | 100 | 100 | 200 |
| valid | 100 | 65 | 165 |

Sources (both CC BY 4.0, Roboflow Universe exports):
- Positives: `Ryukijano/Pothole-detection-Yolov8` (Hugging Face mirror of
  universe.roboflow.com/project-ssayl/potholes-detection-d4rma v1)
- Negatives: `taroii/pothole-detection` "no pothole" splits (Hugging Face)

Raw copies: `ml/datasets/raw/` (gitignored). Assembled YOLO dataset:
`ml/datasets/pothole/` with config `ml/datasets/pothole-dataset.yaml`.

## Training

- Model: `yolo11n.pt` (COCO-pretrained, transfer learning, detect task)
- 119 epochs (early stopping, patience 25), batch 8, imgsz 640, CPU
  (AMD Ryzen AI 9 465), ~1.85 h wall time
- Command: `python ml/training/train.py --data ml/datasets/pothole-dataset.yaml
  --model yolo11n.pt --epochs 120 --batch 8 --device cpu --workers 8
  --patience 25 --pretrained`
- Run artifacts: `ml/training/runs/pothole-detect-v1/` (gitignored except
  this summary)

yolo11s was benchmarked at ~232 s/epoch vs ~65 s/epoch for yolo11n on this
CPU; for a 100-positive-image dataset, more epochs on the nano model was the
better accuracy-per-hour trade-off.

## Measured results (honest numbers, val split incl. 65 negatives)

| Metric | Value |
|---|---|
| Precision | 0.491 |
| Recall | 0.402 |
| mAP@0.5 | **0.409** |
| mAP@0.5:0.95 | 0.150 |
| Clean-road images falsely flagged (conf ≥ 0.25) | 1 / 65 (1.5%) |
| Pothole images with ≥1 detection (conf ≥ 0.25) | 93 / 100 |
| Inference speed (CPU) | ~29–45 ms/frame |

## Honest limitations

- mAP50 of 0.41 is moderate, not production-grade. With only 100 unique
  positive training images, rare/small/distant potholes are missed
  (recall 0.40). Bigger datasets (e.g. RDD2022, thousands of images) and a
  GPU would substantially improve this.
- Severity is an AI-estimated heuristic from bbox size/position — it is not
  a certified engineering measurement (labeled as such in the app).
- False positives are rare but not zero; raising the confidence threshold
  trades recall for precision. Defaults: conf 0.25, IoU 0.45.

## Deployment

- Weights: `ai-service/models/best.pt`
- `ai-service/.env`: `ENABLE_DEMO_MODE=false`, `AI_MODEL_TYPE=detect`,
  `ENABLE_SEGMENTATION=false`
- Verified end-to-end: clean-road video → 0 unique potholes through the full
  video pipeline; 10/10 sample pothole val images detected via `/predict/image`.
