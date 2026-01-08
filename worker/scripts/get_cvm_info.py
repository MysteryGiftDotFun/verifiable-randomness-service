#!/usr/bin/env python3
import sys, json


def get_cvm_info(app_name):
    try:
        # Read JSON from stdin
        input_str = sys.stdin.read()
        if not input_str:
            return None

        data = json.loads(input_str)
        items = data.get("items", []) if isinstance(data, dict) else data
        if not isinstance(items, list):
            items = []

        target = None
        for item in items:
            # Check status - we want active ones
            status = item.get("status")
            hosted = item.get("hosted", {})
            h_status = hosted.get("status")

            # Skip terminated/deleted
            if status == "terminated" or h_status == "terminated":
                continue

            # Match name
            if item.get("name") == app_name or hosted.get("name") == app_name:
                target = item
                break

        if target:
            hosted = target.get("hosted", {})
            return {
                "id": hosted.get("id") or target.get("id") or target.get("vm_uuid"),
                "app_id": hosted.get("app_id") or target.get("app_id"),
                "dashboard_url": target.get("dapp_dashboard_url")
                or hosted.get("app_url"),
            }
    except Exception:
        return None
    return None


if __name__ == "__main__":
    if len(sys.argv) < 2:
        print("Usage: get_cvm_info.py <app_name>", file=sys.stderr)
        sys.exit(1)

    info = get_cvm_info(sys.argv[1])
    if info:
        print(json.dumps(info))
    else:
        sys.exit(1)
