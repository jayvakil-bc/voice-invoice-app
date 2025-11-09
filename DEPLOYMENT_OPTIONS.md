# Deployment Options for Voice Invoice Microservices

Your architecture: 4 Node.js services (auth, user, invoice, api-gateway) + MongoDB Atlas (preferred) + OpenAI API. All services are already containerized with simple Dockerfiles and a `docker-compose.yml` for local development.

Below are pragmatic deployment strategies from fastest-to-prod to most scalable. Pick one, then follow the step checklist.

---
## Option A: Single VPS with Docker Compose (Fast & Cheap)
**Fit:** Low/medium traffic, easiest to ship. Full control over networking / session cookies.
**How:**
1. Provision a VM (Ubuntu 22.04) on DigitalOcean / Hetzner / AWS Lightsail.
2. Install Docker + Docker Compose plugin.
3. Copy repo (git clone or deploy key).
4. Use Atlas for MongoDB (don’t run local mongo container in prod unless needed). Remove `mongodb` service from compose or set `MONGODB_URI` to Atlas connection.
5. Create a `.env` production file (do not commit) with real secrets.
6. Run: `docker compose up -d --build`.
7. Put Nginx / Caddy in front for TLS + domain -> proxy to `api-gateway:3000`.
8. Add `app.set('trust proxy', 1)` to gateway & auth service so secure cookies work behind proxy.

**Pros:** Simple, cheap, fast.
**Cons:** Single host = manual scaling; one point of failure.

---
## Option B: Render (Each Service as Separate Web Service)
**Fit:** Want managed deployments without k8s complexity.
**How:**
1. Create 4 Render “Web Services”: point each to its service folder (`api-gateway`, `auth-service`, `user-service`, `invoice-service`).
2. Set build command: `npm install`; start command: `node server.js` inside each service.
3. Set env vars consistently (all share:`SESSION_SECRET`, `MONGODB_URI`, `CLIENT_URL`, plus service-specific ports `PORT`=internal Render port, you may ignore hard-coded port exposures—they provide `PORT`). Remove port binding logic or adapt to `process.env.PORT`.
4. Gateway env vars: `AUTH_SERVICE_URL`, `USER_SERVICE_URL`, `INVOICE_SERVICE_URL` -> use Render internal hostnames (ex: `https://auth-service.onrender.com`).
5. Cookies: cross-site requires `sameSite=none`, `secure=true`, domain cannot unify across different Render subdomains easily — better to set up a custom apex domain and map all services via subdomains, then share cookie domain (e.g. `.yourdomain.com`). Otherwise use gateway-managed JWT instead of cookie session.

**Pros:** Zero server maintenance.
**Cons:** Cross-subdomain session complexity; potential cold starts.

---
## Option C: Fly.io Machines / Apps (Multi-Region Ready)
**Fit:** Expect scaling or geographical latency improvements.
**How:**
1. Create separate Fly apps for each microservice OR one app with multiple machines & internal networking.
2. Use `fly launch` per service folder.
3. Provide secrets via `fly secrets set ...`.
4. Use Fly internal DNS: `auth-service.internal`, etc.
5. Add `app.set('trust proxy', 1)` for secure cookies.
6. Postgres optional—stick with MongoDB Atlas.

**Pros:** Multi-region, internal networking, simple scaling.
**Cons:** Slightly more setup; learning curve.

---
## Option D: Docker Swarm (Incremental from Compose)
**Fit:** Want basic clustering without k8s.
**How:** Turn compose file into stack (`docker stack deploy -c docker-compose.yml voiceinvoice`). Add replicas for stateless services. MongoDB stays external (Atlas).

**Pros:** Minimal change from compose; some resilience.
**Cons:** Less feature-rich vs k8s.

---
## Option E: Kubernetes (Future / Advanced)
**Fit:** Need auto-scaling, rolling updates, secrets, service mesh later.
**How (outline):**
1. Create deployment & service YAML per microservice (container image from each Dockerfile). 
2. Use an Ingress (nginx) for TLS + routing.
3. Store secrets in Kubernetes Secrets; mount env via `envFrom`.
4. Atlas for MongoDB, OpenAI key as secret.
5. Consider consolidating service logic—could move session to Redis for sticky scaling.

**Pros:** Full flexibility.
**Cons:** Overkill early; more ops overhead.

---
## Recommended Immediate Path
Go with **Option A (Single VPS + Compose)** to ship now. It uses what you already have, avoids multi-domain cookie hassles, and keeps your session approach intact.

After MVP live and stable, upgrade progressively:
- Add fail2ban/ufw + auto backups.
- Add Watchtower for container auto-update (optional).
- Introduce basic metrics (Prometheus node exporter, or Vector + logs).

