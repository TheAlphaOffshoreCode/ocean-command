"use client";

import { FormEvent, useEffect, useState } from "react";
import { OperationalMap, type OperationalFeature } from "./operational-map";
import { OperationalTimeline, type TimelineActivity } from "./operational-timeline";
import { WeatherPanel } from "./weather-panel";

const api = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";
type User = { name: string; email: string; organization_name: string; roles: string[] };

export default function Home() {
  const [mode, setMode] = useState<"login" | "register">("login");
  const [message, setMessage] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [features, setFeatures] = useState<OperationalFeature[]>([]);
  const [activities, setActivities] = useState<TimelineActivity[]>([]);
  const [loading, setLoading] = useState(true);

  async function loadCommandCenter() {
    const me = await fetch(`${api}/api/v1/me`, { credentials: "include" });
    if (!me.ok) { setUser(null); setLoading(false); return; }
    const profile = await me.json();
    setUser(profile.user);
    const [map, timeline] = await Promise.all([
      fetch(`${api}/api/v1/map/operational`, { credentials: "include" }),
      fetch(`${api}/api/v1/activities/timeline`, { credentials: "include" })
    ]);
    if (map.ok) setFeatures((await map.json()).features);
    if (timeline.ok) setActivities((await timeline.json()).data);
    setLoading(false);
  }

  useEffect(() => { void loadCommandCenter(); }, []);
  useEffect(() => {
    if (!user) return;
    const stream = new EventSource(`${api}/api/v1/events`, { withCredentials: true });
    const refresh = () => void loadCommandCenter();
    ["activity.created", "activity.updated", "activity.deleted", "vessel.position_updated", "weather.observed", "weather.forecast_updated", "alert.created", "alert.updated"].forEach((event) => stream.addEventListener(event, refresh));
    return () => stream.close();
  }, [user]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const payload = Object.fromEntries(new FormData(event.currentTarget).entries());
    const response = await fetch(`${api}/api/v1/auth/${mode}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(mode === "register" ? { organizationName: payload.organizationName, organizationSlug: payload.organizationSlug, name: payload.name, email: payload.email, password: payload.password } : { email: payload.email, password: payload.password }) });
    if (!response.ok) { setMessage((await response.json()).message ?? "Request failed"); return; }
    setMessage("");
    await loadCommandCenter();
  }

  async function signOut() { await fetch(`${api}/api/v1/auth/logout`, { method: "POST", credentials: "include" }); setUser(null); setFeatures([]); setActivities([]); setMessage(""); }
  async function updateActivityStatus(id: string, status: string) { const response = await fetch(`${api}/api/v1/activities/${id}`, { method: "PATCH", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ status }) }); if (!response.ok) { setMessage("Unable to update the activity status."); return; } await loadCommandCenter(); }

  if (loading) return <main className="loading">Connecting to Ocean Command…</main>;
  if (user) {
    const asset = features.find((feature) => feature.properties.entityType === "ASSET");
    return <main className="command-center">
      <header><div><p className="eyebrow">SIMULATED DEMONSTRATION DATA · COMMAND CENTER</p><h1>Ocean Command</h1><p>{user.organization_name} · {user.name}</p></div><nav className="command-nav" aria-label="Command Center navigation"><a className="quiet" href="/alerts">Alerts</a><a className="quiet" href="/graph">Operational graph</a><button className="quiet" onClick={signOut}>Sign out</button></nav></header>
      <section className="metrics"><article><strong>{features.filter((feature) => feature.properties.entityType === "ASSET").length}</strong><span>Offshore assets</span></article><article><strong>{features.filter((feature) => feature.properties.entityType === "VESSEL").length}</strong><span>Vessels reporting</span></article><article><strong>{activities.length}</strong><span>Scheduled activities</span></article></section>
      <WeatherPanel assetId={asset?.properties.id} assetName={asset?.properties.name} />
      <section className="map-section"><div className="section-heading"><div><p className="eyebrow">OPERATIONS MAP</p><h2>Current operating area</h2></div><button className="quiet" onClick={() => void loadCommandCenter()}>Refresh positions</button></div><OperationalMap features={features} /></section>
      <section className="timeline-section"><div className="section-heading"><div><p className="eyebrow">OPERATIONS SCHEDULE</p><h2>Activity timeline</h2></div><button className="quiet" onClick={() => void loadCommandCenter()}>Refresh schedule</button></div><OperationalTimeline activities={activities} onStatusChange={(id, status) => void updateActivityStatus(id, status)} /></section>
      {message && <p role="status" className="message">{message}</p>}
      <p className="safety-note">This interface uses simulated data. It supports coordination only; qualified personnel retain responsibility for operational decisions.</p>
    </main>;
  }
  return <main className="auth"><section className="brand"><p className="eyebrow">UNIFIED OFFSHORE OPERATIONS</p><h1>Ocean Command</h1><p>One operational picture for the entire offshore ecosystem.</p><div className="status"><span /> Platform foundation · identity enabled</div></section><section className="panel"><div className="tabs"><button className={mode === "login" ? "active" : ""} onClick={() => setMode("login")}>Sign in</button><button className={mode === "register" ? "active" : ""} onClick={() => setMode("register")}>Create organization</button></div><form onSubmit={submit}>{mode === "register" && <><label>Organization name<input required name="organizationName" minLength={2} /></label><label>Organization slug<input required name="organizationSlug" pattern="[a-z0-9-]{2,64}" /></label><label>Your name<input required name="name" minLength={2} /></label></>}<label>Email<input required type="email" name="email" /></label><label>Password<input required type="password" name="password" minLength={12} /></label><button className="primary" type="submit">{mode === "login" ? "Sign in" : "Create secure workspace"}</button></form>{message && <p role="status" className="message">{message}</p>}<p className="hint">For a local demonstration, run <code>pnpm db:seed</code>.</p></section></main>;
}
