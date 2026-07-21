"use client";

import { useEffect, useState } from "react";
import { flushOfflineMutations, listMutations } from "./offline";

export function OfflineStatus({ onSynced }: { onSynced: () => void }) {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [conflicts, setConflicts] = useState(0);
  async function refresh() { const mutations = await listMutations(); setPending(mutations.filter((item) => item.state === "PENDING").length); setConflicts(mutations.filter((item) => item.state === "CONFLICT").length); }
  useEffect(() => { setOnline(navigator.onLine); void refresh(); const offline = () => setOnline(false); const online = async () => { setOnline(true); await flushOfflineMutations(); await refresh(); onSynced(); }; window.addEventListener("offline", offline); window.addEventListener("online", online); return () => { window.removeEventListener("offline", offline); window.removeEventListener("online", online); }; }, [onSynced]);
  return <p className={`offline-status ${online ? "online" : "offline"}`} role="status">{online ? "Online" : "Offline · cached operational view"}{pending ? ` · ${pending} queued change${pending === 1 ? "" : "s"}` : ""}{conflicts ? ` · ${conflicts} conflict${conflicts === 1 ? "" : "s"} require review` : ""}</p>;
}
