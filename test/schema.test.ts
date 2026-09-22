import assert from "node:assert/strict";
import { test } from "node:test";

import fc from "fast-check";

import { contractDirectory } from "../src/contract-location.ts";
import { EVENT_TYPES } from "../src/contract.ts";
import {
  createEventValidators,
  createTopicAwareValidator,
  createValidator,
  schema,
  validatePayload,
} from "../src/validation.ts";

const expectedSchemaVersion =
  contractDirectory === "draft" ? "DRAFT" : contractDirectory;

const fieldValue: Record<string, unknown> = {
  schemaVersion: expectedSchemaVersion,
  oper: 12,
  veh: 34,
  tst: "2026-09-15T08:00:00.000Z",
  tsi: 1789459200,
  spd: 8.5,
  hdg: 180,
  lat: 60.17,
  long: 24.94,
  acc: -0.2,
  odo: 1250,
  drst: 0,
  loc: "GPS",
  tste: "2026-09-15T08:00:00.000Z",
  desi: "10",
  dir: "1",
  dl: -30,
  oday: "2026-09-15",
  jrn: 123,
  line: 456,
  start: "08:05",
  stop: 1000001,
  route: "1101",
  occu: 0,
  ttarr: "2026-09-15T08:02:00.000Z",
  ttdep: "2026-09-15T08:03:00.000Z",
  "dr-type": 1,
  block: 123,
  seq: 1,
  label: "Suomenlinna II",
  evcp: 75,
  sid: 1,
  "signal-groupid": 2,
  "tlp-signalgroupnbr": 3,
  "tlp-requestid": 4,
  "tlp-requesttype": "NORMAL",
  "tlp-prioritylevel": "normal",
  "tlp-line-configid": 7,
  "tlp-point-configid": 8,
  "tlp-frequency": 5,
  "tlp-protocol": "KAR-MQTT",
  "tlp-att-seq": 1,
  "tlp-decision": "ACK",
};

/**
 * A payload carrying every field the event body defines (for TLR, the
 * normal-priority branch). Topic-aware tests narrow it to a context profile.
 */
const makeEventPayload = (event: (typeof EVENT_TYPES)[number]): unknown => {
  const defs = schema["$defs"] as {
    bodies: Record<
      string,
      {
        properties?: Record<string, unknown>;
        oneOf?: readonly { properties: Record<string, unknown> }[];
      }
    >;
  };
  const definition = defs.bodies[event];
  assert.ok(definition);
  const properties = definition.properties ?? definition.oneOf?.[0]?.properties;
  assert.ok(properties);
  return {
    [event]: Object.fromEntries(
      Object.keys(properties).map((field) => [
        field,
        event === "VJA" && field === "odo" ? 0 : fieldValue[field],
      ]),
    ),
  };
};

type TopicProfileSchema = {
  readonly properties: {
    readonly topic: {
      readonly properties: Record<string, { readonly const?: unknown }>;
    };
    readonly event_type: { readonly const?: unknown };
    readonly body: Record<string, unknown>;
  };
};

const topicProfileFor = (
  event: (typeof EVENT_TYPES)[number],
  topic: {
    readonly journey_type: string;
    readonly temporal_type: string;
    readonly transport_mode: string;
  },
): TopicProfileSchema | undefined => {
  const topicContexts = (
    schema.$defs as {
      topicContexts: { contextProfiles: Record<string, TopicProfileSchema> };
    }
  ).topicContexts;
  return Object.values(topicContexts.contextProfiles).find(
    (candidate) =>
      candidate.properties.event_type.const === event &&
      candidate.properties.topic.properties.journey_type?.const ===
        topic.journey_type &&
      candidate.properties.topic.properties.temporal_type?.const ===
        topic.temporal_type &&
      candidate.properties.topic.properties.transport_mode?.const ===
        topic.transport_mode,
  );
};

const contextBodyFor = (
  event: (typeof EVENT_TYPES)[number],
  topic: {
    readonly journey_type: string;
    readonly temporal_type: string;
    readonly transport_mode: string;
  },
  overrides: Record<string, unknown> = {},
): Record<string, unknown> => {
  const profile = topicProfileFor(event, topic);
  assert.ok(
    profile,
    `${event}/${topic.journey_type}/${topic.temporal_type}/${topic.transport_mode}`,
  );

  const allowed = new Set<string>();
  const collect = (node: unknown): void => {
    if (typeof node !== "object" || node === null) return;
    const current = node as Record<string, unknown>;
    if (typeof current.properties === "object" && current.properties !== null) {
      for (const name of Object.keys(current.properties)) allowed.add(name);
    }
    for (const keyword of ["allOf", "anyOf", "oneOf"] as const) {
      const branches = current[keyword];
      if (Array.isArray(branches)) branches.forEach(collect);
    }
  };
  collect(profile.properties.body);

  const payload = makeEventPayload(event) as Record<
    string,
    Record<string, unknown>
  >;
  return Object.fromEntries(
    Object.entries({ ...payload[event], ...overrides }).filter(([name]) =>
      allowed.has(name),
    ),
  );
};

