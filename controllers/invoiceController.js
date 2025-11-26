const { Invoice } = require('../models');
const { getOpenAIClient } = require('../utils/openai');
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { sendInvoiceEmail } = require('../utils/emailService');
const { createPaymentLink } = require('../utils/paymentService');
const { setupRecurringInvoice, cancelRecurringInvoice } = require('../utils/recurringService');
const { saveInvoiceToDrive, hasDriveAccess } = require('../utils/driveService');

const generateInvoice = async (req, res) => {
    try {
        const { transcript, userId, businessContext } = req.body;
        
        console.log('[Invoice] Generating invoice for user:', userId);
        
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        const dueDate = new Date(today);
        dueDate.setDate(dueDate.getDate() + 30);
        const dueDateFormatted = dueDate.toISOString().split('T')[0];
        
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
        
        if (!invoiceData.from) invoiceData.from = { name: '', address: '', phone: '', email: '' };
        if (!invoiceData.to) invoiceData.to = { name: '', address: '', phone: '', email: '' };
        
        if (!invoiceData.date || invoiceData.date === '' || invoiceData.date === 'YYYY-MM-DD') {
            invoiceData.date = todayFormatted;
        }
        if (!invoiceData.dueDate || invoiceData.dueDate === '' || invoiceData.dueDate === 'YYYY-MM-DD') {
            invoiceData.dueDate = dueDateFormatted;
        }
        
        if (!invoiceData.subtotal) {
            invoiceData.subtotal = invoiceData.items.reduce((sum, item) => sum + (item.amount || 0), 0);
        }
        
        if (!invoiceData.total) invoiceData.total = invoiceData.subtotal;
        if (!invoiceData.tax) invoiceData.tax = 0;
        
        const invoice = await Invoice.create({
            userId,
            originalTranscript: transcript,
            ...invoiceData
        });
        
        console.log('[Invoice] Invoice created:', invoice._id);
        
        res.json({ invoiceId: invoice._id, invoiceData });
        
    } catch (error) {
        console.error('[Invoice] Generation error:', error);
        res.status(500).json({ error: 'Failed to generate invoice' });
    }
};

const getInvoicesByUser = async (req, res) => {
    try {
        const invoices = await Invoice.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(invoices);
    } catch (error) {
        console.error('[Invoice] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch invoices' });
    }
};

const getInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        res.json(invoice);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch invoice' });
    }
};

const updateInvoice = async (req, res) => {
    try {
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) return res.status(404).json({ error: 'Invoice not found' });
        
        Object.assign(invoice, req.body);
        await invoice.save();
        
        res.json(invoice);
    } catch (error) {
        console.error('[Invoice] Update error:', error);
        res.status(500).json({ error: 'Failed to update invoice' });
    }
};

const deleteInvoice = async (req, res) => {
    try {
        await Invoice.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete invoice' });
    }
};

