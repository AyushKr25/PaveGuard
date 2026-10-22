#!/usr/bin/env python3
"""
SmartPothole AI - Evaluation Script
Evaluate trained model on test set
"""

import argparse
from pathlib import Path
from ultralytics import YOLO
import json


def parse_args():
    parser = argparse.ArgumentParser(description="Evaluate pothole detection model")
    parser.add_argument("--model", type=str, required=True, help="Path to trained model (best.pt)")
    parser.add_argument("--data", type=str, default="ml/datasets/dataset.yaml", help="Dataset config path")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--device", type=str, default="auto", help="Device")
    parser.add_argument("--conf", type=float, default=0.25, help="Confidence threshold")
    parser.add_argument("--iou", type=float, default=0.45, help="IoU threshold")
    parser.add_argument("--output", type=str, default="ml/evaluation/results.json", help="Output JSON path")
    parser.add_argument("--plots", action="store_true", help="Generate plots")
    return parser.parse_args()


def main():
    args = parse_args()
    
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        return
    
    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Dataset config not found: {data_path}")
        return
    
    print(f"Evaluating model: {model_path}")
    print(f"Dataset: {data_path}")
    
    # Load model
    model = YOLO(str(model_path))
    
    # Run validation
    metrics = model.val(
        data=str(data_path),
        imgsz=args.imgsz,
        batch=args.batch,
        device=args.device,
        conf=args.conf,
        iou=args.iou,
        plots=args.plots,
    )
    
    # Compile results
    results = {
        "model": str(model_path),
        "dataset": str(data_path),
        "image_size": args.imgsz,
        "confidence_threshold": args.conf,
        "iou_threshold": args.iou,
        "metrics": {
            "mAP50": float(metrics.box.map50),
            "mAP50-95": float(metrics.box.map),
            "precision": float(metrics.box.mp),
            "recall": float(metrics.box.mr),
            "f1": float(2 * metrics.box.mp * metrics.box.mr / (metrics.box.mp + metrics.box.mr)) if (metrics.box.mp + metrics.box.mr) > 0 else 0.0,
        },
        "per_class": {},
    }
    
    # Per-class metrics if available
    if hasattr(metrics.box, 'ap50') and metrics.box.ap50 is not None:
        for i, (ap50, ap) in enumerate(zip(metrics.box.ap50, metrics.box.ap)):
            results["per_class"][f"class_{i}"] = {
                "ap50": float(ap50),
                "ap50-95": float(ap),
            }
    
    # Segmentation metrics if available
    if hasattr(metrics, 'seg') and metrics.seg is not None:
        results["metrics"]["seg_mAP50"] = float(metrics.seg.map50)
        results["metrics"]["seg_mAP50-95"] = float(metrics.seg.map)
        results["metrics"]["seg_precision"] = float(metrics.seg.mp)
        results["metrics"]["seg_recall"] = float(metrics.seg.mr)
    
    # Speed metrics
    if hasattr(metrics, 'speed'):
        results["speed"] = metrics.speed
    
    # Save results
    output_path = Path(args.output)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    
    with open(output_path, 'w') as f:
        json.dump(results, f, indent=2)
    
    print(f"\nResults saved to: {output_path}")
    print("\n=== Evaluation Results ===")
    for key, value in results["metrics"].items():
        print(f"  {key}: {value:.4f}")
    
    # Print confusion matrix info
    if hasattr(metrics.box, 'confusion_matrix'):
        print("\nConfusion matrix available in metrics")


if __name__ == "__main__":
    main()