void test("the selected contract has the expected schema identity", () => {
  const validate = createValidator();
  const wrongVersionPayload = makeEventPayload("DA") as {
    DA: Record<string, unknown>;
  };
  assert.equal(validatePayload(validate, wrongVersionPayload).valid, true);
  if (contractDirectory === "draft") {
    assert.equal(schema["$id"], undefined);
    wrongVersionPayload.DA.schemaVersion = "3-0-0";
  } else {
    assert.equal(
      schema["$id"],
      `https://hsl.fi/schema/hfp/${contractDirectory}/hfp.schema.json`,
    );
    wrongVersionPayload.DA.schemaVersion = "DRAFT";
  }
  assert.equal(validatePayload(validate, wrongVersionPayload).valid, false);
});

void test("every event has a valid representative payload", () => {
  const validators = createEventValidators();
  for (const event of EVENT_TYPES) {
    const result = validatePayload(validators[event], makeEventPayload(event));
    assert.equal(
      result.valid,
      true,
      `${event}: ${JSON.stringify(result.errors)}`,
    );
  }
});

void test("suppressed TLR requires a reason", () => {
  const validate = createValidator();
  const payload = makeEventPayload("TLR") as {
    TLR: Record<string, unknown>;
  };
  payload.TLR["tlp-prioritylevel"] = "norequest";
  assert.equal(validatePayload(validate, payload).valid, false);
  payload.TLR["tlp-reason"] = "PRIOEXEP";
  assert.equal(validatePayload(validate, payload).valid, true);
});

void test("BA requires the assigned block property", () => {
  const validate = createValidator();
  const payload = makeEventPayload("BA") as {
    BA: Record<string, unknown>;
  };
  assert.equal(validatePayload(validate, payload).valid, true);
  payload.BA.block = null;
  assert.equal(validatePayload(validate, payload).valid, false, "never null");
  delete payload.BA.block;
  assert.equal(validatePayload(validate, payload).valid, false);
});

void test("DA and DOUT omit tste when there is no operating-date anchor", () => {
  const validate = createValidator();
  for (const event of ["DA", "DOUT"] as const) {
    const payload = makeEventPayload(event) as Record<
      string,
      Record<string, unknown>
    >;
    assert.equal(validatePayload(validate, payload).valid, true, event);
    const body = payload[event];
    assert.ok(body);
    assert.equal(Object.hasOwn(body, "tste"), false, event);

    const invalid = { [event]: { ...body, tste: null } };
    assert.equal(validatePayload(validate, invalid).valid, false, event);
  }
});

void test("topic-aware journey VP requires never-null journey identity and direction", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const body: Record<string, unknown> = contextBodyFor("VP", topic);
  const envelope = {
    topic,
    event_type: "VP",
    body,
  };
  const without = (field: string) => ({
    ...envelope,
    body: Object.fromEntries(
      Object.entries(envelope.body).filter(([name]) => name !== field),
    ),
  });

  assert.equal(validatePayload(validate, envelope).valid, true);
  for (const field of [
    "desi",
    "dir",
    "jrn",
    "line",
    "oday",
    "oper",
    "route",
    "start",
  ]) {
    const nulled = structuredClone(envelope);
    nulled.body[field] = null;
    assert.equal(
      validatePayload(validate, nulled).valid,
      false,
      `${field} is never null`,
    );
    assert.equal(
      validatePayload(validate, without(field)).valid,
      false,
      `${field} must be present in an assigned journey`,
    );
  }
  for (const dir of ["0", "3", ""]) {
    assert.equal(
      validatePayload(validate, { ...envelope, body: { ...body, dir } }).valid,
      false,
      `journey direction ${dir} is invalid`,
    );
  }

  const unavailable = structuredClone(envelope);
  unavailable.body.dl = null;
  unavailable.body.odo = null;
  assert.equal(
    validatePayload(validate, unavailable).valid,
    true,
    "device values may be null when they fail at runtime",
  );
  for (const field of ["dl", "odo"]) {
    assert.equal(
      validatePayload(validate, without(field)).valid,
      false,
      `${field} applies to an ongoing journey and must be present`,
    );
  }

  assert.equal(
    validatePayload(validate, without("stop")).valid,
    true,
    "stop appears only when the event relates to a stop",
  );
  assert.equal(
    validatePayload(validate, { ...envelope, body: { ...body, stop: null } })
      .valid,
    false,
    "stop is omitted, never null",
  );
});

