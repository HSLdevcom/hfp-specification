"""Validate public examples with an independent Draft 2020-12 implementation."""

import json
import os
from pathlib import Path
import re

from jsonschema import Draft202012Validator


root = Path(__file__).resolve().parents[1]
contract_name = os.environ.get("HFP_CONTRACT_DIRECTORY", "3-0-0")
if contract_name != "draft" and re.fullmatch(
    r"[1-9][0-9]{0,8}-(0|[1-9][0-9]{0,8})-(0|[1-9][0-9]{0,8})",
    contract_name,
) is None:
    raise SystemExit(
        "HFP_CONTRACT_DIRECTORY must equal draft or a canonical SchemaVer"
    )
contract = root / contract_name
schema = json.loads((contract / "hfp.schema.json").read_text(encoding="utf-8"))
Draft202012Validator.check_schema(schema)
validator = Draft202012Validator(schema)
cases = json.loads((contract / "examples" / "cases.json").read_text(encoding="utf-8"))

failures: list[str] = []
for case in cases:
    payload = json.loads(
        (contract / "examples" / case["payload"]).read_text(encoding="utf-8")
    )
    valid = not list(validator.iter_errors(payload))
    if valid != case["valid"]:
        failures.append(
            f'{case["id"]}: expected valid={case["valid"]}, got {valid}'
        )

if failures:
    raise SystemExit("\n".join(failures))

print(f"Validated {len(cases)} example cases with Python jsonschema")
