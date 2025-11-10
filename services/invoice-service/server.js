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

// Update invoice
app.put('/invoices/:id', async (req, res) => {
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

app.listen(PORT, () => {
    console.log(`[Invoice Service] Running on http://localhost:${PORT}`);
});

module.exports = app;
