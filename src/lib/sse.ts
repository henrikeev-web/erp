import { EventEmitter } from "events";

declare global {
  // eslint-disable-next-line no-var
  var __sseEmitter: EventEmitter | undefined;
}

if (!global.__sseEmitter) {
  global.__sseEmitter = new EventEmitter();
  global.__sseEmitter.setMaxListeners(200);
}

export const sseEmitter = global.__sseEmitter;

export interface AdminEvent {
  type:
    | "order_new"
    | "order_confirmed"
    | "order_status"
    | "payment_confirmed";
  orderId: string;
  orderNumber: number;
  customerName?: string;
  status?: string;
}

export function emitAdminEvent(event: AdminEvent) {
  global.__sseEmitter!.emit("admin", JSON.stringify(event));
}
