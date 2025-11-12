require('dotenv').config({ path: '../../.env' });

const express = require('express');
const mongoose = require('mongoose');
const OpenAI = require('openai');
const PDFDocument = require('pdfkit');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || process.env.CONTRACT_SERVICE_PORT || 3004;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('[Contract Service] MongoDB Connected'))
    .catch(err => console.error('[Contract Service] MongoDB Error:', err));

// Contract Model
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
    createdAt: { type: Date, default: Date.now }
});

const Contract = mongoose.model('Contract', contractSchema);

// OpenAI setup
const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'contract-service', status: 'healthy' });
});

// Generate contract
app.post('/contracts/generate', async (req, res) => {
    try {
        const { transcript, userId } = req.body;
        
        console.log('[Contract Service] Generating contract for user:', userId);
        
        // Get today's date
        const today = new Date();
        const todayFormatted = today.toISOString().split('T')[0];
        
        // Create detailed extraction prompt
        const prompt = `You are a professional contract drafting assistant. Extract ALL information from the transcription and create a detailed, comprehensive contract.

CRITICAL INSTRUCTIONS:
1. Extract EVERY detail mentioned in the transcription - don't summarize or skip anything
2. If specific details are mentioned (amounts, percentages, timelines, metrics, features), include them ALL
3. Use professional legal language but preserve all the technical and business details
4. Structure information clearly with lettered sub-clauses (a, b, c, etc.)
5. If something isn't mentioned, use "To be determined" - DO NOT invent information

TRANSCRIPTION TO EXTRACT FROM:
${transcript}

Create a detailed contract with these sections:

1. AGREEMENT OVERVIEW
   - Who are the parties (service provider and client names, contact info if mentioned)
   - What is the effective date or trigger for commencement
   - What is the core purpose/goal of the agreement
   - Include ALL context about what the solution/service does

2. SCOPE OF WORK
   - List EVERY service, feature, deliverable mentioned
   - Include ALL technical details (system names, integration types, data types, performance metrics)
   - Include ALL timelines and milestones mentioned
   - Include ALL specifications (response times, volume metrics, capabilities)
   - Use lettered sub-clauses for each distinct item

3. PAYMENT TERMS
   - Total fees (break down if multiple components mentioned)
   - Payment schedule (when, how often, any special terms)
   - Payment method
   - Any special conditions (prepayment discounts, growth clauses, price protection)
   - Include ALL financial details and calculations mentioned

4. RESPONSIBILITIES
   Client Responsibilities:
   - List EVERY responsibility or requirement for the client
   Service Provider Responsibilities:
   - List EVERY deliverable, service, training, support obligation

5. OWNERSHIP & USAGE RIGHTS
   - Who owns what (IP, deliverables, work product)
   - What usage rights does the client have
   - What can the provider do with the work/data
   - Include ALL ownership and licensing details mentioned

6. CONFIDENTIALITY
   - What must be kept confidential
   - Any exceptions or specific terms mentioned
   - Data handling requirements (HIPAA, PHI, etc. if mentioned)

7. TERM & TERMINATION
   - How long is the contract
   - Notice periods for termination
   - What happens on termination (refunds, responsibilities, etc.)
   - Include ALL performance guarantees, metrics, remediation terms if mentioned
   - Include ALL exit protections or conditions

8. GOVERNING LAW
   - State/jurisdiction (or "To be determined" if not mentioned)
   - Dispute resolution process
   - How will disputes about metrics/ROI be resolved

9. SIGNATURES
   - Signature blocks for both parties

Return ONLY valid JSON in this format (no markdown, no code blocks):
{
    "title": "Brief descriptive title of the contract",
    "serviceProvider": {
        "name": "Service provider company/person name",
        "address": "Address if mentioned or 'To be determined'",
        "email": "Email if mentioned or 'To be determined'",
        "phone": "Phone if mentioned or 'To be determined'"
    },
    "client": {
        "name": "Client company/person name",
        "address": "Address if mentioned or 'To be determined'",
        "email": "Email if mentioned or 'To be determined'",
        "phone": "Phone if mentioned or 'To be determined'"
    },
    "effectiveDate": "${todayFormatted}",
    "sections": [
        {
            "title": "AGREEMENT OVERVIEW",
            "content": "Detailed paragraph explaining parties, effective date trigger, and comprehensive purpose including all context"
        },
        {
            "title": "SCOPE OF WORK",
            "content": "a) First service/deliverable with all technical details\\nb) Second service/deliverable with all specs\\nc) Continue for each distinct service/feature/deliverable\\n\\nDeliverables:\\n- List every specific deliverable mentioned with full details\\n- Include all metrics, timelines, technical specifications\\n\\nTimeline: All timeline and milestone details"
        },
        {
            "title": "PAYMENT TERMS",
            "content": "Total Fee:\\na) Break down all fee components with exact amounts\\nb) List payment schedule with all dates and conditions\\nc) Payment method and any special terms\\nd) All price protection, growth, or adjustment clauses\\n\\nSchedule:\\na) When each payment is due with full details\\nb) All conditions and triggers\\n\\nMethod: Payment method\\n\\nPerformance Metrics & Dispute Resolution: If mentioned, include all details about how success is measured and disputes resolved"
        },
        {
            "title": "RESPONSIBILITIES",
            "content": "Client Responsibilities:\\n- List every requirement, access needed, data to provide\\n- Include all collaboration and decision-making obligations\\n\\nService Provider Responsibilities:\\n- List every service, deliverable, training, support obligation\\n- Include all implementation, optimization, and ongoing support duties"
        },
        {
            "title": "OWNERSHIP & USAGE RIGHTS",
            "content": "CRITICAL: State who owns what clearly\\n\\nFinal Deliverables Ownership: Who retains rights\\n\\nClient Usage: Exact usage rights granted, any limitations\\n\\nProvider Usage: What provider can do with work product, data, learnings"
        },
        {
            "title": "CONFIDENTIALITY",
            "content": "CRITICAL: All confidentiality obligations\\n\\nConfidential Information: What must be kept confidential\\n\\nObligations:\\na) Specific confidentiality duties\\nb) Data handling requirements (HIPAA, etc. if applicable)\\n\\nExceptions: Any exceptions to confidentiality"
        },
        {
            "title": "TERM & TERMINATION",
            "content": "CRITICAL: Full contract duration and termination terms\\n\\nContract Duration: Exact length with start trigger\\n\\nContract Plan: Describe the tier/plan/scope in detail\\n\\nTermination Notice:\\na) Notice period required\\nb) What happens to payments on termination\\n\\nPerformance Based Remedies and Exit Protections:\\na) Any performance guarantees with exact metrics\\nb) Remediation procedures if targets not met\\nc) Exit rights and refund/credit terms\\n\\nOutstanding Payments: Responsibilities for fees through termination"
        },
        {
            "title": "GOVERNING LAW",
            "content": "Governing Law: State or jurisdiction\\n\\nJurisdiction: County/District or 'To be determined'\\n\\nDispute Resolution:\\na) First attempt resolution method\\nb) How ROI/metrics disputes will be resolved (authoritative data source)\\nc) Final dispute resolution procedure"
        },
        {
            "title": "SIGNATURES",
            "content": "Service Provider: ___________________ Date: _______\\n\\nClient: ____________________________ Date: _______"
        }
    ]
}`;
        
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
        
        // Save to database
        const contract = await Contract.create({
            userId,
            originalTranscript: transcript,
            ...contractData
        });
        
        console.log('[Contract Service] Contract created:', contract._id);
        
        res.json({ contractId: contract._id, contractData });
        
    } catch (error) {
        console.error('[Contract Service] Generation error:', error);
        res.status(500).json({ error: 'Failed to generate contract' });
    }
});

// Get all contracts for user
app.get('/contracts/user/:userId', async (req, res) => {
    try {
        const contracts = await Contract.find({ userId: req.params.userId }).sort({ createdAt: -1 });
        res.json(contracts);
    } catch (error) {
        console.error('[Contract Service] Fetch error:', error);
        res.status(500).json({ error: 'Failed to fetch contracts' });
    }
});

// Get single contract
app.get('/contracts/:id', async (req, res) => {
    try {
        const contract = await Contract.findById(req.params.id);
        if (!contract) return res.status(404).json({ error: 'Contract not found' });
        res.json(contract);
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch contract' });
    }
});

// Update contract
app.put('/contracts/:id', async (req, res) => {
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
app.delete('/contracts/:id', async (req, res) => {
    try {
        await Contract.findByIdAndDelete(req.params.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ error: 'Failed to delete contract' });
    }
});

// Generate PDF
app.get('/contracts/:id/pdf', async (req, res) => {
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
        
        // Footer
        const footerY = 750;
        doc.fontSize(8)
           .fillColor('#999999')
           .text('This contract was generated electronically.', 50, footerY, { 
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

app.listen(PORT, () => {
    console.log(`[Contract Service] Running on http://localhost:${PORT}`);
});

module.exports = app;
