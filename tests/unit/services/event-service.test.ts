import { describe, expect, it, vi } from "vitest";
import {
  createEventService,
  createRequestFingerprint,
  type CreateEventAndDeliveriesInput,
  type EventQueries,
  type PersistEventResult,
  type PublishEventInput,
  type StoredEvent,
} from "../../../server/services/event-service";

const projectId = "11111111-1111-4111-8111-111111111111";
const eventId = "22222222-2222-4222-8222-222222222222";
const createdAt = new Date("2026-10-10T00:00:00.000Z");

const input: PublishEventInput = {
  projectId,
  idempotencyKey: "event-1",
  type: "user.created",
  payload: { userId: "user-1" },
};

function createStoredEvent(
  overrides: Partial<StoredEvent> = {},
): StoredEvent {
  return {
    id: eventId,
    projectId,
    type: input.type,
    payload: input.payload,
    idempotencyKey: input.idempotencyKey,
    requestFingerprint: createRequestFingerprint(
      input.type,
      input.payload,
    ),
    createdAt,
    ...overrides,
  };
}

function createPersistenceResult(
  kind: "created" | "existing",
  event: StoredEvent,
): PersistEventResult {
  return { kind, event };
}

describe("event service", () => {
  it("returns project_not_found without querying events or persisting", async () => {
    const findProjectById = vi.fn<EventQueries["findProjectById"]>(
      async () => null,
    );
    const findEventByIdempotencyKey = vi.fn<
      EventQueries["findEventByIdempotencyKey"]
    >();
    const createEventAndDeliveries = vi.fn<
      EventQueries["createEventAndDeliveries"]
    >();
    const service = createEventService({
      findProjectById,
      findEventByIdempotencyKey,
      createEventAndDeliveries,
    });

    const result = await service(input);

    expect(result).toEqual({ kind: "project_not_found" });
    expect(findProjectById).toHaveBeenCalledWith(projectId);
    expect(findEventByIdempotencyKey).not.toHaveBeenCalled();
    expect(createEventAndDeliveries).not.toHaveBeenCalled();
  });

  it("returns replayed for an existing event with the same fingerprint", async () => {
    const existingEvent = createStoredEvent();
    const findProjectById = vi.fn<EventQueries["findProjectById"]>(
      async () => ({ id: projectId }),
    );
    const findEventByIdempotencyKey = vi.fn<
      EventQueries["findEventByIdempotencyKey"]
    >(async () => existingEvent);
    const createEventAndDeliveries = vi.fn<
      EventQueries["createEventAndDeliveries"]
    >();
    const service = createEventService({
      findProjectById,
      findEventByIdempotencyKey,
      createEventAndDeliveries,
    });

    const result = await service(input);

    expect(result).toEqual({
      kind: "replayed",
      event: {
        id: existingEvent.id,
        projectId: existingEvent.projectId,
        type: existingEvent.type,
        payload: existingEvent.payload,
        idempotencyKey: existingEvent.idempotencyKey,
        createdAt: createdAt.toISOString(),
      },
    });
    expect(findEventByIdempotencyKey).toHaveBeenCalledWith(
      projectId,
      input.idempotencyKey,
    );
    expect(createEventAndDeliveries).not.toHaveBeenCalled();
  });

  it("returns idempotency_conflict for an existing event with different data", async () => {
    const existingEvent = createStoredEvent({
      payload: { userId: "different-user" },
      requestFingerprint: createRequestFingerprint(
        input.type,
        { userId: "different-user" },
      ),
    });
    const findProjectById = vi.fn<EventQueries["findProjectById"]>(
      async () => ({ id: projectId }),
    );
    const findEventByIdempotencyKey = vi.fn<
      EventQueries["findEventByIdempotencyKey"]
    >(async () => existingEvent);
    const createEventAndDeliveries = vi.fn<
      EventQueries["createEventAndDeliveries"]
    >();
    const service = createEventService({
      findProjectById,
      findEventByIdempotencyKey,
      createEventAndDeliveries,
    });

    const result = await service(input);

    expect(result).toEqual({ kind: "idempotency_conflict" });
    expect(createEventAndDeliveries).not.toHaveBeenCalled();
  });

  it("persists a new event and returns its public representation", async () => {
    const findProjectById = vi.fn<EventQueries["findProjectById"]>(
      async () => ({ id: projectId }),
    );
    const findEventByIdempotencyKey = vi.fn<
      EventQueries["findEventByIdempotencyKey"]
    >(async () => null);
    const createEventAndDeliveries = vi.fn<
      EventQueries["createEventAndDeliveries"]
    >(async (persistInput: CreateEventAndDeliveriesInput) =>
      createPersistenceResult(
        "created",
        createStoredEvent({
          type: persistInput.type,
          payload: persistInput.payload,
          idempotencyKey: persistInput.idempotencyKey,
          requestFingerprint: persistInput.requestFingerprint,
        }),
      ),
    );
    const service = createEventService({
      findProjectById,
      findEventByIdempotencyKey,
      createEventAndDeliveries,
    });

    const result = await service(input);
    const expectedFingerprint = createRequestFingerprint(
      input.type,
      input.payload,
    );

    expect(result).toEqual({
      kind: "created",
      event: {
        id: eventId,
        projectId,
        type: input.type,
        payload: input.payload,
        idempotencyKey: input.idempotencyKey,
        createdAt: createdAt.toISOString(),
      },
    });
    expect(createEventAndDeliveries).toHaveBeenCalledWith({
      ...input,
      requestFingerprint: expectedFingerprint,
    });
  });

  it("resolves a persistence race as a replay when another request created the event first", async () => {
    const existingEvent = createStoredEvent();
    const findProjectById = vi.fn<EventQueries["findProjectById"]>(
      async () => ({ id: projectId }),
    );
    const findEventByIdempotencyKey = vi.fn<
      EventQueries["findEventByIdempotencyKey"]
    >(async () => null);
    const createEventAndDeliveries = vi.fn<
      EventQueries["createEventAndDeliveries"]
    >(async () => createPersistenceResult("existing", existingEvent));
    const service = createEventService({
      findProjectById,
      findEventByIdempotencyKey,
      createEventAndDeliveries,
    });

    const result = await service(input);

    expect(result).toMatchObject({
      kind: "replayed",
      event: {
        id: existingEvent.id,
        idempotencyKey: existingEvent.idempotencyKey,
      },
    });
  });
});
