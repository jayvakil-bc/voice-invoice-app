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

// Success pages (after Stripe payment)
app.get('/invoice-success', (req, res) => {
    res.send(`
        <!DOCTYPE html>
        <html>
        <head>
            <title>Payment Successful</title>
            <style>
                body {
                    font-family: Arial, sans-serif;
                    display: flex;
                    justify-content: center;
                    align-items: center;
                    min-height: 100vh;
                    margin: 0;
                    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
                }
                .success-container {
                    background: white;
                    padding: 40px;
                    border-radius: 12px;
                    box-shadow: 0 10px 40px rgba(0,0,0,0.2);
                    text-align: center;
                    max-width: 500px;
                }
                .success-icon {
                    font-size: 64px;
                    margin-bottom: 20px;
                }
                h1 {
                    color: #10b981;
                    margin: 0 0 10px 0;
                }
                p {
                    color: #6b7280;
                    line-height: 1.6;
                }
                .btn {
                    display: inline-block;
                    margin-top: 20px;
                    padding: 12px 30px;
                    background: #667eea;
                    color: white;
                    text-decoration: none;
                    border-radius: 6px;
                    font-weight: bold;
                }
                .btn:hover {
                    background: #5568d3;
                }
            </style>
        </head>
        <body>
            <div class="success-container">
                <div class="success-icon">✅</div>
                <h1>Payment Successful!</h1>
                <p>Thank you for your payment. Your invoice has been marked as paid.</p>
                <p style="font-size: 14px; color: #9ca3af;">Invoice: ${req.query.invoice || 'N/A'}</p>
                <p style="font-size: 14px; color: #9ca3af;">A confirmation email has been sent to the invoice owner.</p>
                <a href="/" class="btn">Return to Home</a>
            </div>
        </body>
        </html>
    `);
});

// API routes
app.use(routes.authRoutes);
app.use(routes.transcriptionRoutes);
app.use(routes.invoiceRoutes);
app.use(routes.contractRoutes);
app.use('/api/analytics', routes.analyticsRoutes);
app.use('/api/stripe', routes.stripeRoutes);

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