void test("topic-aware journey identity applies across journey-bearing event bodies", () => {
  const validate = createTopicAwareValidator();
  const journeyEvents = [
    "VP",
    "DUE",
    "ARR",
    "ARS",
    "PDE",
    "DEP",
    "PAS",
    "WAIT",
    "STP",
    "DOR",
    "DOO",
    "DOC",
    "TLR",
    "TLA",
    "VJA",
    "VJOUT",
  ] as const;
  const journeyTopic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const supportedJourneyEvents = journeyEvents.filter((event) =>
    topicProfileFor(event, journeyTopic),
  );
  assert.deepEqual(
    supportedJourneyEvents,
    [...journeyEvents],
    "every journey-bearing event has a bus journey profile",
  );

  for (const event of supportedJourneyEvents) {
    const body = contextBodyFor(event, journeyTopic);
    assert.equal(
      validatePayload(validate, {
        topic: journeyTopic,
        event_type: event,
        body,
      }).valid,
      true,
      event,
    );
  }

  const metroTopic = { ...journeyTopic, transport_mode: "metro" };
  assert.equal(topicProfileFor("STP", metroTopic), undefined);
  assert.equal(
    validatePayload(validate, {
      topic: metroTopic,
      event_type: "STP",
      body: (makeEventPayload("STP") as { STP: Record<string, unknown> }).STP,
    }).valid,
    false,
    "topic/event combinations without a profile are rejected",
  );
});

void test("topic-aware profiles distinguish transport modes and documented aliases", () => {
  const validate = createTopicAwareValidator();
  const busTopic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const metroTopic = { ...busTopic, transport_mode: "metro" };
  const busProfile = topicProfileFor("VP", busTopic);
  const metroProfile = topicProfileFor("VP", metroTopic);
  assert.ok(busProfile);
  assert.ok(metroProfile);
  const busBodySchema = busProfile.properties.body;
  const metroBodySchema = metroProfile.properties.body;
  assert.equal(Object.hasOwn(busBodySchema.properties as object, "jrn"), true);
  assert.equal(
    Object.hasOwn(metroBodySchema.properties as object, "jrn"),
    false,
    "metro journey VP has no jrn property",
  );
  assert.equal(Object.hasOwn(busBodySchema.properties as object, "seq"), false);
  assert.equal(
    Object.hasOwn(metroBodySchema.properties as object, "seq"),
    true,
    "metro journey VP has its mode-specific seq property",
  );

  const busBody = contextBodyFor("VP", busTopic);
  for (const aliasTopic of [
    { ...busTopic, transport_mode: "robot" },
    { ...busTopic, transport_mode: "ubus" },
    { ...busTopic, journey_type: "training" },
    { ...busTopic, journey_type: "training", transport_mode: "robot" },
    { ...busTopic, journey_type: "training", transport_mode: "ubus" },
  ]) {
    assert.ok(topicProfileFor("VP", aliasTopic));
    assert.equal(
      validatePayload(validate, {
        topic: aliasTopic,
        event_type: "VP",
        body: busBody,
      }).valid,
      true,
    );
  }
  assert.equal(
    validatePayload(validate, {
      topic: { ...busTopic, transport_mode: "" },
      event_type: "VP",
      body: busBody,
    }).valid,
    false,
    "an empty transport mode is a producer defect",
  );
});

void test("training accepts the same applicable bodies as every journey context", () => {
  const validate = createTopicAwareValidator();
  // The bundled schema's context registry is the test's typed boundary.
  const definitions = schema.$defs as {
    topicContexts: { contextProfiles: Record<string, TopicProfileSchema> };
  };
  const topicContexts = definitions.topicContexts;
  for (const profile of Object.values(topicContexts.contextProfiles)) {
    const dimensions = profile.properties.topic.properties;
    if (dimensions.journey_type?.const !== "journey") continue;
    const event = profile.properties.event_type
      .const as (typeof EVENT_TYPES)[number];
    const topic = {
      journey_type: "journey",
      temporal_type: String(dimensions.temporal_type?.const),
      transport_mode: String(dimensions.transport_mode?.const),
    };
    const body = contextBodyFor(event, topic);
    assert.equal(
      validatePayload(validate, {
        topic: { ...topic, journey_type: "training" },
        event_type: event,
        body,
      }).valid,
      true,
      `${event}/training/${topic.temporal_type}/${topic.transport_mode}`,
    );
    assert.equal(
      validatePayload(validate, {
        topic: { ...topic, journey_type: "training" },
        event_type: event,
        body: { ...body, unknown: 1 },
      }).valid,
      false,
      `${event} training still rejects unknown body fields`,
    );
  }
});

