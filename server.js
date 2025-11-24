require('dotenv').config({ path: '.env' });

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const cors = require('cors');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Consolidated Voice Invoice Backend...');
console.log('📦 Memory footprint: ~150MB (vs 1.2GB microservices)');

// MongoDB Connection (single shared connection)
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => console.error('❌ MongoDB Error:', err));

// OpenAI setup (shared instance)
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Multer setup for file uploads
const upload = multer({ 
    dest: 'uploads/',
    limits: { fileSize: 25 * 1024 * 1024 }
});


// ========== USER MODEL ==========
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    businessInfo: {
        businessName: String,
        businessAddress: String,
        businessEmail: String,
        businessPhone: String,
        website: String,
        taxId: String,
        setupCompleted: { type: Boolean, default: false }
    },
    businessContext: {
        // AI-learned context about the user's business
        industry: String, // e.g., "Digital Marketing Agency", "SaaS Company", "Consulting"
        serviceTypes: [String], // e.g., ["SEO Services", "PPC Management", "Content Marketing"]
        commonClients: [String], // e.g., ["E-commerce businesses", "Local restaurants"]
        averageDealSize: Number,
        typicalProjectDuration: String, // e.g., "3-6 months", "Ongoing retainer"
        
        // Extracted from voice transcripts and contracts
        voicePatterns: {
            commonPhrases: [String], // Phrases user commonly uses
            serviceDescriptions: [String], // How they describe their services
            pricingStructure: String, // "Per-project", "Monthly retainer", "Performance-based"
        },
        
        // Learning metadata
        totalContracts: { type: Number, default: 0 },
        totalInvoices: { type: Number, default: 0 },
        lastUpdated: Date,
        confidenceScore: { type: Number, default: 0, min: 0, max: 100 } // How confident we are in the context
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// ========== INVOICE MODEL ==========
const invoiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    originalTranscript: String,
    invoiceNumber: String,
    date: String,
    dueDate: String,
    from: {
        name: String,
        address: String,
        phone: String,
        email: String
    },
    to: {
        name: String,
        address: String,
        phone: String,
        email: String
    },
    items: [{
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: Number,
    tax: Number,
    total: Number,
    notes: String,
    createdAt: { type: Date, default: Date.now }
});

const Invoice = mongoose.model('Invoice', invoiceSchema);

// ========== CONTRACT MODEL ==========
const contractSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
    originalTranscript: String,
    contractTitle: String,
    effectiveDate: String,
    parties: {
        serviceProvider: {
            name: String,
            address: String,
            email: String,
            phone: String
        },
        client: {
            name: String,
            signingAuthority: String,
            address: String,
            email: String,
            phone: String
        }
    },
    sections: [{
        title: String,
        content: String,
        order: Number
    }],
    signatures: {
        serviceProvider: {
            signatureData: String,  // Base64 encoded signature image
            signedBy: String,       // Name of person who signed
            signedAt: Date,
            ipAddress: String
        },
        client: {
            signatureData: String,
            signedBy: String,
            signedAt: Date,
            ipAddress: String
        }
    },
    status: {
        type: String,
        enum: ['draft', 'awaiting_signatures', 'partially_signed', 'fully_signed'],
        default: 'draft'
    },
    shareableLink: {
        token: { type: String, unique: true, sparse: true },
        createdAt: Date,
        expiresAt: Date,
        accessCount: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

// ========== PASSPORT CONFIG ==========
// Passport Google Strategy
// Build callback URL dynamically for Render / production
let callbackBase = process.env.AUTH_PUBLIC_URL || `http://localhost:${PORT}`;
// If AUTH_PUBLIC_URL doesn't have protocol, add https://
if (callbackBase && !callbackBase.startsWith('http')) {
    callbackBase = `https://${callbackBase}`;
}
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${callbackBase.replace(/\/$/, '')}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos[0].value
            });
            console.log('[Auth Service] New user created:', user.email);
        } else {
            // Update user info
            user.name = profile.displayName;
            user.picture = profile.photos[0].value;
            await user.save();
        }
        
        return done(null, user);
    } catch (error) {
        console.error('[Auth Service] OAuth error:', error);
        return done(error, null);
    }
}));

passport.serializeUser((user, done) => {
    done(null, user._id);
});

passport.deserializeUser(async (id, done) => {
    try {
        const user = await User.findById(id);
        done(null, user);
    } catch (error) {
        done(error, null);
    }
});

// ========== MIDDLEWARE ==========
app.set('trust proxy', 1);
let clientURL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
if (clientURL && !clientURL.startsWith('http')) {
    clientURL = `https://${clientURL}`;
}

app.use(cors({ origin: clientURL, credentials: true }));
app.use(express.json());
app.use(express.static('public'));

// Session
app.use(session({
    name: 'connect.sid',
    secret: process.env.SESSION_SECRET || 'voice-invoice-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Auth middleware
const requireAuth = (req, res, next) => {
    if (req.isAuthenticated()) {
        return next();
    }
    res.status(401).json({ error: 'Unauthorized' });
};


// ========== PAGE ROUTES ==========
app.get('/create', requireAuth, (req, res) => {
    res.sendFile('invoice.html', { root: 'public' });
});

app.get('/create-contract', requireAuth, (req, res) => {
    res.sendFile('contract.html', { root: 'public' });
});

app.get('/dashboard', requireAuth, (req, res) => {
    res.sendFile('dashboard.html', { root: 'public' });
});

app.get('/settings', requireAuth, (req, res) => {
    res.sendFile('settings.html', { root: 'public' });
});


// ========== AUTH ROUTES ==========
// Routes
app.get('/api/health', (req, res) => {
    res.json({ service: 'auth-service', status: 'healthy' });
});

app.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: clientURL || 'http://localhost:3000/' }),
    (req, res) => {
        // Check if user needs onboarding
        if (!req.user.businessInfo || !req.user.businessInfo.setupCompleted) {
            console.log('[Auth] New user detected, redirecting to onboarding');
            res.redirect((clientURL || 'http://localhost:3000') + '/onboarding.html');
        } else {
            console.log('[Auth] Existing user, redirecting to dashboard');
            res.redirect((clientURL || 'http://localhost:3000') + '/dashboard');
        }
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy((err) => {
            if (err) {
                console.error('[Auth Service] Session destroy error:', err);
            }
            res.redirect('/');
        });
    });
});

app.get('/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                picture: req.user.picture,
                businessInfo: req.user.businessInfo
            }
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// Business info setup endpoint
app.post('/api/user/business-info', requireAuth, async (req, res) => {
    try {
        console.log('[Onboarding] Saving business info for user:', req.user._id);
        console.log('[Onboarding] Business info:', req.body);
        
        const { businessName, businessAddress, businessEmail, businessPhone, website, taxId } = req.body;
        
        // Validate required fields
        if (!businessName || !businessAddress || !businessEmail || !businessPhone) {
            return res.status(400).json({ error: 'Missing required business information' });
        }
        
        // Update user with business info
        req.user.businessInfo = {
            businessName,
            businessAddress,
            businessEmail,
            businessPhone,
            website: website || null,
            taxId: taxId || null,
            setupCompleted: true
        };
        
        await req.user.save();
        
        console.log('[Onboarding] Business info saved successfully');
        
        res.json({
            success: true,
            message: 'Business information saved successfully',
            businessInfo: req.user.businessInfo
        });
    } catch (error) {
        console.error('[Onboarding] Error saving business info:', error);
        res.status(500).json({ error: 'Failed to save business information' });
    }
});

// Get business info endpoint
app.get('/api/user/business-info', requireAuth, async (req, res) => {
    try {
        res.json({
            businessInfo: req.user.businessInfo || null
        });
    } catch (error) {
        console.error('[Business Info] Error fetching:', error);
        res.status(500).json({ error: 'Failed to fetch business information' });
    }
});

// Get AI-learned business context
app.get('/api/user/business-context', requireAuth, async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        res.json({
            businessContext: user.businessContext || null,
            insights: {
                hasContext: !!(user.businessContext && user.businessContext.confidenceScore > 0),
                confidenceScore: user.businessContext?.confidenceScore || 0,
                totalContracts: user.businessContext?.totalContracts || 0,
                canAutofill: user.businessContext?.confidenceScore >= 50, // High confidence = auto-suggest
                summary: user.businessContext ? 
                    `${user.businessContext.industry || 'Unknown industry'} | ${user.businessContext.totalContracts || 0} contracts` :
                    'No context learned yet'
            }
        });
    } catch (error) {
        console.error('[Business Context] Error fetching:', error);
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
});

// Verify token endpoint (for other services)
app.post('/auth/verify', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            valid: true, 
            userId: req.user._id.toString(),
            email: req.user.email 
        });
    } else {
        res.status(401).json({ valid: false });
    }
});


// ========== AUDIO TRANSCRIPTION ==========
app.post('/api/transcribe-audio', requireAuth, upload.single('audio'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ error: 'No audio file provided' });
        }
        
        console.log('[Transcribe] Processing audio file:', req.file.originalname, req.file.size, 'bytes');
        
        // Transcribe using OpenAI Whisper API
        const transcription = await openai.audio.transcriptions.create({
            file: fs.createReadStream(req.file.path),
            model: 'whisper-1'
        });
        
        // Delete temporary file
        fs.unlinkSync(req.file.path);
        
        console.log('[Transcribe] Success');
        res.json({ transcription: transcription.text });
        
    } catch (error) {
        console.error('[Transcribe] Error:', error.message);
        // Clean up file on error
        if (req.file && fs.existsSync(req.file.path)) {
            fs.unlinkSync(req.file.path);
        }
        res.status(500).json({ error: 'Failed to transcribe audio' });
    }
});


// ========== USER ROUTES ==========
// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'user-service', status: 'healthy' });
});

// Get user profile
app.get('/api/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Get business context
app.get('/api/users/:id/business-context', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.businessContext || {});
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
});

// Update business context
app.put('/api/users/:id/business-context', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.businessContext = {
            ...user.businessContext,
            ...req.body
        };
        
        await user.save();
        res.json(user.businessContext);
    } catch (error) {
        console.error('[User Service] Update error:', error);
        res.status(500).json({ error: 'Failed to update business context' });
    }
});

// Add frequent client
app.post('/api/users/:id/frequent-clients', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const { clientName } = req.body;
        
        if (!user.businessContext) {
            user.businessContext = { frequentClients: [], commonServices: [] };
        }
        
        // Check if client already exists
        const existingClient = user.businessContext.frequentClients.find(c => c.name === clientName);
        
        if (existingClient) {
            existingClient.lastUsed = new Date();
        } else {
            user.businessContext.frequentClients.push({
                name: clientName,
                lastUsed: new Date()
            });
        }
        
        // Keep top 10 most recent
        user.businessContext.frequentClients.sort((a, b) => b.lastUsed - a.lastUsed);
        user.businessContext.frequentClients = user.businessContext.frequentClients.slice(0, 10);
        
        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('[User Service] Add client error:', error);
        res.status(500).json({ error: 'Failed to add client' });
    }
});

