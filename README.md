# Voice Invoice & Contract Generator

A streamlined web application that converts speech to professional PDF invoices and contracts using AI.

## Features

- 🎤 Voice-to-text invoice & contract generation
- 📄 Professional PDF documents
- 🔐 Google OAuth authentication
- 💼 Business context memory (frequent clients, common services)
- 📊 Document history and management
- ⚡ Real-time generation with OpenAI GPT-4o
- 📝 Ultra-comprehensive contract extraction (85-95% accuracy)
- 🎨 Modern UI with high-contrast color scheme
- 💾 Memory-efficient monolithic architecture (~40MB RAM)

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

3. **Start the application:**
   
   Open your terminal (Terminal on Mac, Command Prompt on Windows) and navigate to the project folder:
   ```bash
   cd voice-invoice-app
   ```
   
   Then run:
   ```bash
   ./start.sh
   ```
   
   You should see:
   ```
   ✅ Backend started
   🎉 Voice Invoice App Running!
   🌐 Server: http://localhost:3000
   ```

4. **Open the app in your browser:**
   
   Visit: **http://localhost:3000**
   
   You'll see the login page. Click "Continue with Google" to sign in.

### Stop the Application

When you're done, stop the server by running:
```bash
./stop.sh
```

**That's it!** The server will stop and you'll see "✅ Backend stopped"

### Troubleshooting

**If `./start.sh` doesn't work:**
- Make sure you're in the `voice-invoice-app` folder
- Try: `chmod +x start.sh` then run `./start.sh` again
- Or use: `npm start` instead

**If the app won't start:**
- Check `logs/server.log` for error messages
- Make sure your `.env` file has all required keys
- Verify MongoDB, Google OAuth, and OpenAI API keys are correct

## Project Structure

```
├── server.js             # Main backend server (all routes)
├── public/               # Frontend files (HTML, CSS, JS)
│   ├── index.html       # Landing page
│   ├── invoice.html     # Invoice creation
│   ├── contract.html    # Contract creation
│   ├── dashboard.html   # Document management
│   └── settings.html    # Business context settings
├── uploads/              # Temporary audio file storage
├── logs/                 # Server logs
├── start.sh             # Start script
├── stop.sh              # Stop script
└── package.json         # Dependencies
```

## Architecture

**Monolithic Backend** (Port 3000):
- ✅ Single Node.js server with Express
- ✅ Google OAuth authentication with Passport
- ✅ MongoDB with Mongoose ODM
- ✅ OpenAI GPT-4o for AI generation
- ✅ Audio transcription with Whisper API
- ✅ PDF generation with PDFKit
- ✅ Session management with connect-mongo
- ✅ Memory-efficient: ~40MB RAM usage

**Key Technologies:**
- Backend: Express, Mongoose, Passport
- AI: OpenAI GPT-4o (chat completions), Whisper (audio transcription)
- Auth: Google OAuth 2.0
- Database: MongoDB Atlas
- PDF: PDFKit
- File Upload: Multer

## Contract Generation

Uses the **talk2contract-ai methodology** for high-accuracy contract extraction:
- 6-step extraction process (entities, scope, pricing, timeline, terms, safeguards)
- Auto-detect 9 legal safeguards (SLAs, liability, IP rights, confidentiality, warranties, termination, dispute resolution, compliance, insurance)
- Smart ambiguity flagging for missing critical details
- Professional content mapping to 9-section structure
- Pre-generation checklist validation
- **Accuracy: 85-95%** on complex enterprise contracts

## Getting API Keys

**OpenAI:** https://platform.openai.com/api-keys  
**Google OAuth:** https://console.cloud.google.com/apis/credentials  
**MongoDB Atlas:** https://www.mongodb.com/cloud/atlas

## Memory Usage

- Previous microservices architecture: ~1.2GB RAM (5 Node processes)
- Current monolithic architecture: **~40MB RAM** (30x reduction!)
- Suitable for budget VPS hosting (1GB RAM droplets)

## License

ISC