---
## Production Adjustments Needed
1. Remove `mongodb` service from compose (use Atlas). Adjust compose:
```
# In docker-compose.yml remove mongodb section and its depends_on.
# Add environment MONGODB_URI to each service (already present via .env).
```
2. Add `app.set('trust proxy', 1)` in `api-gateway/server.js` and `auth-service/server.js` before session middleware.
3. Ensure all services read `PORT` from env (they do) but in container orchestrators you might override. Current Dockerfiles expose fixed ports—fine for VPS.
4. Rotate all committed secrets (Google client secret, OpenAI key, Mongo password) since they were in repo.
5. Enable HTTPS at proxy; set cookie `secure=true` (already conditionally done when `NODE_ENV=production`). Use domain apex or `app.yourdomain.com`.
6. Set `SESSION_SECRET` identical across gateway + auth; user + invoice only need it if they manage sessions; if they don’t require session state, you can omit session middleware there to reduce overhead.
7. Logging: mount a host volume `./logs:/app/logs` or switch to stdout only and aggregate with a lightweight log collector.

---
## Example Production docker-compose (Atlas + Nginx)
```yaml
version: '3.8'
services:
  api-gateway:
    build: ./api-gateway
    environment:
      NODE_ENV: production
      PORT: 3000
      CLIENT_URL: https://app.yourdomain.com
      AUTH_SERVICE_URL: http://auth-service:3001
      USER_SERVICE_URL: http://user-service:3002
      INVOICE_SERVICE_URL: http://invoice-service:3003
      SESSION_SECRET: ${SESSION_SECRET}
      MONGODB_URI: ${MONGODB_URI}
    depends_on:
      - auth-service
      - user-service
      - invoice-service
    restart: unless-stopped

  auth-service:
    build: ./services/auth-service
    environment:
      NODE_ENV: production
      PORT: 3001
      SESSION_SECRET: ${SESSION_SECRET}
      MONGODB_URI: ${MONGODB_URI}
      GOOGLE_CLIENT_ID: ${GOOGLE_CLIENT_ID}
      GOOGLE_CLIENT_SECRET: ${GOOGLE_CLIENT_SECRET}
      CLIENT_URL: https://app.yourdomain.com
    restart: unless-stopped

  user-service:
    build: ./services/user-service
    environment:
      NODE_ENV: production
      PORT: 3002
      MONGODB_URI: ${MONGODB_URI}
    restart: unless-stopped

  invoice-service:
    build: ./services/invoice-service
    environment:
      NODE_ENV: production
      PORT: 3003
      MONGODB_URI: ${MONGODB_URI}
      OPENAI_API_KEY: ${OPENAI_API_KEY}
    restart: unless-stopped

  nginx:
    image: nginx:1.25-alpine
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/conf.d:/etc/nginx/conf.d:ro
      - ./certs:/etc/ssl/certs:ro
    depends_on:
      - api-gateway
    restart: unless-stopped
```

Example `nginx/conf.d/app.conf`:
```
server {
  listen 80;
  server_name app.yourdomain.com;
  return 301 https://$host$request_uri;
}

server {
  listen 443 ssl;
  server_name app.yourdomain.com;

  ssl_certificate /etc/ssl/certs/fullchain.pem;
  ssl_certificate_key /etc/ssl/certs/privkey.pem;

  location / {
    proxy_pass http://api-gateway:3000;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
  }
}
```

---
## Security Checklist
- Rotate all secrets immediately (Google, OpenAI, Mongo credentials) because they were committed.
- Use a password manager / secrets manager (1Password, Doppler, Vault) instead of plain `.env` on server.
- Run `npm ci` instead of `npm install` for reproducible builds (adjust Dockerfiles).
- Add minimal user/service rate limiting (e.g., `express-rate-limit`) at gateway.
- Make invoices PDF generation idempotent & add size limit to transcript payload.

---
## Suggested Next Steps (Action Order)
1. Rotate secrets + create production `.env` (not tracked).
2. Add `trust proxy` lines.
3. Trim compose file (remove local mongodb if using Atlas).
4. Add Nginx reverse proxy + certs (or use Caddy for auto HTTPS).
5. Deploy to VPS (Option A). Confirm cookies + OAuth redirect.
6. Add monitoring/log strategy.
7. Reassess scalability → consider Option C later if needed.

---
## Minimal Dockerfile Hardening (apply later)
Use multi-stage to prune build deps:
```dockerfile
FROM node:18-alpine AS build
WORKDIR /app
COPY package*.json .
RUN npm ci --omit=dev
COPY . .

FROM node:18-alpine
WORKDIR /app
COPY --from=build /app .
ENV NODE_ENV=production
EXPOSE 3000
CMD ["node", "server.js"]
```

Adapt port per service.

---
## Fallback (If You Need Something Live in Minutes)
Use `ngrok http 3000` or `cloudflared tunnel --url http://localhost:3000` from local machine temporarily. Not production, but allows remote access for demos while you prep Option A.

---
## Questions To Decide Now
1. Do you want single-domain cookie sessions? (Yes → Option A)  
2. Expected monthly traffic? (<50k requests fine on single VPS)  
3. Need geo latency? (No for now)  

Answer those and proceed.

---
**Recommendation:** Implement Option A now; revisit Option C (Fly.io) if growth or multi-region matters.
