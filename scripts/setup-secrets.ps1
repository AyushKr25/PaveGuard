<#
.SYNOPSIS
    Setup script to configure GitHub repository secrets for automated deployment
.DESCRIPTION
    This script helps you add the required secrets to your GitHub repository
    for automated Docker builds and Vercel deployment.
#>

param(
    [Parameter(Mandatory=$true)]
    [string]$GitHubRepo,  # e.g., "ayushkumar143/smartpothole-ai"
    
    [Parameter(Mandatory=$true)]
    [string]$GitHubToken,  # Personal Access Token with repo scope
    
    [Parameter(Mandatory=$true)]
    [string]$DockerHubUsername,  # ayushkumar143
    
    [Parameter(Mandatory=$true)]
    [string]$DockerHubToken,  # dckr_pat_...
    
    [Parameter(Mandatory=$true)]
    [string]$VercelToken,  # vcp_...
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseUrl,  # https://xxx.supabase.co
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseAnonKey,  # eyJ...
    
    [Parameter(Mandatory=$true)]
    [string]$SupabaseServiceRoleKey,  # eyJ...
    
    [Parameter(Mandatory=$true)]
    [string]$AiServiceUrl,  # e.g., https://smartpothole-ai.up.railway.app
    
    [Parameter(Mandatory=$true)]
    [string]$AiServiceSecret,  # Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
    
    [Parameter(Mandatory=$true)]
    [string]$InternalApiSecret  # Another random secret
)

# Secrets to add
$secrets = @{
    "DOCKERHUB_USERNAME"        = $DockerHubUsername
    "DOCKERHUB_TOKEN"           = $DockerHubToken
    "VERCEL_TOKEN"              = $VercelToken
    "NEXT_PUBLIC_SUPABASE_URL"  = $SupabaseUrl
    "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY" = $SupabaseAnonKey
    "SUPABASE_SERVICE_ROLE_KEY" = $SupabaseServiceRoleKey
    "NEXT_PUBLIC_AI_API_URL"    = $AiServiceUrl
    "AI_SERVICE_SECRET"         = $AiServiceSecret
    "INTERNAL_API_SECRET"       = $InternalApiSecret
}

Write-Host "Adding secrets to GitHub repository: $GitHubRepo" -ForegroundColor Green

foreach ($secret in $secrets.GetEnumerator()) {
    $name = $secret.Key
    $value = $secret.Value
    
    Write-Host "Setting secret: $name" -ForegroundColor Cyan
    
    # Use GitHub CLI to set secret
    $result = gh secret set $name --repo $GitHubRepo --body $value 2>&1
    
    if ($LASTEXITCODE -eq 0) {
        Write-Host "  ✅ $name added successfully" -ForegroundColor Green
    } else {
        Write-Host "  ❌ Failed to add $name: $result" -ForegroundColor Red
    }
}

Write-Host "`nAll secrets configured! Next steps:" -ForegroundColor Yellow
Write-Host "1. Push to main branch to trigger deployment"
Write-Host "2. Check GitHub Actions tab for build status"
Write-Host "3. Verify Vercel deployment at your-domain.vercel.app"
Write-Host "4. Verify AI service at $AiServiceUrl/health"