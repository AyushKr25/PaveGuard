# SmartPothole AI - Deployment Guide

## Prerequisites

### Required Accounts
- **GitHub** - Source code repository
- **Vercel** - Frontend hosting
- **Supabase** - Database, Auth, Storage
- **Docker Hub / GHCR / Cloud Provider** - AI Service container registry

### Local Development
- Node.js 20+
- Python 3.11+
- Docker & Docker Compose
- Supabase CLI (optional)

---

## 1. Supabase Setup

### Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note your project URL and anon key from Settings → API
3. Enable Row Level Security (enabled by default)

### Run Migrations
```bash
# Install Supabase CLI
npm install -g supabase

# Link to your project
supabase link --project-ref YOUR_PROJECT_REF

# Push migrations
supabase db push
```

### Configure Storage Buckets
Run in Supabase SQL Editor or use the dashboard:

```sql
-- Create buckets (if not auto-created by config)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
  ('detection-images', 'detection-images', false, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('detection-videos', 'detection-videos', false, 524288000, ARRAY['video/mp4', 'video/webm', 'video/quicktime']),
  ('annotated-results', 'annotated-results', false, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'video/mp4', 'video/webm']),
  ('avatars', 'avatars', true, 5242880, ARRAY['image/jpeg', 'image/png', 'image/webp']),
  ('reports', 'reports', false, 20971520, ARRAY['application/pdf', 'text/csv', 'application/json']);
```

### Apply RLS Policies
Copy policies from `supabase/policies/storage_policies.sql` and run in SQL Editor.

### Seed Data (Development)
```bash
supabase db seed
```

---

## 2. Frontend Deployment (Vercel)

### Connect Repository
1. Push code to GitHub
2. Import project in Vercel
3. Select `frontend` as root directory

### Environment Variables
Add in Vercel Project Settings → Environment Variables:

```env
# Public (NEXT_PUBLIC_*)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-anon-key
NEXT_PUBLIC_AI_API_URL=https://your-ai-service.domain.com
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_APP_URL=https://your-domain.vercel.app
NEXT_PUBLIC_ENABLE_DEMO_MODE=false

# Private (Server-only)
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
AI_SERVICE_SECRET=your-ai-service-secret
INTERNAL_API_SECRET=your-internal-secret
```

### Build Settings
- Framework Preset: Next.js
- Root Directory: `frontend`
- Build Command: `npm run build`
- Output Directory: `.next`
- Install Command: `npm install`

### Deploy
```bash
vercel --prod
```

---

## 3. AI Service Deployment

### Option A: Docker (Recommended)

#### Build Image
```bash
cd ai-service
docker build -t smartpothole-ai-service:latest .
```

#### Run with GPU (NVIDIA)
```bash
docker run -d \
  --name smartpothole-ai \
  --gpus all \
  -p 8000:8000 \
  -v /path/to/models:/app/models \
  -v /path/to/config:/app/config \
  -v /path/to/temp:/app/temp \
  --env-file .env.production \
  smartpothole-ai-service:latest
```

#### Environment Variables (.env.production)
```env
AI_MODEL_PROVIDER=ultralytics
AI_MODEL_PATH=/app/models/best.pt
AI_MODEL_TYPE=segmentation
AI_MODEL_VERSION=v1.0.0
AI_CONFIDENCE_THRESHOLD=0.25
AI_IOU_THRESHOLD=0.45
AI_IMAGE_SIZE=640
AI_DEVICE=auto
AI_HALF_PRECISION=true
AI_HOST=0.0.0.0
AI_PORT=8000
AI_WORKERS=1
AI_LOG_LEVEL=info
AI_MAX_UPLOAD_SIZE=104857600
AI_REQUEST_TIMEOUT=300
ENABLE_SEGMENTATION=true
ENABLE_TRACKING=true
ENABLE_DEPTH=false
ENABLE_DEMO_MODE=false
TRACK_MIN_DETECTION_FRAMES=3
TRACK_TIMEOUT=30
TRACK_DEDUPLICATION_DISTANCE=50
TRACK_MIN_CONFIDENCE=0.3
SEVERITY_CONFIG_PATH=/app/config/severity_config.yaml
AI_CORS_ORIGINS=https://your-domain.vercel.app
AI_SERVICE_SECRET=your-secure-secret
```

### Option B: Kubernetes

```yaml
# k8s/ai-service.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: smartpothole-ai
spec:
  replicas: 2
  selector:
    matchLabels:
      app: smartpothole-ai
  template:
    metadata:
      labels:
        app: smartpothole-ai
    spec:
      containers:
      - name: ai-service
        image: your-registry/smartpothole-ai-service:latest
        ports:
        - containerPort: 8000
        envFrom:
        - secretRef:
            name: ai-service-secrets
        - configMapRef:
            name: ai-service-config
        resources:
          limits:
            nvidia.com/gpu: 1
            memory: "4Gi"
          requests:
            nvidia.com/gpu: 1
            memory: "2Gi"
        livenessProbe:
          httpGet:
            path: /health
            port: 8000
          initialDelaySeconds: 30
          periodSeconds: 10
        readinessProbe:
          httpGet:
            path: /ready
            port: 8000
          initialDelaySeconds: 10
          periodSeconds: 5
---
apiVersion: v1
kind: Service
metadata:
  name: smartpothole-ai
spec:
  selector:
    app: smartpothole-ai
  ports:
  - port: 8000
    targetPort: 8000
  type: ClusterIP
```

