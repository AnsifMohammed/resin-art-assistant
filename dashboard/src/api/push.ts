import type { OkResponse, PushSubscribeRequest } from "../types/index.ts";
import { api } from "./client.ts";

/** POST /push/subscribe — tied to the JWT user server-side */
export const subscribePush = (body: PushSubscribeRequest) => api.post<OkResponse>("/push/subscribe", body);