// Add common service
app.post('/api/users/:id/common-services', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        const { description, rate } = req.body;
        
        if (!user.businessContext) {
            user.businessContext = { frequentClients: [], commonServices: [] };
        }
        
        const existingService = user.businessContext.commonServices.find(s => s.description === description);
        
        if (existingService) {
            existingService.lastUsed = new Date();
            existingService.rate = rate;
        } else {
            user.businessContext.commonServices.push({
                description,
                rate,
                lastUsed: new Date()
            });
        }
        
        // Keep top 15 most recent
        user.businessContext.commonServices.sort((a, b) => b.lastUsed - a.lastUsed);
        user.businessContext.commonServices = user.businessContext.commonServices.slice(0, 15);
        
        await user.save();
        res.json({ success: true });
    } catch (error) {
        console.error('[User Service] Add service error:', error);
        res.status(500).json({ error: 'Failed to add service' });
    }
});

// Remove frequent client
app.delete('/api/users/:id/frequent-clients/:clientName', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.businessContext.frequentClients = user.businessContext.frequentClients.filter(
            c => c.name !== req.params.clientName
        );
        
        await user.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove client' });
    }
});

// Remove common service
app.delete('/api/users/:id/common-services/:description', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        
        user.businessContext.commonServices = user.businessContext.commonServices.filter(
            s => s.description !== decodeURIComponent(req.params.description)
        );
        
        await user.save();
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove service' });
    }
});



// ========== INVOICE ROUTES ==========
// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'invoice-service', status: 'healthy' });
});

