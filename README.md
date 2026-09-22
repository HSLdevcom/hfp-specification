# HSL High-frequency positioning specification

High-frequency positioning (HFP) provides public transit status information as JSON over MQTT. This repository develops the versioned HFP specification, including machine-readable contracts, examples and validation tools.

## Status

The initial HFP v3 payload contract lives under [`3-0-0/`](3-0-0/). Every event body requires `schemaVersion: "3-0-0"` and its schema identifies itself as `https://hsl.fi/schema/hfp/3-0-0/hfp.schema.json`. The version directory remains immutable once the corresponding git tag, e.g. `v3-0-0`, has been made.

Schema validation covers payload structure and the supplied topic context, not complete producer acceptance.

## Develop an HFP producer

### Choose the contract

- Start with [`3-0-0/README.md`](3-0-0/README.md) and pin the immutable [`3-0-0/hfp.schema.json`](3-0-0/hfp.schema.json). Emit `schemaVersion: "3-0-0"` inside every event body, independently of the MQTT topic version and producer software version.
- Develop and validate against the same exact `MODEL-REVISION-ADDITION` contract you will deploy. Future `draft/` work can change without release compatibility guarantees and must never enter production output.
- Read the selected contract's field descriptions, units, enums and bounds in `hfp.schema.json`, together with [field presence and nullability](#field-presence-and-nullability). Implement omission, device-failure nulls and state-dependent field groups.
- Identify every event × journey type × temporal type × transport mode your producer emits. Use the MQTT topic -aware contract for each combination.

### Set up validation

Run commands from the repository root with Node.js 24.15 or newer in the Node.js 24 release line and npm 12:

```sh
npm ci
npm run validate:examples
```

The example command checks the committed payload-only fixtures and their expected outcomes, not your producer's output. Browse [`3-0-0/examples/valid/`](3-0-0/examples/valid/) and [`3-0-0/examples/invalid-schema/`](3-0-0/examples/invalid-schema/) for wire-format examples, then validate your own messages with their actual topic contexts.

### Validate your producer's output

The following runnable example reads one JSON MQTT payload file. Its remaining arguments supply the journey type, temporal type and transport mode from the intended MQTT topic. Replace the fixture path and context arguments with your producer's serialized output and topic context:

```sh
node --input-type=module - 3-0-0/examples/valid/vp.json journey ongoing bus <<'JS'
import { readFileSync } from "node:fs";
import {
  createTopicAwareValidator,
  createValidator,
  validatePayload,
} from "./src/validation.ts";

const [payloadPath, journey_type, temporal_type, transport_mode] = process.argv.slice(2);
const payload = JSON.parse(readFileSync(payloadPath, "utf8"));
const validateWire = createValidator();
const validateContext = createTopicAwareValidator();

let result = validatePayload(validateWire, payload);
if (result.valid) {
  const [event_type, body] = Object.entries(payload)[0];
  result = validatePayload(validateContext, {
    topic: { journey_type, temporal_type, transport_mode },
    event_type,
    body,
  });
}
if (!result.valid) {
  console.error(JSON.stringify(result.errors, null, 2));
  process.exitCode = 1;
} else {
  console.log("Payload and topic context validated.");
}
JS
```

The wire check enforces exactly one supported uppercase event key, such as `{"VP": {...}}`. The second check validates its body against the supplied topic context. Failures print schema diagnostics and exit with status 1. The validators neither coerce types nor fill defaults.

For repeated checks in your producer's test harness, create the validators once and reuse them. These TypeScript helpers run from a repository checkout; this private package does not provide a published npm integration. Producers in other languages can load the self-contained Draft 2020-12 schema and validate the same internal envelope through `#/$defs/topicContexts/topicAwareMessage`, with format assertions enabled.

The helpers default to `3-0-0/`. Set `HFP_CONTRACT_DIRECTORY` to another exact version directory when selecting a different release and read payload examples from that release. Set it to `draft` only after starting the next contract change. Keep the selected schema version and emitted `schemaVersion` aligned.

### Test producer behavior

Exercise your emitted serialized messages for every supported context, including assignment and sign-off transitions, grouped field presence and device failures. Assert omission for inapplicable fields and `null` only for applicable fields that allow runtime failure.

