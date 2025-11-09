# Voice Invoice Generator

A microservices-based web application that converts speech to professional PDF invoices using AI.

## Features

- 🎤 Voice-to-text invoice generation
- 📄 Professional PDF invoices
- � Google OAuth authentication
- 💼 Business context memory (frequent clients, common services)
- 📊 Invoice history and management
- ⚡ Real-time invoice generation with OpenAI GPT-4

## Architecture

Microservices:
- **API Gateway** (Port 3000) - Frontend + routing
- **Auth Service** (Port 3001) - Google OAuth
- **User Service** (Port 3002) - Business context & preferences
- **Invoice Service** (Port 3003) - AI generation & PDF creation

## Quick Start

### Prerequisites
- Node.js 18+
- MongoDB Atlas account (or local MongoDB)
- Google OAuth credentials
- OpenAI API key

### Setup

1. **Clone and install:**
```bash
git clone https://github.com/jayvakil-bc/voice-invoice-app.git
cd voice-invoice-app
npm install
```

2. **Configure environment:**
Create `.env` file:
```env
MONGODB_URI=your_mongodb_uri
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
OPENAI_API_KEY=your_openai_key
SESSION_SECRET=your_random_secret
CLIENT_URL=http://localhost:3000
NODE_ENV=development
```

3. **Start services:**
```bash
npm start
```

4. **Open app:**
Visit `http://localhost:3000`

### Stop Services
```bash
npm run stop
```

## Docker Deployment

```bash
docker-compose up -d
```

## Project Structure

```
├── api-gateway/          # Main gateway service
├── services/
│   ├── auth-service/     # OAuth authentication
│   ├── user-service/     # User data & business context
│   └── invoice-service/  # Invoice generation & PDFs
├── public/               # Frontend files
├── nginx/                # Nginx configs (optional)
└── docker-compose.yml    # Container orchestration
```

## Getting API Keys

**OpenAI:** https://platform.openai.com/api-keys  
**Google OAuth:** https://console.cloud.google.com/apis/credentials  
**MongoDB Atlas:** https://www.mongodb.com/cloud/atlas

## License

ISC
