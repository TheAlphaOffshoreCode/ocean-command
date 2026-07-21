# Simulators

Simulators are a replaceable integration boundary. The local vessel tick creates a new position from the last reported course and emits `vessel.position_updated`. The weather simulator creates observations and six hourly forecasts; every generated payload and persisted metadata is labelled `SIMULATED`. They are development-only providers, not live maritime or meteorological feeds.
