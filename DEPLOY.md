# Auto-Deploy Setup Guide

This guide will help you set up automatic deployment to your server when you push to the `main` branch.

## 📋 Prerequisites

- GitHub repository for this project
- SSH access to your server (already configured)
- GitHub account with repository access

## 🚀 Setup Steps

### 1. Push Your Code to GitHub

If you haven't already, initialize git and push to GitHub:

```bash
# In your local DG-CRM directory
git init
git add .
git commit -m "Initial commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git push -u origin main
```

### 2. Add GitHub Secrets

Go to your GitHub repository:
1. Click **Settings** → **Secrets and variables** → **Actions**
2. Click **New repository secret** and add these three secrets:

**Secret 1: SERVER_HOST**
- Name: `SERVER_HOST`
- Value: `154.65.111.81`

**Secret 2: SERVER_USER**
- Name: `SERVER_USER`
- Value: `ubuntu`

**Secret 3: SSH_PRIVATE_KEY**
- Name: `SSH_PRIVATE_KEY`
- Value: Copy the entire contents of your `dgm.txt` file (the private SSH key)
  ```bash
  cat dgm.txt | pbcopy  # This copies the key to clipboard on Mac
  ```
  Then paste into GitHub

### 3. Configure Git on Server

Run these commands to set up git on your server:

```bash
ssh -i dgm.txt ubuntu@154.65.111.81 << 'EOF'
cd ~/DG-CRM
git config --global user.name "Your Name"
git config --global user.email "your.email@example.com"
git config --global --add safe.directory ~/DG-CRM
git remote set-url origin https://github.com/YOUR_USERNAME/YOUR_REPO.git
git fetch origin
git checkout -b main
git branch --set-upstream-to=origin/main main
git pull origin main
EOF
```

Replace:
- `Your Name` with your actual name
- `your.email@example.com` with your email
- `YOUR_USERNAME/YOUR_REPO` with your GitHub repository

### 4. Test the Workflow

Make a small change to any file and push:

```bash
echo "# Auto-deploy test" >> README.md
git add README.md
git commit -m "Test auto-deploy"
git push origin main
```

Go to your GitHub repository → **Actions** tab to see the deployment in progress.

## 🔍 How It Works

The workflow (`.github/workflows/deploy.yml`):

1. **Triggers** when you push to `main` branch
2. **Connects** to your server via SSH
3. **Pulls** the latest code from GitHub
4. **Detects changes**:
   - If backend changed → rebuilds backend container
   - If frontend changed → rebuilds frontend container  
   - If migrations changed → runs database migrations
5. **Restarts** only the affected services

## 🎯 What Gets Auto-Deployed

✅ Backend code changes (Node.js/Express)
✅ Frontend code changes (Next.js/React)
✅ Database migrations (Prisma)
✅ Docker configuration changes
✅ Environment variable updates (requires manual restart)

## 🛠️ Manual Deployment

If you need to manually trigger deployment or make changes:

```bash
ssh -i dgm.txt ubuntu@154.65.111.81
cd ~/DG-CRM
git pull origin main
docker compose build
docker compose up -d
```

## 📊 Monitoring Deployments

- View deployment logs in GitHub: **Repository → Actions**
- Check server status: 
  ```bash
  ssh -i dgm.txt ubuntu@154.65.111.81 'cd ~/DG-CRM && docker compose ps'
  ```

## ⚠️ Important Notes

- First deployment may fail - run the server git setup commands first
- Environment variables (`.env.local`) are NOT in git - they stay on the server
- Database migrations run automatically if changed
- Failed deployments don't affect running services

## 🔐 Security

- Private SSH key is stored securely in GitHub Secrets (encrypted)
- Never commit `.env.local` or `dgm.txt` to git
- Add to `.gitignore` if not already present

## 🐛 Troubleshooting

**Workflow fails with "permission denied":**
- Check SSH_PRIVATE_KEY secret contains the full key including headers
- Ensure SERVER_HOST and SERVER_USER are correct

**Workflow succeeds but changes not visible:**
- Check if containers restarted: `docker compose ps`
- View container logs: `docker compose logs backend frontend`

**Git conflicts on server:**
```bash
ssh -i dgm.txt ubuntu@154.65.111.81 'cd ~/DG-CRM && git reset --hard origin/main'
```
