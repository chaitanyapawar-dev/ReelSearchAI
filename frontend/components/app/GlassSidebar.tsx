"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion } from "framer-motion";
import {
  LayoutDashboard, Library, Search, Bot, Network, Cpu, BarChart3, Settings, Zap,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { label: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { label: "Library", href: "/library", icon: Library },
  { label: "AI Search", href: "/search", icon: Search },
  { label: "Copilot", href: "/copilot", icon: Bot, soon: true },
  { label: "Memory Graph", href: "/memory", icon: Network, soon: true },
  { label: "Processing", href: "/processing", icon: Cpu },
  { label: "Analytics", href: "/analytics", icon: BarChart3, soon: true },
  { label: "Settings", href: "/settings", icon: Settings },
];

export default function GlassSidebar() {
  const pathname = usePathname();

  return (
    <aside
      className="fixed left-0 top-0 z-40 flex h-screen w-[72px] flex-col items-center py-6 gap-2"
      style={{
        background: "rgba(4, 7, 20, 0.78)",
        backdropFilter: "blur(36px) saturate(160%)",
        WebkitBackdropFilter: "blur(36px) saturate(160%)",
        borderRight: "1px solid rgba(255,255,255,0.06)",
        boxShadow: "2px 0 24px rgba(0,0,0,0.3), inset -1px 0 0 rgba(255,255,255,0.04)",
      }}
    >
      {/* Ambient side glow */}
      <div
        className="absolute right-0 top-1/3 w-[2px] h-[200px] pointer-events-none"
        style={{
          background: "linear-gradient(180deg, transparent, rgba(91,140,255,0.3), rgba(123,97,255,0.2), transparent)",
          filter: "blur(2px)",
        }}
      />

      {/* Brand Mark */}
      <Link
        href="/dashboard"
        className="mb-6 flex h-10 w-10 items-center justify-center rounded-2xl relative"
        style={{
          background: "linear-gradient(135deg, #5B8CFF, #7B61FF)",
          boxShadow: "0 0 28px rgba(91,140,255,0.5), 0 0 0 1px rgba(255,255,255,0.12) inset",
        }}
      >
        <Zap className="h-5 w-5 text-white" strokeWidth={2.5} />
        {/* Pulse ring */}
        <motion.div
          className="absolute inset-0 rounded-2xl border border-[#5B8CFF]/50"
          animate={{ opacity: [0.3, 0.7, 0.3], scale: [1, 1.12, 1] }}
          transition={{ duration: 3, repeat: Infinity, ease: "easeInOut" }}
        />
      </Link>

      {/* Divider */}
      <div className="mb-2 h-px w-8 bg-gradient-to-r from-transparent via-white/15 to-transparent" />

      {/* Nav Items */}
      <nav className="flex flex-1 flex-col items-center gap-1 w-full px-2">
        {NAV_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));

          return (
            <div key={item.href} className="group relative w-full flex justify-center">
              <Link
                href={item.soon ? "#" : item.href}
                className={cn(
                  "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-200",
                  isActive
                    ? "text-white"
                    : "text-white/30 hover:text-white/75",
                  item.soon && "cursor-not-allowed opacity-40"
                )}
              >
                {/* Active background pill */}
                {isActive && (
                  <motion.div
                    layoutId="sidebar-active-pill"
                    className="absolute inset-0 rounded-xl"
                    style={{
                      background: "rgba(91,140,255,0.15)",
                      border: "1px solid rgba(91,140,255,0.3)",
                      boxShadow: "0 0 20px rgba(91,140,255,0.2), inset 0 1px 0 rgba(255,255,255,0.1)",
                    }}
                    transition={{
                      type: "spring",
                      stiffness: 380,
                      damping: 30
                    }}
                  />
                )}

                <Icon className="h-[18px] w-[18px] relative z-10" strokeWidth={isActive ? 2 : 1.5} />

                {/* Hover glow */}
                {!isActive && (
                  <div className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 transition-opacity duration-200"
                    style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.08)" }} />
                )}
              </Link>

              {/* Tooltip */}
              <div className="pointer-events-none absolute left-full ml-3 top-1/2 -translate-y-1/2 z-50 whitespace-nowrap opacity-0 group-hover:opacity-100 transition-opacity duration-200">
                <div
                  className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-white/90"
                  style={{
                    background: "rgba(8,12,30,0.97)",
                    border: "1px solid rgba(255,255,255,0.09)",
                    backdropFilter: "blur(16px)",
                    boxShadow: "0 4px 16px rgba(0,0,0,0.4)",
                  }}
                >
                  {item.label}
                  {item.soon && <span className="text-[9px] uppercase tracking-widest text-white/25 ml-1">Soon</span>}
                </div>
              </div>
            </div>
          );
        })}
      </nav>

      {/* Bottom: System Health */}
      <div className="mt-auto flex flex-col items-center gap-1.5">
        <motion.div
          className="h-2 w-2 rounded-full bg-emerald-400"
          style={{ boxShadow: "0 0 10px rgba(52,211,113,0.9)" }}
          animate={{ opacity: [0.4, 1, 0.4] }}
          transition={{ duration: 2.2, repeat: Infinity }}
        />
        <span className="text-[8px] uppercase tracking-widest text-white/20">Live</span>
      </div>
    </aside>
  );
}
