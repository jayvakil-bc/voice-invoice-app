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
        
        // Create comprehensive prompt for OpenAI
        const prompt = `You are a professional contract generator. Your task is to take spoken/transcribed information and intelligently map it into a structured contract template.

═══════════════════════════════════════════════════════════════════════
CRITICAL SAFEGUARD INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════

1. Use professional legal tone and language throughout
2. Structure using lettered sub-clauses (a, b, c formatting)
3. Present information clearly and professionally
4. DO NOT copy any specific details from examples
5. All content MUST come from the user's transcription
6. Use complete sentences and proper clause structure
7. Add standard legal phrasing where appropriate

═══════════════════════════════════════════════════════════════════════
REQUIRED OUTPUT STRUCTURE (JSON)
═══════════════════════════════════════════════════════════════════════

Generate a JSON object with this EXACT structure:

{
  "contractTitle": "[Type of Contract, e.g., 'Social Media Manager Contract']",
  "effectiveDate": "${todayFormatted}",
  "parties": {
    "serviceProvider": {
      "name": "[Provider Name]",
      "address": "[Provider Address]",
      "email": "[Provider Email]"
    },
    "client": {
      "name": "[Client Name/Company]",
      "signingAuthority": "[Signing Person]",
      "address": "[Client Address]",
      "email": "[Client Email]"
    }
  },
  "sections": [
    {
      "title": "AGREEMENT OVERVIEW",
      "content": "Parties: [Names]\\nEffective Date: ${todayFormatted}\\nPurpose: [Description]",
      "order": 1
    },
    {
      "title": "SCOPE OF WORK",
      "content": "Services: [What will be provided]\\nDeliverables:\\na) [Item 1]\\nb) [Item 2]\\nDeadline: [When]",
      "order": 2
    },
    {
      "title": "PAYMENT TERMS",
      "content": "Total Fee: [Amount]\\nSchedule: [When payments are due]\\nMethod: [How to pay]\\nCalculation Method: [If performance-based, explain formula]",
      "order": 3
    },
    {
      "title": "RESPONSIBILITIES",
      "content": "Client Responsibilities:\\na) [Item 1]\\nb) [Item 2]\\n\\nService Provider Responsibilities:\\na) [Item 1]\\nb) [Item 2]",
      "order": 4
    },
    {
      "title": "OWNERSHIP & USAGE RIGHTS",
      "content": "Final Deliverables: [Who owns what]\\nClient Usage: [What client can do]\\nProvider Usage: [What provider can do]",
      "order": 5
    },
    {
      "title": "CONFIDENTIALITY",
      "content": "Confidential Information: [What is confidential]\\nObligations: [What each party must do]\\nExceptions: [Standard exceptions]",
      "order": 6
    },
    {
      "title": "TERM & TERMINATION",
      "content": "Contract Duration: [How long]\\nTermination Notice: [How much notice]\\nOutstanding Payments: [What happens to payments]",
      "order": 7
    },
    {
      "title": "LIABILITY & WARRANTY",
      "content": "Quality Standards: [Expected quality]\\nLiability Limit: [Limits on liability]\\nWarranties: [Guarantees provided]",
      "order": 8
    },
    {
      "title": "GOVERNING LAW",
      "content": "Governing Law: [Which jurisdiction]\\nJurisdiction: [Where disputes handled]\\nDispute Resolution: [How to resolve]",
      "order": 9
    },
    {
      "title": "SIGNATURES",
      "content": "Service Provider: ___________________ Date: _______\\nClient: ____________________________ Date: _______",
      "order": 10
    }
  ]
}

═══════════════════════════════════════════════════════════════════════
CONTENT MAPPING RULES
═══════════════════════════════════════════════════════════════════════

1. EXTRACT all relevant information from transcription
2. MAP to appropriate sections using professional language
3. Use lettered sub-clauses (a, b, c) for multiple items
4. If information is missing, use reasonable professional defaults
5. Keep sections concise - 2-3 sentences or bullet points
6. DO NOT add clauses not mentioned in transcription
7. For payment terms: NEVER add late fees/penalties unless explicitly stated
8. Add clarifications for performance-based payments to prevent disputes

SPECIAL HANDLING FOR PAYMENT TERMS:
- If performance-based fees mentioned, clarify calculation method
- If ad spend mentioned, clarify account ownership and transparency
- Add payment caps if performance-based
- Define metrics clearly (ROAS, revenue, etc.)

TRANSCRIPTION:
${transcript}

Generate the complete contract following the structure above. Use professional legal language but keep it clear and concise.`;

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
