# SmartPothole AI - Complete Deployment Script (Windows PowerShell)
# Run this script to deploy everything automatically

param(
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseAnonKey,
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseServiceRoleKey,
    
    [Parameter(Mandatory=$true)]
    [string]$AiServiceUrl,
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubRepo  # e.g., "ayushkumar143/smartpothole-ai"
)

# Configuration - UPDATE THESE (never commit real tokens)
$DockerHubUsername = "your-dockerhub-username"
$DockerHubToken = "your-dockerhub-access-token"
$VercelToken = "your-vercel-access-token"

# Generate secrets
$AiServiceSecret = [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes(32) | ForEach-Object { $_.ToString("x2") } -join ''
$InternalApiSecret = [System.Security.Cryptography.RandomNumberGenerator]::Create().GetBytes(32) | ForEach-Object { $_.ToString("x2") } -join ''

Write-Host "🚀 SmartPothole AI - Automated Deployment" -ForegroundColor Green
Write-Host "=========================================" -ForegroundColor Green
Write-Host ""
Write-Host "Configuration:" -ForegroundColor Yellow
Write-Host "  Docker Hub: $DockerHubUsername"
Write-Host "  Vercel: ✓"
Write-Host "  Supabase: $SupabaseUrl"
Write-Host "  AI Service: $AiServiceUrl"
Write-Host "  GitHub Repo: $GitHubRepo"
Write-Host ""

# Step 1: Docker Hub Login
Write-Host "Step 1: Docker Hub Login" -ForegroundColor Green
$DockerHubToken | docker login -u $DockerHubUsername --password-stdin

# Step 2: Build and Push AI Service
Write-Host "Step 2: Build & Push AI Service" -ForegroundColor Green
Set-Location ai-service
docker build -t "$DockerHubUsername/smartpothole-ai-service:latest" --target production .
docker push "$DockerHubUsername/smartpothole-ai-service:latest"
Set-Location ..

# Step 3: Deploy Frontend to Vercel
Write-Host "Step 3: Deploy Frontend to Vercel" -ForegroundColor Green
Set-Location frontend

# Create .env.production
@"
NEXT_PUBLIC_SUPABASE_URL=$SupabaseUrl
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=$SupabaseAnonKey
NEXT_PUBLIC_AI_API_URL=$AiServiceUrl
NEXT_PUBLIC_MAP_TILE_URL=https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png
NEXT_PUBLIC_APP_URL=https://your-app.vercel.app
NEXT_PUBLIC_ENABLE_DEMO_MODE=false
SUPABASE_SERVICE_ROLE_KEY=$SupabaseServiceRoleKey
AI_SERVICE_SECRET=$AiServiceSecret
INTERNAL_API_SECRET=$InternalApiSecret
"@ | Out-File -FilePath ".env.production" -Encoding utf8

# Deploy with Vercel CLI
npx vercel@latest --prod --token="$VercelToken" --yes
Set-Location ..

# Step 4: Setup GitHub Secrets for CI/CD
Write-Host "Step 4: Configuring GitHub Secrets" -ForegroundColor Green
if (Get-Command gh -ErrorAction SilentlyContinue) {
    gh secret set DOCKERHUB_USERNAME --repo $GitHubRepo --body $DockerHubUsername
    gh secret set DOCKERHUB_TOKEN --repo $GitHubRepo --body $DockerHubToken
    gh secret set VERCEL_TOKEN --repo $GitHubRepo --body $VercelToken
    gh secret set NEXT_PUBLIC_SUPABASE_URL --repo $GitHubRepo --body $SupabaseUrl
    gh secret set NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY --repo $GitHubRepo --body $SupabaseAnonKey
    gh secret set SUPABASE_SERVICE_ROLE_KEY --repo $GitHubRepo --body $SupabaseServiceRoleKey
    gh secret set NEXT_PUBLIC_AI_API_URL --repo $GitHubRepo --body $AiServiceUrl
    gh secret set AI_SERVICE_SECRET --repo $GitHubRepo --body $AiServiceSecret
    gh secret set INTERNAL_API_SECRET --repo $GitHubRepo --body $InternalApiSecret
    Write-Host "✅ GitHub secrets configured" -ForegroundColor Green
} else {
    Write-Host "⚠️ GitHub CLI not found. Install with: winget install GitHub.cli" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "✅ Deployment Complete!" -ForegroundColor Green
Write-Host ""
Write-Host "Generated Secrets (SAVE THESE!):" -ForegroundColor Yellow
Write-Host "AI_SERVICE_SECRET: $AiServiceSecret" -ForegroundColor Cyan
Write-Host "INTERNAL_API_SECRET: $InternalApiSecret" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next Manual Steps:" -ForegroundColor Yellow
Write-Host "1. Deploy AI service to Railway/Render/Fly.io using: $DockerHubUsername/smartpothole-ai-service:latest"
Write-Host "2. Update AI_SERVICE_URL in Vercel with the actual deployed URL"
Write-Host "3. Run Supabase migrations:"
Write-Host "   supabase link --project-ref YOUR_REF"
Write-Host "   supabase db push"
Write-Host "4. Apply storage policies from supabase/policies/storage_policies.sql"
Write-Host ""
Write-Host "Your Vercel deployment should be live at: https://your-app.vercel.app" -ForegroundColor Green