void test("deadrun VP carries the journey assignment as a whole and no passenger designation", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "deadrun",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const assigned = contextBodyFor("VP", topic);
  const unassigned = Object.fromEntries(
    Object.entries(assigned).filter(
      ([name]) =>
        !["oper", "dir", "jrn", "oday", "start", "tste", "dl", "stop"].includes(
          name,
        ),
    ),
  );
  const check = (body: Record<string, unknown>): boolean =>
    validatePayload(validate, { topic, event_type: "VP", body }).valid;
  assert.equal(check(assigned), true, "signed onto a deadrun");
  assert.equal(check(unassigned), true, "not signed on");
  assert.equal(check({ ...assigned, dl: null }), true, "dl failed at runtime");
  assert.equal(check({ ...unassigned, jrn: 123 }), false, "partial bundle");
  assert.equal(check({ ...unassigned, dl: -30 }), false, "dl needs assignment");
  assert.equal(
    check({ ...unassigned, dl: null }),
    false,
    "dl needs assignment",
  );
  assert.equal(check({ ...assigned, oper: null }), false, "never null");
  const withoutTste = Object.fromEntries(
    Object.entries(assigned).filter(([name]) => name !== "tste"),
  );
  assert.equal(check(withoutTste), false, "tste appears exactly with oday");
  for (const field of ["desi", "line", "route", "occu"]) {
    assert.equal(
      check({ ...assigned, [field]: fieldValue[field] }),
      false,
      `${field} does not apply in deadrun`,
    );
  }
  assert.equal(check({ ...assigned, dir: "0" }), false, "bus direction 0");

  const metroTopic = { ...topic, transport_mode: "metro" };
  const metro = contextBodyFor("VP", metroTopic, { dir: "0" });
  assert.equal(
    validatePayload(validate, {
      topic: metroTopic,
      event_type: "VP",
      body: metro,
    }).valid,
    true,
    "metro deadrun accepts direction 0",
  );
});

void test("train driver-out retains journey and training contexts without journey identity", () => {
  const validate = createTopicAwareValidator();
  const sourceTopic = {
    journey_type: "deadrun",
    temporal_type: "ongoing",
    transport_mode: "train",
  };
  const body = contextBodyFor("DOUT", sourceTopic);
  for (const journey_type of ["journey", "training", "deadrun"]) {
    const topic = { ...sourceTopic, journey_type };
    const check = (overrides: Record<string, unknown>): boolean =>
      validatePayload(validate, {
        topic,
        event_type: "DOUT",
        body: { ...body, ...overrides },
      }).valid;
    assert.equal(check({}), true, `${journey_type} train driver-out`);
    for (const value of [0, 1, 2, 3]) {
      assert.equal(check({ "dr-type": value }), true);
    }
    for (const value of [-1, 4, null, "3"]) {
      assert.equal(check({ "dr-type": value }), false, "invalid driver type");
    }
    for (const field of [
      "oday",
      "tste",
      "dir",
      "jrn",
      "start",
      "desi",
      "line",
      "route",
      "occu",
    ]) {
      for (const value of [fieldValue[field], null]) {
        assert.equal(
          check({ [field]: value }),
          false,
          `${field} is inapplicable`,
        );
      }
    }
    for (const field of ["oper", "veh", "tst", "tsi", "loc"]) {
      assert.equal(check({ [field]: null }), false, `${field} is never null`);
    }
    for (const field of ["spd", "hdg", "acc", "odo", "drst"]) {
      assert.equal(
        check({ [field]: null }),
        true,
        `${field} failed independently`,
      );
    }
    assert.equal(check({ lat: null, long: null, loc: "N/A" }), true);
    assert.equal(check({ lat: null, long: null }), false);
    assert.equal(check({ lat: null, loc: "N/A" }), false);
    assert.equal(check({ long: null, loc: "N/A" }), false);
    assert.equal(check({ loc: "N/A" }), false);
    assert.equal(check({ schemaVersion: "2.0" }), false);
    assert.equal(check({ tst: "not-a-timestamp" }), false);
    assert.equal(check({ tsi: "1789459200" }), false);
    assert.equal(check({ oper: "12" }), false);
    assert.equal(check({ unknown: 1 }), false);
  }
  for (const topic of [
    { ...sourceTopic, journey_type: "journey", temporal_type: "upcoming" },
    { ...sourceTopic, journey_type: "training", temporal_type: "upcoming" },
    { ...sourceTopic, journey_type: "journey", transport_mode: "tram" },
    { ...sourceTopic, journey_type: "journey", transport_mode: "metro" },
    { ...sourceTopic, journey_type: "journey", transport_mode: "ferry" },
  ]) {
    assert.equal(
      validatePayload(validate, { topic, event_type: "DOUT", body }).valid,
      false,
      `unsupported DOUT/${topic.journey_type}/${topic.temporal_type}/${topic.transport_mode}`,
    );
  }
});

