const directory = process.env.HFP_CONTRACT_DIRECTORY ?? "3-0-0";
const schemaVer = /^[1-9][0-9]{0,8}-(0|[1-9][0-9]{0,8})-(0|[1-9][0-9]{0,8})$/;

if (directory !== "draft" && !schemaVer.test(directory)) {
  throw new Error(
    "HFP_CONTRACT_DIRECTORY must equal draft or a canonical SchemaVer",
  );
}

export const contractDirectory = directory;

export const contractUrl = (relativePath: string): URL =>
  new URL(`../${contractDirectory}/${relativePath}`, import.meta.url);
