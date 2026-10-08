import { createHash } from "node:crypto";
import type { EventType } from "../schemas/events";

export type EventPayload = Record<string, unknown>;

export type PublishEventInput = {
  projectId: string;
  idempotencyKey: string;
  type: EventType;
  payload: EventPayload;
};

export type StoredEvent = {
  id: string;
  projectId: string;
  type: EventType;
  payload: EventPayload;
  idempotencyKey: string;
  requestFingerprint: string;
  createdAt: Date;
};

export type PublicEvent = {
  id: string;
  projectId: string;
  type: EventType;
  payload: EventPayload;
  idempotencyKey: string;
  createdAt: string;
};

export type PublishEventResult =
  | {
      kind: "created";
      event: PublicEvent;
    }
  | {
      kind: "replayed";
      event: PublicEvent;
    }
  | {
      kind: "project_not_found";
    }
  | {
      kind: "idempotency_conflict";
    };

export type PublishEvent = (
  input: PublishEventInput,
) => Promise<PublishEventResult>;

export type CreateEventAndDeliveriesInput = PublishEventInput & {
  requestFingerprint: string;
};

export type PersistEventResult =
  | {
      kind: "created";
      event: StoredEvent;
    }
  | {
      kind: "existing";
      event: StoredEvent;
    };

export type EventQueries = {
  findProjectById(
    projectId: string,
  ): Promise<{ id: string } | null>;

  findEventByIdempotencyKey(
    projectId: string,
    idempotencyKey: string,
  ): Promise<StoredEvent | null>;

  createEventAndDeliveries(
    input: CreateEventAndDeliveriesInput,
  ): Promise<PersistEventResult>;
};

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(canonicalize);
  }

  if (value !== null && typeof value === "object") {
    const object = value as Record<string, unknown>;

    return Object.keys(object)
      .sort()
      .reduce<Record<string, unknown>>((result, key) => {
        result[key] = canonicalize(object[key]);
        return result;
      }, {});
  }

  return value;
}

export function createRequestFingerprint(
  type: EventType,
  payload: EventPayload,
): string {
  const canonicalRequest = JSON.stringify({
    type,
    payload: canonicalize(payload),
  });

  if (canonicalRequest === undefined) {
    throw new Error("Unable to serialize event request");
  }

  return createHash("sha256")
    .update(canonicalRequest)
    .digest("hex");
}

function toPublicEvent(event: StoredEvent): PublicEvent {
  return {
    id: event.id,
    projectId: event.projectId,
    type: event.type,
    payload: event.payload,
    idempotencyKey: event.idempotencyKey,
    createdAt: event.createdAt.toISOString(),
  };
}

function resolveExistingEvent(
  event: StoredEvent,
  requestFingerprint: string,
): PublishEventResult {
  if (event.requestFingerprint !== requestFingerprint) {
    return {
      kind: "idempotency_conflict",
    };
  }

  return {
    kind: "replayed",
    event: toPublicEvent(event),
  };
}

export function createEventService(
  queries: EventQueries,
): PublishEvent {
  return async (input) => {
    const project = await queries.findProjectById(input.projectId);

    if (!project) {
      return {
        kind: "project_not_found",
      };
    }

    const requestFingerprint = createRequestFingerprint(
      input.type,
      input.payload,
    );

    const existingEvent =
      await queries.findEventByIdempotencyKey(
        input.projectId,
        input.idempotencyKey,
      );

    if (existingEvent) {
      return resolveExistingEvent(
        existingEvent,
        requestFingerprint,
      );
    }

    const persisted =
      await queries.createEventAndDeliveries({
        ...input,
        requestFingerprint,
      });

    if (persisted.kind === "existing") {
      return resolveExistingEvent(
        persisted.event,
        requestFingerprint,
      );
    }

    return {
      kind: "created",
      event: toPublicEvent(persisted.event),
    };
  };
}