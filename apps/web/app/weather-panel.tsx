"use client";

import { useEffect, useState } from "react";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type Observation = { wind_speed: number; wave_height: number; visibility: number };
type Forecast = { wind_speed: number; wave_height: number; valid_at: string };
type Window = { id: string; name: string; status: string };

export function WeatherPanel({ assetId, assetName }: { assetId?: string; assetName?: string }) {
  const [observation, setObservation] = useState<Observation | null>(null); const [forecast, setForecast] = useState<Forecast[]>([]); const [windows, setWindows] = useState<Window[]>([]); const [affected, setAffected] = useState(0);
  async function loadWeather() { if (!assetId) return; const [observations, forecasts, impacts, operationalWindows] = await Promise.all([fetch(`${api}/api/v1/assets/${assetId}/weather`, { credentials: "include" }), fetch(`${api}/api/v1/assets/${assetId}/weather/forecast`, { credentials: "include" }), fetch(`${api}/api/v1/assets/${assetId}/weather/impact`, { credentials: "include" }), fetch(`${api}/api/v1/operational-windows?assetId=${assetId}`, { credentials: "include" })]); if (observations.ok) setObservation((await observations.json()).data[0] ?? null); if (forecasts.ok) setForecast((await forecasts.json()).data.slice(0, 3)); if (impacts.ok) setAffected((await impacts.json()).affectedActivities.length); if (operationalWindows.ok) setWindows((await operationalWindows.json()).data.slice(0, 3)); }
  useEffect(() => { void loadWeather(); }, [assetId]);
  if (!assetId) return null;
  return <section className="weather-section"><div className="section-heading"><div><p className="eyebrow">SIMULATED METEOCEAN</p><h2>{assetName ?? "Selected asset"}</h2></div><button className="quiet" onClick={() => void loadWeather()}>Refresh conditions</button></div><div className="weather-grid"><article><span>Latest observation</span>{observation ? <><strong>{observation.wind_speed} kn</strong><p>{observation.wave_height} m waves · {observation.visibility} nm visibility</p></> : <p>No simulated observation yet.</p>}</article><article><span>Activity impact</span><strong>{affected}</strong><p>Scheduled activities affected by current meteocean limits.</p></article><article><span>Operational windows</span><strong>{windows.length}</strong><p>{windows.length ? windows.map((window) => `${window.name} (${window.status})`).join(" · ") : "No window registered."}</p></article></div>{forecast.length > 0 && <div className="forecast"><span>Next simulated forecast points</span>{forecast.map((point) => <p key={point.valid_at}>{new Intl.DateTimeFormat(undefined, { hour: "2-digit", minute: "2-digit" }).format(new Date(point.valid_at))} · {point.wind_speed} kn · {point.wave_height} m</p>)}</div>}</section>;
}
