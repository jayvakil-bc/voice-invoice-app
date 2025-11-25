require('dotenv').config({ path: '.env' });

const express = require('express');
const mongoose = require('mongoose');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const cors = require('cors');

const configurePassport = require('./config/passport');
const { errorHandler, notFoundHandler } = require('./middleware/errorHandler');
const { requireAuth } = require('./middleware/auth');
const routes = require('./routes');
const { startRecurringInvoiceCron } = require('./utils/recurringService');
const { testEmailConfig } = require('./utils/emailService');
const { testStripeConfig } = require('./utils/paymentService');

const app = express();
const PORT = process.env.PORT || 3000;

console.log('🚀 Starting Voice Invoice Backend...');
console.log('📦 Refactored Architecture - Clean & Maintainable');

// ========== DATABASE CONNECTION ==========
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ MongoDB Connected'))
    .catch(err => {
        console.error('❌ MongoDB Error:', err);
        process.exit(1);
    });

// ========== PASSPORT CONFIGURATION ==========
configurePassport();

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

// ========== ROUTES ==========
// Page routes (protected)
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

// API routes
app.use(routes.authRoutes);
app.use(routes.transcriptionRoutes);
app.use(routes.invoiceRoutes);
app.use(routes.contractRoutes);
app.use('/api/analytics', routes.analyticsRoutes);

// Business context compatibility route
app.get('/api/business-context', requireAuth, async (req, res) => {
    try {
        const { User } = require('./models');
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

app.put('/api/business-context', requireAuth, async (req, res) => {
    try {
        const { User } = require('./models');
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

// ========== ERROR HANDLING ==========
app.use(notFoundHandler);
app.use(errorHandler);

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
✅ Transcription routes ready
✅ Invoice routes ready  
✅ Contract routes ready
✅ Analytics routes ready

📁 Clean Architecture:
   - Models in /models
   - Controllers in /controllers
   - Routes in /routes
   - Middleware in /middleware
   - Utils in /utils

======================================
    `);

    // Start recurring invoice cron job
    startRecurringInvoiceCron();
    
    // Test integrations
    console.log('\n🔍 Testing Tier 1 Integrations...');
    testEmailConfig();
    testStripeConfig();
    console.log('');
});

module.exports = app;
