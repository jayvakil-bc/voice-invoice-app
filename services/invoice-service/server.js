require('dotenv').config({ path: '../../.env' });

const express = require('express');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || process.env.INVOICE_SERVICE_PORT || 3003;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('[Invoice Service] MongoDB Connected'))
    .catch(err => console.error('[Invoice Service] MongoDB Error:', err));

// Invoice Model
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

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'invoice-service', status: 'healthy' });
});

// Generate invoice
app.post('/invoices/generate', async (req, res) => {
    try {
        const { transcript, userId, businessContext } = req.body;
        
        console.log('[Invoice Service] Generating invoice for user:', userId);
        
        // Create prompt for OpenAI
        let prompt = `You are an AI that extracts invoice information from voice/text input. Extract the following in JSON format:
{
  "invoiceNumber": "string (generate if not mentioned, format: INV-YYYY-001)",
  "date": "YYYY-MM-DD (today's date)",
  "dueDate": "YYYY-MM-DD (30 days from today if not mentioned)",
  "from": {
    "name": "sender company/person",
    "address": "sender address",
    "phone": "sender phone",
    "email": "sender email"
  },
  "to": {
    "name": "client name",
    "address": "client address",
    "phone": "client phone (if mentioned)",
    "email": "client email (if mentioned)"
  },
  "items": [
    {
      "description": "service/product description",
      "quantity": number,
      "rate": number,
      "amount": number (quantity * rate)
    }
  ],
  "notes": "any additional notes or payment terms"
}

`;

        if (businessContext && Object.keys(businessContext).length > 0) {
            prompt += `\nUse this business information when extracting "from" details:\n`;
            if (businessContext.companyName) prompt += `Company: ${businessContext.companyName}\n`;
            if (businessContext.address) prompt += `Address: ${businessContext.address}\n`;
            if (businessContext.phone) prompt += `Phone: ${businessContext.phone}\n`;
            if (businessContext.email) prompt += `Email: ${businessContext.email}\n`;
        }

        prompt += `\nInput: ${transcript}`;

        const completion = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [{ role: 'user', content: prompt }],
            response_format: { type: 'json_object' }
        });

        const invoiceData = JSON.parse(completion.choices[0].message.content);
        
        // Validate and normalize items data
        if (invoiceData.items && Array.isArray(invoiceData.items)) {
            invoiceData.items = invoiceData.items.map(item => ({
                description: item.description || 'Service',
                quantity: Number(item.quantity) || 1,
                rate: Number(item.rate) || 0,
                amount: (Number(item.quantity) || 1) * (Number(item.rate) || 0)
            }));
        } else {
            invoiceData.items = [];
        }
        
        // Calculate totals
        let subtotal = 0;
        invoiceData.items.forEach(item => {
            subtotal += item.amount;
        });
        
        invoiceData.subtotal = subtotal;
        invoiceData.tax = subtotal * 0.1; // 10% tax
        invoiceData.total = subtotal + invoiceData.tax;
        
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
app.get('/invoices/user/:userId', async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error('[Invoice Service] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
});

// Get single invoice
app.get('/invoices/:id', async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
});

// Regenerate invoice
app.put('/invoices/:id/regenerate', async (req, res) => {
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
app.delete('/invoices/:id', async (req, res) => {
    try {
        await Invoice.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
});

// Generate PDF
app.get('/invoices/:id/pdf', async (req, res) => {
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
        
        const doc = new PDFDocument({ margin: 50 });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
        
        doc.pipe(res);
        
        // Header
        doc.fontSize(24).font('Helvetica-Bold').text('INVOICE', { align: 'center' });
        doc.moveDown();
        
        // Invoice details
        doc.fontSize(10).font('Helvetica');
        doc.text(`Invoice #: ${invoice.invoiceNumber}`, 50, 100);
        doc.text(`Date: ${invoice.date}`, 50, 115);
        doc.text(`Due Date: ${invoice.dueDate}`, 50, 130);
        
        // From section
        let yPos = 180;
        doc.fontSize(12).font('Helvetica-Bold').text('From:', 50, yPos);
        doc.fontSize(10).font('Helvetica');
        if (invoice.from.name) doc.text(invoice.from.name, 50, yPos + 15);
        if (invoice.from.address) doc.text(invoice.from.address, 50, yPos + 30);
        if (invoice.from.phone) doc.text(invoice.from.phone, 50, yPos + 45);
        if (invoice.from.email) doc.text(invoice.from.email, 50, yPos + 60);
        
        // To section
        doc.fontSize(12).font('Helvetica-Bold').text('Bill To:', 300, yPos);
        doc.fontSize(10).font('Helvetica');
        if (invoice.to.name) doc.text(invoice.to.name, 300, yPos + 15);
        if (invoice.to.address) doc.text(invoice.to.address, 300, yPos + 30);
        if (invoice.to.phone) doc.text(invoice.to.phone, 300, yPos + 45);
        if (invoice.to.email) doc.text(invoice.to.email, 300, yPos + 60);
        
        // Items table
        yPos = 320;
        doc.fontSize(10).font('Helvetica-Bold');
        doc.text('Description', 50, yPos);
        doc.text('Qty', 300, yPos);
        doc.text('Rate', 350, yPos);
        doc.text('Amount', 450, yPos);
        
        doc.moveTo(50, yPos + 15).lineTo(550, yPos + 15).stroke();
        
        yPos += 25;
        doc.font('Helvetica');
        
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => {
                doc.text(item.description || '', 50, yPos, { width: 240 });
                doc.text((item.quantity || 0).toString(), 300, yPos);
                doc.text(`$${(item.rate || 0).toFixed(2)}`, 350, yPos);
                doc.text(`$${(item.amount || 0).toFixed(2)}`, 450, yPos);
                yPos += 20;
            });
        }
        
        // Totals
        yPos += 20;
        doc.moveTo(50, yPos).lineTo(550, yPos).stroke();
        yPos += 15;
        
        doc.text('Subtotal:', 350, yPos);
        doc.text(`$${(invoice.subtotal || 0).toFixed(2)}`, 450, yPos);
        yPos += 20;
        
        doc.text('Tax (10%):', 350, yPos);
        doc.text(`$${(invoice.tax || 0).toFixed(2)}`, 450, yPos);
        yPos += 20;
        
        doc.fontSize(12).font('Helvetica-Bold');
        doc.text('Total:', 350, yPos);
        doc.text(`$${(invoice.total || 0).toFixed(2)}`, 450, yPos);
        
        // Notes
        if (invoice.notes) {
            yPos += 50;
            doc.fontSize(10).fillColor('#666').font('Helvetica')
               .text('Notes:', 50, yPos)
               .text(invoice.notes, 50, yPos + 15, { width: 500 });
        }
        
        // Footer
        doc.fontSize(8).fillColor('#999')
           .text('Thank you for your business!', 50, 720, { align: 'center' });
        
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

app.listen(PORT, () => {
    console.log(`[Invoice Service] Running on http://localhost:${PORT}`);
});

module.exports = app;
