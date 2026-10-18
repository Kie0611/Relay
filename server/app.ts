import express from "express";
import type { Express } from "express";
import { apiKeyQueries } from "../db/queries/api-keys";
import { deliveryQueries } from "../db/queries/deliveries";
import { deliveryDashboardQueries } from "../db/queries/delivery-dashboard";
import { endpointQueries } from "../db/queries/endpoints";
import { eventQueries } from "../db/queries/events";
import { checkDatabaseReadiness } from "../db/health";
import { createDeliveriesRouter } from "./routes/deliveries";
import { createDeliveryDashboardRouter } from "./routes/delivery-dashboard";
import { createApiKeysRouter } from "./routes/api-keys";
import { createEndpointsRouter } from "./routes/endpoints";
import { createEventsRouter } from "./routes/events";
import { createHealthRouter } from "./routes/health";
import { createDeliveryService } from "./services/delivery-service";
import { createEndpointService } from "./services/endpoint-service";
import { createEventService } from "./services/event-service";
import { createApiKeyService } from "./services/api-key-service";
import { createProjectAuthMiddleware } from "./middleware/project-auth";
import { createDeliveryDashboardService } from "./services/delivery-dashboard-service";

export type AppOptions = {
  requireAuth?: boolean;
  adminKey?: string;
};

export function createApp(options: AppOptions = {}): Express {
  const publishEvent = createEventService(eventQueries);
  const eventsRouter = createEventsRouter(publishEvent);
  const replayDelivery = createDeliveryService(deliveryQueries);
  const deliveriesRouter = createDeliveriesRouter(replayDelivery);
  const deliveryDashboard = createDeliveryDashboardService(
    deliveryDashboardQueries,
  );
  const deliveryDashboardRouter = createDeliveryDashboardRouter(
    deliveryDashboard,
  );
  const endpointManagement = createEndpointService(endpointQueries);
  const endpointsRouter = createEndpointsRouter(endpointManagement);
  const apiKeyManagement = createApiKeyService(apiKeyQueries);
  const apiKeysRouter = createApiKeysRouter(
    apiKeyManagement,
    options.adminKey ?? process.env.RELAY_ADMIN_KEY,
  );

  const app = express();
  const dashboardOrigin =
    process.env.DASHBOARD_ORIGIN ?? "http://localhost:3000";

  app.use(express.json());
  app.use((req, res, next) => {
    res.setHeader("Access-Control-Allow-Origin", dashboardOrigin);
    res.setHeader(
      "Access-Control-Allow-Headers",
      "Content-Type, Authorization, X-Relay-API-Key, X-Relay-Admin-Key, Idempotency-Key",
    );
    res.setHeader(
      "Access-Control-Allow-Methods",
      "GET,POST,PATCH,OPTIONS",
    );

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });

  app.use(createHealthRouter(checkDatabaseReadiness));
  app.use("/api", apiKeysRouter);

  const requireAuth =
    options.requireAuth ?? process.env.RELAY_AUTH_REQUIRED === "true";

  if (requireAuth) {
    app.use(
      "/api/projects/:projectId",
      createProjectAuthMiddleware(apiKeyQueries),
    );
  }

  app.use("/api", eventsRouter);
  app.use("/api", deliveriesRouter);
  app.use("/api", deliveryDashboardRouter);
  app.use("/api", endpointsRouter);

  return app;
}

export const app = createApp();
