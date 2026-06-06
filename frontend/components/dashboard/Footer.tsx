"use client";

import { Globe } from "lucide-react";
import { GitHubIcon, LinkedInIcon } from "@/components/ui/BrandIcons";
import { GITHUB_URL } from "@/lib/constants";

export default function Footer() {
  return (
    <footer className="relative border-t border-white/10 px-4 py-12 md:px-6">
      <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-cyan-400/40 to-transparent" />
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-8 md:flex-row">
        <div className="flex items-center gap-3">
          <span className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-cyan-400 to-violet-500">
            <span className="h-1.5 w-1.5 rounded-full bg-white" />
          </span>
          <span className="text-sm font-semibold text-white">REEL SAVER AI</span>
        </div>

        <div className="flex items-center gap-6">
          <a
            href={GITHUB_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 transition hover:text-white"
            aria-label="GitHub"
          >
            <GitHubIcon className="h-5 w-5" />
          </a>
          <a
            href="https://linkedin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 transition hover:text-white"
            aria-label="LinkedIn"
          >
            <LinkedInIcon className="h-5 w-5" />
          </a>
          <a
            href="https://portfolio.dev"
            target="_blank"
            rel="noopener noreferrer"
            className="text-white/40 transition hover:text-white"
            aria-label="Portfolio"
          >
            <Globe className="h-5 w-5" />
          </a>
        </div>

        <p className="text-center text-xs text-white/35 md:text-right">
          © {new Date().getFullYear()} Reel Saver AI · Built with multimodal AI
        </p>
      </div>
    </footer>
  );
}
