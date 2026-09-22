# HFP 3-0-0

This directory freezes the initial HFP v3 payload contract as SchemaVer `3-0-0`. Its schema, source modules, examples, and documentation remain immutable. The canonical schema identity follows `https://hsl.fi/schema/hfp/3-0-0/hfp.schema.json`; load the bundled schema locally rather than retrieving it during message validation. Payload validation does not establish complete producer acceptance or interoperability.

## Contract Rules and Operational Limits

The following rules describe this version's payload shapes. Open operational questions remain explicit; any change to this version's normative payload rules requires another SchemaVer.

- It exposes all 22 confirmed event names through a payload-only root union. The root accepts every message that some topic profile accepts: for each event, a field is required only when every topic profile of that event requires it.
- It uses the workbook field-applicability matrix as the initial event-body baseline.
- Its ordinary payload root remains payload-only and validates event body shapes without topic context. The separate topic-aware validator selects an exact event × journey type × temporal type × transport mode profile, with context-specific field applicability and requiredness.
- The topic-aware matrix has 297 exact profiles. They cover the supported HFP v2 contexts, the new-event contexts below, `robot` and `ubus` copies of every bus profile, and a `training` copy of every journey profile. Producers must supply a known transport mode; an empty mode has no profile. The source schema embeds this version's frozen profiles.
- Train DOUT supports journey/ongoing and its training/ongoing mirror without converting the topic to deadrun. Driver sign-out does not itself change the journey context; its body omits `oday`, `tste`, and journey identity. DUE, ARR, ARS, and WAIT support bus deadrun/ongoing and the `robot` and `ubus` aliases. They require `oper`, `dir`, `jrn`, `oday`, and `start` together, plus `tste`, `stop`, `ttarr`, and `ttdep`, and forbid `desi`, `line`, `route`, and `occu`, even as null. These 14 profiles correct omissions caused by a historical-context whitelist; they do not relax field semantics or admit unsupported contexts.
- New events: STP in journey/ongoing bus and tram; DOR wherever DOO and DOC occur; EVCHS and EVCHE in bus journey/ongoing and deadrun/ongoing; metro DOO, DOC, and DOR in journey/ongoing and deadrun/ongoing. Their trigger semantics remain open.
- New-event payload rules: STP carries the stop/timetable group optionally; EVCHS/EVCHE require `dr-type` and `evcp`, with `oper` and `oday` optional together in deadrun; metro door bodies omit `seq`. These shapes belong to `3-0-0`; operational trigger semantics still need domain-owner confirmation.
- Journey VP requires `dir` with `"1"` or `"2"`. Ongoing journey VP requires `dl`; upcoming VP omits it because the journey has not departed.
- Deadrun and signoff carry `oper`, `dir`, `jrn`, `oday`, and `start` together while the vehicle is signed onto a deadrun and omit all of them otherwise; they never carry `desi`, `line`, `route`, or `occu`. Assigned deadrun carries `dl` once it has departed its scheduled start.
- `stop` appears when the event relates to a stop. Stop events require `stop`, `ttarr`, and `ttdep`. Door, stop-request, and traffic-light events carry `ttarr` and `ttdep` together with `stop`; in a journey a stop always brings its scheduled times, and outside a journey the times also require a deadrun assignment.
- `lat` and `long` are null together, and exactly when `loc` is `N/A`. Metro reports trackside positioning as `loc: "MAN"`.
- `odo` appears in every VP of modes with an odometer and resets at every journey or deadrun sign-on. VJA captures the post-reset state and requires `odo: 0`, never null, where supported; capture it at sign-on rather than reading the live counter later at publication. VJA still omits `dl`. Metro and ferry omit `odo`; metro omits `occu` until it gets a full-vehicle button; ferry omits `occu` and `drst`.
- Null follows [Field Presence and Nullability](../README.md#field-presence-and-nullability): it means only that an applicable field's source failed at runtime (for example, a failed door-state module or GPS source). If a field does not apply in a topic context or vehicle state, omit it instead. Only `lat`, `long`, `spd`, `hdg`, `acc`, `odo`, `drst`, `dl`, and `evcp` can be null; identifiers, timestamps, timetable times, `tste`, `block`, `seq`, `label`, and traffic-light fields never are.
- `BA.block` is required because the event assigns the vehicle to a block. Bus and tram VJA/VJOUT carry `block` while the vehicle is signed onto a block; train VJA/VJOUT omit it.
- It retains `ttarr` on stop and door events under the no-implicit-v2-removal rule and adds it to TLR and TLA next to `ttdep`.
- It permits `dir: "0"` only for the unresolved metro deadrun migration case.
- It includes reserved `dr-type: 2` and uses `3` instead of the observed v2 sentinel `-1` when no driver is signed in.
- It accepts whole battery percentages from 0 through 100, or null.
- `tste` appears exactly when `oday` appears. Events without an operating-date anchor, such as DA and DOUT, omit it.
- TLR carries `tlp-line-configid` and `tlp-point-configid` only when that configuration level applies.
- TLR `tlp-protocol` accepts `KAR` and `KAR-MQTT`, matching the v3 workbook. The historical v2 `MQTT` label does not validate; its migration requires identifying the actual request protocol rather than blindly renaming it.
- Every event body requires the exact SchemaVer `3-0-0`. The schema carries `$id: https://hsl.fi/schema/hfp/3-0-0/hfp.schema.json` as its stable canonical identifier.

The ordinary root validates payload-only event shapes and cannot prove agreement with an MQTT topic. The schema also exposes `topicContexts.topicAwareMessage`, a validation-only envelope `{ "topic": { "journey_type", "temporal_type", "transport_mode" }, "event_type", "body" }` assembled by the caller; it is not sent on the wire. `createTopicAwareValidator()` requires one of the explicit context profiles and validates its selected v3 body shape, including rules that link fields within a body. Tuples outside the matrix are deliberately rejected rather than receiving an unreviewed event-only fallback.

## Intentional V2 Differences

- Every event body requires `schemaVersion: "3-0-0"`; other versions, development markers, and abbreviated versions fail validation.
- `start` requires zero-padded local `HH:mm` spelling.
- Unknown properties fail exact contract validation.

## Wire Types Kept From V2

Field types match what HFP v2 vehicle computers publish, so producers and consumers need no type conversions:

- `stop`, `block`, `line`, and `jrn` are integers and never null.
- `hdg` and `dl` accept integers or null. Cached HFP v2 evidence contains no fractional heading or schedule-deviation values.
- `spd`, `acc`, and `odo` accept numbers or null, including fractional values. `odo` remains nonnegative; applicable VJA requires exactly `0`, never null.
- `occu` accepts integers from 0 through 100 with the v2 meaning. A driver-controlled full-vehicle sign sends `0` or `100`. Passenger load/occupancy for metro and other modes without driver sign switches will eventually use passenger counting message channels.
- `block` was erroneously listed as `blo` in earlier draft materials.

## Confirmed Retentions And Mode Adaptations

- `ttarr` is confirmed retained on stop and door events; TLR and TLA carry it with `ttdep` when the request relates to a stop.
- `seq` is confirmed retained for multi-unit vehicles (e.g. metro) on `VP`.
- `label` is confirmed retained for ferries on `VP`.
- `line` and `jrn` may be omitted where unavailable (e.g. metro).
- `dir: "0"` remains allowed for metro deadrun; the data source provider still needs to confirm its operational meaning.

## Files

- `hfp.schema.json`: generated, self-contained Draft 2020-12 schema.
- `modules/hfp.source.schema.json`: frozen source used to reproduce this version's bundle.
- `examples/cases.json`: expectations for every public example.
- `examples/valid/`: synthetic accepted payloads.
- `examples/invalid-schema/`: synthetic rejected payloads.
- `release-evidence.json`: performed verification, promotion provenance, and unverified operational scope.
- `manifest.json`: SHA-256 digests keyed by sorted relative paths for every version-local file except the manifest itself.

Validate the frozen contract from the repository root without rewriting its files:

```sh
HFP_CONTRACT_DIRECTORY=3-0-0 npm run bundle:check
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:examples
HFP_CONTRACT_DIRECTORY=3-0-0 npm run validate:independent
```

Timestamp arithmetic, valid Gregorian calendar dates, `tst`/`tsi` equality, `tste` derivation, full MQTT grammar and topic agreement, event triggers, and operational behavior remain outside JSON Schema validation. The evidence records no claim of production rollout, producer/consumer interoperability, or compatibility with raw HFP v2 captures.
