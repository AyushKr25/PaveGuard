# SmartPothole AI

> **Production-ready AI-powered road pothole and road-damage detection platform**

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)
[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![FastAPI](https://img.shields.io/badge/FastAPI-0.110-green)](https://fastapi.tiangolo.com/)
[![Supabase](https://img.shields.io/badge/Supabase-PostgreSQL-3ECF8E)](https://supabase.com/)
[![YOLO](https://img.shields.io/badge/YOLO-Ultralytics-00FFFF)](https://ultralytics.com/)
[![Docker](https://img.shields.io/badge/Docker-Ready-blue)](https://docker.com/)
[![Vercel](https://img.shields.io/badge/Vercel-Deployed-black)](https://vercel.com/)

## Overview

SmartPothole AI is a comprehensive platform for detecting, analyzing, and mapping road potholes and damage using computer vision. It supports multiple input sources including static images, uploaded videos, live camera feeds, and mobile cameras.

### Key Features

- **Multi-Source Detection**: Images, videos, live webcam, mobile camera, dashcam footage
- **Real-Time Processing**: Live camera detection with configurable inference FPS
- **Object Tracking**: Persistent tracking across frames to prevent duplicate detections
- **AI Severity Estimation**: Dedicated severity engine (LOW/MODERATE/HIGH/CRITICAL)
- **GPS Integration**: Automatic location capture with privacy controls
- **Interactive Maps**: Leaflet-based mapping with clustering and filtering
- **Analytics Dashboard**: Real-time metrics, charts, and detection history
- **Report Generation**: PDF, CSV, JSON export for road authorities
- **Model Feedback Loop**: Human-in-the-loop for continuous improvement
- **Production Ready**: Auth, RLS, Docker, CI/CD, comprehensive tests

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   Frontend      │────▶│   AI Service    │────▶│   YOLO Model    │
│   (Next.js)     │     │   (FastAPI)     │     │   (Ultralytics) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
        │                       │
        ▼                       ▼
┌─────────────────┐     ┌─────────────────┐
│   Supabase      │     │   Object Tracker │
│   (PostgreSQL)  │     │   (BoT-SORT)     │
└─────────────────┘     └─────────────────┘
```

### Technology Stack

| Layer | Technology |
|-------|------------|
| Frontend | Next.js 14, TypeScript, Tailwind CSS, shadcn/ui |
| Backend | FastAPI, Python 3.11+, Ultralytics YOLO |
| Database | Supabase (PostgreSQL + Auth + Storage + Realtime) |
| AI/ML | YOLOv11 (Detection + Segmentation), BoT-SORT Tracking |
| Deployment | Vercel (Frontend), Docker (AI Service) |
| Maps | Leaflet + OpenStreetMap |
| Charts | Recharts |

## Quick Start

### Prerequisites

- Node.js 20+
- Python 3.11+
- Docker & Docker Compose (optional)
- Supabase account
- NVIDIA GPU (recommended for AI service)

### 1. Clone and Configure

```bash
git clone https://github.com/your-org/smartpothole-ai.git
cd smartpothole-ai
cp .env.example .env.local
# Edit .env.local with your credentials
```

### 2. Supabase Setup

1. Create a new Supabase project
2. Run migrations:
   ```bash
   cd supabase
   supabase link --project-ref your-project-ref
   supabase db push
   ```
3. Configure storage buckets and RLS policies (see `supabase/` directory)

### 3. AI Model Setup

Place your trained YOLO model weights in `ai-service/models/`:

```bash
mkdir -p ai-service/models
# Place your best.pt or yolo11n-seg.pt here
```

For development without custom weights, the system will use a pretrained model with a clear "DEMO MODE" indicator.

### 4. Local Development

#### Option A: Docker (Recommended)

```bash
docker-compose up -d
# Frontend: http://localhost:3000
# AI Service: http://localhost:8000
# AI Docs: http://localhost:8000/docs
```

#### Option B: Manual

```bash
# Terminal 1: Frontend
cd frontend
npm install
npm run dev

# Terminal 2: AI Service
cd ai-service
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

### 5. Production Deployment

#### Frontend (Vercel)

1. Connect repository to Vercel
2. Add environment variables from `.env.example`
3. Deploy

#### AI Service (Docker)

```bash
# Build production image
docker build -t smartpothole-ai-service ./ai-service --target production

# Run with GPU support
docker run -d \
  --gpus all \
  -p 8000:8000 \
  -v /path/to/models:/app/models \
  -v /path/to/config:/app/config \
  --env-file .env.production \
  smartpothole-ai-service
```

## Project Structure

```
smartpothole-ai/
├── frontend/                 # Next.js Application
│   ├── src/
│   │   ├── app/             # App Router pages
│   │   ├── components/      # React components
│   │   ├── lib/             # Utilities, clients
│   │   ├── hooks/           # Custom hooks
│   │   ├── types/           # TypeScript types
│   │   └── styles/          # Global styles
│   ├── public/              # Static assets
│   └── Dockerfile
│
├── ai-service/              # FastAPI AI Service
│   ├── app/
│   │   ├── api/             # API routes
│   │   ├── inference/       # YOLO inference engine
│   │   ├── tracking/        # Object tracking
│   │   ├── severity/        # Severity estimation
│   │   ├── video/           # Video processing
│   │   ├── schemas/         # Pydantic models
│   │   └── services/        # Business logic
│   ├── models/              # Model weights (gitignored)
│   ├── config/              # Configuration files
│   ├── tests/               # Backend tests
│   └── Dockerfile
│
├── supabase/                # Supabase Configuration
│   ├── migrations/          # SQL migrations
│   ├── seed/                # Seed data
│   ├── config.toml          # Supabase config
│   └── policies/            # RLS policies
│
├── ml/                      # ML Training Pipeline
│   ├── training/            # Training scripts
│   ├── datasets/            # Dataset configs
│   ├── configs/             # Model configs
│   └── evaluation/          # Evaluation scripts
│
├── docs/                    # Documentation
├── scripts/                 # Utility scripts
├── tests/                   # E2E tests
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Documentation

### AI Service Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/health` | GET | Health check |
| `/ready` | GET | Readiness check (model loaded) |
| `/model` | GET | Model information |
| `/predict/image` | POST | Single image detection |
| `/predict/frame` | POST | Single frame detection (live) |
| `/predict/video` | POST | Video detection (async job) |
| `/track/frame` | POST | Frame with tracking |
| `/severity` | POST | Severity estimation |
| `/jobs/{job_id}` | GET | Job status |

### Detection Response Format

```json
{
  "detections": [
    {
      "id": "uuid",
      "class_name": "pothole",
      "confidence": 0.934,
      "bbox": {"x1": 100, "y1": 150, "x2": 400, "y2": 350},
      "segmentation": null,
      "severity": {
        "level": "HIGH",
        "score": 0.78,
        "confidence": 0.71
      }
    }
  ],
  "model": {
    "name": "YOLO11",
    "version": "v1.0.0",
    "task": "segment"
  },
  "processing": {
    "latency_ms": 82,
    "image_width": 1280,
    "image_height": 720
  }
}
```

## Configuration

### Inference Profiles

| Profile | Model | Use Case |
|---------|-------|----------|
| FAST | YOLO11n-seg | Live camera, mobile |
| BALANCED | YOLO11s-seg | General purpose |
| ACCURACY | YOLO11m-seg | Batch processing |

### Severity Configuration

Severity weights are configurable in `ai-service/config/severity_config.yaml`:

```yaml
weights:
  segmentation_area: 0.30
  bbox_area: 0.20
  aspect_ratio: 0.15
  shape_irregularity: 0.15
  confidence: 0.10
  temporal_persistence: 0.10

thresholds:
  LOW: 0.0
  MODERATE: 0.35
  HIGH: 0.65
  CRITICAL: 0.85
```

## Security

- **Row Level Security**: All Supabase tables protected with RLS policies
- **Authentication**: Supabase Auth with JWT tokens
- **API Security**: CORS, rate limiting, request validation
- **File Upload**: MIME validation, size limits, signed URLs
- **Secrets**: Never committed, managed via environment variables

## Testing

```bash
# Frontend tests
cd frontend && npm run test

# Backend tests
cd ai-service && pytest

# E2E tests
npm run test:e2e
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

See [CONTRIBUTING.md](CONTRIBUTING.md) for details.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Disclaimer

> **Severity is an AI-assisted visual estimate and should not be treated as a certified engineering measurement.**
>
> **Depth is an estimate and may be inaccurate without calibrated depth sensing.**

## Roadmap

- [ ] Mobile apps (React Native)
- [ ] Multi-model ensemble
- [ ] Depth camera support
- [ ] Municipal dashboard
- [ ] Predictive maintenance
- [ ] Fleet management integration

## Support

- Issues: [GitHub Issues](https://github.com/your-org/smartpothole-ai/issues)
- Discussions: [GitHub Discussions](https://github.com/your-org/smartpothole-ai/discussions)
- Security: [SECURITY.md](SECURITY.md)