// Generate invoice
app.post('/api/invoices/generate', async (req, res) => {
    try {
        const { transcript, userId, businessContext } = req.body;
        
        console.log('[Invoice Service] Generating invoice for user:', userId);
        
        // Get today's date and due date (30 days from now)
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0]; // YYYY-MM-DD
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateFormatted = dueDate.toISOString().split('T')[0];
        
        // Create prompt for OpenAI
        let prompt = `You are a STRICT extractor that creates invoices from transcriptions. Use ONLY facts explicitly present in the inputs.

CRITICAL BILLING CONTEXT:
- Understand WHEN the pricing applies (immediate/today vs. future/ongoing)
- ONLY include pricing that applies to the CURRENT billing period
- If pricing is discussed for future work, ongoing retainers, or later phases, DO NOT include it in this invoice
- Look for temporal indicators: "now", "today", "this month", "upfront", "deposit" vs. "monthly", "ongoing", "per month", "future"

CRITICAL STRUCTURE:
1. If there's a main package/service with a total price that applies NOW, create it as a line_item
2. ONLY create sub-line_items if the transcription EXPLICITLY breaks down the pricing for individual deliverables
3. DO NOT infer or distribute pricing across deliverables unless explicitly stated
4. DO NOT include recurring/monthly fees unless this invoice represents that billing period

TRANSCRIPTION:
${transcript}

Generate a properly structured invoice in JSON format with the following structure:
{
  "invoice_number": "INV-[generate unique number]",
  "date": "${todayFormatted}",
  "due_date": "${dueDateFormatted}",
  "from": {
    "name": "[Your company name from transcript or 'Your Company']",
    "address": "[Your full address from transcript or '']",
    "phone": "[Your phone from transcript or '']",
    "email": "[Your email from transcript or '']"
  },
  "to": {
    "name": "[Client name from transcript]",
    "address": "[Client full address from transcript - IMPORTANT: extract complete address if mentioned]",
    "phone": "[Client phone from transcript or '']",
    "email": "[Client email from transcript or '']"
  },
  "line_items": [
    {
      "description": "Main Package Name or Service Description",
      "quantity": 1,
      "unit": "package",
      "unit_price": [total price],
      "line_total": [total price],
      "is_header": true
    },
    {
      "description": "Specific Deliverable (only if explicitly priced separately)",
      "quantity": [number],
      "unit": "[unit type]",
      "unit_price": [price per unit],
      "line_total": [quantity * unit_price],
      "is_header": false
    }
  ],
  "subtotal": [sum of all line_totals],
  "total": [subtotal + any fees/taxes if mentioned],
  "notes": "[Payment terms or additional notes from transcript]"
}

CRITICAL RULES:
- Each line_item must have: description, quantity, unit, unit_price, line_total, is_header
- Amounts must be numbers only (no currency symbols, no commas)
- ALWAYS extract addresses when mentioned - look for street, city, state, zip patterns
- Only break down costs if the transcription explicitly mentions individual prices
- If only a total package price is mentioned, create a single line_item for the entire package
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const invoiceData = JSON.parse(completion.choices[0].message.content);
        
        // Map line_items to items (convert GPT output to our schema)
        if (invoiceData.line_items && Array.isArray(invoiceData.line_items)) {
            invoiceData.items = invoiceData.line_items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.unit_price) || 0,
                amount: Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.unit_price) || 0))
            }));
            delete invoiceData.line_items; // Remove the line_items field
        } else if (invoiceData.items && Array.isArray(invoiceData.items)) {
            // If GPT already used 'items', normalize it
            invoiceData.items = invoiceData.items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.rate) || Number(item.unit_price) || 0,
                amount: Number(item.amount) || Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.rate) || Number(item.unit_price) || 0))
            }));
        } else {
            invoiceData.items = [];
        }
        
        // Normalize field names
        if (invoiceData.invoice_number && !invoiceData.invoiceNumber) {
            invoiceData.invoiceNumber = invoiceData.invoice_number;
            delete invoiceData.invoice_number;
        }
        
        if (invoiceData.due_date && !invoiceData.dueDate) {
            invoiceData.dueDate = invoiceData.due_date;
            delete invoiceData.due_date;
        }
        
        // Ensure from/to objects exist
        if (!invoiceData.from) {
            invoiceData.from = { name: '', address: '', phone: '', email: '' };
        }
        if (!invoiceData.to) {
            invoiceData.to = { name: '', address: '', phone: '', email: '' };
        }
        
        // Ensure date and dueDate are set
        if (!invoiceData.date || invoiceData.date === '' || invoiceData.date === 'YYYY-MM-DD') {
            invoiceData.date = todayFormatted;
        }
        if (!invoiceData.dueDate || invoiceData.dueDate === '' || invoiceData.dueDate === 'YYYY-MM-DD') {
            invoiceData.dueDate = dueDateFormatted;
        }
        
        // Calculate totals only if not provided by GPT
        if (!invoiceData.subtotal) {
            let subtotal = 0;
            invoiceData.items.forEach(item => {
                subtotal += item.amount;
            });
            invoiceData.subtotal = subtotal;
        }
        
        // Use GPT's total if provided, otherwise use subtotal (no automatic tax)
        if (!invoiceData.total) {
            invoiceData.total = invoiceData.subtotal;
        }
        
        // Only include tax if GPT mentioned it
        if (!invoiceData.tax) {
            invoiceData.tax = 0;
        }
        
        // Save to database
        const invoice = await Invoice.create({
            userId,
            originalTranscript: transcript,
            ...invoiceData
        });
        
        console.log('[Invoice Service] Invoice created:', invoice._id);
        
        res.json({ invoiceId: invoice._id, invoiceData });
        
    } catch (error) {
        console.error('[Invoice Service] Generation error:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

// Get all invoices for user
app.get('/api/invoices/user/:userId', async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error('[Invoice Service] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// Get single invoice
app.get('/api/invoices/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// Update invoice
app.put('/api/invoices/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        
        // Update fields
        Object.assign(invoice, req.body);
        await invoice.save();
        
        res.json(invoice);
    } catch (error) {
        console.error('[Invoice Service] Update error:', error);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
});

// Regenerate invoice
app.put('/api/invoices/:id/regenerate', async (req, res) => {
    try {
        const { transcript, businessContext } = req.body;
        const invoice = await Invoice.findById(req.params.id);
        
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        
        // Re-generate with OpenAI (same logic as generate)
        let prompt = `Extract invoice information from: ${transcript}`;
        
        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const invoiceData = JSON.parse(completion.choices[0].message.content);
        
        // Update invoice
        Object.assign(invoice, {
            originalTranscript: transcript,
            ...invoiceData
        });
        
        await invoice.save();
        res.json(invoice);
        
    } catch (error) {
        console.error('[Invoice Service] Regenerate error:', error);
        res.status(500).json({ error: 'Failed to regenerate invoice' });
    }
});

// Delete invoice
app.delete('/api/invoices/:id', async (req, res) => {
    try {
        await Invoice.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

// Generate PDF
app.get('/api/invoices/:id/pdf', async (req, res) => {
    try {
        console.log('[Invoice Service] Generating PDF for invoice:', req.params.id);
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) {
            console.log('[Invoice Service] Invoice not found:', req.params.id);
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        console.log('[Invoice Service] Invoice data:', JSON.stringify({
            invoiceNumber: invoice.invoiceNumber,
            itemCount: invoice.items?.length || 0,
            total: invoice.total
        }));
        
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
        
        doc.pipe(res);
        
        // Brand color
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        const lightGray = '#999999';
        
        // Header with colored background
        doc.rect(0, 0, 612, 120).fill(brandColor);
        
        // Invoice title
        doc.fontSize(32)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text('INVOICE', 50, 40);
        
        // Invoice details in header
        doc.fontSize(11)
           .font('Helvetica')
           .fillColor('white')
           .text(`Invoice #: ${invoice.invoiceNumber}`, 380, 45)
           .text(`Date: ${invoice.date}`, 380, 62)
           .text(`Due Date: ${invoice.dueDate}`, 380, 79);
        
        // From and To sections
        let yPos = 160;
        
        // From section
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('FROM', 50, yPos);
        
        yPos += 20;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor(darkGray);
        if (invoice.from.name) doc.text(invoice.from.name, 50, yPos);
        
        yPos += 18;
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(mediumGray);
        if (invoice.from.address) {
            const addressLines = doc.splitTextToFit(invoice.from.address, 220);
            addressLines.forEach(line => {
                doc.text(line, 50, yPos);
                yPos += 14;
            });
        }
        if (invoice.from.phone) {
            doc.text(invoice.from.phone, 50, yPos);
            yPos += 14;
        }
        if (invoice.from.email) {
            doc.text(invoice.from.email, 50, yPos);
        }
        
        // To section
        yPos = 160;
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('BILL TO', 320, yPos);
        
        yPos += 20;
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor(darkGray);
        if (invoice.to.name) doc.text(invoice.to.name, 320, yPos);
        
        yPos += 18;
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(mediumGray);
        if (invoice.to.address) {
            const addressLines = doc.splitTextToFit(invoice.to.address, 220);
            addressLines.forEach(line => {
                doc.text(line, 320, yPos);
                yPos += 14;
            });
        }
        if (invoice.to.phone) {
            doc.text(invoice.to.phone, 320, yPos);
            yPos += 14;
        }
        if (invoice.to.email) {
            doc.text(invoice.to.email, 320, yPos);
        }
        
        // Items table
        yPos = 340;
        
        // Table header with colored background
        doc.rect(50, yPos - 5, 512, 25).fill('#f5f7fa');
        
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray);
        doc.text('Description', 60, yPos + 5);
        doc.text('Qty', 360, yPos + 5, { width: 40, align: 'center' });
        doc.text('Unit Price', 410, yPos + 5, { width: 70, align: 'right' });
        doc.text('Amount', 490, yPos + 5, { width: 62, align: 'right' });
        
        yPos += 30;
        
        // Divider line
        doc.strokeColor('#e0e0e0')
           .lineWidth(1)
           .moveTo(50, yPos)
           .lineTo(562, yPos)
           .stroke();
        
        yPos += 15;
        
        // Items
        doc.font('Helvetica')
           .fillColor(darkGray);
        
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => {
                // Check if we need a new page
                if (yPos > 680) {
                    doc.addPage();
                    yPos = 50;
                }
                
                const descHeight = doc.heightOfString(item.description || '', { width: 290 });
                
                doc.fontSize(10)
                   .text(item.description || '', 60, yPos, { width: 290 });
                doc.text((item.quantity || 0).toString(), 360, yPos, { width: 40, align: 'center' });
                doc.text(`$${(item.rate || 0).toFixed(2)}`, 410, yPos, { width: 70, align: 'right' });
                doc.text(`$${(item.amount || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
                
                yPos += Math.max(descHeight, 15) + 10;
            });
        }
        
        yPos += 10;
        
        // Totals section
        doc.strokeColor('#e0e0e0')
           .lineWidth(1)
           .moveTo(380, yPos)
           .lineTo(562, yPos)
           .stroke();
        
        yPos += 15;
        
        // Subtotal
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(mediumGray)
           .text('Subtotal:', 410, yPos, { width: 70, align: 'right' })
           .text(`$${(invoice.subtotal || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
        
        yPos += 20;
        
        // Tax (only if > 0)
        if (invoice.tax && invoice.tax > 0) {
            doc.text('Tax:', 410, yPos, { width: 70, align: 'right' })
               .text(`$${invoice.tax.toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
            yPos += 20;
        }
        
        // Total with background
        doc.rect(380, yPos - 5, 182, 30).fill(brandColor);
        
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text('TOTAL:', 410, yPos + 5, { width: 70, align: 'right' })
           .text(`$${(invoice.total || 0).toFixed(2)}`, 490, yPos + 5, { width: 62, align: 'right' });
        
        yPos += 45;
        
        // Notes section
        if (invoice.notes) {
            yPos += 10;
            doc.fontSize(10)
               .font('Helvetica-Bold')
               .fillColor(darkGray)
               .text('Payment Terms & Notes:', 50, yPos);
            
            yPos += 18;
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor(mediumGray)
               .text(invoice.notes, 50, yPos, { width: 512, align: 'left' });
        }
        
        // Footer
        const footerY = 750;
        doc.fontSize(9)
           .fillColor(lightGray)
           .text('Thank you for your business!', 50, footerY, { 
               width: 512, 
               align: 'center' 
           });
        
        // Finalize the PDF and end the stream
        doc.end();
        
        console.log('[Invoice Service] PDF generation completed for invoice:', req.params.id);
        
    } catch (error) {
        console.error('[Invoice Service] PDF error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
});



// ========== CONTRACT ROUTES ==========
// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'contract-service', status: 'healthy' });
});

// Generate contract
app.post('/api/contracts/generate', async (req, res) => {
    try {
        const { transcript, userId } = req.body;
        
        console.log('[Contract Service] Generating contract for user:', userId);
        
        // Get user's learned business context for intelligent assistance
        const user = await User.findById(userId);
        const businessContext = user?.businessContext || null;
        
        let contextEnhancement = '';
        if (businessContext && businessContext.confidenceScore >= 30) {
            console.log('[Contract Service] 🧠 Using AI-learned business context (confidence:', businessContext.confidenceScore + ')');
            contextEnhancement = `

═══════════════════════════════════════════════════════════════════════
📊 AI-LEARNED BUSINESS CONTEXT (Use this to enhance contract accuracy!)
═══════════════════════════════════════════════════════════════════════

The system has learned the following about this user's business from ${businessContext.totalContracts || 0} previous contracts:

Industry: ${businessContext.industry || 'Unknown'}
Services Offered: ${businessContext.serviceTypes?.join(', ') || 'Unknown'}
Typical Clients: ${businessContext.commonClients?.join(', ') || 'Unknown'}
Pricing Model: ${businessContext.voicePatterns?.pricingStructure || 'Unknown'}
Average Deal Size: ${businessContext.averageDealSize ? '$' + businessContext.averageDealSize.toLocaleString() : 'Unknown'}
Typical Duration: ${businessContext.typicalProjectDuration || 'Unknown'}

Common Phrases/Terminology:
${businessContext.voicePatterns?.commonPhrases?.map(p => `- "${p}"`).join('\n') || '- None yet'}

Service Descriptions:
${businessContext.voicePatterns?.serviceDescriptions?.map(d => `- ${d}`).join('\n') || '- None yet'}

💡 USE THIS CONTEXT TO:
1. Better understand ambiguous terms in the transcript
2. Fill in missing details with high-probability defaults (if confidence is high)
3. Recognize patterns in their service offerings
4. Suggest appropriate contract structures based on their typical deals

⚠️ IMPORTANT: This context is ASSISTIVE ONLY. Always prioritize the actual transcript content.`;
        }
        
        // Get today's date
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        
        // Professional contract generation prompt based on talk2contract-ai proven methodology
        const prompt = `You are a professional contract generator. Your task is to take spoken/transcribed information and intelligently map it into a structured contract template.
${contextEnhancement}

═══════════════════════════════════════════════════════════════════════
PART A: CRITICAL RULES - READ THIS FIRST
═══════════════════════════════════════════════════════════════════════

🚨 ABSOLUTE PROHIBITIONS:

1. NEVER INVENT DATA
   - DO NOT create, guess, or fabricate any information not present in the transcription
   - DO NOT make assumptions about pricing, dates, deliverables, or terms not explicitly stated
   - DO NOT generate "reasonable" values for missing critical information
   - If information is unclear or missing, you MUST flag it explicitly

2. NEVER COPY FROM THE STYLE REFERENCE
   - The example contract below is ONLY for learning tone, structure, and formatting
   - DO NOT copy any specific details (names, amounts, dates, services) from the example
   - All actual content MUST come exclusively from the user's transcription

3. NEVER ADD UNSTATED CLAUSES
   - DO NOT add late payment penalties, fees, or interest unless explicitly mentioned
   - DO NOT add contract clauses about topics not discussed in the transcription
   - Only include terms that were actually stated or clearly implied by the parties

4. ALWAYS FLAG AMBIGUITIES
   - If payment structure is unclear → Flag it with "⚠️ CLARIFICATION NEEDED:"
   - If dates/deadlines are vague → Flag it
   - If scope boundaries are undefined → Flag it

═══════════════════════════════════════════════════════════════════════
PART B: STEP-BY-STEP EXTRACTION METHODOLOGY
═══════════════════════════════════════════════════════════════════════

Before generating the contract, follow this extraction process:

STEP 1: IDENTIFY CORE ENTITIES
□ Who is the service provider? (Exact name/entity)
□ Who is the client? (Exact name/entity)
□ What is the effective date? (USE ${todayFormatted} - DO NOT invent dates from the past)

STEP 2: MAP DELIVERABLES
□ What specific services will be provided?
□ What are the concrete deliverables?
□ What are the deadlines/timelines?
□ Are there any exclusions or scope boundaries mentioned?

STEP 3: DECODE PAYMENT STRUCTURE
□ What is the base fee amount?
□ Is there a variable/bonus component?
□ If yes: Is the total = base + bonus, OR does bonus REPLACE base?
□ When are payments due? (Specific timing: immediate, within X hours, on anniversary, etc.)
□ How are invoices delivered? (Stripe, wire, check, number of invoices, etc.)
□ When does contract become effective? (On signing, on payment, on both payments clearing, etc.)
□ What payment method was specified?
□ Are there request volume tiers? (Baseline, cap, upgrade triggers, grace periods)
□ Are there incremental system costs? (Per-system pricing, prorating, integration costs)
□ What are performance guarantee remedies? (Specific consequences for missing metrics)

STEP 4: IDENTIFY RESPONSIBILITIES
□ What must the client provide/do?
□ What must the service provider deliver/do?
□ Are there any specific deadlines tied to responsibilities?

STEP 5: CHECK FOR SPECIAL TERMS
□ Ownership/IP rights mentioned?
□ Confidentiality requirements stated?
□ Performance metrics or goals discussed? (With specific percentages and consequences?)
□ SLA commitments with specific metrics? (Uptime %, response times, availability targets?)
□ SLA penalty mechanisms? (Service credits, refunds, remedies for breach?)
□ Termination conditions specified? (Material breach, cure periods, binding commitment?)
□ Contract duration explicitly stated? (Including whether it's binding?)
□ Training and support details? (Team names, duration, topics, CSM assignment?)
□ Data volumes mentioned? (Terabytes, records, structured vs unstructured?)
□ System counts and names? (How many, which specific systems?)
□ Implementation milestones? (Week-by-week breakdown?)
□ Specific project dates? (Kickoff date, go-live date, deadline context?)
□ Business context? (Seasonal considerations, urgency drivers, strategic timing, approval history, stakeholder context?)
□ Governing law and jurisdiction? (State, county, arbitration rules?)

STEP 6: FLAG WHAT'S MISSING OR UNCLEAR
□ List any critical information that is:
  - Completely absent
  - Vaguely stated
  - Ambiguous
  - Open to multiple interpretations

═══════════════════════════════════════════════════════════════════════
TRANSCRIPTION TO EXTRACT FROM:
═══════════════════════════════════════════════════════════════════════

${transcript}

═══════════════════════════════════════════════════════════════════════
PART C: CRITICAL CONTRACT PROVISIONS - AUTO-DETECT & FIX
═══════════════════════════════════════════════════════════════════════

When generating contracts, automatically scan for these common legal gaps and ADD CLARIFYING LANGUAGE:

1. PAYMENT STRUCTURE AMBIGUITIES
IF the transcription mentions:
- Variable/performance-based fees (bonuses, ROAS-based, commission, etc.)
- Multiple fee components (base + bonus, retainer + commission, etc.)

THEN add these clarifications in Section 3 (Payment Terms):
a) CALCULATION METHOD:
   "Total monthly fee calculated as: [base amount] + [variable component] = [total]
    The [total] REPLACES the [base], not added to it."
b) PERFORMANCE METRICS:
   Define exactly how metrics are measured (what counts, what tracking system, time period, attribution)
c) PAYMENT CAPS:
   "Maximum monthly fee shall not exceed $[amount]"
d) DISPUTE RESOLUTION:
   "[Client's platform] shall be the authoritative source of truth"

2. AD SPEND / FUND MANAGEMENT ACCOUNTABILITY
IF the transcription mentions:
- Marketing/ad spend managed by provider
- Client providing budget/funds for ads

THEN add these protections in Section 3 & 4:
a) ACCOUNT OWNERSHIP:
   "Client maintains ownership and billing control of Ad Account. Service Provider operates as authorized administrator only."
b) TRANSPARENCY REQUIREMENTS:
   "Service Provider must grant Client view-only access and deliver weekly spend reports"
c) UNSPENT BUDGET HANDLING:
   "If monthly ad spend falls below threshold, Service Provider must provide written explanation. Unspent budget does not roll over unless agreed in writing."

3. PERFORMANCE-BASED TERMINATION RIGHTS
IF the transcription mentions:
- Performance goals/targets + Long contract duration (3+ months) + Early termination penalties

THEN add these protections in Section 7:
a) PERFORMANCE EXIT CLAUSE:
   "If [key metric] falls below [threshold] for two (2) consecutive months, Client may terminate immediately with [X] days notice and no early termination penalty."
