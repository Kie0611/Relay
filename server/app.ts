import express from "express";
import { deliveryQueries } from "../db/queries/deliveries";
import { eventQueries } from "../db/queries/events";
import { checkDatabaseReadiness } from "../db/health";
import { createDeliveriesRouter } from "./routes/deliveries";
import { createEventsRouter } from "./routes/events";
import { createHealthRouter } from "./routes/health";
import { createDeliveryService } from "./services/delivery-service";
import { createEventService } from "./services/event-service";

const publishEvent = createEventService(eventQueries);
const eventsRouter = createEventsRouter(publishEvent);
const replayDelivery = createDeliveryService(deliveryQueries);
const deliveriesRouter = createDeliveriesRouter(replayDelivery);

export const app = express();

app.use(express.json());

app.use(createHealthRouter(checkDatabaseReadiness));
app.use("/api", eventsRouter);
app.use("/api", deliveriesRouter);