void test("bus deadrun stop events require assignment and scheduled stop fields", () => {
  const validate = createTopicAwareValidator();
  const sourceTopic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const passengerFields = ["desi", "line", "route", "occu"];
  const assignmentFields = ["oper", "dir", "jrn", "oday", "start"];
  const stopFields = ["stop", "ttarr", "ttdep"];
  for (const event of ["DUE", "ARR", "ARS", "WAIT"] as const) {
    const body = Object.fromEntries(
      Object.entries(contextBodyFor(event, sourceTopic)).filter(
        ([name]) => !passengerFields.includes(name),
      ),
    );
    for (const transport_mode of ["bus", "robot", "ubus"]) {
      const topic = { ...sourceTopic, journey_type: "deadrun", transport_mode };
      const check = (candidate: Record<string, unknown>): boolean =>
        validatePayload(validate, { topic, event_type: event, body: candidate })
          .valid;
      const omit = (fields: readonly string[]): Record<string, unknown> =>
        Object.fromEntries(
          Object.entries(body).filter(([name]) => !fields.includes(name)),
        );
      const label = `${event}/${transport_mode}`;
      assert.equal(check(body), true, `${label} assigned scheduled stop`);
      for (const field of passengerFields) {
        for (const value of [fieldValue[field], null]) {
          assert.equal(
            check({ ...body, [field]: value }),
            false,
            `${label} forbids ${field}`,
          );
        }
      }
      for (const field of [...assignmentFields, ...stopFields, "tste"]) {
        assert.equal(check(omit([field])), false, `${label} requires ${field}`);
        assert.equal(
          check({ ...body, [field]: null }),
          false,
          `${label} never-null ${field}`,
        );
      }
      assert.equal(
        check(omit([...assignmentFields, "tste", "dl"])),
        false,
        `${label} timetable without assignment`,
      );
      assert.equal(
        check(omit([...assignmentFields, ...stopFields, "tste", "dl"])),
        false,
        `${label} unassigned event without stop`,
      );
      assert.equal(
        check(omit(stopFields)),
        false,
        `${label} requires stop group`,
      );
      for (const field of ["spd", "hdg", "acc", "odo", "drst", "dl"]) {
        assert.equal(
          check({ ...body, [field]: null }),
          true,
          `${label} ${field} failed independently`,
        );
      }
      for (const field of ["veh", "tst", "tsi", "loc"]) {
        assert.equal(
          check({ ...body, [field]: null }),
          false,
          `${label} ${field}`,
        );
      }
      assert.equal(check({ ...body, lat: null, long: null, loc: "N/A" }), true);
      assert.equal(check({ ...body, lat: null, long: null }), false);
      assert.equal(check({ ...body, lat: null, loc: "N/A" }), false);
      assert.equal(check({ ...body, long: null, loc: "N/A" }), false);
      assert.equal(check({ ...body, loc: "N/A" }), false);
      assert.equal(check({ ...body, dir: "0" }), false);
      assert.equal(check({ ...body, stop: "1000001" }), false);
      assert.equal(check({ ...body, jrn: "123" }), false);
      assert.equal(check({ ...body, start: "8:05" }), false);
      assert.equal(check({ ...body, ttarr: "not-a-timestamp" }), false);
      assert.equal(check({ ...body, ttdep: "not-a-timestamp" }), false);
      assert.equal(check({ ...body, unknown: 1 }), false);
    }
    for (const topic of [
      { ...sourceTopic, journey_type: "deadrun", temporal_type: "upcoming" },
      { ...sourceTopic, journey_type: "signoff" },
      { ...sourceTopic, journey_type: "deadrun", transport_mode: "train" },
      { ...sourceTopic, journey_type: "deadrun", transport_mode: "tram" },
      { ...sourceTopic, journey_type: "deadrun", transport_mode: "metro" },
      { ...sourceTopic, journey_type: "deadrun", transport_mode: "ferry" },
    ]) {
      assert.equal(
        validatePayload(validate, { topic, event_type: event, body }).valid,
        false,
        `unsupported ${event}/${topic.journey_type}/${topic.temporal_type}/${topic.transport_mode}`,
      );
    }
  }
});

