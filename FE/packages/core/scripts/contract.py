"""Print OpenAPI operations with their parameters and resolved schemas, for frontend work.

Usage (from FE/):
  python packages/core/scripts/contract.py --list [tag]          # one line per operation
  python packages/core/scripts/contract.py listProducts           # by operationId
  python packages/core/scripts/contract.py /catalogue/products    # every method on a path
  python packages/core/scripts/contract.py --schema Product       # one schema, refs expanded one level
Requires PyYAML (pip install pyyaml).
"""
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[4]
spec = yaml.safe_load((ROOT / "openapi.yaml").read_text(encoding="utf-8"))
schemas = spec["components"]["schemas"]
parameters = spec["components"].get("parameters", {})
METHODS = ("get", "post", "put", "patch", "delete")


def ref_name(node):
    return node["$ref"].rsplit("/", 1)[-1] if isinstance(node, dict) and "$ref" in node else None


def compact(node, depth=0, seen=()):
    """Inline $refs to `depth` levels; deeper refs stay as their schema name."""
    name = ref_name(node)
    if name:
        if depth <= 0 or name in seen:
            return f"<{name}>"
        return {f"<{name}>": compact(schemas[name], depth - 1, seen + (name,))}
    if isinstance(node, dict):
        out = {}
        for key, value in node.items():
            if key in ("description",) and isinstance(value, str) and len(value) > 400:
                value = value[:400] + "…"
            out[key] = compact(value, depth, seen)
        return out
    if isinstance(node, list):
        return [compact(item, depth, seen) for item in node]
    return node


def show_operation(path, method, op):
    print(f"\n=== {method.upper()} {path}  ({op.get('operationId')})  tags={op.get('tags')}")
    if op.get("description"):
        print("description:", op["description"])
    for param in op.get("parameters", []):
        name = ref_name(param)
        param = parameters[name] if name else param
        print(f"param {param['in']} {param['name']}{' (required)' if param.get('required') else ''}: {json.dumps(compact(param.get('schema', {}), 1))} {param.get('description', '')[:300]}")
    body = op.get("requestBody")
    if body:
        for media, content in body.get("content", {}).items():
            print(f"body {media}:", json.dumps(compact(content.get("schema", {}), 2), ensure_ascii=False, indent=1))
    for code, response in op.get("responses", {}).items():
        if str(code).startswith("2"):
            content = response.get("content", {})
            for media, value in content.items():
                print(f"response {code} {media}:", json.dumps(compact(value.get("schema", {}), 2), ensure_ascii=False, indent=1))
            if not content:
                print(f"response {code}: (no body)")


def main(argv):
    if not argv:
        print(__doc__)
        return
    if argv[0] == "--list":
        tag = argv[1] if len(argv) > 1 else None
        for path, item in spec["paths"].items():
            for method in METHODS:
                op = item.get(method)
                if op and (tag is None or tag in op.get("tags", [])):
                    print(f"{method.upper():6} {path:70} {op.get('operationId'):40} {','.join(op.get('tags', []))}")
        return
    if argv[0] == "--schema":
        print(json.dumps(compact(schemas[argv[1]], 1), ensure_ascii=False, indent=1))
        return
    target = argv[0]
    for path, item in spec["paths"].items():
        for method in METHODS:
            op = item.get(method)
            if op and (op.get("operationId") == target or path == target):
                show_operation(path, method, op)


if __name__ == "__main__":
    main(sys.argv[1:])
