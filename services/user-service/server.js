require('dotenv').config({ path: '../../.env' });

const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || process.env.USER_SERVICE_PORT || 3002;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('[User Service] MongoDB Connected'))
    .catch(err => console.error('[User Service] MongoDB Error:', err));

// User Model with Business Context
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    businessContext: {
        companyName: String,
        address: String,
        phone: String,
        email: String,
        defaultCurrency: { type: String, default: 'USD' },
        defaultPaymentTerms: String,
        frequentClients: [{
            name: String,
            lastUsed: { type: Date, default: Date.now }
        }],
        commonServices: [{
            description: String,
            rate: Number,
            lastUsed: { type: Date, default: Date.now }
        }]
    },
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Middleware
app.use(cors());
app.use(express.json());

// Auth middleware (validates with auth service)
const authenticate = async (req, res, next) => {
    const userId = req.headers['x-user-id'];
    
    if (!userId) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    req.userId = userId;
    next();
};

// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'user-service', status: 'healthy' });
});

// Get user profile
app.get('/users/:id', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch user' });
    }
});

// Get business context
app.get('/users/:id/business-context', async (req, res) => {
    try {
        const user = await User.findById(req.params.id);
        if (!user) return res.status(404).json({ error: 'User not found' });
        res.json(user.businessContext || {});
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
});

// Update business context
app.put('/users/:id/business-context', async (req, res) => {
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
app.post('/users/:id/frequent-clients', async (req, res) => {
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
app.post('/users/:id/common-services', async (req, res) => {
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
app.delete('/users/:id/frequent-clients/:clientName', async (req, res) => {
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
app.delete('/users/:id/common-services/:description', async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`[User Service] Running on http://localhost:${PORT}`);
});

module.exports = app;