b) REASONABLE TERMINATION PENALTIES:
   "Early termination fee = 50% of remaining monthly service fees, capped at $[reasonable maximum]."
c) MUTUAL TERMINATION OPTION:
   "Either party may terminate for convenience with [30-60] days written notice."

CRITICAL: DO NOT add late payment penalties, interest charges, or payment-related fees unless explicitly mentioned in the transcription.

4. PERFORMANCE GUARANTEE REMEDIES (TIER 1 PRIORITY)
IF the transcription mentions:
- Specific performance metrics (95%, 98%, 90% targets, etc.)
- Evaluation periods (120-day validation, 90-day checkpoints, etc.)
- Consequences for missing targets

THEN add detailed remedies in Section 3 (Payment Terms):
a) METRIC-SPECIFIC REMEDIES:
   For each metric mentioned, include:
   - Exact threshold (e.g., "If coverage falls below 95%")
   - Validation method (e.g., "validated via joint audit of 200 random data fields at day 90 with DPO")
   - Specific consequence (e.g., "extends contract by 6 months at no additional cost" OR "refunds 25% of first-year subscription")
   - Measurement source (e.g., "measured via platform dashboard logs" OR "measured via Jira tickets vs. DataVault timestamps")
   
b) STRUCTURED FORMAT:
   "Performance Guarantee Remedies ([evaluation period]):\\n
    a) [Metric Name]: If [condition] (validated via [method]), Service Provider [remedy]\\n
    b) [Metric Name]: If [condition] (measured via [method]), Service Provider [remedy]\\n
    c) [Metric Name]: If [condition] (measured via [method]), Service Provider [remedy]"

5. REQUEST VOLUME TIERS (TIER 1 PRIORITY)
IF the transcription mentions:
- Baseline request volumes (e.g., 50 requests per month)
- Capacity limits or headroom (e.g., up to 75 requests)
- Tier upgrade triggers or overage handling

THEN add complete volume structure in Section 3:
"Request Volume Structure:\\n
 - Baseline: [X requests per month]\\n
 - Included Headroom: Up to [Y requests per month]\\n
 - Tier Upgrade: If Client consistently exceeds [Y] requests for [X] consecutive months, pricing moves to $[amount]/month tier\\n
 - Grace Period: [X]-day grace period before overage enforcement\\n
 - Transparency: DataVault will discuss tier adjustment transparently rather than apply unexpected overage fees"

6. COMPLETE LEGAL ENTITY NAMES (TIER 1 PRIORITY)
Always extract and format complete legal names:
- Service Provider: Include entity type (Inc., LLC, Corp.) and full address if mentioned
- Client: Include full company legal name, state of incorporation if mentioned, authorized signatory with full name and title
- Flag with ⚠️ if entity type or full legal name is unclear

7. PAYMENT TIMING & CONTRACT START (TIER 2 PRIORITY)
IF transcription mentions specific payment delivery timing:
Extract and include:
- How invoices are delivered (e.g., "Two Stripe invoices sent within 4 hours")
- When each payment is due (e.g., "due immediately" vs "due on anniversary")
- When contract becomes effective (e.g., "when both payments clear")
- Kickoff timing relative to payment (e.g., "Executive kickoff within 48 hours of payment clearance")

8. IMPLEMENTATION MILESTONES (TIER 2 PRIORITY)
IF transcription mentions phase-by-phase timeline:
Break down into week-by-week or phase-by-phase structure:
"Implementation Timeline ([total duration]):\\n
 - Week 0: [Extract kickoff details]\\n
 - Weeks 1-2: [Extract milestone]\\n
 - Weeks 3-4: [Extract milestone with deliverables]\\n
 - Weeks 5-6: [Extract milestone]\\n
 - Weeks 7-8: [Extract milestone and go-live details]"

9. TRAINING & SUPPORT DETAILS (TIER 3 PRIORITY)
IF transcription mentions training sessions, CSM, or support:
Extract specific details:
- Who gets trained (team names, number of people)
- Duration (half-day, 2-hour, etc.)
- Topics covered
- CSM assignment duration and meeting frequency
- Self-sufficiency timeline

10. SERVICE LEVEL AGREEMENTS (TIER 1 PRIORITY)
IF the transcription mentions:
- Uptime commitments (99%, 99.9%, 99.95%, etc.)
- Response time requirements (<200ms, <500ms, etc.)
- Support availability (24/7, business hours, etc.)
- Performance targets with percentages (95% of requests, etc.)
- Consequences for missing SLAs

THEN add complete SLA structure in Section 3 (Payment Terms) or create dedicated SLA subsection in Section 4:
"Service Level Agreements:\\n
 a) Uptime: Service Provider commits to [X]% uptime [measured how/when]\\n
 b) Response Times: [Y] API response times for [Z]% of requests [measured via what tool]\\n
 c) Support Availability: [24/7 monitoring, X hours of monthly support time]\\n
 d) SLA Breach Remedies: If Service Provider fails to meet SLAs, [specific remedy: service credits proportional to breach, refunds, etc.]\\n
 e) Measurement: [How SLAs are measured, reporting frequency, dispute resolution]"

11. PROJECT TIMELINE & BUSINESS CONTEXT (TIER 2 PRIORITY)
IF transcription mentions specific dates, deadlines, or strategic timing:
Extract and include in Section 2 (Scope of Work) or Section 7 (Term & Termination):
- Kickoff date (e.g., "December 15th")
- Go-live target (e.g., "late June, early July 2026")
- Project duration (e.g., "7 months total", "by month 7")
- Business context (e.g., "want this done by Q2", "stabilize before Q4 busy season", "budget approved last month")
- Strategic rationale (e.g., "CTO has been pushing for this", "Operations approved budget")

Format as:
"Project Timeline:\\n
 - Kickoff: [Specific date or condition]\\n
 - Phase 1 Completion: [Date or duration]\\n
 - Phase 2 Completion: [Date or duration]\\n
 - Go-Live Target: [Specific date or timeframe]\\n
 - Total Duration: [X months/weeks]\\n
 - Business Context: [Strategic timing, seasonal considerations, urgency drivers]"

CRITICAL: DO NOT add late payment penalties, interest charges, or payment-related fees unless explicitly mentioned in the transcription.

═══════════════════════════════════════════════════════════════════════
PART D: ADAPTIVE OUTPUT STRUCTURE - BUILD WHAT YOU FIND
═══════════════════════════════════════════════════════════════════════

CRITICAL: The sections below are GUIDELINES, not rigid templates. 

YOUR JOB: Extract information from the transcription and intelligently organize it into appropriate contract sections. If the transcription mentions something that doesn't fit the examples below, CREATE A NEW SUBSECTION OR ADD IT WHERE IT MAKES SENSE.

DO NOT force information into predetermined templates if it doesn't fit naturally.
DO capture EVERY detail mentioned in the transcription, even if it's unconventional.

Return ONLY valid JSON (no markdown, no code blocks) with this structure:

{
    "title": "[Descriptive title based on the services discussed]",
    "effectiveDate": "${todayFormatted}",
    "parties": {
        "serviceProvider": {
            "name": "[Extract from transcript: company name, or 'Service Provider' if not mentioned]",
            "address": "[Extract full address if mentioned, otherwise 'To be determined']",
            "email": "[Extract email if mentioned, otherwise 'To be determined']",
            "phone": "[Extract phone if mentioned, otherwise 'To be determined']"
        },
        "client": {
            "name": "[Extract from transcript: company name, or 'Client' if not mentioned]",
            "signingAuthority": "",
            "address": "[Extract full address if mentioned, otherwise 'To be determined']",
            "email": "[Extract email if mentioned, otherwise 'To be determined']",
            "phone": "[Extract phone if mentioned, otherwise 'To be determined']"
        }
    },
    "sections": [
        {
            "title": "1. AGREEMENT OVERVIEW",
            "content": "[Extract and format professionally: Service Provider name, Client name, Effective Date (MUST USE ${todayFormatted} - DO NOT write dates like 'November 23, 2023'), Contract Duration, Purpose/Description of agreement]"
        },
        {
            "title": "2. SCOPE OF WORK",
            "content": "[Extract ALL services, deliverables, timelines, milestones, technical specs, system counts, data volumes (include terabytes, data types like structured/unstructured), implementation phases, operational notes, exclusions - CAPTURE EVERYTHING mentioned about what's being delivered. Include specific project dates (kickoff, go-live, deadlines) and business context (seasonal timing, urgency drivers, strategic rationale, stakeholder approval history, budget context).]"
        },
        {
            "title": "3. PAYMENT TERMS",
            "content": "[Extract ALL payment information: total amounts, fee breakdowns, payment schedules, timing, methods, volume tiers, incremental pricing, performance guarantees with specific remedies, bonus structures, caps, when payments trigger, how invoices are sent - CAPTURE EVERY FINANCIAL DETAIL. CRITICAL: Include SLA commitments with specific metrics (uptime %, response times, availability targets) and SLA penalty mechanisms with detailed formulas (service credits proportional to breach duration/severity, specific calculation method, refunds, consequences for breach).]"
        },
        {
            "title": "4. RESPONSIBILITIES",
            "content": "[Extract what Client must do (provide access, collaborate on compliance, approve deliverables) and what Service Provider must do (migration execution, API integration, portal development, incident response, performance optimization, warranty support). Include training details, support details, CSM assignments, meeting frequencies, approval processes, cooperation requirements - CAPTURE ALL OBLIGATIONS]"
        },
        {
            "title": "5. INTELLECTUAL PROPERTY & USAGE RIGHTS",
            "content": "[If IP/ownership mentioned in transcription, extract it here. Otherwise use standard SaaS language: Platform Ownership (Provider retains), Client Data Ownership (Client retains, Provider is Data Processor), Data Maps/Configs (Client gets export rights), Anonymized Telemetry (Provider can use), Post-Termination (30-day export, 90-day deletion)]"
        },
        {
            "title": "6. CONFIDENTIALITY & DATA PROCESSING",
            "content": "[If confidentiality/DPA mentioned in transcription, extract it here. Otherwise use standard enterprise language: Mutual Confidentiality (5-year survival), Data Processor Role (GDPR/CCPA compliance), DPA requirement (30 days with SCCs), Security Standards (SOC 2 Type II, encryption, MFA), Subprocessors (30-day notice), Breach Notification (24 hours), Audit Rights (annual)]"
        },
        {
            "title": "7. TERM & TERMINATION",
            "content": "[Extract contract duration, binding period, termination rights, cure periods, notice requirements, non-renewal process, performance-based exit clauses, refund provisions, what happens to payments on termination - CAPTURE ALL TERMINATION TERMS]"
        },
        {
            "title": "8. GOVERNING LAW & DISPUTES",
            "content": "[Extract governing law, jurisdiction, arbitration rules if mentioned. Otherwise use reasonable defaults: State law (Delaware or mutual agreement), arbitration (AAA Commercial Rules), good faith negotiation]"
        },
        {
            "title": "9. SIGNATURES",
            "content": "[Standard signature block with extracted names, titles, company names for both Service Provider and Client]"
        }
    ]
}

