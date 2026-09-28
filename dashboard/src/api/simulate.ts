import type { SimulateRequest, SimulateResponse } from "../types/index.ts";
import { api } from "./client.ts";

/** POST /simulate/message — only works when the backend runs with DEMO_MODE=true */
export const simulateMessage = (body: SimulateRequest) => api.post<SimulateResponse>("/simulate/message", body);
