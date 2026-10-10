import express from "express";
import { eventQueries } from "../db/queries/events";
import { checkDatabaseReadiness } from "../db/health";
import { createEventsRouter } from "./routes/events";
import { createHealthRouter } from "./routes/health";
import { createEventService } from "./services/event-service";

const publishEvent = createEventService(eventQueries);
const eventsRouter = createEventsRouter(publishEvent);

export const app = express();

app.use(express.json());

app.use(createHealthRouter(checkDatabaseReadiness));
app.use("/api", eventsRouter);