ADAPTIVE INSTRUCTIONS:
- If transcription mentions ROI/business context, ADD it to Section 2 or create "Business Context" subsection
- If transcription mentions detailed SLAs, ADD them to Section 4 or create "Service Level Agreement" subsection
- If transcription mentions warranty/indemnification, ADD Section 10 for "Warranties & Indemnification"
- If transcription mentions specific compliance requirements (HIPAA, SOX, PCI), ADD them to Section 6
- If transcription mentions renewal terms/pricing, ADD subsection to Section 7
- The goal is to capture EVERYTHING discussed, not fit into a template

═══════════════════════════════════════════════════════════════════════
PART E: INTELLIGENT CONTENT MAPPING - BE ADAPTIVE, NOT RIGID
═══════════════════════════════════════════════════════════════════════

CORE PRINCIPLE: Your job is to CAPTURE EVERYTHING from the transcription and organize it intelligently, not force it into predetermined boxes.

1. COMPREHENSIVE EXTRACTION:
   Read the ENTIRE transcription carefully and identify ALL mentioned:
   - Party information (names, roles, titles, companies)
   - Services/deliverables (be specific - quantities, specs, systems, data volumes in terabytes/gigabytes)
   - Payment details (amounts, timing, methods, volume tiers, incremental costs, guarantees)
   - Timeline/milestones (phases, weeks, deadlines, kickoff timing)
   - Responsibilities (who does what, when, with what resources)
   - Special terms (performance metrics, training, support, ROI context)
   - Legal requirements (termination, IP, confidentiality, compliance)
   - Business context (stakeholder approvals, budget history, urgency drivers, seasonal considerations)
   - Data infrastructure (terabytes, structured vs unstructured, database types, file storage)

2. INTELLIGENT ORGANIZATION:
   - Group related information together logically
   - If something doesn't fit neatly into a section, ADD A SUBSECTION
   - If transcription is detailed about one topic, reflect that detail in the contract
   - If transcription is vague about something, note it but don't invent details
   - Think: "What would make this contract MOST useful to both parties?"

3. PROFESSIONAL FORMATTING:
   - Use numbered/lettered clauses for organization (a, b, c)
   - Write in complete sentences with proper legal phrasing
   - "The Client agrees to..." not "Client: agrees"
   - "Service Provider will deliver..." not "Provider does X"
   - Use subsection headers when needed ("Request Volume Structure:", "Performance Guarantee Remedies:")

4. DETAIL PRESERVATION:
   - If transcription says "17 systems" → List the count AND names if mentioned
   - If transcription says "95% accuracy" → Include the percentage, validation method, and consequence
   - If transcription says "$1,500/month per system" → Include the per-unit cost, prorating logic, and example calculation
   - If transcription says "8-week timeline" → Break down the week-by-week milestones if provided
   - If transcription says "8 terabytes" → Include data volume, data types (structured/unstructured)
   - If transcription says "CTO pushing", "budget approved" → Include stakeholder context and approval history
   - If transcription says "retail banking customers", "Q4 busy season" → Include business context and industry details
   - DO NOT summarize away specifics - contracts need precision

5. ADAPTIVE STRUCTURE:
   - Unusual service model? Explain it clearly in Section 2
   - Complex payment structure? Break it down step-by-step in Section 3
   - Special compliance requirements? Add them to Section 6
   - Detailed SLAs? Add subsection to Section 4 or create Section 10
   - The 9-section structure is a STARTING POINT, not a constraint

6. HANDLING MISSING INFORMATION:
   A. For NON-CRITICAL information:
      → Use "To be determined"
   B. For CRITICAL information:
      → Use "⚠️ CLARIFICATION NEEDED: [describe what needs to be clarified]"
      
      CRITICAL info that REQUIRES flagging if missing:
      ✓ Payment amounts (total contract value)
      ✓ Payment calculation methods (if performance-based or variable)
      ✓ Contract duration, start/end dates
      ✓ Core deliverables and quantities
      ✓ Key project deadlines
      ✓ Performance metrics tied to payment/termination
      ✓ Termination penalties or early exit fees
      
      INFO that can use "To be determined" (DO NOT flag as missing):
      ✓ Complete legal entity names → Use company name provided, add "(To be determined at signing)" if entity type unclear
      ✓ Authorized signatory names → Use name provided, add "with authorized signatory title (to be confirmed at execution)"
      ✓ Governing law/jurisdiction → Use "Governing law and jurisdiction to be determined by mutual agreement (typically Delaware or state of Client's incorporation)"
      ✓ Payment net terms → Use "Payment due on receipt" as default
      ✓ Email addresses/phone numbers
      ✓ Exact street addresses
      ✓ Secondary contact info
      
      CRITICAL: Sections 5 (IP Rights) and 6 (Confidentiality/DPA) are now auto-generated with industry-standard language. DO NOT flag these sections as missing.

7. EXTRACT DATA VOLUMES & SYSTEM COUNTS:
   - Always include specific numbers: "15 terabytes", "8 terabytes", "17 systems", "50 requests per month"
   - List ALL system names mentioned, not just a count
   - Include data types: "structured data", "unstructured data", "database files", "file storage", "PII", etc.
   - Include specific quantities mentioned in transcription (e.g., "8 terabytes of data - mix of structured databases and unstructured file storage")

8. EXTRACT BUSINESS CONTEXT & STAKEHOLDER DETAILS:
   If transcription mentions approval history, urgency drivers, or stakeholder context:
   - CTO/executive pushing for project
   - Budget approval timing ("approved last month", "approved last quarter")
   - Industry context ("retail banking customers", "financial institution", "healthcare provider")
   - Seasonal considerations ("Q4 busy season", "stabilize before peak period")
   - Strategic rationale ("want this done by Q2", "ahead of compliance deadline")

8. EXTRACT BUSINESS CONTEXT & STAKEHOLDER DETAILS:
   If transcription mentions approval history, urgency drivers, or stakeholder context:
   - CTO/executive pushing for project
   - Budget approval timing ("approved last month", "approved last quarter")
   - Industry context ("retail banking customers", "financial institution", "healthcare provider")
   - Seasonal considerations ("Q4 busy season", "stabilize before peak period")
   - Strategic rationale ("want this done by Q2", "ahead of compliance deadline")

9. EXTRACT DETAILED DELIVERABLES:
   If transcription mentions comprehensive deliverables, include specific items like:
   - Data inventory with classifications
   - Real-time vs snapshot reporting
   - Access logs and flow diagrams
   - Deletion verification methods
   - Compliance report formats
   - Shadow IT discovery capabilities
   - Cryptographic proof logging
   - Machine learning-based classification
   - Retention policy enforcement details

10. EXTRACT INCREMENTAL PRICING:
   If transcription mentions adding systems/users/capacity:
   - Per-unit costs (e.g., "$1,500/month per system")
   - Prorating calculations (e.g., "6 months into 2-year contract = $9,000 for remaining 18 months")
   - What's included (e.g., "integration engineering work included")
   - Renewal treatment (e.g., "rolls into standard renewal pricing")

11. CRITICAL DATE HANDLING:
   - ALWAYS use ${todayFormatted} as the effective date in Section 1
   - DO NOT write historical dates like "November 23, 2023" or "effective as of November 23, 2023"
   - The correct format is: "This Agreement is between [Service Provider] and [Client] effective as of ${todayFormatted}"
   - Extract project kickoff dates, go-live dates, and deadlines separately in Section 2 (Scope of Work)

12. REMEMBER: All content comes from the transcription, NOT from any example.

13. DO NOT ADD CLAUSES NOT MENTIONED:
   - NEVER add late payment terms, penalties, or fees unless explicitly stated
   - NEVER add clauses about topics not discussed
   - Only include what was actually mentioned

═══════════════════════════════════════════════════════════════════════
PART F: PRE-GENERATION CHECKLIST
═══════════════════════════════════════════════════════════════════════

Before outputting the final contract, verify you have:

✓ EXTRACTED all information from transcription (not invented)
✓ FLAGGED any critical ambiguities with "⚠️ CLARIFICATION NEEDED:"
✓ NOT INVENTED any data (pricing, dates, terms) not in transcription
✓ NOT COPIED any specifics from style references
✓ USED "To be determined" only for non-critical missing info
✓ ADDED relevant protective clauses from Part C where applicable
✓ MAINTAINED the 9-section JSON structure from Part D
✓ USED professional legal tone and formatting
✓ KEPT all sections concise with lettered sub-clauses

