import { readFile, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";

import { contractUrl } from "./contract-location.ts";

const outputUrl = contractUrl("hfp.schema.json");
const sourceUrl = contractUrl("modules/hfp.source.schema.json");
const source = JSON.parse(await readFile(sourceUrl, "utf8")) as unknown;
const expected = `${JSON.stringify(source, null, 2)}\n`;

if (process.argv.includes("--check")) {
  let actual: string;
  try {
    actual = await readFile(outputUrl, "utf8");
  } catch {
    console.error(
      `${fileURLToPath(outputUrl)} does not exist; run npm run bundle`,
    );
    process.exitCode = 1;
    actual = "";
  }
  if (actual !== expected) {
    console.error(
      `${fileURLToPath(outputUrl)} does not match ${fileURLToPath(sourceUrl)}`,
    );
    process.exitCode = 1;
  }
} else {
  await writeFile(outputUrl, expected, "utf8");
  console.log(`Wrote ${fileURLToPath(outputUrl)}`);
}