Add separate integration checks for the [conformance boundaries](#conformance-boundaries): parse and check the complete MQTT topic, match its event to the payload key, verify topic identifiers against body values and check timestamp arithmetic, reference data, event timing, state transitions and delivery behavior. The helper accepts a context object; it does not parse or validate a raw MQTT topic. MQTT grammar and unresolved event semantics require separate operational agreements, so schema success alone cannot establish producer acceptance.

It may be beneficial to subscribe to your HFP messages in your development environment and run the schema validation for every message.

## Consume HFP

- Select and pin the contract matching the message body's exact `schemaVersion`, starting with [`3-0-0/`](3-0-0/). Treat an unsupported version explicitly instead of silently applying another version or coercing values. Use future drafts only for development.
- Read the contract's field descriptions and [presence/nullability rules](#field-presence-and-nullability). An omitted field means it does not apply; an allowed `null` reports a runtime failure. Do not replace either with a fabricated value.
- Use the [producer validation workflow](#validate-your-producers-output) for ingestion fixtures, supplying context from the received topic. Check full topic agreement and operational semantics separately as described under [conformance boundaries](#conformance-boundaries).
- Review [release compatibility rules](RELEASING.md) before changing the version your consumer accepts.

## Contract layout

- [`3-0-0/hfp.schema.json`](3-0-0/hfp.schema.json) contains the generated self-contained Draft 2020-12 payload schema.
- [`3-0-0/examples/`](3-0-0/examples/) contains synthetic valid and invalid payloads plus executable expectations.
- [`3-0-0/modules/hfp.source.schema.json`](3-0-0/modules/hfp.source.schema.json) preserves the source used to reproduce the bundle; do not edit released source files.
- [`3-0-0/manifest.json`](3-0-0/manifest.json) records sorted SHA-256 digests of every other version-local file; [`3-0-0/release-evidence.json`](3-0-0/release-evidence.json) records performed verification and its limits.
- Top-level directories matching `MODEL-REVISION-ADDITION` contain immutable contracts. `draft/` exists only while developing the next contract change.
- `src/validate-examples.ts` validates every example with Ajv.
- `scripts/validate-independent.py` checks the same examples with Python jsonschema.

The payload root validates payload shape without MQTT topic context. A separate topic-aware entry point selects one of 297 exact context profiles and keeps MQTT metadata outside the wire payload. Version `3-0-0` freezes this context matrix; changes require another SchemaVer.

The matrix includes train `DOUT` in `journey/ongoing` and its `training/ongoing` mirror: driver sign-out does not force a deadrun topic and the body omits operating-date and journey identity fields. Bus `DUE`, `ARR`, `ARS` and `WAIT` also support `deadrun/ongoing`, including the `robot` and `ubus` aliases. These stop events require the full deadrun assignment and `stop`, `ttarr` and `ttdep`, with `tste` accompanying `oday`; they forbid `desi`, `line`, `route` and `occu`, even as null. These 14 profiles correct omissions from a historical-context whitelist without accepting historical field defects or adding an event-only fallback.

## Field presence and nullability

The contract decides field presence and nullability separately for each topic context: the combination of event type, journey type, temporal type and transport mode. A field can be required in one context, optional in another and omitted in a third.

Each field in a topic context takes one of these forms:

| Presence | Null allowed | Meaning                                                                                                       | Example                                                                                                   |
| -------- | ------------ | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Omitted  | —            | The field never applies in this context. Producers must not send it, not even as `null`.                      | `desi` and `line` in deadrun VP                                                                           |
| Required | No           | The field applies in every message of this context and no device failure can prevent its value.               | `veh` and `tst`; `dir` in ongoing journey VP                                                              |
| Required | Yes          | The field applies in every message of this context. `null` means that its source failed at runtime.           | `drst` while the door module is broken                                                                    |
| Optional | No           | The field applies only in some vehicle states. Producers omit it in the other states.                         | `jrn` in deadrun VP: present only when the driver has signed onto a journey, such as from depot to a stop |
| Optional | Yes          | The field applies only in some vehicle states. `null` means that it applies but its source failed at runtime. |                                                                                                           |

Principles:

1. **Absence means "does not apply".** A field appears only in the contexts and vehicle states where it has meaning. Omission never means "unknown".
2. **`null` means "broken".** `null` is allowed only for an applicable field whose value could not be produced because a device or system failed at runtime, such as a door module, a satellite positioning receiver, or an odometer connection. `null` never means "does not apply", "not implemented", or "this vehicle lacks the equipment".
3. **No missing equipment.** Every vehicle must have the equipment that the fields of its topic contexts require. A vehicle that never produces a value for an applicable field has a defect; the contract does not make the field optional or nullable for it.
4. **A slightly broken vehicle keeps serving customers.** A vehicle with a failed device can stay in service, so its messages must stay valid. Values from devices that can fail independently, such as position, speed, heading, acceleration, odometer, door status and battery charge, are therefore nullable wherever they apply. Identifiers, timestamps, timetable times and values the driver sets are never `null`.
5. **An unassigned vehicle omits journey identity.** Without a sign-on, the journey identity fields are omitted, not sent as `null`.
6. **Fields that depend on the same state appear together.** When presence depends on vehicle state rather than on the topic, the field is optional. Fields that depend on the same state are present together or omitted together.
7. **Nullability is fixed before release.** Allowing `null` in a released field breaks consumers, so each field's nullability is decided before release and errs toward nullable for device-derived values.
8. **Evidence proposes; people decide.** HFP v2 recordings show how each context behaves, but no numeric threshold decides applicability. A reviewed candidate list classifies each field in each context:
   - always `null`: candidate for omission;
   - a value in only a few exceptional messages: candidate for omission, with those values treated as producer defects;
   - `null` in a substantial share of messages: optional if the field depends on vehicle state, nullable if the nulls come from device failures;
   - `null` in only a few messages: nullable if the value comes from a device, otherwise a producer defect.

   Each decision is recorded with its rationale. A field that HFP v2 never filled can still be required in HFP v3 when it applies.

## Conformance boundaries

JSON Schema currently enforces:

- exactly one supported uppercase event in the envelope;
- the exact `schemaVersion: "3-0-0"` inside every event body;
- the event-specific required field set;
- rejection of unknown fields;
- primitive types, approved enums, lexical patterns and durable numeric bounds;
- in the topic-aware envelope, the field set of each exact event, journey type, temporal type and transport mode: applicable journey identity and `dir` are required in journey-bearing `journey` and `training` bodies, while driver-out bodies omit them; ongoing journey VP requires `dl`, while upcoming VP omits it; `stop` appears only when the event relates to a stop;
- rules that link fields within a body: the deadrun assignment fields appear together, `dl` in deadrun requires an assignment, `stop`, `ttarr` and `ttdep` appear together, `tste` appears exactly with `oday` and null coordinates appear exactly with `loc: "N/A"`.

Separate semantic or operational checks must enforce timestamp arithmetic, calendar validity, full MQTT topic agreement and context selection, event trigger timing, state transitions, delivery behavior, clock synchronization and reference-data existence. `createTopicAwareValidator()` accepts an internal `{ topic, event_type, body }` envelope assembled from the topic and payload; that envelope is for validation only and is not transmitted.

## Specify and maintain HFP

Review the [current contract rules](3-0-0/README.md) and [conformance boundaries](#conformance-boundaries) before changing field applicability, semantics, or context profiles. Record contract decisions explicitly; producer recordings provide evidence rather than automatic acceptance rules.

In addition to the producer validation requirements, install:

- Python 3.12 or newer and `uv` for the independent-validator check
- `prek` 0.5.3 for local hooks

Install and run every public check:

```sh
npm ci
npm run check
```

Never edit `3-0-0/` after promotion. When the next contract change starts, [recreate `draft/`](RELEASING.md#promotion) from the current release, replace its exact discriminator with the development marker, remove the canonical `$id` and release-only evidence/manifest and select it with `HFP_CONTRACT_DIRECTORY=draft`. Edit `draft/modules/hfp.source.schema.json`, update `draft/examples/cases.json` and behavioral tests under [`test/`](test/), then regenerate the draft bundle:

```sh
HFP_CONTRACT_DIRECTORY=draft npm run bundle
```

Check that the committed bundle matches a fresh deterministic build:

```sh
npm run bundle:check
```

Select the existing exact-version directory explicitly when checking the frozen contract:

```sh
HFP_CONTRACT_DIRECTORY=3-0-0 npm run bundle:check
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:examples
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:independent
```

Run the Git hook suite explicitly:

```sh
prek run --all-files
```

## Releases

`3-0-0` establishes the initial HFP v3 payload contract. Subsequent promotions move `draft/` to an approved exact-version directory, replace its development discriminator with that exact SchemaVer, add the permanent `$id`, regenerate artifacts, record release evidence and checksums and freeze all version-local bytes. Tags and GitHub assets follow the separate publication procedure.

See [`RELEASING.md`](RELEASING.md) for the complete lifecycle, GitHub release process, canonical schema identity and optional SchemaStore catalog integration.

## License

The repository uses [CC0 1.0 Universal](LICENSE).
