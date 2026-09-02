# Diagnostic Center Appointment & Slot Management System

Production-ready scaffold for replacing a Google Sheets appointment workflow with secure realtime booking, slot capacity enforcement, audit trails, analytics, and exports.

## Stack

- **Web**: Next.js 15, TypeScript, Tailwind CSS, React Query, Socket.io Client
- **API**: Node.js, Express, TypeScript, Socket.io, JWT
- **Database**: PostgreSQL, Prisma
- **Deployment**: Docker Compose / VPS compatible

---

## Quick Start (Local Development)

1. Copy `.env.example` to `.env`.
2. Run `npm install`.
3. Start PostgreSQL with `docker compose up postgres -d`.
4. Run `npm run prisma:migrate --workspace apps/api`.
5. Run `npm run prisma:seed --workspace apps/api`.
6. Start the API: `npm run dev:api`.
7. In another terminal, start the web app: `npm run dev:web`.

### Seeded Admin Login:
- **Email**: `admin@diagnostic.local`
- **Password**: `Admin@12345`

---

## Deploying for 24/7 Production (Docker Compose)

To run the application continuously 24/7 on a production VPS (without keeping your local VS Code or terminal open):

### 1. Preparation
1. Clone the project folder onto your production server.
2. Create/update the `.env` file at the root:
   ```env
   DATABASE_URL="postgresql://postgres:postgres@postgres:5432/diagnostic_center?schema=public"
   JWT_SECRET="YOUR_GENERATE_RANDOM_LONG_SECRET"
   JWT_EXPIRES_IN="8h"
   API_PORT=4000
   NEXT_PUBLIC_API_URL="http://localhost:4000"
   NEXT_PUBLIC_SOCKET_URL="http://localhost:4000"
   ```

### 2. Build & Launch Containers
Run the build and start in detached (background) mode:
```bash
docker compose up --build -d
```
*Note: The Nginx container will bind to port `3500` by default. You can access the system at `http://YOUR_SERVER_IP:3500`.*

### 3. Verify Container Status
Check that all services (`postgres`, `api`, `web`, and `nginx`) are active:
```bash
docker compose ps
```

### 4. Viewing Logs
To see running logs for all services or a single container:
```bash
# All logs
docker compose logs -f

# Just API logs
docker compose logs -f api
```

### 5. Stop Containers
```bash
docker compose down
```

---

## Custom Domains & SSL Setup (Later)

Once you register a domain:
1. Open `docker-compose.yml` and change the Nginx port mapping from `"3500:80"` to `"80:80"` (and `"443:443"` for SSL).
2. Install Certbot on the host or use a reverse-proxy sidecar (like Caddy/Traefik) to generate and auto-renew Let's Encrypt SSL certificates.
