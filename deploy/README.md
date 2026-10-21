# Production deploys

```
PR ─► CI: npm ci, prisma validate, typecheck, build (GitHub-hosted runner, no secrets)
merge to main ─► CI passes ─► Deploy workflow waits in the "production" environment
   ─► ssh deploy@server "deploy <sha>"   (key can run only deploy.sh)
        deploy.sh: fetch <sha> from main ─► build in releases/<sha> (live site untouched)
                   ─► refuse if the release adds a Prisma migration
                   ─► switch `current` symlink ─► pm2 reload ─► health check
                   ─► unhealthy? switch back to the previous release automatically
```

**The pipeline never connects to the database.** It does not run migrations, seeds,
backups or `db push`. A release whose `prisma/migrations` folder has something new is
refused before the live site is touched; see [Releases with a migration](#releases-with-a-migration).

Rollback: Actions → Deploy → Run workflow → `rollback`. Only code changes; the database is left alone.

Rules:
- Never run `prisma db push` against production. Schema changes ship as migration folders
  (`npm run prisma:migrate --workspace apps/api` locally, commit the folder).
- Migrations should be backward compatible with the previous release (add first,
  remove in a later deploy), so that rolling back code still works.
- Nothing gets copied to the server by hand anymore. If it is not on `main`, it is not in prod.

## Server layout

```
/home/deploy/bin/deploy.sh            root-owned copy of deploy/server/deploy.sh
/home/deploy/diagnostic/
  repo.git/                           bare mirror, fetched with a read-only deploy key
  releases/<sha>/                     one folder per build (last 3 kept)
  current -> releases/<sha>           what PM2 runs
  history.log                         successful deploys
  applied-migrations.txt              migrations an admin applied by hand (one name per line)
  shared/env/{api,web,root}.env       production env files (chmod 600)
  shared/uploads/                     prescriptions; linked into every release
  shared/logs/                        one log per deploy
```

## One-time setup

Run on the server as `ubuntu` (with sudo). Check each step's output before the next one.

### 1. Deploy user and folders

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo -u deploy mkdir -p /home/deploy/diagnostic/{releases,shared/{env,uploads,logs}}
sudo install -d -o root -g root -m 755 /home/deploy/bin
# copy deploy/server/deploy.sh to the server first (scp), then:
sudo install -o root -g root -m 755 deploy.sh /home/deploy/bin/deploy.sh
which node npm pm2 git curl   # all must resolve for the deploy user too
```

If Node or PM2 live under `ubuntu`'s nvm, install them system-wide instead
(NodeSource package + `sudo npm i -g pm2`), or put a `PATH=...` line in
`/home/deploy/diagnostic/deploy.env`.

### 2. Let the server fetch the repo (read-only)

```bash
sudo -u deploy ssh-keygen -t ed25519 -N "" -C "diagnostic-server-fetch" -f /home/deploy/.ssh/github_fetch
sudo -u deploy tee /home/deploy/.ssh/config >/dev/null <<'EOF'
Host github.com
  IdentityFile ~/.ssh/github_fetch
  IdentitiesOnly yes
EOF
sudo cat /home/deploy/.ssh/github_fetch.pub
```

Add that public key in GitHub → repo Settings → Deploy keys, **without** write access. Then:

```bash
sudo -u deploy ssh -T git@github.com   # confirm the fingerprint matches GitHub's published one
sudo -u deploy git clone --mirror git@github.com:rohanchauhan196-cpu/diagnostic-center-appointment-module.git /home/deploy/diagnostic/repo.git
```

### 3. Move env files and uploads into `shared/`

The current app (checked 2026-10-21) runs from `/home/ubuntu/diagnostic-center-system`:
web on port 3500 (PM2 env), API on `API_PORT=4500` from `apps/api/.env`, uploads (~35 MB)
in `apps/api/public/uploads`.

```bash
OLD=/home/ubuntu/diagnostic-center-system
S=/home/deploy/diagnostic/shared
sudo cp $OLD/apps/api/.env            $S/env/api.env
sudo cp $OLD/apps/web/.env            $S/env/web.env
sudo cp $OLD/apps/web/.env.production $S/env/web.env.production
sudo cp $OLD/.env                     $S/env/root.env
sudo rsync -a $OLD/apps/api/public/uploads/ $S/uploads/
sudo chown -R deploy:deploy $S && sudo chmod 600 $S/env/*
```

Uploads made between this copy and the cut-over (step 5) must be copied again right
before cutting over: `sudo rsync -a $OLD/apps/api/public/uploads/ $S/uploads/ && sudo chown -R deploy:deploy $S/uploads`.

### 4. Key for GitHub Actions

On your own computer:

```bash
ssh-keygen -t ed25519 -N "" -C "github-actions-deploy" -f deploy_actions
```

On the server, add `deploy_actions.pub` to `/home/deploy/.ssh/authorized_keys` as one line:

```
command="/home/deploy/bin/deploy.sh",no-pty,no-port-forwarding,no-agent-forwarding,no-X11-forwarding ssh-ed25519 AAAA... github-actions-deploy
```

```bash
sudo chown deploy:deploy /home/deploy/.ssh/authorized_keys && sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

In GitHub → Settings → Environments → `production`:
- Secret `DEPLOY_SSH_KEY`: contents of `deploy_actions` (private key). Then delete the local file.
- Secret `DEPLOY_KNOWN_HOSTS`: output of `ssh-keyscan -t ed25519 <server-ip>`, after checking it
  matches `sudo ssh-keygen -lf /etc/ssh/ssh_host_ed25519_key.pub` run on the server.
- Variable `DEPLOY_HOST`: the server IP.
- Deployment branches: `main` only. Required reviewers: yourself (public repos, or GitHub Pro for private).

### 5. Cut over from the old `ubuntu` PM2 processes

The first deploy has no previous release to compare migrations against, so it only
goes ahead safely if the commit's code matches what prod runs today (same schema).

```bash
SHA=<commit on main to go live with>
sudo -u deploy /home/deploy/bin/deploy.sh prepare $SHA     # builds; site still running the old way
sudo rsync -a /home/ubuntu/diagnostic-center-system/apps/api/public/uploads/ /home/deploy/diagnostic/shared/uploads/
sudo chown -R deploy:deploy /home/deploy/diagnostic/shared/uploads
# as ubuntu: stops ONLY these two; the other PM2 apps on this server keep running (downtime starts)
pm2 delete diagnostic-api diagnostic-web && pm2 save
sudo -u deploy /home/deploy/bin/deploy.sh deploy $SHA      # starts under deploy (seconds)
sudo env PATH=$PATH pm2 startup systemd -u deploy --hp /home/deploy   # start on reboot
```

nginx needs no change: the apps still listen on 3500 (web) and 4500 (API).
Check the site, uploads and logins, then test a rollback from GitHub Actions once.

### 6. Lock the server down

Once your own SSH key login works:

`sshd_config.d/60-cloudimg-settings.conf` already says `PasswordAuthentication no`, yet
password logins still worked on 2026-10-21, and `PermitRootLogin yes` is set. Check what
sshd actually uses, then turn off every password path:

```bash
sudo sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin|usepam'
sudo tee /etc/ssh/sshd_config.d/00-hardening.conf >/dev/null <<'EOF'
PasswordAuthentication no
KbdInteractiveAuthentication no
PermitRootLogin no
EOF
sudo sshd -t && sudo systemctl reload ssh
sudo sshd -T | grep -E 'passwordauthentication|kbdinteractiveauthentication|permitrootlogin'
# keep this session open and confirm a NEW key-based login works before closing it
sudo apt install -y fail2ban
```

Keep the old `/home/ubuntu/diagnostic-center-system` folder for a week as a fallback, then remove it.

## Releases with a migration

When a merged change adds a folder under `apps/api/prisma/migrations/`, the Deploy
workflow fails with "This release adds database migrations" and the live site keeps
running the old code. To ship it, a person does the database part by hand:

1. Take a backup and copy it off the server.
2. Read the migration's `migration.sql` and run it against production yourself
   (for example with `psql`, or `npx prisma migrate deploy` from a checkout of that commit).
3. Record that it is done, so the pipeline lets the release through:
   ```bash
   echo <migration_folder_name> | sudo -u deploy tee -a /home/deploy/diagnostic/applied-migrations.txt
   ```
4. Re-run the Deploy workflow for that commit (Actions → Deploy → Run workflow).
