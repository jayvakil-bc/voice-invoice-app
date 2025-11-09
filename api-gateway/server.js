require('dotenv').config({ path: '../.env' });

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const cors = require('cors');
const path = require('path');
const axios = require('axios');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
const PORT = process.env.PORT || 3000;

// Service URLs
const AUTH_SERVICE = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';
const USER_SERVICE = process.env.USER_SERVICE_URL || 'http://localhost:3002';
const INVOICE_SERVICE = process.env.INVOICE_SERVICE_URL || 'http://localhost:3003';

// Middleware
// Trust proxy for correct secure cookies behind Nginx/ALB in production
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// Session (shared with auth service) - only if MongoDB is configured
if (process.env.MONGODB_URI) {
    app.use(session({
        secret: process.env.SESSION_SECRET || 'auth-secret',
        resave: false,
        saveUninitialized: false,
        store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
        cookie: {
            maxAge: 1000 * 60 * 60 * 24 * 7,
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
            domain: process.env.NODE_ENV === 'production' 
                ? process.env.CLIENT_URL?.replace(/https?:\/\//, '') 
                : 'localhost'
        }
    }));
} else {
    console.warn('[Gateway] No MongoDB URI - sessions won\'t be shared');
}

// Serve static files
app.use(express.static(path.join(__dirname, '..', 'public'), { index: false }));

console.log('[API Gateway] Starting on port', PORT);
console.log('[API Gateway] Services:');
console.log('  - Auth:', AUTH_SERVICE);
console.log('  - User:', USER_SERVICE);
console.log('  - Invoice:', INVOICE_SERVICE);

// Proxy all /auth/* routes to the auth-service so OAuth happens on a single public domain
app.use('/auth', createProxyMiddleware({
    target: AUTH_SERVICE,
    changeOrigin: true,
    xfwd: true,
    cookieDomainRewrite: "",
    pathRewrite: { '^/auth': '/auth' }
}));

// Health check
app.get('/api/health', async (req, res) => {
    try {
        const [auth, user, invoice] = await Promise.all([
            axios.get(`${AUTH_SERVICE}/health`).catch(e => ({ data: { status: 'unhealthy' } })),
            axios.get(`${USER_SERVICE}/health`).catch(e => ({ data: { status: 'unhealthy' } })),
            axios.get(`${INVOICE_SERVICE}/health`).catch(e => ({ data: { status: 'unhealthy' } }))
        ]);
        
        res.json({
            gateway: 'healthy',
            services: {
                auth: auth.data.status,
                user: user.data.status,
                invoice: invoice.data.status
            }
        });
    } catch (error) {
        res.status(500).json({ error: 'Health check failed' });
    }
});

// ===== AUTH ROUTES (proxy to auth-service) =====
app.get('/auth/google', (req, res) => {
    // Use dynamic AUTH_SERVICE URL so Render exposed URL works
    res.redirect(`${AUTH_SERVICE.replace(/\/$/, '')}/auth/google`);
});

app.get('/auth/google/callback', (req, res) => {
    // In most flows auth-service handles callback and redirects to CLIENT_URL
    res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/dashboard');
});

app.get('/auth/logout', async (req, res) => {
    try {
        await axios.get(`${AUTH_SERVICE}/auth/logout`, {
            headers: { Cookie: req.headers.cookie }
        });
        res.redirect('/');
    } catch (error) {
        res.redirect('/');
    }
});

app.get('/auth/user', async (req, res) => {
    try {
        const response = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        res.json(response.data);
    } catch (error) {
        res.status(401).json({ authenticated: false });
    }
});

// ===== PAGE ROUTES =====
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'login.html'));
});

app.get('/dashboard', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'dashboard.html'));
});

app.get('/create', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'index.html'));
});

app.get('/settings', (req, res) => {
    res.sendFile(path.join(__dirname, '..', 'public', 'settings.html'));
});

// ===== USER SERVICE ROUTES =====
app.get('/api/business-context', async (req, res) => {
    try {
        // Get user from auth service
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        // Get business context from user service
        const response = await axios.get(`${USER_SERVICE}/users/${userId}/business-context`);
        res.json(response.data);
    } catch (error) {
        console.error('[Gateway] Business context error:', error.message);
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
});

app.put('/api/business-context', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        const response = await axios.put(`${USER_SERVICE}/users/${userId}/business-context`, req.body);
        res.json(response.data);
    } catch (error) {
        console.error('[Gateway] Update business context error:', error.message);
        res.status(500).json({ error: 'Failed to update business context' });
    }
});

