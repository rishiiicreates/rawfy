#!/usr/bin/env python3
"""
Validate that a Rawfy output JSON file has the expected shape.
Usage: python validate_rawfy_output.py <output.json>
Exit 0 on success, 1 on failure.
"""
import sys, json

REQUIRED_KEYS = {"url", "content", "format"}

def validate(path: str) -> bool:
    with open(path) as f:
        data = json.load(f)
    missing = REQUIRED_KEYS - set(data.keys())
    if missing:
        print(f"FAIL: Missing keys: {missing}")
        return False
    if not data["content"] or len(data["content"]) < 50:
        print("FAIL: content is empty or suspiciously short")
        return False
    print(f"OK: {data['url']} — {len(data['content'])} chars of {data['format']}")
    return True

if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: python validate_rawfy_output.py <output.json>")
        sys.exit(1)
    success = validate(sys.argv[1])
    sys.exit(0 if success else 1)
