# SmartPothole AI - Architecture Documentation

## System Overview

SmartPothole AI is a production-ready platform for detecting, analyzing, and mapping road potholes using computer vision. The system follows a microservices architecture with clear separation of concerns.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SmartPothole AI System                              │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐    ┌──────────┐  │
│  │   Frontend   │    │  AI Service  │    │  Database    │    │ Storage  │  │
│  │  (Next.js)   │◄──▶│  (FastAPI)   │◄──▶│  (Supabase)  │◄──▶│ (S3/API) │  │
│  └──────────────┘    └──────────────┘    └──────────────┘    └──────────┘  │
│         │                   │                   │                   │        │
│         ▼                   ▼                   ▼                   ▼        │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         Shared Types & Schemas                        │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Component Details

### 1. Frontend (Next.js 14)

**Technology Stack:**
- Next.js 14 with App Router
- TypeScript 5.3+
- Tailwind CSS 3.4+
- shadcn/ui (Radix UI primitives)
- TanStack Query (React Query) for server state
- Zustand for client state
- Leaflet for maps

**Key Pages:**
- `/` - Landing page
- `/dashboard` - Analytics dashboard
- `/detect/image` - Image upload & detection
- `/detect/video` - Video upload & async processing
- `/detect/live` - Live camera detection
- `/map` - Interactive pothole map
- `/sessions` - Road scan sessions
- `/detections/[id]` - Detection details
- `/reports` - Report generation
- `/settings` - User preferences
- `/admin` - Admin dashboard
- `/auth/*` - Authentication flows

**State Management:**
- Server state: TanStack Query
- Client state: Zustand stores (auth, preferences, detections, sessions, live, map, UI)
- Form state: React Hook Form + Zod

### 2. AI Service (FastAPI)

**Technology Stack:**
- FastAPI 0.110+
- Python 3.11+
- Ultralytics YOLO (v8/v11)
- OpenCV for image processing
- Supervision for tracking utilities
- ONNX Runtime for browser inference (optional)

**Core Modules:**

#### Inference Engine (`app/inference/engine.py`)
- Loads YOLO model (detection or segmentation)
- Handles device selection (CUDA/MPS/CPU)
- Supports half-precision (FP16) on GPU
- Warmup on startup
- Demo mode when custom weights unavailable

#### Object Tracker (`app/tracking/tracker.py`)
- Simple centroid-based tracker
- Configurable timeout and deduplication distance
- Minimum detection frames for confirmation
- Track history for severity estimation

#### Severity Estimator (`app/severity/estimator.py`)
- Configurable weights via YAML
- Features: segmentation area, bbox area, aspect ratio, shape irregularity, confidence, temporal persistence
- Thresholds: LOW/MODERATE/HIGH/CRITICAL
- Returns severity score, level, confidence, and reasons

#### Video Processor (`app/video/processor.py`)
- Async video processing with frame sampling
- Frame skip based on target inference FPS
- Annotated video output
- Track-based deduplication
- Progress reporting via job manager

#### Job Manager (`app/services/job_manager.py`)
- In-memory job queue with disk persistence
- Status: queued → processing → completed/failed/cancelled
- Progress tracking
- Cleanup of old jobs

**API Endpoints:**
- `GET /health` - Health check
- `GET /ready` - Readiness probe
- `GET /model` - Model info
- `POST /predict/image` - Single image detection
- `POST /predict/frame` - Live frame detection
- `POST /track/frame` - Frame with tracking
- `POST /predict/video` - Start video job (async)
- `GET /jobs/{job_id}` - Job status
- `POST /jobs/{job_id}/cancel` - Cancel job
- `POST /severity` - Severity estimation

### 3. Database (Supabase PostgreSQL)

**Tables:**
- `profiles` - User profiles (extends auth.users)
- `model_versions` - ML model registry
- `detections` - Core detection records
- `detection_media` - Media files (images, videos, annotated)
- `detection_frames` - Per-frame data for video/live
- `detection_sessions` - Batch processing sessions
- `road_scan_sessions` - Live road scan sessions
- `locations` - GPS points for road scans
- `processing_jobs` - Async video jobs
- `feedback` - Human feedback for model improvement
- `reports` - Generated reports
- `user_preferences` - User settings
- `system_settings` - Global configuration

