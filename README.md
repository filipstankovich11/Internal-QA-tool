# Gorgias Internal QA Tool

## Setup

### 1. Clone the repo
```bash
git clone https://github.com/filipstankovich11/Internal-QA-tool.git
cd Internal-QA-tool
```

### 2. Install frontend dependencies
```bash
npm install
```

### 3. Install Python dependencies
```bash
cd api
pip install -r requirements.txt
cd ..
```

### 4. Configure environment variables
```bash
cp .env.example .env.local
```
Fill in `.env.local` with your credentials (Supabase, Gorgias, Anthropic).

### 5. Run locally
In two separate terminals:

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — API server
cd api && python score.py
```

App will be available at http://localhost:5173
