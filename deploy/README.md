# Production deploys

```
PR ─► CI: npm ci, prisma validate, typecheck, build (GitHub-hosted runner, no secrets)
merge to main ─► CI passes ─► Deploy workflow waits in the "production" environment
   ─► ssh deploy@server "deploy <sha>"   (key can run only deploy.sh)
        deploy.sh: fetch <sha> from main ─► build in releases/<sha> (live site untouched)
                   ─► pg_dump backup ─► prisma migrate deploy
                   ─► switch `current` symlink ─► pm2 reload ─► health check
                   ─► unhealthy? switch back to the previous release automatically
```

Rollback: Actions → Deploy → Run workflow → `rollback`. Code goes back; database
migrations do not, so restore from `shared/backups/` only if a migration itself broke things.

Rules:
- Never run `prisma db push` against production. Schema changes ship as migrations
  (`npm run prisma:migrate --workspace apps/api` locally, commit the folder).
- Migrations should be backward compatible with the previous release (add first,
  remove in a later deploy), because rollback does not revert them.
- Nothing gets copied to the server by hand anymore. If it is not on `main`, it is not in prod.

## Server layout

```
/home/deploy/bin/deploy.sh            root-owned copy of deploy/server/deploy.sh
/home/deploy/diagnostic/
  repo.git/                           bare mirror, fetched with a read-only deploy key
  releases/<sha>/                     one folder per build (last 3 kept)
  current -> releases/<sha>           what PM2 runs
  history.log                         successful deploys
  shared/env/{api,web,root}.env       production env files (chmod 600)
  shared/uploads/                     prescriptions; linked into every release
  shared/backups/                     pre-deploy pg_dump files (last 14 kept)
  shared/logs/                        one log per deploy
```

## One-time setup

Run on the server as `ubuntu` (with sudo). Check each step's output before the next one.

### 1. Deploy user and folders

```bash
sudo adduser --disabled-password --gecos "" deploy
sudo -u deploy mkdir -p /home/deploy/diagnostic/{releases,shared/{env,uploads,backups,logs}}
sudo install -d -o root -g root -m 755 /home/deploy/bin
# copy deploy/server/deploy.sh to the server first (scp), then:
sudo install -o root -g root -m 755 deploy.sh /home/deploy/bin/deploy.sh
which node npm pm2 pg_dump git curl   # all must resolve for the deploy user too
```

If Node or PM2 live under `ubuntu`'s nvm, install them system-wide instead
(NodeSource package + `sudo npm i -g pm2`), or put a `PATH=...` line in
`/home/deploy/diagnostic/deploy.env`. `pg_dump` must be the same major version as
the Postgres server (`sudo apt install postgresql-client-<version>`).

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

Find where the running app reads them first:

```bash
pm2 jlist | python3 -c "import json,sys;[print(p['name'],p['pm2_env']['pm_cwd']) for p in json.load(sys.stdin)]"
find /home/ubuntu/diagnostic-center-system -path '*/node_modules' -prune -o -type d -name uploads -print
```

Then copy (adjust source paths to what the commands above showed):

```bash
OLD=/home/ubuntu/diagnostic-center-system
S=/home/deploy/diagnostic/shared
sudo cp $OLD/apps/api/.env $S/env/api.env
sudo cp $OLD/apps/web/.env $S/env/web.env        # if it exists
sudo cp $OLD/.env          $S/env/root.env       # if it exists
sudo rsync -a $OLD/apps/api/public/uploads/ $S/uploads/
sudo chown -R deploy:deploy $S && sudo chmod 600 $S/env/*.env
```

### 4. Fix the migration history (prod was changed with `db push`)

```bash
cd /home/ubuntu/diagnostic-center-system/apps/api
npx prisma migrate status
# Shows which migrations Prisma thinks are missing. Check the real schema against the repo's:
npx prisma migrate diff --from-url "$(grep ^DATABASE_URL= .env | cut -d= -f2- | tr -d '"')" \
  --to-schema-datamodel prisma/schema.prisma --script
```

- If the diff is empty, the database already matches. Mark each listed migration as applied:
  `npx prisma migrate resolve --applied <migration_folder_name>`
- If the diff is not empty, stop: the database and repo disagree. Work out which side is right
  and add a migration for the difference before going further.

`npx prisma migrate status` must end with "Database schema is up to date!".

### 5. Key for GitHub Actions

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

### 6. Cut over from the old `ubuntu` PM2 processes

```bash
SHA=<commit on main to go live with>
sudo -u deploy /home/deploy/bin/deploy.sh prepare $SHA     # builds; site still running the old way
pm2 delete diagnostic-api diagnostic-web && pm2 save       # as ubuntu: old processes stop (downtime starts)
sudo -u deploy /home/deploy/bin/deploy.sh deploy $SHA      # backup, migrate, start under deploy (seconds)
sudo env PATH=$PATH pm2 startup systemd -u deploy --hp /home/deploy   # start on reboot
```

nginx needs no change: the apps still listen on 3000 (web) and 4000 (API).
Check the site, uploads and logins, then test a rollback from GitHub Actions once.

### 7. Lock the server down

Once your own SSH key login works:

```bash
sudo sed -i 's/^#\?PasswordAuthentication.*/PasswordAuthentication no/' /etc/ssh/sshd_config
sudo grep -rl PasswordAuthentication /etc/ssh/sshd_config.d/ | xargs -r sudo sed -i 's/^PasswordAuthentication.*/PasswordAuthentication no/'
sudo sshd -t && sudo systemctl reload ssh
sudo apt install -y fail2ban
```

Keep the old `/home/ubuntu/diagnostic-center-system` folder for a week as a fallback, then remove it.
