# 🏗️ Microservices Architecture - Voice Invoice Generator

## 📋 Overview

Your application has been converted to a **microservices architecture** with 3 independent services and an API Gateway.

```
┌─────────────────────────────────────────────────────────────┐
│                        API GATEWAY                           │
│                     (Port 3000)                              │
│  - Routes all requests                                       │
│  - Serves static files                                       │
│  - Aggregates service responses                              │
└────────┬──────────────┬──────────────┬──────────────────────┘
         │              │              │
    ┌────▼─────┐  ┌────▼─────┐  ┌────▼────────┐
    │  AUTH    │  │  USER    │  │  INVOICE    │
    │ SERVICE  │  │ SERVICE  │  │  SERVICE    │
    │(Port 3001│  │(Port 3002│  │ (Port 3003) │
    └──────────┘  └──────────┘  └─────────────┘
         │              │              │
         └──────────────┴──────────────┘
                       │
                 ┌─────▼──────┐
                 │  MongoDB   │
                 │ (Shared DB)│
                 └────────────┘
```

## 🎯 Services Breakdown

### 1. **Auth Service** (Port 3001)
**Responsibilities:**
- Google OAuth authentication
- Session management
- User login/logout
- Token validation

**Endpoints:**
- `GET /auth/google` - Start OAuth
- `GET /auth/google/callback` - OAuth callback
- `GET /auth/logout` - Logout user
- `GET /auth/user` - Get current user
- `POST /auth/verify` - Verify session (for other services)

**Technologies:**
- Express.js
- Passport.js + Google OAuth
- express-session
- MongoDB (user authentication)

---

### 2. **User Service** (Port 3002)
**Responsibilities:**
- User profile management
- Business context (company info, clients, services)
- CRUD operations on user data

**Endpoints:**
- `GET /users/:id` - Get user profile
- `GET /users/:id/business-context` - Get business info
- `PUT /users/:id/business-context` - Update business info
- `POST /users/:id/frequent-clients` - Add frequent client
- `POST /users/:id/common-services` - Add common service
- `DELETE /users/:id/frequent-clients/:name` - Remove client
- `DELETE /users/:id/common-services/:desc` - Remove service

**Technologies:**
- Express.js
- Mongoose
- MongoDB (user data & business context)

---

### 3. **Invoice Service** (Port 3003)
**Responsibilities:**
- Invoice generation with AI
- PDF creation
- Invoice CRUD operations
- OpenAI integration

**Endpoints:**
- `POST /invoices/generate` - Generate new invoice
- `GET /invoices/user/:userId` - Get all user invoices
- `GET /invoices/:id` - Get single invoice
- `PUT /invoices/:id/regenerate` - Regenerate invoice
- `DELETE /invoices/:id` - Delete invoice
- `GET /invoices/:id/pdf` - Download PDF

**Technologies:**
- Express.js
- OpenAI GPT-4o
- PDFKit
- Mongoose
- MongoDB (invoices)

---

### 4. **API Gateway** (Port 3000)
**Responsibilities:**
- Single entry point for all requests
- Routes requests to appropriate services
- Handles authentication forwarding
- Serves frontend static files
- Aggregates responses from multiple services

**Main Routes:**
- `/` → Login page
- `/dashboard` → Dashboard page
- `/create` → Invoice creator
- `/settings` → Settings page
- `/api/*` → Proxied to backend services
- `/auth/*` → Proxied to auth service

**Technologies:**
- Express.js
- Axios (HTTP client for service-to-service)
- Static file serving

---

## 🚀 Running the Application

### Option 1: Local Development (Individual Services)

1. **Install all dependencies:**
```bash
cd services/auth-service && npm install && cd ../..
cd services/user-service && npm install && cd ../..
cd services/invoice-service && npm install && cd ../..
cd api-gateway && npm install && cd ..
```

2. **Start all services:**
```bash
./start-services.sh
```

This will start:
- Auth Service on http://localhost:3001
- User Service on http://localhost:3002
- Invoice Service on http://localhost:3003
- API Gateway on http://localhost:3000

3. **Access the app:**
```
http://localhost:3000
```

4. **Stop all services:**
```bash
./stop-services.sh
```

---

### Option 2: Docker Compose (Recommended for Production)

1. **Start everything with one command:**
```bash
docker-compose up --build
```

2. **Access the app:**
```
http://localhost:3000
```

3. **Stop everything:**
```bash
docker-compose down
```

4. **View logs:**
```bash
docker-compose logs -f [service-name]
# Example: docker-compose logs -f auth-service
```

---

## 📊 Health Monitoring

Check all services health:
```bash
curl http://localhost:3000/api/health
```

Response:
```json
{
  "gateway": "healthy",
  "services": {
    "auth": "healthy",
    "user": "healthy",
    "invoice": "healthy"
  }
}
```