Generate the comprehensive contract JSON now using ONLY information from the transcription.`;
        
        console.log('[Contract Service] Sending to OpenAI...');

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }    
        });

        const contractData = JSON.parse(completion.choices[0].message.content);
        
        // Ensure all required fields exist
        if (!contractData.effectiveDate) {
            contractData.effectiveDate = todayFormatted;
        }
        
        // Get user's business info for auto-filling service provider details (already fetched above)
        let serviceProviderInfo = {
            name: 'Service Provider',
            address: 'To be determined',
            email: 'To be determined',
            phone: 'To be determined'
        };
        
        // Auto-fill service provider from user's business info if available
        if (user && user.businessInfo && user.businessInfo.setupCompleted) {
            console.log('[Contract Service] Auto-filling service provider from business info');
            serviceProviderInfo = {
                name: user.businessInfo.businessName,
                address: user.businessInfo.businessAddress,
                email: user.businessInfo.businessEmail,
                phone: user.businessInfo.businessPhone
            };
        }
        
        // Map the OpenAI response directly - trust GPT-4o's extraction from the prompt
        const contractToSave = {
            userId,
            originalTranscript: transcript,
            contractTitle: contractData.title || 'Service Agreement',
            effectiveDate: contractData.effectiveDate,
            parties: contractData.parties || {
                serviceProvider: serviceProviderInfo,
                client: {
                    name: 'Client',
                    signingAuthority: '',
                    address: 'To be determined',
                    email: 'To be determined',
                    phone: 'To be determined'
                }
            },
            sections: contractData.sections || []
        };
        
        // If parties were extracted from OpenAI but service provider is generic, use business info
        if (contractToSave.parties.serviceProvider.name === 'Service Provider' && 
            user && user.businessInfo && user.businessInfo.setupCompleted) {
            contractToSave.parties.serviceProvider = serviceProviderInfo;
        }
        
        // Save to database
        const contract = await Contract.create(contractToSave);
        
        console.log('[Contract Service] Contract created:', contract._id);
        
        // 🧠 AI LEARNING AGENT - Learn from this contract!
        learnFromContract(userId, transcript, contractToSave).catch(err => {
            console.error('[AI Learning] Error learning from contract:', err);
            // Don't block the response if learning fails
        });
        
        // Return the properly structured contract data for the frontend
        res.json({ 
            contractId: contract._id, 
            contractData: {
                contractTitle: contract.contractTitle,
                effectiveDate: contract.effectiveDate,
                parties: contract.parties,
                sections: contract.sections
            }
        });
        
    } catch (error) {
        console.error('[Contract Service] Generation error:', error);
        res.status(500).json({ error: 'Failed to generate contract' });
    }
});

// Get all contracts for user
app.get('/api/contracts/user/:userId', async (req, res) => {
    try {
        const contracts = await Contract.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(contracts);
    } catch (error) {
        console.error('[Contract Service] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
});

// Get single contract
app.get('/api/contracts/:id', async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        res.json(contract);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch contract' });
    }
});

// Update contract
app.put('/api/contracts/:id', async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        // Update fields
        Object.assign(contract, req.body);
        await contract.save();
        
        res.json(contract);
    } catch (error) {
        console.error('[Contract Service] Update error:', error);
        res.status(500).json({ error: 'Failed to update contract' });
    }
});

// Delete contract
app.delete('/api/contracts/:id', async (req, res) => {
    try {
        await Contract.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete contract' });
    }
});

// Add signature to contract
app.post('/api/contracts/:id/sign', requireAuth, async (req, res) => {
    try {
        const { party, signatureData, signedBy } = req.body;
        
        if (!party || !signatureData || !signedBy) {
            return res.status(400).json({ error: 'Missing required fields: party, signatureData, signedBy' });
        }
        
        if (party !== 'serviceProvider' && party !== 'client') {
            return res.status(400).json({ error: 'Party must be either "serviceProvider" or "client"' });
        }
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        // Initialize signatures object if it doesn't exist
        if (!contract.signatures) {
            contract.signatures = {};
        }
        
        // Add signature
        contract.signatures[party] = {
            signatureData,
            signedBy,
            signedAt: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress
        };
        
        // Update contract status
        const serviceProviderSigned = contract.signatures.serviceProvider?.signatureData;
        const clientSigned = contract.signatures.client?.signatureData;
        
        if (serviceProviderSigned && clientSigned) {
            contract.status = 'fully_signed';
        } else if (serviceProviderSigned || clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log(`[Contract Service] Signature added for ${party} on contract:`, contract._id);
        
        res.json({ 
            success: true, 
            status: contract.status,
            signatures: contract.signatures
        });
        
    } catch (error) {
        console.error('[Contract Service] Signature error:', error);
        res.status(500).json({ error: 'Failed to add signature' });
    }
});

// Remove signature from contract
app.delete('/api/contracts/:id/sign/:party', requireAuth, async (req, res) => {
    try {
        const { party } = req.params;
        
        if (party !== 'serviceProvider' && party !== 'client') {
            return res.status(400).json({ error: 'Party must be either "serviceProvider" or "client"' });
        }
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        
        // Remove signature
        if (contract.signatures && contract.signatures[party]) {
            contract.signatures[party] = undefined;
        }
        
        // Update contract status
        const serviceProviderSigned = contract.signatures?.serviceProvider?.signatureData;
        const clientSigned = contract.signatures?.client?.signatureData;
        
        if (!serviceProviderSigned && !clientSigned) {
            contract.status = 'draft';
        } else if (serviceProviderSigned || clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log(`[Contract Service] Signature removed for ${party} on contract:`, contract._id);
        
        res.json({ 
            success: true, 
            status: contract.status
        });
        
    } catch (error) {
        console.error('[Contract Service] Remove signature error:', error);
        res.status(500).json({ error: 'Failed to remove signature' });
    }
});

// Generate shareable link for contract
app.post('/api/contracts/:id/share', requireAuth, async (req, res) => {
    try {
        console.log('[Contract Service] Share request for contract:', req.params.id);
        
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            console.log('[Contract Service] Contract not found:', req.params.id);
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        console.log('[Contract Service] Contract found, user:', req.user._id, 'owner:', contract.userId);
        
        // Check if user owns this contract
        if (contract.userId.toString() !== req.user._id.toString()) {
            console.log('[Contract Service] Unauthorized access attempt');
            return res.status(403).json({ error: 'Unauthorized' });
        }
        
        // Generate unique token
        const crypto = require('crypto');
        const token = crypto.randomBytes(32).toString('hex');
        
        // Set link to expire in 30 days
        const expiresAt = new Date();
        expiresAt.setDate(expiresAt.getDate() + 30);
        
        contract.shareableLink = {
            token,
            createdAt: new Date(),
            expiresAt,
            accessCount: 0
        };
        
        await contract.save();
        
        // Build shareable URL
        const baseUrl = process.env.CLIENT_URL || `http://localhost:${PORT}`;
        const shareableUrl = `${baseUrl}/contract/view/${token}`;
        
        console.log('[Contract Service] Shareable link generated for contract:', contract._id);
        
        res.json({
            success: true,
            shareableUrl,
            expiresAt
        });
        
    } catch (error) {
        console.error('[Contract Service] Share link error:', error);
        res.status(500).json({ error: 'Failed to generate shareable link' });
    }
});

// View contract via shareable link (no auth required)
app.get('/contract/view/:token', async (req, res) => {
    res.sendFile('contract-view.html', { root: 'public' });
});

// Get contract data via shareable link (no auth required)
app.get('/api/contracts/shared/:token', async (req, res) => {
    try {
        console.log('[Contract Service] Attempting to load shared contract with token:', req.params.token);
        
        const contract = await Contract.findOne({ 'shareableLink.token': req.params.token });
        
        if (!contract) {
            console.log('[Contract Service] Contract not found for token:', req.params.token);
            return res.status(404).json({ error: 'Contract not found or link expired' });
        }
        
        console.log('[Contract Service] Contract found:', contract._id);
        
        // Check if link is expired
        if (contract.shareableLink.expiresAt < new Date()) {
            console.log('[Contract Service] Link expired for contract:', contract._id);
            return res.status(410).json({ error: 'This link has expired' });
        }
        
        // Increment access count
        contract.shareableLink.accessCount += 1;
        await contract.save();
        
        console.log('[Contract Service] Shared contract accessed:', contract._id, 'Count:', contract.shareableLink.accessCount);
        
        res.json({
            contractId: contract._id,
            contractTitle: contract.contractTitle,
            effectiveDate: contract.effectiveDate,
            parties: contract.parties,
            sections: contract.sections,
            signatures: contract.signatures,
            status: contract.status
        });
        
    } catch (error) {
        console.error('[Contract Service] Shared contract error:', error);
        res.status(500).json({ error: 'Failed to load contract' });
    }
});

// Sign contract via shareable link (no auth required)
app.post('/api/contracts/shared/:token/sign', async (req, res) => {
    try {
        const { party, signatureData, signedBy } = req.body;
        
        if (!party || !signatureData || !signedBy) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        
        if (party !== 'client') {
            return res.status(400).json({ error: 'Only client can sign via shareable link' });
        }
        
        const contract = await Contract.findOne({ 'shareableLink.token': req.params.token });
        
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        // Check if link is expired
        if (contract.shareableLink.expiresAt < new Date()) {
            return res.status(410).json({ error: 'This link has expired' });
        }
        
        // Add client signature
        if (!contract.signatures) {
            contract.signatures = {};
        }
        
        contract.signatures.client = {
            signatureData,
            signedBy,
            signedAt: new Date(),
            ipAddress: req.ip || req.connection.remoteAddress
        };
        
        // Update status
        const serviceProviderSigned = contract.signatures.serviceProvider?.signatureData;
        const clientSigned = contract.signatures.client?.signatureData;
        
        if (serviceProviderSigned && clientSigned) {
            contract.status = 'fully_signed';
        } else if (clientSigned) {
            contract.status = 'partially_signed';
        }
        
        await contract.save();
        
        console.log('[Contract Service] Client signature added via shared link:', contract._id);
        
        res.json({
            success: true,
            status: contract.status,
            message: 'Contract signed successfully!'
        });
        
    } catch (error) {
        console.error('[Contract Service] Shared sign error:', error);
        res.status(500).json({ error: 'Failed to sign contract' });
    }
});

