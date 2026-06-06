"use client";

import dynamic from "next/dynamic";

const Dashboard = dynamic(() => import("./Dashboard"), {
  ssr: false,
  loading: () => (
    <div className="flex min-h-screen items-center justify-center bg-void">
      <div className="h-10 w-10 animate-pulse rounded-full bg-gradient-to-br from-cyan-400/40 to-violet-500/40" />
    </div>
  ),
});

export default function LandingClient() {
  return <Dashboard />;
}
