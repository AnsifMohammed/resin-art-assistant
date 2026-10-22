import type {
  CustomerListParams,
  CustomerListResponse,
  CustomerOrdersResponse,
  CustomerResponse,
  UpdateCustomerRequest,
} from "../types/index.ts";
import { api } from "./client.ts";

const enc = encodeURIComponent;

/** GET /customers (admin only). Default limit 24; counts are business-wide per segment. */
export const listCustomers = (params: CustomerListParams = {}, signal?: AbortSignal) =>
  api.get<CustomerListResponse>("/customers", params, signal);

/** GET /customers/:id */
export const getCustomer = (id: string, signal?: AbortSignal) =>
  api.get<CustomerResponse>(`/customers/${enc(id)}`, undefined, signal);

/** PATCH /customers/:id — strict: name, city, notes, isFavourite, isPriority, optedOut. */
export const updateCustomer = (id: string, body: UpdateCustomerRequest) =>
  api.patch<CustomerResponse>(`/customers/${enc(id)}`, body);

/** GET /customers/:id/orders — newest first, deleted excluded (cancelled included). */
export const getCustomerOrders = (id: string, signal?: AbortSignal) =>
  api.get<CustomerOrdersResponse>(`/customers/${enc(id)}/orders`, undefined, signal);
