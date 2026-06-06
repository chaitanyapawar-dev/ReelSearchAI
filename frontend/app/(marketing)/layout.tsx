import FloatingNavbar from "@/components/ui/FloatingNavbar";

export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    // No overflow-hidden here — that would clip the fixed navbar
    <div className="relative min-h-screen">
      <FloatingNavbar />
      {children}
    </div>
  );
}
