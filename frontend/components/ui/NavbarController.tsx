"use client";

import { usePathname } from "next/navigation";
import FloatingNavbar from "@/components/ui/FloatingNavbar";

export default function NavbarController() {
  const pathname = usePathname();
  // Hide the floating navbar on the local app route
  if (pathname?.startsWith("/app")) return null;
  return <FloatingNavbar />;
}