void test("coordinates are null together and exactly with loc N/A", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "tram",
  };
  const body = contextBodyFor("VP", topic);
  const check = (overrides: Record<string, unknown>): boolean =>
    validatePayload(validate, {
      topic,
      event_type: "VP",
      body: { ...body, ...overrides },
    }).valid;
  assert.equal(check({ lat: null, long: null, loc: "N/A" }), true);
  assert.equal(check({ lat: null, long: null, loc: "GPS" }), false);
  assert.equal(check({ loc: "N/A" }), false);
  assert.equal(check({ lat: null, loc: "N/A" }), false);
});

void test("door and traffic-light events carry stop and timetable times together", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  for (const event of ["DOO", "DOC", "DOR", "TLR", "TLA"] as const) {
    const body = contextBodyFor(event, topic);
    const check = (fields: readonly string[]): boolean =>
      validatePayload(validate, {
        topic,
        event_type: event,
        body: Object.fromEntries(
          Object.entries(body).filter(([name]) => !fields.includes(name)),
        ),
      }).valid;
    assert.equal(check([]), true, `${event} at a stop`);
    assert.equal(
      check(["stop", "ttarr", "ttdep"]),
      true,
      `${event} away from a stop`,
    );
    assert.equal(
      check(["ttarr", "ttdep"]),
      false,
      `${event} stop without times`,
    );
    assert.equal(check(["stop"]), false, `${event} times without stop`);
    assert.equal(check(["ttdep"]), false, `${event} arrival without departure`);
  }
});

void test("the payload-only root accepts every topic-profile body", () => {
  const validators = createEventValidators();
  const validate = createTopicAwareValidator();
  const topicContexts = (
    schema.$defs as {
      topicContexts: { contextProfiles: Record<string, TopicProfileSchema> };
    }
  ).topicContexts;
  for (const profile of Object.values(topicContexts.contextProfiles)) {
    const event = profile.properties.event_type
      .const as (typeof EVENT_TYPES)[number];
    const dimensions = profile.properties.topic.properties;
    const topic = {
      journey_type: String(dimensions.journey_type?.const),
      temporal_type: String(dimensions.temporal_type?.const),
      transport_mode: String(dimensions.transport_mode?.const),
    };
    const label = `${event}/${topic.journey_type}/${topic.temporal_type}/${topic.transport_mode}`;
    const body = contextBodyFor(event, topic);
    assert.equal(
      validatePayload(validate, { topic, event_type: event, body }).valid,
      true,
      label,
    );
    assert.equal(
      validatePayload(validators[event], { [event]: body }).valid,
      true,
      label,
    );
  }

  const deadrun = {
    journey_type: "deadrun",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const unassigned = Object.fromEntries(
    Object.entries(contextBodyFor("VP", deadrun)).filter(
      ([name]) =>
        !["oper", "dir", "jrn", "oday", "start", "tste", "dl", "stop"].includes(
          name,
        ),
    ),
  );
  assert.equal(
    validatePayload(validators.VP, { VP: unassigned }).valid,
    true,
    "an unassigned deadrun VP passes the root",
  );
});

void test("journey-upcoming VP omits schedule deviation and keeps the odometer", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "journey",
    temporal_type: "upcoming",
    transport_mode: "bus",
  };
  const body: Record<string, unknown> = contextBodyFor("VP", topic, {
    oday: "2026-09-16",
  });
  const envelope = {
    topic,
    event_type: "VP",
    body,
  };

  assert.equal(validatePayload(validate, envelope).valid, true);
  assert.equal(Object.hasOwn(body, "dl"), false);
  for (const value of [null, 0]) {
    assert.equal(
      validatePayload(validate, { ...envelope, body: { ...body, dl: value } })
        .valid,
      false,
      "dl must be omitted, not null or a value, before departure",
    );
  }
  assert.equal(
    validatePayload(validate, { ...envelope, body: { ...body, odo: null } })
      .valid,
    true,
    "odo applies in every VP and may fail at runtime",
  );
  assert.equal(
    validatePayload(validate, {
      ...envelope,
      body: Object.fromEntries(
        Object.entries(body).filter(([name]) => name !== "odo"),
      ),
    }).valid,
    false,
    "odo applies in every VP",
  );
});

