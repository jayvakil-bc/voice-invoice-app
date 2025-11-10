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
            email: String
        },
        client: {
            name: String,
            signingAuthority: String,
            address: String,
            email: String
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
        
        // Create comprehensive prompt for OpenAI with detailed safeguards
        const prompt = `You are a professional contract generator. Extract information from the transcription and create a professional contract following the structure below.

═══════════════════════════════════════════════════════════════════════
REQUIRED JSON OUTPUT FORMAT
═══════════════════════════════════════════════════════════════════════

{
  "contractTitle": "[Type, e.g., 'Marketing Services Contract']",
  "effectiveDate": "${todayFormatted}",
  "parties": {
    "serviceProvider": {
      "name": "[Name]",
      "address": "[Address or 'To be determined']",
      "email": "[Email or 'To be determined']"
    },
    "client": {
      "name": "[Name]",
      "signingAuthority": "[Person or leave blank]",
      "address": "[Address or 'To be determined']",
      "email": "[Email or 'To be determined']"
    }
  },
  "sections": [
    {
      "title": "AGREEMENT OVERVIEW",
      "content": "This agreement is entered into on ${todayFormatted}.\\n\\nParties:\\na) Service Provider: [Name]\\nb) Client: [Name]\\n\\nPurpose: [Describe what service provider will do]",
      "order": 1
    },
    {
      "title": "SCOPE OF WORK",
      "content": "The Service Provider agrees to perform:\\n\\na) [Main service 1]\\nb) [Main service 2]\\nc) [Main service 3]\\n\\nDeliverables:\\n- [Specific item 1]\\n- [Specific item 2]\\n\\nTimeline: [When work happens]",
      "order": 2
    },
    {
      "title": "PAYMENT TERMS",
      "content": "Fee Structure:\\na) [Base amount if mentioned]\\nb) [Bonus/variable amount if mentioned]\\n\\nIf performance-based, add:\\nCalculation Method: Total = [base] + [bonus based on X metric]. The total REPLACES the base, not added to it.\\nMetrics: [Define how ROAS/revenue measured, which platform is source of truth]\\nPayment Cap: Maximum fee shall not exceed $[X] per month\\n\\nPayment Schedule: [When paid]\\nPayment Method: [How paid]\\n\\nIf ad spend mentioned, add:\\nAd Account: Client maintains ownership and billing control. Provider operates as authorized admin only.\\nTransparency: Provider must grant client view-only access and provide weekly spend reports.",
      "order": 3
    },
    {
      "title": "RESPONSIBILITIES",
      "content": "Client Responsibilities:\\na) [What client must do]\\nb) [What client must provide]\\n\\nService Provider Responsibilities:\\na) [What provider must deliver]\\nb) [Quality/timeline commitments]",
      "order": 4
    },
    {
      "title": "OWNERSHIP & USAGE RIGHTS",
      "content": "All ownership rights remain with Service Provider unless explicitly transferred.\\n\\nService Provider Rights: Full rights to use, modify, and repurpose all work\\nClient Usage: [Limited license for specific business use]\\nPortfolio Use: Provider may use work for portfolio and marketing",
      "order": 5
    },
    {
      "title": "CONFIDENTIALITY",
      "content": "Confidential Information: All project-related information, deliverables, content, and communications\\n\\nObligations:\\na) Both parties must maintain confidentiality\\nb) No disclosure to third parties without written consent\\n\\nExceptions: Information may be disclosed only if mutually agreed in writing",
      "order": 6
    },
    {
      "title": "TERM & TERMINATION",
      "content": "Contract Duration: [X months/period from transcription]\\n\\nTermination:\\na) Either party may terminate with [30] days written notice\\nb) If Client terminates without cause: [early termination fee if mentioned, otherwise 'no penalty']\\nc) If Provider terminates: No penalty to Client\\n\\nIf performance goals mentioned, add:\\nPerformance Exit: If [metric] falls below [threshold] for 2 consecutive months, Client may terminate immediately with no penalty",
      "order": 7
    },
    {
      "title": "GOVERNING LAW",
      "content": "Governing Law: [Jurisdiction from transcription or 'To be determined']\\nJurisdiction: [Location or 'To be determined']\\nDispute Resolution: Good faith negotiation, then mediation if needed",
      "order": 8
    },
    {
      "title": "SIGNATURES",
      "content": "IN WITNESS WHEREOF, the parties have executed this agreement:\\n\\nService Provider:\\nSignature: ___________________\\nName: [Provider Name]\\nDate: _______\\n\\nClient:\\nSignature: ___________________\\nName: [Client Name]\\nDate: _______",
      "order": 9
    }
  ]
}

═══════════════════════════════════════════════════════════════════════
CRITICAL RULES
═══════════════════════════════════════════════════════════════════════

1. EXTRACT all details from transcription - do NOT invent information
2. Use professional legal language with lettered sub-clauses (a, b, c)
3. Keep sections concise (2-3 sentences or bullet points)
4. If info missing, use "To be determined" not [Placeholder]
5. DO NOT add late fees/penalties unless explicitly mentioned
6. DO NOT copy any example contract details

SPECIAL AUTO-DETECT & FIX:
- Performance-based payment? → Clarify calculation, add caps, define metrics
- Ad spend mentioned? → Add account ownership clause, transparency requirements  
- Long-term contract? → Add performance exit clause
- Harsh penalties? → Modify to reasonable caps

TRANSCRIPTION:
${transcript}

Generate the complete JSON contract above using ONLY information from the transcription.`;

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
