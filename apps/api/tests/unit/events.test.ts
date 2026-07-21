import { describe, expect, it } from "vitest";
import { publish, subscribe } from "../../src/events.js";

describe("operational event bus", () => {
  it("isolates organizations and stops after unsubscribe", () => {
    const received: string[] = [];
    const unsubscribe = subscribe("org-a", (event) => received.push(event.type));
    publish({ id: "one", organizationId: "org-a", type: "activity.updated", payload: {}, occurredAt: new Date().toISOString() });
    publish({ id: "two", organizationId: "org-b", type: "activity.updated", payload: {}, occurredAt: new Date().toISOString() });
    unsubscribe();
    publish({ id: "three", organizationId: "org-a", type: "vessel.position_updated", payload: {}, occurredAt: new Date().toISOString() });
    expect(received).toEqual(["activity.updated"]);
  });
});
