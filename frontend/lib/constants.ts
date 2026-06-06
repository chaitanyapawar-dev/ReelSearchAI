export const GITHUB_URL = "https://github.com";
export const DOCS_URL = "#architecture";

export const NAV_LINKS = [
  { label: "Features", href: "#features" },
  { label: "Workflow", href: "#workflow" },
  { label: "Architecture", href: "#architecture" },
  { label: "GitHub", href: GITHUB_URL, external: true },
] as const;

export const TECH_PILLS = [
  "Whisper",
  "CLIP",
  "BLIP",
  "ChromaDB",
  "Ollama",
  "FastAPI",
  "Next.js",
] as const;
