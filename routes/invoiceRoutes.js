const express = require('express');
const invoiceController = require('../controllers/invoiceController');
const { requireAuth } = require('../middleware/auth');
const { User, Invoice } = require('../models');
const { getOpenAIClient } = require('../utils/openai');

const router = express.Router();

// Core invoice routes
router.post('/api/invoices/generate', invoiceController.generateInvoice);
router.get('/api/invoices/user/:userId', invoiceController.getInvoicesByUser);
router.get('/api/invoices/:id', invoiceController.getInvoice);
router.put('/api/invoices/:id', invoiceController.updateInvoice);
router.delete('/api/invoices/:id', invoiceController.deleteInvoice);
router.get('/api/invoices/:id/pdf', invoiceController.generateInvoicePDF);

// Tier 1 feature routes
router.post('/api/invoices/:id/send-email', invoiceController.sendInvoiceWithEmail);
router.post('/api/invoices/:id/payment-link', invoiceController.createInvoicePaymentLink);
router.put('/api/invoices/:id/payment-status', invoiceController.updatePaymentStatus);
router.post('/api/invoices/:id/recurring/setup', invoiceController.setupRecurring);
router.delete('/api/invoices/:id/recurring/cancel', invoiceController.cancelRecurring);

// Compatibility alias for frontend
router.get('/api/invoices', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const invoices = await Invoice.find({ userId }).sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error('[Invoices Alias] Error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

router.post('/api/generate-invoice', requireAuth, async (req, res) => {
    try {
        const userId = req.user._id;
        const { transcript } = req.body;
        
        const user = await User.findById(userId);
        const businessContext = user ? {
            frequentClients: user.businessContext?.frequentClients || [],
            commonServices: user.businessContext?.commonServices || []
        } : { frequentClients: [], commonServices: [] };
        
        req.body.userId = userId;
        req.body.businessContext = businessContext;
        
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateFormatted = dueDate.toISOString().split('T')[0];
        
        console.log('[Invoice Alias] Generating invoice for user:', userId);
        
        const openai = getOpenAIClient();
        
        const prompt = `You are a STRICT extractor that creates invoices from transcriptions. Use ONLY facts explicitly present in the inputs.

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
- If only a total package price is mentioned, create a single line_item for the entire package`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const invoiceData = JSON.parse(completion.choices[0].message.content);
        
        console.log('[Invoice Alias] Raw GPT response:', JSON.stringify(invoiceData, null, 2));
        
        // Normalize data
        if (invoiceData.line_items && Array.isArray(invoiceData.line_items)) {
            invoiceData.items = invoiceData.line_items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.unit_price) || 0,
                amount: Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.unit_price) || 0))
            }));
            delete invoiceData.line_items;
        } else if (invoiceData.items && Array.isArray(invoiceData.items)) {
            invoiceData.items = invoiceData.items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.rate) || Number(item.unit_price) || 0,
                amount: Number(item.amount) || Number(item.line_total) || ((Number(item.quantity) || 1) * (Number(item.rate) || Number(item.unit_price) || 0))
            }));
        } else {
            invoiceData.items = [];
        }
        
        if (invoiceData.invoice_number && !invoiceData.invoiceNumber) {
            invoiceData.invoiceNumber = invoiceData.invoice_number;
            delete invoiceData.invoice_number;
        }
        
        if (invoiceData.due_date && !invoiceData.dueDate) {
            invoiceData.dueDate = invoiceData.due_date;
            delete invoiceData.due_date;
        }
        
        if (!invoiceData.from) {
            invoiceData.from = { name: '', address: '', phone: '', email: '' };
        }
        if (!invoiceData.to) {
            invoiceData.to = { name: '', address: '', phone: '', email: '' };
        }
        
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

module.exports = router;
