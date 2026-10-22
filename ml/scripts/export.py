#!/usr/bin/env python3
"""
SmartPothole AI - Export Script
Export trained model to various formats
"""

import argparse
from pathlib import Path
from ultralytics import YOLO


def parse_args():
    parser = argparse.ArgumentParser(description="Export pothole detection model")
    parser.add_argument("--model", type=str, required=True, help="Path to trained model (best.pt)")
    parser.add_argument("--format", type=str, default="onnx", choices=["onnx", "torchscript", "openvino", "engine", "coreml", "tflite", "pb"], help="Export format")
    parser.add_argument("--imgsz", type=int, default=640, help="Image size")
    parser.add_argument("--half", action="store_true", default=True, help="FP16 half-precision")
    parser.add_argument("--int8", action="store_true", help="INT8 quantization (requires calibration data)")
    parser.add_argument("--device", type=str, default="cpu", help="Device for export")
    parser.add_argument("--opset", type=int, default=12, help="ONNX opset version")
    parser.add_argument("--simplify", action="store_true", default=True, help="Simplify ONNX model")
    parser.add_argument("--dynamic", action="store_true", help="Dynamic batch size")
    parser.add_argument("--output", type=str, default=None, help="Output path (default: same dir as model)")
    return parser.parse_args()


def main():
    args = parse_args()
    
    model_path = Path(args.model)
    if not model_path.exists():
        print(f"Model not found: {model_path}")
        return
    
    print(f"Loading model: {model_path}")
    model = YOLO(str(model_path))
    
    # Determine output path
    if args.output:
        output_path = Path(args.output)
    else:
        output_path = model_path.parent / f"{model_path.stem}.{args.format}"
    
    print(f"Exporting to {args.format.upper()}...")
    print(f"  Image size: {args.imgsz}")
    print(f"  Half precision: {args.half}")
    print(f"  Output: {output_path}")
    
    # Export arguments
    export_args = {
        "format": args.format,
        "imgsz": args.imgsz,
        "half": args.half,
        "device": args.device,
        "opset": args.opset,
        "simplify": args.simplify,
        "dynamic": args.dynamic,
    }
    
    if args.int8:
        export_args["int8"] = True
        print("  INT8 quantization: enabled (requires calibration data)")
    
    try:
        exported_path = model.export(**export_args)
        print(f"\nExport successful!")
        print(f"Exported model: {exported_path}")
        
        # Verify export
        if args.format == "onnx":
            import onnx
            onnx_model = onnx.load(str(exported_path))
            onnx.checker.check_model(onnx_model)
            print("ONNX model verified successfully!")
        
    except Exception as e:
        print(f"Export failed: {e}")
        return 1
    
    return 0


if __name__ == "__main__":
    exit(main())