import { readFile } from "node:fs/promises";

import { contractUrl } from "./contract-location.ts";
import { createValidator, validatePayload } from "./validation.ts";

type Case = {
  readonly id: string;
  readonly payload: string;
  readonly valid: boolean;
};

const examplesUrl = contractUrl("examples/");
const cases = JSON.parse(
  await readFile(new URL("cases.json", examplesUrl), "utf8"),
) as readonly Case[];
const validate = createValidator();
let failures = 0;

for (const testCase of cases) {
  const payload = JSON.parse(
    await readFile(new URL(testCase.payload, examplesUrl), "utf8"),
  ) as unknown;
  const result = validatePayload(validate, payload);
  if (result.valid !== testCase.valid) {
    failures += 1;
    console.error(
      `${testCase.id}: expected valid=${String(testCase.valid)}, got ${String(result.valid)}`,
    );
    if (!result.valid) {
      console.error(JSON.stringify(result.errors, null, 2));
    }
  }
}

if (failures > 0) {
  process.exitCode = 1;
} else {
  console.log(`Validated ${String(cases.length)} example cases with Ajv`);
}
