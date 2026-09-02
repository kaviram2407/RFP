# AI-RFP Intelligence & Proposal Platform

This is the central repository for the AI-RFP Intelligence & Proposal Platform.

## Phases

The development is divided into phases as outlined in the PRODUCT_BLUEPRINT.md and DEVELOPMENT_ROADMAP.md.

Phase 0: Project foundation + architecture + rules.
Phase 1: Environment + Docker + PostgreSQL + pgvector + Redis
Phase 2: Authentication + RBAC
...

## Architecture Overview

*   **Frontend**: Next.js, TypeScript, Tailwind CSS, shadcn/ui
*   **Backend**: Python, FastAPI
*   **Database**: PostgreSQL, pgvector, SQLAlchemy 2.x, Alembic
*   **AI**: NVIDIA-hosted openai/gpt-oss-120b, NVIDIA nemotron-3-embed-1b
*   **Background Jobs**: Celery, Redis
*   **Storage**: Cloudflare R2

## Getting Started

### Prerequisites

* Python 3.11+
* Docker and Docker Compose
* Git

### Start infrastructure

```bash
docker compose up -d
```

### Create virtual environment

```bash
cd backend
python3 -m venv .venv
```

### Install dependencies

```bash
cd backend
source .venv/bin/activate
pip install -r requirements.txt
```

### Run migrations

```bash
cd backend
source .venv/bin/activate
alembic upgrade head
```

### Start backend

```bash
cd backend
source .venv/bin/activate
uvicorn app.main:app --reload
```

### Health check

You can verify the backend is running and connected to services via the health check endpoint:

```bash
curl http://localhost:8000/health
```

Expected output when healthy:
```json
{
  "status": "ok",
  "services": {
    "api": "ok",
    "database": "ok",
    "redis": "ok"
  }
}
```

### Stop infrastructure

```bash
docker compose down
```
