import { EventEmitter } from "node:events";
type OperationalEvent = { id: string; organizationId: string; type: string; payload: object; occurredAt: string };
const bus = new EventEmitter();
export function publish(event: OperationalEvent) { bus.emit(event.organizationId, event); }
export function subscribe(organizationId: string, listener: (event: OperationalEvent) => void) { bus.on(organizationId, listener); return () => bus.off(organizationId, listener); }