void test("VJA records the post-reset odometer as exactly zero", () => {
  const validate = createTopicAwareValidator();
  const validateRoot = createEventValidators().VJA;
  const profiles = (
    schema.$defs as {
      topicContexts: { contextProfiles: Record<string, TopicProfileSchema> };
    }
  ).topicContexts.contextProfiles;
  for (const profile of Object.values(profiles)) {
    if (profile.properties.event_type.const !== "VJA") continue;
    const dimensions = profile.properties.topic.properties;
    const topic = {
      journey_type: String(dimensions.journey_type?.const),
      temporal_type: String(dimensions.temporal_type?.const),
      transport_mode: String(dimensions.transport_mode?.const),
    };
    const label = `VJA/${topic.journey_type}/${topic.transport_mode}`;
    const body = contextBodyFor("VJA", topic, { odo: 0 });
    const check = (candidate: Record<string, unknown>): boolean =>
      validatePayload(validate, { topic, event_type: "VJA", body: candidate })
        .valid;
    assert.equal(Object.hasOwn(body, "odo"), true, label);
    assert.equal(check(body), true, label);
    assert.equal(
      validatePayload(validateRoot, { VJA: body }).valid,
      true,
      label,
    );
    for (const odo of [null, -1, 1, 0.5, "0"]) {
      assert.equal(
        check({ ...body, odo }),
        false,
        `${label}: ${JSON.stringify(odo)}`,
      );
      assert.equal(
        validatePayload(validateRoot, { VJA: { ...body, odo } }).valid,
        false,
        label,
      );
    }
    const withoutOdometer = Object.fromEntries(
      Object.entries(body).filter(([name]) => name !== "odo"),
    );
    assert.equal(
      check(withoutOdometer),
      false,
      `${label}: missing reset value`,
    );
    assert.equal(
      validatePayload(validateRoot, { VJA: withoutOdometer }).valid,
      false,
      label,
    );
    fc.assert(
      fc.property(fc.oneof(fc.constant(0), fc.jsonValue()), (odo) => {
        assert.equal(
          validatePayload(validateRoot, { VJA: { ...body, odo } }).valid,
          odo === 0,
          label,
        );
      }),
    );
  }
});

void test("TLR protocol follows the workbook KAR and KAR-MQTT spellings", () => {
  const validate = createTopicAwareValidator();
  const validateRoot = createEventValidators().TLR;
  const topic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const body = contextBodyFor("TLR", topic);
  for (const [protocol, expected] of [
    ["KAR", true],
    ["KAR-MQTT", true],
    ["MQTT", false],
    ["kar", false],
    [null, false],
  ] as const) {
    const candidate = { ...body, "tlp-protocol": protocol };
    assert.equal(
      validatePayload(validate, { topic, event_type: "TLR", body: candidate })
        .valid,
      expected,
      String(protocol),
    );
    assert.equal(
      validatePayload(validateRoot, { TLR: candidate }).valid,
      expected,
      String(protocol),
    );
  }
});

