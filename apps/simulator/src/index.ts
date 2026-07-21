const scenario = process.env.OCEAN_SCENARIO ?? "normal";
const event = { id: crypto.randomUUID(), type: "simulator.scenario_started", version: 1, source: "SIMULATED", scenario, occurredAt: new Date().toISOString() };
console.log(JSON.stringify(event));
