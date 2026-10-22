#!/usr/bin/env python3
"""
SmartPothole AI - Training Script
Train YOLO model for pothole detection/segmentation
"""

import argparse
import yaml
from pathlib import Path
from ultralytics import YOLO
import torch


def parse_args():
    parser = argparse.ArgumentParser(description="Train pothole detection model")
    parser.add_argument("--data", type=str, default="ml/datasets/dataset.yaml", help="Dataset config path")
    parser.add_argument("--model", type=str, default="yolo11n-seg.pt", help="Base model (yolo11n-seg.pt, yolo11s-seg.pt, yolo11m-seg.pt)")
    parser.add_argument("--epochs", type=int, default=100, help="Number of epochs")
    parser.add_argument("--batch", type=int, default=16, help="Batch size")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--device", type=str, default="auto", help="Device (cuda, mps, cpu, auto)")
    parser.add_argument("--workers", type=int, default=8, help="DataLoader workers")
    parser.add_argument("--patience", type=int, default=20, help="Early stopping patience")
    parser.add_argument("--project", type=str, default="ml/training/runs", help="Project directory")
    parser.add_argument("--name", type=str, default="pothole-seg", help="Run name")
    parser.add_argument("--pretrained", action="store_true", help="Use pretrained weights")
    parser.add_argument("--resume", type=str, default=None, help="Resume from checkpoint")
    parser.add_argument("--export", action="store_true", help="Export to ONNX after training")
    return parser.parse_args()


def main():
    args = parse_args()
    
    # Check dataset exists
    data_path = Path(args.data)
    if not data_path.exists():
        print(f"Dataset config not found: {data_path}")
        print("Please create dataset.yaml with correct paths")
        return
    
    # Load dataset config to verify paths
    with open(data_path) as f:
        dataset_config = yaml.safe_load(f)
    
    print(f"Training configuration:")
    print(f"  Data: {args.data}")
    print(f"  Model: {args.model}")
    print(f"  Epochs: {args.epochs}")
    print(f"  Batch size: {args.batch}")
    print(f"  Image size: {args.imgsz}")
    print(f"  Device: {args.device}")
    print(f"  Project: {args.project}/{args.name}")
    
    # Initialize model
    model = YOLO(args.model)
    
    # Train
    results = model.train(
        data=str(data_path),
        epochs=args.epochs,
        batch=args.batch,
        imgsz=args.imgsz,
        device=args.device,
        workers=args.workers,
        patience=args.patience,
        project=args.project,
        name=args.name,
        pretrained=args.pretrained,
        resume=args.resume,
        # Optimization
        optimizer="auto",
        lr0=0.01,
        lrf=0.01,
        momentum=0.937,
        weight_decay=0.0005,
        warmup_epochs=3,
        warmup_momentum=0.8,
        warmup_bias_lr=0.1,
        # Augmentation
        hsv_h=0.015,
        hsv_s=0.7,
        hsv_v=0.4,
        degrees=10.0,
        translate=0.1,
        scale=0.5,
        shear=2.0,
        perspective=0.0,
        flipud=0.0,
        fliplr=0.5,
        mosaic=1.0,
        mixup=0.1,
        copy_paste=0.1,
    )
    
    print(f"\nTraining complete!")
    print(f"Best model: {results.best}")
    
    # Validate
    print("\nRunning validation...")
    metrics = model.val()
    print(f"mAP50: {metrics.box.map50:.4f}")
    print(f"mAP50-95: {metrics.box.map:.4f}")
    
    # Export if requested
    if args.export:
        print("\nExporting to ONNX...")
        export_path = model.export(format="onnx", imgsz=args.imgsz, half=True)
        print(f"Exported to: {export_path}")
    
    # Print final metrics
    print("\n=== Final Metrics ===")
    print(f"mAP@0.5: {metrics.box.map50:.4f}")
    print(f"mAP@0.5:0.95: {metrics.box.map:.4f}")
    print(f"Precision: {metrics.box.mp:.4f}")
    print(f"Recall: {metrics.box.mr:.4f}")
    
    if hasattr(metrics, 'seg'):
        print(f"Seg mAP@0.5: {metrics.seg.map50:.4f}")
        print(f"Seg mAP@0.5:0.95: {metrics.seg.map:.4f}")


if __name__ == "__main__":
    main()