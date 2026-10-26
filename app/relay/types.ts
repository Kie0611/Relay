export type ConnectionMode = "live" | "preview";

export type DeliveryStatus =
  | "pending"
  | "processing"
  | "retrying"
  | "delivered"
  | "failed"
  | "dead_lettered"
  | "cancelled";

export type Endpoint = {
  id: string;
  projectId: string;
  url: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type Delivery = {
  deliveryId: string;
  eventId: string;
  eventType: string;
  endpointId?: string;
  endpointUrl: string;
  endpointActive?: boolean;
  runId?: string;
  runNumber?: number;
  runType?: "initial" | "manual_replay";
  status: DeliveryStatus;
  attemptCount: number;
  nextAttemptAt: string | null;
  deliveredAt: string | null;
  updatedAt: string;
  lastResponseStatus?: number | null;
};

export type RelayEvent = {
  id: string;
  type: string;
  payload: Record<string, unknown> | null;
  createdAt: string;
  deliveryCount: number;
  source: "preview" | "delivery-summary";
};

export type DeliveryAttempt = {
  id: string;
  deliveryId: string;
  attemptNumber: number;
  responseStatus: number | null;
  errorCode: string | null;
  startedAt: string;
  completedAt: string | null;
  durationMs: number | null;
};

export type ProjectData = {
  endpoints: Endpoint[];
  deliveries: Delivery[];
  events: RelayEvent[];
  attempts: DeliveryAttempt[];
};

export type ApiError = {
  error?: {
    code?: string;
    message?: string;
  };
};

export type DashboardView =
  | "overview"
  | "events"
  | "deliveries"
  | "endpoints"
  | "access";

export type MutationResult = {
  ok: boolean;
  message: string;
};