app.delete('/api/business-context/clients/:clientName', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        await axios.delete(`${USER_SERVICE}/users/${userId}/frequent-clients/${req.params.clientName}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove client' });
    }
});

app.delete('/api/business-context/services/:description', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        await axios.delete(`${USER_SERVICE}/users/${userId}/common-services/${req.params.description}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to remove service' });
    }
});

// ===== INVOICE SERVICE ROUTES =====
app.post('/api/generate-invoice', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        // Get business context
        const businessContextResponse = await axios.get(`${USER_SERVICE}/users/${userId}/business-context`);
        const businessContext = businessContextResponse.data;
        
        // Generate invoice
        const response = await axios.post(`${INVOICE_SERVICE}/invoices/generate`, {
            transcript: req.body.transcript,
            userId,
            businessContext
        });
        
        const { invoiceData } = response.data;
        
        // Update business context with client and services
        if (invoiceData.to && invoiceData.to.name) {
            await axios.post(`${USER_SERVICE}/users/${userId}/frequent-clients`, {
                clientName: invoiceData.to.name
            });
        }
        
        if (invoiceData.items && invoiceData.items.length > 0) {
            for (const item of invoiceData.items) {
                await axios.post(`${USER_SERVICE}/users/${userId}/common-services`, {
                    description: item.description,
                    rate: item.rate
                });
            }
        }
        
        res.json(response.data);
    } catch (error) {
        console.error('[Gateway] Generate invoice error:', error.message);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
});

app.get('/api/invoices', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        
        const response = await axios.get(`${INVOICE_SERVICE}/invoices/user/${userId}`);
        res.json(response.data);
    } catch (error) {
        console.error('[Gateway] Fetch invoices error:', error.message);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

app.get('/api/invoices/:id', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const response = await axios.get(`${INVOICE_SERVICE}/invoices/${req.params.id}`);
        res.json(response.data);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

app.put('/api/invoices/:id/regenerate', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        const userId = authResponse.data.user.id;
        const businessContextResponse = await axios.get(`${USER_SERVICE}/users/${userId}/business-context`);
        
        const response = await axios.put(`${INVOICE_SERVICE}/invoices/${req.params.id}/regenerate`, {
            transcript: req.body.transcript,
            businessContext: businessContextResponse.data
        });
        
        res.json(response.data);
    } catch (error) {
        console.error('[Gateway] Regenerate error:', error.message);
        res.status(500).json({ error: 'Failed to regenerate invoice' });
    }
});

app.delete('/api/invoices/:id', async (req, res) => {
    try {
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        await axios.delete(`${INVOICE_SERVICE}/invoices/${req.params.id}`);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

app.get('/api/invoices/:id/download', async (req, res) => {
    try {
        console.log('[Gateway] PDF download request for invoice:', req.params.id);
        console.log('[Gateway] Cookie header:', req.headers.cookie ? 'Present' : 'Missing');
        
        const authResponse = await axios.get(`${AUTH_SERVICE}/auth/user`, {
            headers: { Cookie: req.headers.cookie }
        });
        
        console.log('[Gateway] Auth check:', authResponse.data.authenticated ? 'Authenticated' : 'Not authenticated');
        
        if (!authResponse.data.authenticated) {
            return res.status(401).json({ error: 'Not authenticated' });
        }
        
        console.log('[Gateway] Fetching PDF from invoice service...');
        const response = await axios.get(`${INVOICE_SERVICE}/invoices/${req.params.id}/pdf`, {
            responseType: 'stream',
            headers: { 'Accept': 'application/pdf' }
        });
        
        console.log('[Gateway] PDF stream received, piping to response');
        
        // Set headers before piping
        res.setHeader('Content-Type', 'application/pdf');
        if (response.headers['content-disposition']) {
            res.setHeader('Content-Disposition', response.headers['content-disposition']);
        }
        
        // Handle stream errors
        response.data.on('error', (err) => {
            console.error('[Gateway] Stream error:', err);
            if (!res.headersSent) {
                res.status(500).json({ error: 'Failed to download invoice' });
            }
        });
        
        response.data.on('end', () => {
            console.log('[Gateway] PDF stream completed');
        });
        
        response.data.pipe(res);
    } catch (error) {
        console.error('[Gateway] Download error:', error.message);
        if (error.response) {
            console.error('[Gateway] Error response status:', error.response.status);
            console.error('[Gateway] Error response data:', error.response.data);
        }
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to download invoice' });
        }
    }
});

app.listen(PORT, () => {
    console.log(`[API Gateway] Running on http://localhost:${PORT}`);
});

module.exports = app;
