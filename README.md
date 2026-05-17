# Reel Saver AI 🎬🧠

A local-first AI-powered Instagram Reel memory system.  
Download reels → transcribe them → search them semantically — all running 100% on your machine.

---

## What It Does

| Step | Feature |
|------|---------|
| 1 | Download Instagram reels (MP4) via yt-dlp |
| 2 | Extract audio (MP3) with FFmpeg |
| 3 | Transcribe speech with faster-whisper (CPU, int8) |
| 4 | Generate embeddings with sentence-transformers (`all-MiniLM-L6-v2`) |
| 5 | Store embeddings in ChromaDB (local vector database) |
| 6 | Library management — browse, delete, re-index reels |
| 7 | Search Evaluation Dashboard — test retrieval quality with preset queries, Hinglish support, and relevance feedback |

---

## Tech Stack

**Backend**
- Python 3.10+
- FastAPI + Uvicorn
- yt-dlp (reel downloading)
- FFmpeg (audio extraction)
- faster-whisper (transcription, CPU)
- sentence-transformers (embeddings)
- ChromaDB (local vector DB)

**Frontend**
- Next.js 14 (App Router)
- TypeScript
- Vanilla CSS

---

## Project Structure

```
REEL SAVER AI/
├── backend/
│   ├── main.py              # FastAPI app — all endpoints
│   ├── requirements.txt     # Python dependencies
│   └── downloads/           # Runtime: MP4, MP3, transcripts (gitignored)
│       ├── audio/
│       └── transcripts/
├── frontend/
│   ├── app/
│   │   ├── page.tsx         # Main UI (all 4 sections)
│   │   ├── globals.css      # All styles
│   │   └── layout.tsx       # Next.js root layout
│   ├── package.json
│   └── next.config.mjs
└── README.md
```

---

## Setup & Run

### Prerequisites
- Python 3.10+
- Node.js 18+
- FFmpeg installed and in PATH

### Backend

```bash
cd backend
python -m venv venv

# Windows
.\venv\Scripts\activate

# Mac/Linux
source venv/bin/activate

pip install -r requirements.txt
python -m uvicorn main:app --reload --port 8000
```

### Frontend

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:3000**

---

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/download` | Download + transcribe + index a reel |
| `POST` | `/search` | Semantic search across saved reels |
| `GET` | `/library` | Fetch all saved reels from ChromaDB |
| `DELETE` | `/delete/{reel_id}` | Delete reel files + embedding |
| `POST` | `/reindex/{reel_id}` | Re-generate embedding from transcript |
| `POST` | `/feedback` | Save relevance feedback for a search result |
| `GET` | `/search-analytics` | Aggregated search quality metrics |

---

## Features

### Semantic Search
Uses `all-MiniLM-L6-v2` embeddings stored in ChromaDB.  
Works with vague, indirect, and **Hinglish** queries.

### Search Evaluation Dashboard (Step 7)
- One-click English + Hinglish preset queries
- CSS-only similarity score bars
- Per-result Relevant / Not Relevant feedback
- Persistent search logs (`backend/search_logs/`)
- Live analytics: total searches, avg similarity, success rate, best/worst queries
- Debug panel: raw score, transcript length, reel ID
- Search timing: "Search completed in 0.42s"

### Library Management (Step 6)
- Browse all saved reels with file-existence validation
- Safe deletion (files + ChromaDB record)
- Re-index: refresh embeddings from existing transcript

---

## Local-First Design

Everything runs offline after initial model download:
- No cloud APIs
- No authentication
- No paid services
- CPU-only inference (no GPU required)

---

## Requirements

```
fastapi
uvicorn
yt-dlp
faster-whisper
sentence-transformers
chromadb
```

---

## License

MIT