**Security:**
- Row Level Security (RLS) on all tables
- Users can only access own data
- Admins have full access
- Service role for backend operations

### 4. Storage (Supabase Storage)

**Buckets:**
- `detection-images` - Original uploaded images (private)
- `detection-videos` - Original uploaded videos (private)
- `annotated-results` - AI-annotated outputs (private)
- `avatars` - User profile pictures (public)
- `reports` - Generated PDF/CSV reports (private)

**Policies:**
- Users access own folders (`user_id/*`)
- Service role writes annotated results
- Admins have full access
- MIME type and size validation

## Data Flow

### Image Detection
```
User uploads image
       │
       ▼
Frontend validates & sends to AI Service
       │
       ▼
AI Service: YOLO inference
       │
       ▼
Severity estimation per detection
       │
       ▼
Return detections + optional annotated image
       │
       ▼
Frontend displays results
       │
       ▼
User saves → Supabase (detection + media)
```

### Video Detection
```
User uploads video
       │
       ▼
AI Service creates job (queued)
       │
       ▼
Background: VideoProcessor processes frames
       │
       ▼
Frame sampling (configurable FPS)
       │
       ▼
YOLO + Tracking per frame
       │
       ▼
Severity per detection
       │
       ▼
Track-based deduplication
       │
       ▼
Annotated video written
       │
       ▼
Job marked completed with results
       │
       ▼
Frontend polls → displays results
```

### Live Detection
```
User grants camera permission
       │
       ▼
Video element + canvas overlay
       │
       ▼
Frame sampling (configurable FPS)
       │
       ▼
Base64 → AI Service /track/frame
       │
       ▼
YOLO + Tracking
       │
       ▼
Severity estimation
       │
       ▼
Canvas overlay drawn
       │
       ▼
Track history maintained
       │
       ▼
User captures/saves → Supabase
```

## Security Architecture

### Authentication
- Supabase Auth (email/password + OAuth ready)
- JWT tokens with auto-refresh
- Server-side session validation (SSR)

### Authorization
- RLS policies enforce data isolation
- Role-based access (USER/ADMIN)
- API secret for AI service endpoints

### Data Protection
- HTTPS everywhere (Vercel + Supabase)
- Signed URLs for private storage
- Input validation (file type, size, MIME)
- No secrets in client bundle

### Privacy
- Explicit camera/location permissions
- Clear data usage explanations
- User-controlled data deletion
- GDPR-compliant data export/delete

## Deployment Architecture

### Frontend (Vercel)
- Automatic deployments from Git
- Edge functions for auth
- ISR for static pages
- Environment variables in Vercel dashboard

### AI Service (Docker)
- Containerized with GPU support
- Deployable to any container platform
- Health/readiness endpoints
- Horizontal scaling via replicas

### Database (Supabase)
- Managed PostgreSQL
- Automatic backups
- Point-in-time recovery
- Connection pooling

## Scaling Considerations

### Frontend
- Static generation where possible
- Code splitting by route
- Image optimization via Next.js
- CDN caching via Vercel

### AI Service
- Model loaded once per worker
- GPU utilization monitoring
- Batch inference for videos
- Queue-based async processing
- Horizontal scaling with load balancer

### Database
- Connection pooling (PgBouncer)
- Read replicas for analytics
- Partitioned tables for large datasets
- Indexes on query patterns

## Monitoring & Observability

### Frontend
- Vercel Analytics
- Sentry for error tracking
- Custom events for user actions

### AI Service
- Structured logging (JSON)
- Prometheus metrics endpoint
- Health/readiness for K8s
- Request/response logging

### Database
- Supabase dashboard
- Slow query monitoring
- Connection pool stats

## Disaster Recovery

- Database: Daily backups + PITR
- Storage: Versioned objects
- Code: Git history
- Config: Environment variables in secrets manager
- RTO: < 1 hour, RPO: < 24 hours

## Future Extensibility

- Additional damage classes (cracks, patches, rutting)
- Depth estimation integration
- Mobile apps (React Native)
- Municipal dashboards
- Fleet management integration
- Predictive maintenance models