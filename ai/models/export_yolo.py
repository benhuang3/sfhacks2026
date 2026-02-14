"""
Export YOLOv8n to ExecuTorch (.pte) format for on-device inference.

Prerequisites:
    pip install ultralytics torch>=2.9.0 executorch

Usage:
    python export_yolo.py

This produces a .pte file that can be loaded by react-native-executorch
via useExecutorchModule() or ExecutorchModule class.

Note: For the hackathon MVP, we use the built-in SSD-MobileNetV3 model
from react-native-executorch. This script is the upgrade path to YOLO.
"""

from pathlib import Path
from ultralytics import YOLO


def export_yolov8n():
    """Export YOLOv8n (detection only) to ExecuTorch format."""
    model = YOLO("yolov8n.pt")

    # Export to ExecuTorch
    # This uses torch.export() under the hood and produces a .pte file
    model.export(format="executorch")

    print("YOLOv8n exported to ExecuTorch format.")
    print("Look for the .pte file in the yolov8n_executorch_model/ directory.")


def export_yolov8n_seg():
    """
    Export YOLOv8n-seg (detection + segmentation) to ExecuTorch format.

    Note: This produces both bounding boxes and instance segmentation masks.
    Requires custom post-processing code in the React Native app.
    Only pursue this if time allows — bounding box crop is sufficient for OCR.
    """
    model = YOLO("yolov8n-seg.pt")
    model.export(format="executorch")

    print("YOLOv8n-seg exported to ExecuTorch format.")


if __name__ == "__main__":
    output_dir = Path(__file__).parent
    print(f"Working directory: {output_dir}")
    print("Exporting YOLOv8n to ExecuTorch...")
    print()

    export_yolov8n()
