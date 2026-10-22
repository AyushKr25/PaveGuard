#!/usr/bin/env python3
"""
SmartPothole AI - Dataset Preparation Script
Convert various dataset formats to YOLO format
"""

import argparse
import os
import shutil
import json
import yaml
from pathlib import Path
from sklearn.model_selection import train_test_split
from PIL import Image
import cv2
import numpy as np


def parse_args():
    parser = argparse.ArgumentParser(description="Prepare dataset for YOLO training")
    parser.add_argument("--source", type=str, required=True, help="Source dataset directory")
    parser.add_argument("--format", type=str, choices=["coco", "voc", "yolo", "labelme"], default="coco", help="Source format")
    parser.add_argument("--output", type=str, default="ml/datasets/pothole", help="Output directory")
    parser.add_argument("--train-split", type=float, default=0.7, help="Train split ratio")
    parser.add_argument("--val-split", type=float, default=0.2, help="Val split ratio")
    parser.add_argument("--test-split", type=float, default=0.1, help="Test split ratio")
    parser.add_argument("--classes", type=str, nargs="+", default=["pothole"], help="Class names")
    return parser.parse_args()


def convert_coco_to_yolo(source_dir: Path, output_dir: Path, classes: list):
    """Convert COCO format to YOLO"""
    # Find annotation file
    ann_files = list(source_dir.glob("*.json"))
    if not ann_files:
        print("No COCO annotation file found")
        return
    
    with open(ann_files[0]) as f:
        coco = json.load(f)
    
    # Create class mapping
    cat_id_to_idx = {cat['id']: idx for idx, cat in enumerate(coco['categories'])}
    
    # Group annotations by image
    ann_by_image = {}
    for ann in coco['annotations']:
        img_id = ann['image_id']
        if img_id not in ann_by_image:
            ann_by_image[img_id] = []
        ann_by_image[img_id].append(ann)
    
    # Process images
    for img in coco['images']:
        img_id = img['id']
        img_path = source_dir / img['file_name']
        
        if not img_path.exists():
            print(f"Image not found: {img_path}")
            continue
        
        # Copy image
        dst_img = output_dir / "images" / img['file_name']
        dst_img.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(img_path, dst_img)
        
        # Create label file
        label_path = output_dir / "labels" / f"{img_path.stem}.txt"
        label_path.parent.mkdir(parents=True, exist_ok=True)
        
        with open(label_path, 'w') as f:
            for ann in ann_by_image.get(img_id, []):
                cat_idx = cat_id_to_idx.get(ann['category_id'])
                if cat_idx is None:
                    continue
                
                # COCO bbox: [x, y, w, h] -> YOLO: [x_center, y_center, w, h] normalized
                x, y, w, h = ann['bbox']
                img_w, img_h = img['width'], img['height']
                
                x_center = (x + w / 2) / img_w
                y_center = (y + h / 2) / img_h
                w_norm = w / img_w
                h_norm = h / img_h
                
                f.write(f"{cat_idx} {x_center:.6f} {y_center:.6f} {w_norm:.6f} {h_norm:.6f}\n")
        
        # Handle segmentation if present
        if 'segmentation' in ann_by_image.get(img_id, [{}])[0]:
            # Could convert to YOLO segmentation format
            pass


def split_dataset(output_dir: Path, train_ratio: float, val_ratio: float, test_ratio: float):
    """Split dataset into train/val/test"""
    images_dir = output_dir / "images"
    labels_dir = output_dir / "labels"
    
    # Get all image files
    image_files = list(images_dir.glob("*.jpg")) + list(images_dir.glob("*.png")) + list(images_dir.glob("*.jpeg"))
    
    if not image_files:
        print("No images found")
        return
    
    # Split
    train_files, temp_files = train_test_split(image_files, train_size=train_ratio, random_state=42)
    val_size = val_ratio / (val_ratio + test_ratio)
    val_files, test_files = train_test_split(temp_files, train_size=val_size, random_state=42)
    
    # Create split directories
    for split_name, files in [("train", train_files), ("val", val_files), ("test", test_files)]:
        split_img_dir = output_dir / "images" / split_name
        split_lbl_dir = output_dir / "labels" / split_name
        split_img_dir.mkdir(parents=True, exist_ok=True)
        split_lbl_dir.mkdir(parents=True, exist_ok=True)
        
        for img_file in files:
            # Move image
            dst_img = split_img_dir / img_file.name
            shutil.move(str(img_file), str(dst_img))
            
            # Move label
            lbl_file = labels_dir / f"{img_file.stem}.txt"
            if lbl_file.exists():
                dst_lbl = split_lbl_dir / lbl_file.name
                shutil.move(str(lbl_file), str(dst_lbl))
    
    # Remove empty parent directories
    if images_dir.exists() and not any(images_dir.iterdir()):
        images_dir.rmdir()
    if labels_dir.exists() and not any(labels_dir.iterdir()):
        labels_dir.rmdir()
    
    print(f"Dataset split: train={len(train_files)}, val={len(val_files)}, test={len(test_files)}")


def create_dataset_yaml(output_dir: Path, classes: list):
    """Create dataset.yaml"""
    config = {
        "names": {i: name for i, name in enumerate(classes)},
        "nc": len(classes),
        "train": "images/train",
        "val": "images/val",
        "test": "images/test",
    }
    
    with open(output_dir / "dataset.yaml", 'w') as f:
        yaml.dump(config, f, default_flow_style=False)
    
    print(f"Created dataset.yaml at {output_dir / 'dataset.yaml'}")


def main():
    args = parse_args()
    
    source = Path(args.source)
    output = Path(args.output)
    
    if not source.exists():
        print(f"Source directory not found: {source}")
        return
    
    print(f"Preparing dataset from {source} to {output}")
    print(f"Format: {args.format}")
    print(f"Classes: {args.classes}")
    
    # Create output structure
    output.mkdir(parents=True, exist_ok=True)
    (output / "images").mkdir(exist_ok=True)
    (output / "labels").mkdir(exist_ok=True)
    
    # Convert based on format
    if args.format == "coco":
        convert_coco_to_yolo(source, output, args.classes)
    else:
        print(f"Format {args.format} not yet implemented")
        return
    
    # Split dataset
    split_dataset(output, args.train_split, args.val_split, args.test_split)
    
    # Create dataset.yaml
    create_dataset_yaml(output, args.classes)
    
    print("\nDataset preparation complete!")
    print(f"Output directory: {output}")


if __name__ == "__main__":
    main()