// Generate PDF
app.get('/api/contracts/:id/pdf', async (req, res) => {
    try {
        console.log('[Contract Service] Generating PDF for contract:', req.params.id);
        const contract = await Contract.findById(req.params.id);
        if (!contract) {
            console.log('[Contract Service] Contract not found:', req.params.id);
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        const doc = new PDFDocument({ 
            margin: 50,
            size: 'A4'
        });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=contract-${contract._id}.pdf`);
        
        doc.pipe(res);
        
        // Brand color
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        const lightGray = '#999999';
        
        // Header
        doc.rect(0, 0, 612, 100).fill(brandColor);
        
        doc.fontSize(28)
           .font('Helvetica-Bold')
           .fillColor('white')
           .text(contract.contractTitle || 'Professional Services Contract', 50, 35, { width: 512, align: 'center' });
        
        // Contract metadata
        let yPos = 130;
        doc.fontSize(10)
           .font('Helvetica')
           .fillColor(darkGray)
           .text(`Effective Date: ${contract.effectiveDate}`, 50, yPos);
        
        yPos += 30;
        
        // Parties section
        doc.fontSize(12)
           .font('Helvetica-Bold')
           .fillColor(brandColor)
           .text('PARTIES TO THIS AGREEMENT', 50, yPos);
        
        yPos += 20;
        
        // Service Provider
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('Service Provider:', 50, yPos);
        
        yPos += 15;
        doc.font('Helvetica')
           .fillColor(mediumGray);
        if (contract.parties?.serviceProvider?.name) {
            doc.text(contract.parties.serviceProvider.name, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.address) {
            doc.text(contract.parties.serviceProvider.address, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.email) {
            doc.text(contract.parties.serviceProvider.email, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.serviceProvider?.phone) {
            doc.text(contract.parties.serviceProvider.phone, 50, yPos);
            yPos += 14;
        }
        
        yPos += 10;
        
        // Client
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('Client:', 50, yPos);
        
        yPos += 15;
        doc.font('Helvetica')
           .fillColor(mediumGray);
        if (contract.parties?.client?.name) {
            doc.text(contract.parties.client.name, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.signingAuthority) {
            doc.text(`Signing Authority: ${contract.parties.client.signingAuthority}`, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.address) {
            doc.text(contract.parties.client.address, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.email) {
            doc.text(contract.parties.client.email, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.phone) {
            doc.text(contract.parties.client.phone, 50, yPos);
            yPos += 14;
        }
        if (contract.parties?.client?.email) {
            doc.text(contract.parties.client.email, 50, yPos);
            yPos += 14;
        }
        
        yPos += 20;
        
        // Contract sections
        if (contract.sections && contract.sections.length > 0) {
            contract.sections.sort((a, b) => a.order - b.order).forEach(section => {
                // Check if we need a new page
                if (yPos > 680) {
                    doc.addPage();
                    yPos = 50;
                }
                
                // Section title
                doc.fontSize(11)
                   .font('Helvetica-Bold')
                   .fillColor(brandColor)
                   .text(`${section.order}. ${section.title}`, 50, yPos);
                
                yPos += 18;
                
                // Section content
                doc.fontSize(10)
                   .font('Helvetica')
                   .fillColor(darkGray);
                
                const lines = section.content.split('\n');
                lines.forEach(line => {
                    if (yPos > 720) {
                        doc.addPage();
                        yPos = 50;
                    }
                    
                    if (line.trim()) {
                        doc.text(line, 50, yPos, { width: 512, align: 'left' });
                        yPos += doc.heightOfString(line, { width: 512 }) + 5;
                    } else {
                        yPos += 8;
                    }
                });
                
                yPos += 15;
            });
        }
        
        // Signature Section
        yPos += 30;
        
        // Check if we need a new page for signatures
        if (yPos > 600) {
            doc.addPage();
            yPos = 50;
        }
        
        // Signature section title
        doc.fontSize(14)
           .font('Helvetica-Bold')
           .fillColor(brandColor)
           .text('SIGNATURES', 50, yPos);
        
        yPos += 25;
        
        // Service Provider Signature
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('Service Provider:', 50, yPos);
        
        yPos += 20;
        
        if (contract.signatures?.serviceProvider?.signatureData) {
            // Draw signature image
            try {
                const signatureBuffer = Buffer.from(contract.signatures.serviceProvider.signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                doc.image(signatureBuffer, 50, yPos, { width: 200, height: 60 });
                yPos += 70;
            } catch (err) {
                console.error('[Contract PDF] Signature image error:', err);
                yPos += 60;
            }
            
            // Signature line
            doc.moveTo(50, yPos).lineTo(250, yPos).stroke();
            yPos += 5;
            
            // Signed by and date
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor(mediumGray)
               .text(`Signed by: ${contract.signatures.serviceProvider.signedBy}`, 50, yPos);
            yPos += 12;
            
            if (contract.signatures.serviceProvider.signedAt) {
                const signedDate = new Date(contract.signatures.serviceProvider.signedAt).toLocaleDateString();
                doc.text(`Date: ${signedDate}`, 50, yPos);
            }
            yPos += 20;
        } else {
            // Unsigned - show placeholder
            doc.moveTo(50, yPos + 60).lineTo(250, yPos + 60).stroke();
            yPos += 65;
            doc.fontSize(9)
               .font('Helvetica-Oblique')
               .fillColor(lightGray)
               .text('Signature (Not yet signed)', 50, yPos);
            yPos += 20;
        }
        
        yPos += 20;
        
        // Client Signature
        doc.fontSize(10)
           .font('Helvetica-Bold')
           .fillColor(darkGray)
           .text('Client:', 50, yPos);
        
        yPos += 20;
        
        if (contract.signatures?.client?.signatureData) {
            // Draw signature image
            try {
                const signatureBuffer = Buffer.from(contract.signatures.client.signatureData.replace(/^data:image\/\w+;base64,/, ''), 'base64');
                doc.image(signatureBuffer, 50, yPos, { width: 200, height: 60 });
                yPos += 70;
            } catch (err) {
                console.error('[Contract PDF] Signature image error:', err);
                yPos += 60;
            }
            
            // Signature line
            doc.moveTo(50, yPos).lineTo(250, yPos).stroke();
            yPos += 5;
            
            // Signed by and date
            doc.fontSize(9)
               .font('Helvetica')
               .fillColor(mediumGray)
               .text(`Signed by: ${contract.signatures.client.signedBy}`, 50, yPos);
            yPos += 12;
            
            if (contract.signatures.client.signedAt) {
                const signedDate = new Date(contract.signatures.client.signedAt).toLocaleDateString();
                doc.text(`Date: ${signedDate}`, 50, yPos);
            }
        } else {
            // Unsigned - show placeholder
            doc.moveTo(50, yPos + 60).lineTo(250, yPos + 60).stroke();
            yPos += 65;
            doc.fontSize(9)
               .font('Helvetica-Oblique')
               .fillColor(lightGray)
               .text('Signature (Not yet signed)', 50, yPos);
        }
        
        // Footer
        const footerY = 750;
        doc.fontSize(8)
           .fillColor('#999999')
           .text(`Contract Status: ${contract.status || 'draft'}`, 50, footerY, { 
               width: 512, 
               align: 'center' 
           })
           .text('This contract was generated electronically.', 50, footerY + 10, { 
               width: 512, 
               align: 'center' 
           });
        
        doc.end();
        
        console.log('[Contract Service] PDF generation completed for contract:', req.params.id);
        
    } catch (error) {
        console.error('[Contract Service] PDF error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
});


// ========== COMPATIBILITY ALIASES FOR API GATEWAY ==========
// The frontend was built for the API Gateway which uses different route names
// Add aliases here to maintain backward compatibility

// GET /api/business-context - Get business context for current user
app.get('/api/business-context', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        res.json({
            frequentClients: user.businessContext?.frequentClients || [],
            commonServices: user.businessContext?.commonServices || []
        });
    } catch (error) {
        console.error('[Business Context] Error:', error);
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
});

// PUT /api/business-context - Update business context
app.put('/api/business-context', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const user = await User.findById(userId);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }
        
        user.businessContext = req.body;
        await user.save();
        
        res.json(user.businessContext);
    } catch (error) {
        console.error('[Business Context Update] Error:', error);
        res.status(500).json({ error: 'Failed to update business context' });
    }
});

// GET /api/invoices - Get all invoices for current user
app.get('/api/invoices', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const invoices = await Invoice.find({ userId }).sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error('[Invoices Alias] Error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// GET /api/contracts - Get all contracts for current user
app.get('/api/contracts', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const contracts = await Contract.find({ userId }).sort({ createdAt: -1 });
        res.json(contracts);
    } catch (error) {
        console.error('[Contracts Alias] Error:', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
});

// GET /api/contracts/:id/download - Download contract as PDF
app.get('/api/contracts/:id/download', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const contractId = req.params.id;
        
        console.log(`[Contract Download] Fetching contract ${contractId} for user ${userId}`);
        
        const contract = await Contract.findOne({ _id: contractId, userId });
        
        if (!contract) {
            return res.status(404).json({ error: 'Contract not found' });
        }
        
        // Create PDF document
        const doc = new PDFDocument({ 
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 }
        });
        
        // Set response headers
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Contract_${contract.contractTitle.replace(/\s+/g, '_')}.pdf"`);
        
        // Pipe the PDF document to response
        doc.pipe(res);
        
        // Add content to PDF
        doc.fontSize(20).text(contract.contractTitle, { align: 'center' });
        doc.moveDown();
        doc.fontSize(12).text(`Effective Date: ${contract.effectiveDate}`, { align: 'center' });
        doc.moveDown(2);
        
        // Parties section
        doc.fontSize(14).text('PARTIES', { underline: true });
        doc.moveDown(0.5);
        doc.fontSize(11);
        doc.text(`Service Provider: ${contract.parties.serviceProvider.name}`);
        if (contract.parties.serviceProvider.address && contract.parties.serviceProvider.address !== 'To be determined') {
            doc.text(`Address: ${contract.parties.serviceProvider.address}`);
        }
        if (contract.parties.serviceProvider.email && contract.parties.serviceProvider.email !== 'To be determined') {
            doc.text(`Email: ${contract.parties.serviceProvider.email}`);
        }
        if (contract.parties.serviceProvider.phone && contract.parties.serviceProvider.phone !== 'To be determined') {
            doc.text(`Phone: ${contract.parties.serviceProvider.phone}`);
        }
        doc.moveDown();
        
        doc.text(`Client: ${contract.parties.client.name}`);
        if (contract.parties.client.address && contract.parties.client.address !== 'To be determined') {
            doc.text(`Address: ${contract.parties.client.address}`);
        }
        if (contract.parties.client.email && contract.parties.client.email !== 'To be determined') {
            doc.text(`Email: ${contract.parties.client.email}`);
        }
        if (contract.parties.client.phone && contract.parties.client.phone !== 'To be determined') {
            doc.text(`Phone: ${contract.parties.client.phone}`);
        }
        doc.moveDown(2);
        
        // Contract sections
        if (contract.sections && contract.sections.length > 0) {
            contract.sections.forEach((section, index) => {
                doc.fontSize(14).text(section.title, { underline: true });
                doc.moveDown(0.5);
                doc.fontSize(11).text(section.content, { align: 'justify' });
                doc.moveDown(1.5);
                
                // Add page break if content is too long (except for last section)
                if (index < contract.sections.length - 1 && doc.y > 650) {
                    doc.addPage();
                }
            });
        }
        
        // Finalize PDF
        doc.end();
        
        console.log(`[Contract Download] PDF generated successfully for contract ${contractId}`);
        
    } catch (error) {
        console.error('[Contract Download] Error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
});

app.post('/api/generate-invoice', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const { transcript } = req.body;
        
        // Get business context from user
        const user = await User.findById(userId);
        const businessContext = user ? {
            frequentClients: user.businessContext?.frequentClients || [],
            commonServices: user.businessContext?.commonServices || []
        } : { frequentClients: [], commonServices: [] };
        
        // Call the main invoice generation endpoint
        req.body.userId = userId;
        req.body.businessContext = businessContext;
        
        // Get today's date and due date
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateFormatted = dueDate.toISOString().split('T')[0];
        
        console.log('[Invoice Alias] Generating invoice for user:', userId);
        
        // Create the full prompt with proper structure
        let prompt = `You are a STRICT extractor that creates invoices from transcriptions. Use ONLY facts explicitly present in the inputs.

CRITICAL BILLING CONTEXT:
- Understand WHEN the pricing applies (immediate/today vs. future/ongoing)
- ONLY include pricing that applies to the CURRENT billing period
- If pricing is discussed for future work, ongoing retainers, or later phases, DO NOT include it in this invoice
- Look for temporal indicators: "now", "today", "this month", "upfront", "deposit" vs. "monthly", "ongoing", "per month", "future"

CRITICAL STRUCTURE:
1. If there's a main package/service with a total price that applies NOW, create it as a line_item
2. ONLY create sub-line_items if the transcription EXPLICITLY breaks down the pricing for individual deliverables
3. DO NOT infer or distribute pricing across deliverables unless explicitly stated
4. DO NOT include recurring/monthly fees unless this invoice represents that billing period

TRANSCRIPTION:
${transcript}

Generate a properly structured invoice in JSON format with the following structure:
{
  "invoice_number": "INV-[generate unique number]",
  "date": "${todayFormatted}",
  "due_date": "${dueDateFormatted}",
  "from": {
    "name": "[Your company name from transcript or 'Your Company']",
    "address": "[Your full address from transcript or '']",
    "phone": "[Your phone from transcript or '']",
    "email": "[Your email from transcript or '']"
  },
  "to": {
    "name": "[Client name from transcript]",
    "address": "[Client full address from transcript - IMPORTANT: extract complete address if mentioned]",
    "phone": "[Client phone from transcript or '']",
    "email": "[Client email from transcript or '']"
  },
  "line_items": [
    {
      "description": "Main Package Name or Service Description",
      "quantity": 1,
      "unit": "package",
      "unit_price": [total price],
      "line_total": [total price],
      "is_header": true
    },
    {
      "description": "Specific Deliverable (only if explicitly priced separately)",
      "quantity": [number],
      "unit": "[unit type]",
      "unit_price": [price per unit],
      "line_total": [quantity * unit_price],
      "is_header": false
    }
  ],
  "subtotal": [sum of all line_totals],
  "total": [subtotal + any fees/taxes if mentioned],
  "notes": "[Payment terms or additional notes from transcript]"
}

CRITICAL RULES:
- Each line_item must have: description, quantity, unit, unit_price, line_total, is_header
- Amounts must be numbers only (no currency symbols, no commas)
- ALWAYS extract addresses when mentioned - look for street, city, state, zip patterns
- Only break down costs if the transcription explicitly mentions individual prices
- If only a total package price is mentioned, create a single line_item for the entire package
`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const invoiceData = JSON.parse(completion.choices[0].message.content);
        
        console.log('[Invoice Alias] Raw GPT response:', JSON.stringify(invoiceData, null, 2));
        
        // Normalize the data - convert line_items to items
        if (invoiceData.line_items && Array.isArray(invoiceData.line_items)) {
            invoiceData.items = invoiceData.line_items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.unit_price) || 0,
                amount: Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.unit_price) || 0))
            }));
            delete invoiceData.line_items;
        } else if (invoiceData.items && Array.isArray(invoiceData.items)) {
            // If GPT already used 'items', normalize it
            invoiceData.items = invoiceData.items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.rate) || Number(item.unit_price) || 0,
                amount: Number(item.amount) || Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.rate) || Number(item.unit_price) || 0))
            }));
        } else {
            invoiceData.items = [];
        }
        
        // Normalize field names
        if (invoiceData.invoice_number && !invoiceData.invoiceNumber) {
            invoiceData.invoiceNumber = invoiceData.invoice_number;
            delete invoiceData.invoice_number;
        }
        
        if (invoiceData.due_date && !invoiceData.dueDate) {
            invoiceData.dueDate = invoiceData.due_date;
            delete invoiceData.due_date;
        }
        
        // Ensure from/to objects exist
        if (!invoiceData.from) {
            invoiceData.from = { name: '', address: '', phone: '', email: '' };
        }
        if (!invoiceData.to) {
            invoiceData.to = { name: '', address: '', phone: '', email: '' };
        }
        
        // Calculate totals
        if (!invoiceData.subtotal && invoiceData.items) {
            invoiceData.subtotal = invoiceData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        }
        
        if (!invoiceData.total) {
            invoiceData.total = invoiceData.subtotal;
        }
        
        if (!invoiceData.tax) {
            invoiceData.tax = 0;
        }
        
        console.log('[Invoice Alias] Normalized data:', JSON.stringify(invoiceData, null, 2));
        
        // Save
        const invoice = await Invoice.create({
            userId,
            originalTranscript: transcript,
            ...invoiceData,
            date: invoiceData.date || todayFormatted,
            dueDate: invoiceData.dueDate || invoiceData.due_date || dueDateFormatted
        });
        
        res.json({ invoiceData: invoice });
    } catch (error) {
        console.error('[Invoice Alias] Error:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

app.post('/api/generate-contract', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const { transcript } = req.body;
        
        console.log('[Contract Alias] Generating contract for user:', userId);
        
        // Forward to the main contract generation logic
        req.body.userId = userId;
        
        // Just call the same logic - simpler than duplicating 820 lines
        // Set url to match the main route and re-process
        const originalUrl = req.url;
        req.url = '/api/contracts/generate';
        
        // Find the route handler
        const layer = app._router.stack.find(layer => 
            layer.route && layer.route.path === '/api/contracts/generate' && layer.route.methods.post
        );
        
        if (layer && layer.route) {
            req.url = originalUrl; // Restore for logging
            return layer.route.stack[0].handle(req, res);
        }
        
        res.status(500).json({ error: 'Route not found' });
    } catch (error) {
        console.error('[Contract Alias] Error:', error);
        res.status(500).json({ error: 'Failed to generate contract' });
    }
});


