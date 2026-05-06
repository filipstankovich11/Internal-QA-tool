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
  1 # Supabase                                                                                                                                                                                                                                           
       2 VITE_SUPABASE_URL=https://your-project.supabase.co                                                                                                                                                                                                   
       3 VITE_SUPABASE_ANON_KEY=your-anon-key                                                                                                                                                                                                                 
       4                                                                                                                                                                                                                                                      
       5 # Python API (optional if running locally)                                                                                                                                                                                                           
       6 VITE_API_URL=http://localhost:5001                                                                                                                                                                                                                   
       7                                                                                                                                                                                                                                                      
       8 # Gorgias (required for the Python API server)                                                                                                                                                                                                       
       9 GORGIAS_AUTH=Basic your-base64-encoded-credentials                                                                                                                                                                                                   
      10 GORGIAS_DOMAIN=yourcompany.gorgias.com                                                                                                                                                                                                               
      11                                                                                                                                                                                                                                                      
      12 # Anthropic (required for AI scoring)                                                                                                                                                                                                                
      13 ANTHROPIC_API_KEY=sk-ant-...     
### 5. Run locally
In two separate terminals:

```bash
# Terminal 1 — Frontend
npm run dev

# Terminal 2 — API server
cd api && python score.py
```

App will be available at http://localhost:5173
