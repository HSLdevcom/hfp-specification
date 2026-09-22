import { readFileSync } from "node:fs";

import {
  Ajv2020,
  type AnySchemaObject,
  type ErrorObject,
  type ValidateFunction,
} from "ajv/dist/2020.js";
import addFormatsModule, { type FormatsPlugin } from "ajv-formats";

import { contractUrl } from "./contract-location.ts";
import { EVENT_TYPES, type EventType } from "./contract.ts";

export type ValidationResult =
  | { readonly valid: true; readonly errors: readonly [] }
  | { readonly valid: false; readonly errors: readonly ErrorObject[] };

const addFormats = addFormatsModule as unknown as FormatsPlugin;
export const schema = JSON.parse(
  readFileSync(contractUrl("hfp.schema.json"), "utf8"),
) as AnySchemaObject;

const createAjv = (): Ajv2020 => {
  const ajv = new Ajv2020({
    allErrors: true,
    coerceTypes: false,
    strict: true,
    strictRequired: true,
    useDefaults: false,
  });
  addFormats(ajv);
  return ajv;
};

export const createValidator = (): ValidateFunction =>
  createAjv().compile(schema);

/**
 * Validate the internal envelope used to apply rules selected from MQTT topic
 * context. The envelope is assembled by the caller and is not a wire payload.
 */
export const createTopicAwareValidator = (): ValidateFunction => {
  const ajv = createAjv();
  ajv.addSchema(schema, "hfp-contract");
  return ajv.compile({
    $ref: "hfp-contract#/$defs/topicContexts/topicAwareMessage",
  });
};

export const createEventValidators = (): Readonly<
  Record<EventType, ValidateFunction>
> => {
  const ajv = createAjv();
  ajv.addSchema(schema, "hfp-contract");
  return Object.fromEntries(
    EVENT_TYPES.map((event) => [
      event,
      ajv.compile({ $ref: `hfp-contract#/$defs/profiles/${event}` }),
    ]),
  ) as unknown as Record<EventType, ValidateFunction>;
};

export const validatePayload = (
  validator: ValidateFunction,
  payload: unknown,
): ValidationResult => {
  if (validator(payload)) {
    return { valid: true, errors: [] };
  }
  return { valid: false, errors: validator.errors ?? [] };
};