// ========== AI LEARNING AGENT - THE MAGIC! ==========
/**
 * 🧠 AI LEARNING AGENT
 * 
 * This agent learns about the user's business from EVERY interaction:
 * - Voice transcripts (what they say, how they say it)
 * - Contract data (services offered, pricing structures, client types)
 * - Patterns over time (typical deal sizes, project durations)
 * 
 * The more they use the system, the SMARTER it gets!
 */
async function learnFromContract(userId, transcript, contractData) {
    try {
        console.log('[AI Learning Agent] 🧠 Starting to learn from contract for user:', userId);
        
        const user = await User.findById(userId);
        if (!user) {
            console.log('[AI Learning Agent] User not found');
            return;
        }
        
        // Prepare learning prompt for GPT-4
        const learningPrompt = `You are an AI business intelligence agent. Analyze this contract and voice transcript to extract key business insights about the user's business.

VOICE TRANSCRIPT:
${transcript}

CONTRACT DATA:
- Title: ${contractData.contractTitle}
- Service Provider: ${contractData.parties?.serviceProvider?.name || 'N/A'}
- Client: ${contractData.parties?.client?.name || 'N/A'}
- Sections: ${contractData.sections?.map(s => s.title).join(', ') || 'N/A'}

CURRENT BUSINESS CONTEXT (what we already know):
${JSON.stringify(user.businessContext || {}, null, 2)}

YOUR TASK:
Extract and update the following information. If you can't determine something with high confidence, leave it as null.

Return a JSON object with:
{
    "industry": "string - What industry/sector is this business in? (e.g., 'Digital Marketing Agency', 'SaaS Company', 'IT Consulting')",
    "serviceTypes": ["array", "of", "services"] - What specific services do they offer? Extract from transcript and contract sections,
    "commonClients": ["array", "of", "client", "types"] - What type of clients do they serve? (e.g., 'E-commerce businesses', 'Small businesses'),
    "averageDealSize": number - Estimated average contract value in dollars (extract from payment terms),
    "typicalProjectDuration": "string - How long are typical projects/contracts? (e.g., '3-6 months', 'Ongoing monthly', '1 year')",
    "commonPhrases": ["array", "of", "phrases"] - Extract 3-5 common phrases or terminology the user uses in their transcript,
    "serviceDescriptions": ["array", "of", "descriptions"] - How do they describe their services? Extract natural language descriptions,
    "pricingStructure": "string - What's their pricing model? (e.g., 'Monthly retainer', 'Per-project flat fee', 'Performance-based + retainer', 'Hourly rate')",
    "confidenceScore": number - Rate your confidence in these insights from 0-100
}

IMPORTANT: 
- Be conservative. Only extract what's CLEARLY stated or strongly implied.
- Merge with existing context intelligently (add new items to arrays, don't duplicate)
- If analyzing multiple contracts over time, identify PATTERNS not one-offs
- Focus on insights that help AUTO-FILL future contracts`;

        console.log('[AI Learning Agent] 📡 Calling OpenAI for business intelligence...');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { 
                    role: 'system', 
                    content: 'You are a business intelligence AI that learns about users\' businesses from their contracts and transcripts. Always return valid JSON.' 
                },
                { role: 'user', content: learningPrompt }
            ],
            temperature: 0.3, // Lower temperature for more consistent extraction
            response_format: { type: "json_object" }
        });
        
        const insights = JSON.parse(response.choices[0].message.content);
        console.log('[AI Learning Agent] 🎯 Insights extracted:', insights);
        
        // Merge insights with existing context
        const currentContext = user.businessContext || {};
        
        // Smart merging - add new items, don't duplicate
        const mergeArrays = (existing, newItems) => {
            const combined = [...(existing || []), ...(newItems || [])];
            return [...new Set(combined)].slice(0, 10); // Keep max 10 unique items
        };
        
        const updatedContext = {
            industry: insights.industry || currentContext.industry,
            serviceTypes: mergeArrays(currentContext.serviceTypes, insights.serviceTypes),
            commonClients: mergeArrays(currentContext.commonClients, insights.commonClients),
            averageDealSize: insights.averageDealSize || currentContext.averageDealSize,
            typicalProjectDuration: insights.typicalProjectDuration || currentContext.typicalProjectDuration,
            voicePatterns: {
                commonPhrases: mergeArrays(currentContext.voicePatterns?.commonPhrases, insights.commonPhrases),
                serviceDescriptions: mergeArrays(currentContext.voicePatterns?.serviceDescriptions, insights.serviceDescriptions),
                pricingStructure: insights.pricingStructure || currentContext.voicePatterns?.pricingStructure
            },
            totalContracts: (currentContext.totalContracts || 0) + 1,
            totalInvoices: currentContext.totalInvoices || 0,
            lastUpdated: new Date(),
            confidenceScore: Math.min(
                (currentContext.confidenceScore || 0) + (insights.confidenceScore || 10), 
                100
            ) // Confidence increases with each contract, capped at 100
        };
        
        // Update user's business context
        user.businessContext = updatedContext;
        await user.save();
        
        console.log('[AI Learning Agent] ✅ Business context updated! Confidence:', updatedContext.confidenceScore);
        console.log('[AI Learning Agent] 📊 Learned:', {
            industry: updatedContext.industry,
            serviceCount: updatedContext.serviceTypes?.length || 0,
            totalContracts: updatedContext.totalContracts
        });
        
    } catch (error) {
        console.error('[AI Learning Agent] ❌ Error:', error.message);
        // Don't throw - learning is non-critical
    }
}


// ========== START SERVER ==========
app.listen(PORT, () => {
    console.log(`
======================================
🎉 Voice Invoice Backend Running!
======================================

🌐 Server: http://localhost:${PORT}
📊 Dashboard: http://localhost:${PORT}/dashboard
💚 Health: http://localhost:${PORT}/api/health

✅ Auth routes ready
✅ User routes ready
✅ Invoice routes ready  
✅ Contract routes ready

Memory: ~150MB (reduced from 1.2GB!)

======================================
    `);
});

module.exports = app;
