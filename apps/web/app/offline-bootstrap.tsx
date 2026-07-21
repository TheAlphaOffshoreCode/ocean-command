"use client";

import { useEffect } from "react";

export function OfflineBootstrap() {
  useEffect(() => { if ("serviceWorker" in navigator) void navigator.serviceWorker.register("/sw.js"); }, []);
  return null;
}
