# Diagnostic Center System — Production Deployment Guide

This guide documents the architecture and step-by-step instructions for deploying updates to the production server.

---

## 1. Production Architecture Overview

The application runs directly on the host machine using **PM2** for process management and **Nginx** as a reverse proxy/SSL termination.
* **Backend API**: Run via PM2 process `diagnostic-api` (listens on port `4000`).
* **Frontend Web**: Run via PM2 process `diagnostic-web` (listens on port `3000`).
* **Nginx**: Proxies public traffic from domains to the respective PM2 ports and terminates SSL certificates.

> [!IMPORTANT]
> The production server **does not** run this system in Docker (Docker is reserved for other/older websites on the server). Do not use Docker Compose for updating this site to avoid binding conflicts on host ports.

---

## 2. Manual Deployment Steps

To deploy updates manually, log in to the server via SSH:

### Step 1: Create local bundle
On your local PC, create a compressed archive of the workspace excluding build artifacts, local config, and dependencies:
```bash
tar --exclude="node_modules" --exclude=".next" --exclude="dist" --exclude="logs" --exclude="*.tar.gz" --exclude=".env*" -czf update.tar.gz .
```

### Step 2: Upload to Server
Upload the archive to the target folder:
```bash
scp update.tar.gz ubuntu@187.77.187.52:/home/ubuntu/
```

### Step 3: Extract the bundle
SSH into the server, move to the folder, and extract the updates:
```bash
# SSH into server
ssh ubuntu@187.77.187.52

# Extract bundle
tar -xzf /home/ubuntu/update.tar.gz -C /home/ubuntu/diagnostic-center-system/
rm /home/ubuntu/update.tar.gz
```

### Step 4: Build both Workspaces
Compile the source code:
```bash
cd /home/ubuntu/diagnostic-center-system

# Build API (TypeScript compile)
npm run build --workspace=apps/api

# Build Web (Next.js compile)
npm run build --workspace=apps/web
```

### Step 5: Restart PM2 Processes
Restart the services under PM2 to apply the changes:
```bash
pm2 restart diagnostic-api
pm2 restart diagnostic-web
```

### Step 6: Verify Uptime
Verify that the services are online and stable:
```bash
pm2 list
```

---

## 3. Automated Password-Based Deployment Script

If you do not have SSH keys set up or are using password authentication, you can run a Python script from your local machine to deploy in one command.

### Requirements
Ensure you have the SSH library `paramiko` installed:
```bash
pip install paramiko
```

### Script (`deploy_pm2.py`)
Save the following code as `deploy_pm2.py` and run it locally with `python deploy_pm2.py`:

```python
import os
import sys
import subprocess
import paramiko

# Set standard output and error to use UTF-8 (prevents crashes with special logging chars)
if hasattr(sys.stdout, 'reconfigure'): sys.stdout.reconfigure(encoding='utf-8')
if hasattr(sys.stderr, 'reconfigure'): sys.stderr.reconfigure(encoding='utf-8')

workspace = os.path.dirname(os.path.abspath(__file__))
archive_name = "update.tar.gz"
archive_path = os.path.join(workspace, archive_name)

print("1. Creating local update archive...")
if os.path.exists(archive_path):
    os.remove(archive_path)

# Run tar command excluding build/node_modules directories
cmd = [
    "tar",
    "--exclude=node_modules",
    "--exclude=.next",
    "--exclude=dist",
    "--exclude=logs",
    "--exclude=*.tar.gz",
    "--exclude=.env*",
    "-czf",
    archive_name,
    "."
]
subprocess.run(cmd, cwd=workspace, check=True)
print("Archive created successfully.")

hostname = "187.77.187.52"
username = "ubuntu"
password = "VIT@2026@Mol2"  # Update password if changed
remote_base = "/home/ubuntu/diagnostic-center-system"

print("\n2. Connecting to remote host and uploading archive via SFTP...")
ssh = paramiko.SSHClient()
ssh.set_missing_host_key_policy(paramiko.AutoAddPolicy())
ssh.connect(hostname, username=username, password=password)

sftp = ssh.open_sftp()
sftp.put(archive_path, f"/home/ubuntu/{archive_name}")
sftp.close()
print("Upload completed.")

# Clean up local archive
if os.path.exists(archive_path):
    os.remove(archive_path)

print("\n3. Running deployment and build commands on production server...")

deploy_commands = f"""
echo '=== Extracting archive ==='
tar -xzf /home/ubuntu/{archive_name} -C {remote_base}
rm /home/ubuntu/{archive_name}

cd {remote_base}

echo '=== Building API (TypeScript) ==='
npm run build --workspace=apps/api

echo '=== Building Web (Next.js) ==='
npm run build --workspace=apps/web

echo '=== Restarting PM2 processes ==='
pm2 restart diagnostic-api
pm2 restart diagnostic-web

echo '=== Checking PM2 status ==='
pm2 list
"""

stdin, stdout, stderr = ssh.exec_command(deploy_commands)

# Stream stdout in real-time
while True:
    line = stdout.readline()
    if not line: break
    print(line, end="")

# Stream stderr in real-time
while True:
    line = stderr.readline()
    if not line: break
    print(line, end="")

ssh.close()
print("\nPM2 Deployment completed successfully!")
```
