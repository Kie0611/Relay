import express from "express";
import { checkDatabaseReadiness } from "../db/health";
import { createHealthRouter } from "./routes/health";

export const app = express();

app.use(express.json());

app.use(createHealthRouter(checkDatabaseReadiness));