Individual service health:
```bash
curl http://localhost:3001/health  # Auth
curl http://localhost:3002/health  # User
curl http://localhost:3003/health  # Invoice
```

---

## 🔄 Service Communication Flow

### Example: Creating an Invoice

1. **User submits transcript** → `POST /api/generate-invoice` (API Gateway)
2. **Gateway authenticates** → `GET /auth/user` (Auth Service)
3. **Gateway gets business context** → `GET /users/:id/business-context` (User Service)
4. **Gateway generates invoice** → `POST /invoices/generate` (Invoice Service)
5. **Gateway updates business context** → `POST /users/:id/frequent-clients` (User Service)
6. **Response sent back** → Client receives invoice data

---

## 🔧 Configuration

### Environment Variables

Each service needs these variables (set in `.env.microservices`):

**Auth Service:**
- `MONGODB_URI`
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `SESSION_SECRET`
- `CLIENT_URL`
- `AUTH_SERVICE_PORT` (default: 3001)

**User Service:**
- `MONGODB_URI`
- `USER_SERVICE_PORT` (default: 3002)

**Invoice Service:**
- `MONGODB_URI`
- `OPENAI_API_KEY`
- `INVOICE_SERVICE_PORT` (default: 3003)

**API Gateway:**
- `PORT` (default: 3000)
- `CLIENT_URL`
- `AUTH_SERVICE_URL` (default: http://localhost:3001)
- `USER_SERVICE_URL` (default: http://localhost:3002)
- `INVOICE_SERVICE_URL` (default: http://localhost:3003)

---

## 📁 Project Structure

```
my-project/
├── services/
│   ├── auth-service/
│   │   ├── server.js
│   │   ├── package.json
│   │   └── Dockerfile
│   ├── user-service/
│   │   ├── server.js
│   │   ├── package.json
│   │   └── Dockerfile
│   └── invoice-service/
│       ├── server.js
│       ├── package.json
│       └── Dockerfile
├── api-gateway/
│   ├── server.js
│   ├── package.json
│   └── Dockerfile
├── public/
│   ├── login.html
│   ├── dashboard.html
│   ├── index.html
│   ├── settings.html
│   └── *.js, *.css
├── docker-compose.yml
├── start-services.sh
├── stop-services.sh
├── .env.microservices
└── MICROSERVICES_README.md (this file)
```

---

## 🎨 Benefits of This Architecture

1. **Scalability**: Each service can scale independently
2. **Maintainability**: Clear separation of concerns
3. **Fault Isolation**: If one service fails, others continue
4. **Technology Flexibility**: Each service can use different tech
5. **Team Organization**: Different teams can own different services
6. **Deployment**: Deploy services independently
7. **Development**: Work on services in isolation

---

## 🐛 Debugging

View logs for individual services:

**Local:**
```bash
tail -f logs/auth-service.log
tail -f logs/user-service.log
tail -f logs/invoice-service.log
tail -f logs/api-gateway.log
```

**Docker:**
```bash
docker-compose logs -f auth-service
docker-compose logs -f user-service
docker-compose logs -f invoice-service
docker-compose logs -f api-gateway
```

---

## 🚢 Deployment

### Deploy Individual Services

Each service can be deployed separately to:
- AWS ECS/Fargate
- Google Cloud Run
- Kubernetes
- Heroku
- Railway
- Fly.io

### Deploy with Docker Swarm

```bash
docker swarm init
docker stack deploy -c docker-compose.yml voice-invoice
```

### Deploy with Kubernetes

```bash
# Convert docker-compose to k8s
kompose convert

# Deploy
kubectl apply -f .
```

---

## ✅ Testing

Test each service independently:

```bash
# Auth Service
curl http://localhost:3001/health

# User Service
curl http://localhost:3002/health

# Invoice Service
curl http://localhost:3003/health

# Full flow through gateway
curl http://localhost:3000/api/health
```

---

## 📝 Next Steps

1. Add Redis for caching
2. Implement message queue (RabbitMQ/Kafka)
3. Add API rate limiting
4. Implement circuit breakers
5. Add distributed tracing (Jaeger/Zipkin)
6. Set up centralized logging (ELK Stack)
7. Add Prometheus/Grafana for monitoring
8. Implement service mesh (Istio)

---

## 🆘 Troubleshooting

**Services won't start:**
- Check if ports 3000-3003 are available
- Verify MongoDB connection
- Check environment variables

**Gateway can't reach services:**
- Ensure all services are running
- Check SERVICE_URL environment variables
- Verify network connectivity

**Authentication fails:**
- Verify Google OAuth credentials
- Check CLIENT_URL matches your domain
- Ensure session cookies are working

---

**Your microservices architecture is ready! 🎉**

Run `./start-services.sh` to get started!