void test("null remains valid for runtime telemetry failures in an applicable context", () => {
  const validate = createTopicAwareValidator();
  const topic = {
    journey_type: "deadrun",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const body = contextBodyFor("VP", topic, {
    spd: null,
    lat: null,
    long: null,
    loc: "N/A",
  });

  assert.equal(
    validatePayload(validate, {
      topic,
      event_type: "VP",
      body,
    }).valid,
    true,
  );
});

void test("topic-aware envelope checks event type against the event body schema", () => {
  const validate = createTopicAwareValidator();
  const body = (makeEventPayload("DA") as { DA: Record<string, unknown> }).DA;
  assert.equal(
    validatePayload(validate, {
      topic: {
        journey_type: "journey",
        temporal_type: "ongoing",
        transport_mode: "bus",
      },
      event_type: "VP",
      body,
    }).valid,
    false,
  );
});

void test("validation never removes an unknown property", () => {
  const payload = {
    DA: {
      schemaVersion: expectedSchemaVersion,
      oper: 12,
      veh: 34,
      tst: "2026-09-15T08:00:00.000Z",
      tsi: 1789459200,
      spd: 0,
      hdg: 90,
      lat: 60.17,
      long: 24.94,
      acc: 0,
      odo: 0,
      drst: 0,
      loc: "GPS",
      "dr-type": 1,
      unexpected: true,
    },
  };
  const before = structuredClone(payload);
  const result = validatePayload(createValidator(), payload);
  assert.equal(result.valid, false);
  assert.deepEqual(payload, before);
});

void test("all unsupported occupancy values fail without mutation", () => {
  const validate = createValidator();
  fc.assert(
    fc.property(
      fc.integer().filter((value) => value < 0 || value > 100),
      (occu) => {
        const payload = {
          VP: {
            schemaVersion: expectedSchemaVersion,
            oper: 12,
            veh: 34,
            tst: "2026-09-15T08:00:00.000Z",
            tsi: 1789459200,
            spd: 8.5,
            hdg: 180,
            lat: 60.17,
            long: 24.94,
            acc: -0.2,
            odo: 1250,
            drst: 0,
            loc: "GPS",
            tste: "2026-09-15T08:00:00.000Z",
            desi: "10",
            dir: "1",
            dl: -30,
            oday: "2026-09-15",
            jrn: 123,
            line: 456,
            start: "08:05",
            stop: 1000001,
            route: "1101",
            occu,
          },
        };
        const before = structuredClone(payload);
        assert.equal(validatePayload(validate, payload).valid, false);
        assert.deepEqual(payload, before);
      },
    ),
  );
});

const metroVp = {
  VP: {
    schemaVersion: expectedSchemaVersion,
    oper: 50,
    veh: 34,
    tst: "2026-09-15T08:00:00.000Z",
    tsi: 1789459200,
    spd: 8.5,
    hdg: 180,
    lat: 60.17,
    long: 24.94,
    acc: null,
    odo: null,
    drst: null,
    loc: "MAN",
    tste: "2026-09-15T08:00:00.000Z",
    desi: "M1",
    dir: "0",
    dl: null,
    oday: "2026-09-15",
    start: "08:05",
    stop: 1000001,
    route: "31M1",
    occu: 0,
    seq: 2,
  },
};

void test("VP accepts dir 0, seq, and omitted line and jrn", () => {
  assert.equal(validatePayload(createValidator(), metroVp).valid, true);
});

void test("VP rejects v3-only representations of v2 integer fields", () => {
  const validate = createValidator();
  for (const [field, value] of [
    ["line", "LINE456"],
    ["jrn", "JRN123"],
    ["stop", "1000001"],
    ["hdg", 180.5],
    ["dl", -30.5],
  ] as const) {
    const payload = { VP: { ...metroVp.VP, [field]: value } };
    assert.equal(validatePayload(validate, payload).valid, false, field);
  }
});

void test("odometer accepts fractional meters without weakening bounds or wire types", () => {
  const root = createValidator();
  const topicAware = createTopicAwareValidator();
  const topic = {
    journey_type: "journey",
    temporal_type: "ongoing",
    transport_mode: "bus",
  };
  const body = contextBodyFor("VP", topic);
  for (const odo of [0.25, 18705.4783038795, null]) {
    const candidate = { ...body, odo };
    assert.equal(validatePayload(root, { VP: candidate }).valid, true);
    assert.equal(
      validatePayload(topicAware, { topic, event_type: "VP", body: candidate })
        .valid,
      true,
    );
  }
  for (const odo of [-0.25, "0.25"]) {
    const candidate = { ...body, odo };
    assert.equal(validatePayload(root, { VP: candidate }).valid, false);
    assert.equal(
      validatePayload(topicAware, { topic, event_type: "VP", body: candidate })
        .valid,
      false,
    );
  }
});

void test("BA block is required, never null, and rejects non-integer values", () => {
  const validate = createValidator();
  const validPayload = {
    BA: {
      schemaVersion: expectedSchemaVersion,
      oper: 12,
      veh: 34,
      tst: "2026-09-15T08:00:00.000Z",
      tsi: 1789459200,
      spd: 0,
      hdg: 0,
      lat: 60.17,
      long: 24.94,
      acc: 0,
      odo: 0,
      drst: 0,
      loc: "GPS",
      tste: "2026-09-15T08:00:00.000Z",
      oday: "2026-09-15",
      "dr-type": 1,
      block: 123,
    },
  };
  assert.equal(validatePayload(validate, validPayload).valid, true);

  const nullBlock = { BA: { ...validPayload.BA, block: null } };
  assert.equal(validatePayload(validate, nullBlock).valid, false);

  const stringBlock = { BA: { ...validPayload.BA, block: "00123" } };
  assert.equal(validatePayload(validate, stringBlock).valid, false);
});