const generateInvoicePDF = async (req, res) => {
    try {
        console.log('[Invoice] Generating PDF for invoice:', req.params.id);
        const invoice = await Invoice.findById(req.params.id);
        if (!invoice) {
            console.log('[Invoice] Invoice not found:', req.params.id);
            return res.status(404).json({ error: 'Invoice not found' });
        }
        
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename=invoice-${invoice.invoiceNumber}.pdf`);
        
        doc.pipe(res);
        
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        const lightGray = '#999999';
        
        // Header
        doc.rect(0, 0, 612, 120).fill(brandColor);
        doc.fontSize(32).font('Helvetica-Bold').fillColor('white').text('INVOICE', 50, 40);
        doc.fontSize(11).font('Helvetica').fillColor('white')
           .text(`Invoice #: ${invoice.invoiceNumber}`, 380, 45)
           .text(`Date: ${invoice.date}`, 380, 62)
           .text(`Due Date: ${invoice.dueDate}`, 380, 79);
        
        let yPos = 160;
        
        // From section
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('FROM', 50, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.from.name) doc.text(invoice.from.name, 50, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.from.address) {
            const addressLines = doc.splitTextToFit(invoice.from.address, 220);
            addressLines.forEach(line => {
                doc.text(line, 50, yPos);
                yPos += 14;
            });
        }
        if (invoice.from.phone) { doc.text(invoice.from.phone, 50, yPos); yPos += 14; }
        if (invoice.from.email) doc.text(invoice.from.email, 50, yPos);
        
        // To section
        yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('BILL TO', 320, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.to.name) doc.text(invoice.to.name, 320, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.to.address) {
            const addressLines = doc.splitTextToFit(invoice.to.address, 220);
            addressLines.forEach(line => {
                doc.text(line, 320, yPos);
                yPos += 14;
            });
        }
        if (invoice.to.phone) { doc.text(invoice.to.phone, 320, yPos); yPos += 14; }
        if (invoice.to.email) doc.text(invoice.to.email, 320, yPos);
        
        // Items table
        yPos = 340;
        doc.rect(50, yPos - 5, 512, 25).fill('#f5f7fa');
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray);
        doc.text('Description', 60, yPos + 5);
        doc.text('Qty', 360, yPos + 5, { width: 40, align: 'center' });
        doc.text('Unit Price', 410, yPos + 5, { width: 70, align: 'right' });
        doc.text('Amount', 490, yPos + 5, { width: 62, align: 'right' });
        yPos += 30;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        
        doc.font('Helvetica').fillColor(darkGray);
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => {
                if (yPos > 680) { doc.addPage(); yPos = 50; }
                const descHeight = doc.heightOfString(item.description || '', { width: 290 });
                doc.fontSize(10).text(item.description || '', 60, yPos, { width: 290 });
                doc.text((item.quantity || 0).toString(), 360, yPos, { width: 40, align: 'center' });
                doc.text(`$${(item.rate || 0).toFixed(2)}`, 410, yPos, { width: 70, align: 'right' });
                doc.text(`$${(item.amount || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
                yPos += Math.max(descHeight, 15) + 10;
            });
        }
        
        yPos += 10;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(380, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        
        // Totals
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray)
           .text('Subtotal:', 410, yPos, { width: 70, align: 'right' })
           .text(`$${(invoice.subtotal || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
        yPos += 20;
        
        if (invoice.tax && invoice.tax > 0) {
            doc.text('Tax:', 410, yPos, { width: 70, align: 'right' })
               .text(`$${invoice.tax.toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
            yPos += 20;
        }
        
        doc.rect(380, yPos - 5, 182, 30).fill(brandColor);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('white')
           .text('TOTAL:', 410, yPos + 5, { width: 70, align: 'right' })
           .text(`$${(invoice.total || 0).toFixed(2)}`, 490, yPos + 5, { width: 62, align: 'right' });
        yPos += 45;
        
        // Notes
        if (invoice.notes) {
            yPos += 10;
            doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Payment Terms & Notes:', 50, yPos);
            yPos += 18;
            doc.fontSize(9).font('Helvetica').fillColor(mediumGray).text(invoice.notes, 50, yPos, { width: 512, align: 'left' });
        }
        
        // Footer
        doc.fontSize(9).fillColor(lightGray).text('Thank you for your business!', 50, 750, { width: 512, align: 'center' });
        
        doc.end();
        console.log('[Invoice] PDF generation completed');
        
    } catch (error) {
        console.error('[Invoice] PDF error:', error);
        if (!res.headersSent) {
            res.status(500).json({ error: 'Failed to generate PDF' });
        }
    }
};

// Send invoice via email with PDF attachment
const sendInvoiceWithEmail = async (req, res) => {
    try {
        const { id } = req.params;
        const { recipientEmail, includePaymentLink } = req.body;

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Generate PDF to temp file
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const pdfPath = path.join(tempDir, `invoice-${invoice.invoiceNumber}-${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(writeStream);

        // Generate PDF (reuse logic from generateInvoicePDF)
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        const lightGray = '#999999';
        
        doc.rect(0, 0, 612, 120).fill(brandColor);
        doc.fontSize(32).font('Helvetica-Bold').fillColor('white').text('INVOICE', 50, 40);
        doc.fontSize(11).font('Helvetica').fillColor('white')
           .text(`Invoice #: ${invoice.invoiceNumber}`, 380, 45)
           .text(`Date: ${invoice.date}`, 380, 62)
           .text(`Due Date: ${invoice.dueDate}`, 380, 79);
        
        let yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('FROM', 50, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.from.name) doc.text(invoice.from.name, 50, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.from.address) {
            const addressLines = doc.splitTextToFit(invoice.from.address, 220);
            addressLines.forEach(line => { doc.text(line, 50, yPos); yPos += 14; });
        }
        if (invoice.from.phone) { doc.text(invoice.from.phone, 50, yPos); yPos += 14; }
        if (invoice.from.email) doc.text(invoice.from.email, 50, yPos);
        
        yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('BILL TO', 320, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.to.name) doc.text(invoice.to.name, 320, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.to.address) {
            const addressLines = doc.splitTextToFit(invoice.to.address, 220);
            addressLines.forEach(line => { doc.text(line, 320, yPos); yPos += 14; });
        }
        if (invoice.to.phone) { doc.text(invoice.to.phone, 320, yPos); yPos += 14; }
        if (invoice.to.email) doc.text(invoice.to.email, 320, yPos);
        
        yPos = 340;
        doc.rect(50, yPos - 5, 512, 25).fill('#f5f7fa');
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray);
        doc.text('Description', 60, yPos + 5);
        doc.text('Qty', 360, yPos + 5, { width: 40, align: 'center' });
        doc.text('Unit Price', 410, yPos + 5, { width: 70, align: 'right' });
        doc.text('Amount', 490, yPos + 5, { width: 62, align: 'right' });
        yPos += 30;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        
        doc.font('Helvetica').fillColor(darkGray);
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => {
                if (yPos > 680) { doc.addPage(); yPos = 50; }
                const descHeight = doc.heightOfString(item.description || '', { width: 290 });
                const currency = invoice.currency || 'USD';
                const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
                doc.fontSize(10).text(item.description || '', 60, yPos, { width: 290 });
                doc.text((item.quantity || 0).toString(), 360, yPos, { width: 40, align: 'center' });
                doc.text(`${symbol}${(item.rate || 0).toFixed(2)}`, 410, yPos, { width: 70, align: 'right' });
                doc.text(`${symbol}${(item.amount || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
                yPos += Math.max(descHeight, 15) + 10;
            });
        }
        
        yPos += 10;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(380, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        
        const currency = invoice.currency || 'USD';
        const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
        
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray)
           .text('Subtotal:', 410, yPos, { width: 70, align: 'right' })
           .text(`${symbol}${(invoice.subtotal || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
        yPos += 20;
        
        if (invoice.tax && invoice.tax > 0) {
            doc.text('Tax:', 410, yPos, { width: 70, align: 'right' })
               .text(`${symbol}${invoice.tax.toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
            yPos += 20;
        }
        
        doc.rect(380, yPos - 5, 182, 30).fill(brandColor);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('white')
           .text('TOTAL:', 410, yPos + 5, { width: 70, align: 'right' })
           .text(`${symbol}${(invoice.total || 0).toFixed(2)}`, 490, yPos + 5, { width: 62, align: 'right' });
        yPos += 45;
        
        if (invoice.notes) {
            yPos += 10;
            doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('Payment Terms & Notes:', 50, yPos);
            yPos += 18;
            doc.fontSize(9).font('Helvetica').fillColor(mediumGray).text(invoice.notes, 50, yPos, { width: 512, align: 'left' });
        }
        
        doc.fontSize(9).fillColor(lightGray).text('Thank you for your business!', 50, 750, { width: 512, align: 'center' });
        doc.end();

        // Wait for PDF to finish writing
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Optionally create payment link
        let paymentLink = null;
        if (includePaymentLink) {
            try {
                paymentLink = await createPaymentLink(invoice);
                invoice.paymentLink = paymentLink;
                await invoice.save();
            } catch (error) {
                console.warn('⚠️  Could not create payment link:', error.message);
            }
        }

        // Send email
        const emailResult = await sendInvoiceEmail({
            to: recipientEmail,
            invoice,
            pdfPath,
            paymentLink
        });

        // Cleanup temp file
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (err) {
                console.error('Error cleaning up temp PDF:', err);
            }
        }, 5000);

        res.json({
            success: true,
            messageId: emailResult.messageId,
            paymentLink: paymentLink
        });

    } catch (error) {
        console.error('[Invoice] Email send error:', error);
        res.status(500).json({ error: error.message || 'Failed to send invoice email' });
    }
};

// Create Stripe payment link for invoice
const createInvoicePaymentLink = async (req, res) => {
    try {
        const { id } = req.params;
        
        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Get user's Stripe Connect account
        const User = require('../models/User');
        const user = await User.findById(req.user.id);
        
        if (!user.stripeAccountId || !user.stripeOnboarded) {
            return res.status(400).json({ 
                error: 'Please connect your Stripe account in Settings before creating payment links.',
                needsStripeSetup: true
            });
        }

        const paymentLink = await createPaymentLink(invoice, user.stripeAccountId);
        
        invoice.paymentLink = paymentLink;
        await invoice.save();

        res.json({
            success: true,
            paymentLink,
            invoiceId: invoice._id
        });

    } catch (error) {
        console.error('[Invoice] Payment link error:', error);
        res.status(500).json({ error: error.message || 'Failed to create payment link' });
    }
};

// Update payment status (called by Stripe webhook or manually)
const updatePaymentStatus = async (req, res) => {
    try {
        const { id } = req.params;
        const { status, paymentDate, stripePaymentId } = req.body;

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        invoice.paymentStatus = status;
        if (paymentDate) invoice.paymentDate = paymentDate;
        if (stripePaymentId) invoice.stripePaymentId = stripePaymentId;

        await invoice.save();

        res.json({
            success: true,
            invoice
        });

    } catch (error) {
        console.error('[Invoice] Payment status update error:', error);
        res.status(500).json({ error: 'Failed to update payment status' });
    }
};

// Setup recurring schedule for invoice
const setupRecurring = async (req, res) => {
    try {
        const { id } = req.params;
        const { frequency, endDate } = req.body;

        if (!['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly'].includes(frequency)) {
            return res.status(400).json({ error: 'Invalid frequency' });
        }

        const invoice = await setupRecurringInvoice(id, { frequency, endDate });

        res.json({
            success: true,
            invoice
        });

    } catch (error) {
        console.error('[Invoice] Setup recurring error:', error);
        res.status(500).json({ error: error.message || 'Failed to setup recurring invoice' });
    }
};

// Cancel recurring schedule
const cancelRecurring = async (req, res) => {
    try {
        const { id } = req.params;

        const invoice = await cancelRecurringInvoice(id);

        res.json({
            success: true,
            invoice
        });

    } catch (error) {
        console.error('[Invoice] Cancel recurring error:', error);
        res.status(500).json({ error: error.message || 'Failed to cancel recurring invoice' });
    }
};

// Save invoice to Google Drive
const saveToGoogleDrive = async (req, res) => {
    try {
        const { id } = req.params;
        const user = req.user;

        // Check if user has Drive access
        if (!hasDriveAccess(user)) {
            return res.status(403).json({ 
                error: 'Google Drive access not available. Please re-login to grant permissions.' 
            });
        }

        const invoice = await Invoice.findById(id);
        if (!invoice) {
            return res.status(404).json({ error: 'Invoice not found' });
        }

        // Generate PDF to temp file
        const tempDir = path.join(__dirname, '../uploads/temp');
        if (!fs.existsSync(tempDir)) {
            fs.mkdirSync(tempDir, { recursive: true });
        }
        
        const pdfPath = path.join(tempDir, `invoice-${invoice.invoiceNumber}-${Date.now()}.pdf`);
        const writeStream = fs.createWriteStream(pdfPath);
        
        const doc = new PDFDocument({ margin: 50, size: 'A4' });
        doc.pipe(writeStream);

        // Generate PDF (simplified version)
        const brandColor = '#667eea';
        const darkGray = '#333333';
        const mediumGray = '#666666';
        
        doc.rect(0, 0, 612, 120).fill(brandColor);
        doc.fontSize(32).font('Helvetica-Bold').fillColor('white').text('INVOICE', 50, 40);
        doc.fontSize(11).font('Helvetica').fillColor('white')
           .text(`Invoice #: ${invoice.invoiceNumber}`, 380, 45)
           .text(`Date: ${invoice.date}`, 380, 62)
           .text(`Due Date: ${invoice.dueDate}`, 380, 79);
        
        let yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('FROM', 50, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.from.name) doc.text(invoice.from.name, 50, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.from.address) {
            const addressLines = doc.splitTextToFit(invoice.from.address, 220);
            addressLines.forEach(line => { doc.text(line, 50, yPos); yPos += 14; });
        }
        if (invoice.from.phone) { doc.text(invoice.from.phone, 50, yPos); yPos += 14; }
        if (invoice.from.email) doc.text(invoice.from.email, 50, yPos);
        
        yPos = 160;
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray).text('BILL TO', 320, yPos);
        yPos += 20;
        doc.fontSize(12).font('Helvetica-Bold').fillColor(darkGray);
        if (invoice.to.name) doc.text(invoice.to.name, 320, yPos);
        yPos += 18;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray);
        if (invoice.to.address) {
            const addressLines = doc.splitTextToFit(invoice.to.address, 220);
            addressLines.forEach(line => { doc.text(line, 320, yPos); yPos += 14; });
        }
        if (invoice.to.phone) { doc.text(invoice.to.phone, 320, yPos); yPos += 14; }
        if (invoice.to.email) doc.text(invoice.to.email, 320, yPos);
        
        yPos = 340;
        doc.rect(50, yPos - 5, 512, 25).fill('#f5f7fa');
        doc.fontSize(10).font('Helvetica-Bold').fillColor(darkGray);
        doc.text('Description', 60, yPos + 5);
        doc.text('Qty', 360, yPos + 5, { width: 40, align: 'center' });
        doc.text('Unit Price', 410, yPos + 5, { width: 70, align: 'right' });
        doc.text('Amount', 490, yPos + 5, { width: 62, align: 'right' });
        yPos += 30;
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(50, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        
        doc.font('Helvetica').fillColor(darkGray);
        if (invoice.items && invoice.items.length > 0) {
            invoice.items.forEach(item => {
                const currency = invoice.currency || 'USD';
                const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
                doc.fontSize(10).text(item.description || '', 60, yPos, { width: 290 });
                doc.text((item.quantity || 0).toString(), 360, yPos, { width: 40, align: 'center' });
                doc.text(`${symbol}${(item.rate || 0).toFixed(2)}`, 410, yPos, { width: 70, align: 'right' });
                doc.text(`${symbol}${(item.amount || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
                yPos += 20;
            });
        }
        
        yPos += 10;
        const currency = invoice.currency || 'USD';
        const symbol = currency === 'USD' ? '$' : currency === 'EUR' ? '€' : currency === 'GBP' ? '£' : currency;
        
        doc.strokeColor('#e0e0e0').lineWidth(1).moveTo(380, yPos).lineTo(562, yPos).stroke();
        yPos += 15;
        doc.fontSize(10).font('Helvetica').fillColor(mediumGray)
           .text('Subtotal:', 410, yPos, { width: 70, align: 'right' })
           .text(`${symbol}${(invoice.subtotal || 0).toFixed(2)}`, 490, yPos, { width: 62, align: 'right' });
        yPos += 20;
        
        doc.rect(380, yPos - 5, 182, 30).fill(brandColor);
        doc.fontSize(12).font('Helvetica-Bold').fillColor('white')
           .text('TOTAL:', 410, yPos + 5, { width: 70, align: 'right' })
           .text(`${symbol}${(invoice.total || 0).toFixed(2)}`, 490, yPos + 5, { width: 62, align: 'right' });
        
        doc.end();

        // Wait for PDF to finish writing
        await new Promise((resolve, reject) => {
            writeStream.on('finish', resolve);
            writeStream.on('error', reject);
        });

        // Upload to Drive
        const driveResult = await saveInvoiceToDrive(user, invoice, pdfPath);

        // Cleanup temp file
        setTimeout(() => {
            try {
                if (fs.existsSync(pdfPath)) {
                    fs.unlinkSync(pdfPath);
                }
            } catch (err) {
                console.error('Error cleaning up temp PDF:', err);
            }
        }, 5000);

        res.json({
            success: true,
            drive: driveResult
        });

    } catch (error) {
        console.error('[Invoice] Drive save error:', error);
        res.status(500).json({ error: error.message || 'Failed to save to Google Drive' });
    }
};

module.exports = {
    generateInvoice,
    getInvoicesByUser,
    getInvoice,
    updateInvoice,
    deleteInvoice,
    generateInvoicePDF,
    sendInvoiceWithEmail,
    createInvoicePaymentLink,
    updatePaymentStatus,
    setupRecurring,
    cancelRecurring,
    saveToGoogleDrive
};
