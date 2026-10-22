#!/bin/bash
# One-Command Deployment for SmartPothole AI
# Usage: curl -sSL https://raw.githubusercontent.com/your-repo/main/deploy-one-command.sh | bash -s -- \
#   --supabase-url "https://xxx.supabase.co" \
#   --supabase-anon-key "eyJ..." \
#   --supabase-service-key "eyJ..." \
#   --ai-service-url "https://your-ai.railway.app" \
#   --github-repo "ayushkumar143/smartpothole-ai"

set -e

# Parse arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    --supabase-url) SUPABASE_URL="$2"; shift 2 ;;
    --supabase-anon-key) SUPABASE_ANON_KEY="$2"; shift 2 ;;
    --supabase-service-key) SUPABASE_SERVICE_ROLE_KEY="$2"; shift 2 ;;
    --ai-service-url) AI_SERVICE_URL="$2"; shift 2 ;;
    --github-repo) GITHUB_REPO="$2"; shift 2 ;;
    *) echo "Unknown option: $1"; exit 1 ;;
  esac
done

# Validate required args
if [[ -z "$SUPABASE_URL" || -z "$SUPABASE_ANON_KEY" || -z "$SUPABASE_SERVICE_ROLE_KEY" || -z "$AI_SERVICE_URL" || -z "$GITHUB_REPO" ]]; then
  echo "Usage: $0 --supabase-url <url> --supabase-anon-key <key> --supabase-service-key <key> --ai-service-url <url> --github-repo <owner/repo>"
  exit 1
fi

# Configuration - UPDATE THESE (never commit real tokens)
DOCKERHUB_USERNAME="your-dockerhub-username"
DOCKERHUB_TOKEN="your-dockerhub-access-token"
VERCEL_TOKEN="your-vercel-access-token"

# Generate secrets
AI_SERVICE_SECRET=$(openssl rand -hex 32)
INTERNAL_API_SECRET=$(openssl rand -hex 32)

echo "🚀 Deploying SmartPothole AI..."
echo "================================="

# 1. Docker Hub Login
echo "📦 Docker Hub Login..."
echo "$DOCKERHUB_TOKEN" | docker login -u "$DOCKERHUB_USERNAME" --password-stdin

# 2. Build & Push AI Service
echo "🔨 Building AI Service..."
cd ai-service
docker build -t "$DOCKERHUB_USERNAME/smartpothole-ai-service:latest" --target production .
docker push "$DOCKERHUB_USERNAME/smartpothole-ai-service:latest"
cd ..

# 3. Vercel Deploy
echo "🌐 Deploying to Vercel..."
cd frontend
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

npx vercel@latest --prod --token="$VERCEL_TOKEN" --yes
cd ..

# 4. GitHub Secrets (if gh CLI available)
if command -v gh &> /dev/null; then
  echo "🔐 Setting GitHub Secrets..."
  gh secret set DOCKERHUB_USERNAME --repo "$GITHUB_REPO" --body "$DOCKERHUB_USERNAME"
  gh secret set DOCKERHUB_TOKEN --repo "$GITHUB_REPO" --body "$DOCKERHUB_TOKEN"
  gh secret set VERCEL_TOKEN --repo "$GITHUB_REPO" --body "$VERCEL_TOKEN"
  gh secret set NEXT_PUBLIC_SUPABASE_URL --repo "$GITHUB_REPO" --body "$SUPABASE_URL"
  gh secret set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --repo "$GITHUB_REPO" --body "$SUPABASE_ANON_KEY"
  gh secret set SUPABASE_SERVICE_ROLE_KEY --repo "$GITHUB_REPO" --body "$SUPABASE_SERVICE_ROLE_KEY"
  gh secret set NEXT_PUBLIC_AI_API_URL --repo "$GITHUB_REPO" --body "$AI_SERVICE_URL"
  gh secret set AI_SERVICE_SECRET --repo "$GITHUB_REPO" --body "$AI_SERVICE_SECRET"
  gh secret set INTERNAL_API_SECRET --repo "$GITHUB_REPO" --body "$INTERNAL_API_SECRET"
  echo "✅ GitHub Secrets configured"
else
  echo "⚠️ GitHub CLI not installed. Run: curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg | sudo dd of=/usr/share/keyrings/githubcli-archive-keyring.gpg && echo \"deb [arch=\$(dpkg --print-architecture) signed-by=/usr/share/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main\" | sudo tee /etc/apt/sources.list.d/github-cli.list > /dev/null && sudo apt update && sudo apt install gh"
fi

echo ""
echo "✅ DEPLOYMENT COMPLETE!"
echo ""
echo "🔑 SAVE THESE SECRETS:"
echo "AI_SERVICE_SECRET: $AI_SERVICE_SECRET"
echo "INTERNAL_API_SECRET: $INTERNAL_API_SECRET"
echo ""
echo "📋 NEXT STEPS:"
echo "1. Deploy AI service to Railway/Render/Fly.io using: $DOCKERHUB_USERNAME/smartpothole-ai-service:latest"
echo "2. Update NEXT_PUBLIC_AI_API_URL in Vercel with actual AI service URL"
echo "3. Run Supabase migrations:"
echo "   supabase link --project-ref YOUR_REF && supabase db push"
echo "4. Apply storage policies from supabase/policies/storage_policies.sql"
echo ""
echo "🎉 Your app will be live at: https://your-app.vercel.app"