### Option C: Cloud Run / Fly.io / Render

**Cloud Run:**
```bash
gcloud run deploy smartpothole-ai \
  --image gcr.io/PROJECT_ID/smartpothole-ai-service \
  --platform managed \
  --region us-central1 \
  --memory 4Gi \
  --cpu 2 \
  --gpu 1 \
  --allow-unauthenticated \
  --set-env-vars=AI_MODEL_PATH=/app/models/best.pt,AI_DEVICE=cuda
```

**Fly.io:**
```toml
# fly.toml
app = "smartpothole-ai"
primary_region = "iad"

[build]
  dockerfile = "Dockerfile"

[env]
  AI_MODEL_PATH = "/app/models/best.pt"
  AI_DEVICE = "cuda"

[mounts]
  source = "models"
  destination = "/app/models"

[[services]]
  http_checks = []
  internal_port = 8000
  processes = ["app"]
  protocol = "tcp"
  script_checks = []
  
  [[services.ports]]
    handlers = ["http"]
    port = 8000

  [[services.tcp_checks]]
    grace_period = "10s"
    interval = "10s"
    restart_limit = 3
    timeout = "5s"
```

---

## 4. Model Setup

### Custom Trained Model
1. Train your YOLO model (see `ml/training/`)
2. Export best.pt: `yolo export model=best.pt format=onnx`
3. Place in `ai-service/models/best.pt`

### Development (No Custom Model)
Set `ENABLE_DEMO_MODE=true` - uses pretrained YOLO11n-seg with mock detections.

### Model Profiles
Configure in environment:
```env
AI_PROFILE_FAST_MODEL=yolo11n-seg.pt      # ~120 FPS
AI_PROFILE_BALANCED_MODEL=yolo11s-seg.pt  # ~65 FPS
AI_PROFILE_ACCURACY_MODEL=yolo11m-seg.pt  # ~35 FPS
```

---

## 5. Local Development

### Using Docker Compose
```bash
# Copy environment template
cp .env.example .env.local

# Edit with your values
# Required: NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

# Start all services
docker-compose -f docker-compose.yml -f docker-compose.dev.yml up -d

# View logs
docker-compose logs -f frontend
docker-compose logs -f ai-service
```

### Manual Development
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

# Terminal 3: Supabase (optional)
supabase start
```

---

## 6. Production Checklist

### Security
- [ ] All secrets in environment variables (not code)
- [ ] HTTPS enforced (Vercel + Supabase automatic)
- [ ] RLS policies tested
- [ ] API secret configured for AI service
- [ ] CORS origins restricted to production domain
- [ ] File upload validation (type, size, MIME)
- [ ] Signed URLs for private storage access

### Performance
- [ ] Frontend builds successfully
- [ ] AI service health/readiness endpoints work
- [ ] Model loads correctly on startup
- [ ] GPU utilization monitored
- [ ] Database indexes created
- [ ] Connection pooling configured

### Monitoring
- [ ] Vercel Analytics enabled
- [ ] Sentry DSN configured (optional)
- [ ] AI service logging configured
- [ ] Health check endpoints accessible
- [ ] Alerting on job failures

### Backup & Recovery
- [ ] Supabase backups enabled
- [ ] Point-in-time recovery tested
- [ ] Storage versioning enabled
- [ ] Environment variables documented

---

## 7. Domain & SSL

### Custom Domain (Vercel)
1. Add domain in Vercel Project Settings → Domains
2. Configure DNS records as instructed
3. SSL auto-provisioned

### Custom Domain (AI Service)
1. Configure DNS A/CNAME record
2. Set up SSL (Let's Encrypt via reverse proxy)
3. Update `NEXT_PUBLIC_AI_API_URL` and `AI_CORS_ORIGINS`

---

## 8. Troubleshooting

### Frontend Build Fails
```bash
# Clear cache
rm -rf .next node_modules
npm install
npm run build
```

### AI Service Model Not Loading
- Check `AI_MODEL_PATH` exists in container
- Verify model file permissions
- Check logs for CUDA errors
- Try `AI_DEVICE=cpu` for debugging

### Supabase Connection Issues
- Verify `NEXT_PUBLIC_SUPABASE_URL` format
- Check anon key is correct
- Ensure RLS policies allow access
- Check Supabase project is not paused

### Video Processing Fails
- Increase `AI_REQUEST_TIMEOUT`
- Check disk space in `/app/temp`
- Verify ffmpeg installed in container
- Check video codec compatibility

---

## 9. Scaling

### AI Service
- Increase replicas behind load balancer
- Use GPU node pools
- Implement request queuing (Redis + Celery)
- Consider model optimization (TensorRT, ONNX)

### Database
- Enable connection pooling (PgBouncer)
- Add read replicas for analytics
- Partition large tables by date
- Archive old detections

### Frontend
- Enable ISR for static pages
- Use edge functions for auth
- Optimize bundle size
- Configure caching headers

---

## 10. Rollback Procedure

### Frontend (Vercel)
```bash
vercel rollback [deployment-url]
```

### AI Service (Docker)
```bash
docker tag smartpothole-ai-service:previous smartpothole-ai-service:latest
docker-compose up -d ai-service
```

### Database
```bash
supabase db reset --linked  # WARNING: destroys data
# Or restore from backup via Supabase dashboard
```