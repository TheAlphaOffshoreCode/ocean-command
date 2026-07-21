import type { Metadata } from "next"; import "./globals.css"; import { OfflineBootstrap } from "./offline-bootstrap";
export const metadata: Metadata = { title: "Ocean Command", description: "Unified Offshore Operations Command Platform" };
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) { return <html lang="en"><body><OfflineBootstrap />{children}</body></html>; }
