#!/bin/bash
# SmartPothole AI - Complete Deployment Script
# Run this script to deploy everything automatically

set -e

echo "🚀 SmartPothole AI - Automated Deployment"
echo "========================================="

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Configuration - UPDATE THESE
DOCKERHUB_USERNAME="your-dockerhub-username"
DOCKERHUB_TOKEN="your-dockerhub-access-token"
VERCEL_TOKEN="your-vercel-access-token"

# These need to be provided by user
SUPABASE_URL="${SUPABASE_URL:-https://your-project.supabase.co}"
SUPABASE_ANON_KEY="${SUPABASE_ANON_KEY:-your-anon-key}"
SUPABASE_SERVICE_ROLE_KEY="${SUPABASE_SERVICE_ROLE_KEY:-your-service-role-key}"
AI_SERVICE_URL="${AI_SERVICE_URL:-https://your-ai-service.railway.app}"
AI_SERVICE_SECRET="${AI_SERVICE_SECRET:-$(openssl rand -hex 32)}"
INTERNAL_API_SECRET="${INTERNAL_API_SECRET:-$(openssl rand -hex 32)}"
GITHUB_REPO="${GITHUB_REPO:-your-username/smartpothole-ai}"

echo -e "${YELLOW}Configuration:${NC}"
echo "  Docker Hub: $DOCKERHUB_USERNAME"
echo "  Vercel: ✓"
echo "  Supabase: $SUPABASE_URL"
echo "  AI Service: $AI_SERVICE_URL"
echo "  GitHub Repo: $GITHUB_REPO"
echo ""

# Step 1: Login to Docker Hub
echo -e "${GREEN}Step 1: Docker Hub Login${NC}"
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin

# Step 2: Build and Push AI Service
echo -e "${GREEN}Step 2: Build & Push AI Service${NC}"
cd ai-service
docker build -t "$DOCKERHUB_USERNAME/smartpothole-ai-service:latest" --target production .
docker push "$DOCKERHUB_USERNAME/smartpothole-ai-service:latest"
cd ..

# Step 3: Deploy Frontend to Vercel
echo -e "${GREEN}Step 3: Deploy Frontend to Vercel${NC}"
cd frontend

# Create .env.production for Vercel
cat > .env.production <<EOF
NEXT_PUBLIC_SUPABASE_URL=$SUPABASE_URL
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$SUPABASE_ANON_KEY
NEXT_PUBLIC_AI_API_URL=$AI_SERVICE_URL
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
SUPABASE_SERVICE_ROLE_KEY=$SUPABASE_SERVICE_ROLE_KEY
AI_SERVICE_SECRET=$AI_SERVICE_SECRET
INTERNAL_API_SECRET=$INTERNAL_API_SECRET
EOF

# Deploy with Vercel CLI
npx vercel@latest --prod --token="$VERCEL_TOKEN" --yes
cd ..

# Step 4: Deploy AI Service to Railway
echo -e "${GREEN}Step 4: Deploy AI Service to Railway${NC}"
# Note: Railway deployment via CLI requires railway login first
# Alternative: Use Railway dashboard or Render/Fly.io

echo -e "${GREEN}✅ Deployment Complete!${NC}"
echo ""
echo "Next manual steps:"
echo "1. Deploy AI service to Railway/Render/Fly.io using the pushed Docker image"
echo "2. Update AI_SERVICE_URL in Vercel with the actual deployed URL"
echo "3. Run Supabase migrations:"
echo "   supabase link --project-ref YOUR_REF"
echo "   supabase db push"
echo "4. Apply storage policies from supabase/policies/storage_policies.sql"
echo ""
echo "Your generated secrets (save these!):"
echo "AI_SERVICE_SECRET: $AI_SERVICE_SECRET"
echo "INTERNAL_API_SECRET: $INTERNAL_API_SECRET"