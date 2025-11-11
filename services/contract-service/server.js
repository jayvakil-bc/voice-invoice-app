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
        
        // Create comprehensive prompt for OpenAI with detailed safeguards
        const prompt = `You are a contract extraction and generation system. Your job is to EXTRACT information from the transcription and map it to a structured contract format.

CRITICAL RULES:
1. ONLY use information explicitly stated in the transcription
2. DO NOT invent, assume, or add information not mentioned
3. If information is missing, use "To be determined" 
4. DO NOT copy from examples - extract from THIS transcription only
5. Keep language professional but based on what was actually said

TRANSCRIPTION TO EXTRACT FROM:
"${transcript}"

Now extract and map the following information:

STEP 1: IDENTIFY THE PARTIES
- Who is the SERVICE PROVIDER (the person/company providing services)?
  Name: [Extract name]
  Address: [Extract if mentioned, else "To be determined"]
  Email: [Extract if mentioned, else "To be determined"]
  Phone: [Extract if mentioned, else ""]

- Who is the CLIENT (the person/company receiving services)?
  Name: [Extract name]
  Address: [Extract if mentioned, else "To be determined"]
  Email: [Extract if mentioned, else "To be determined"]
  Phone: [Extract if mentioned, else ""]

STEP 2: IDENTIFY THE SERVICES
- What services will be provided? List each one mentioned
- What are the specific deliverables? (posts, hours, reports, etc.)
- What is the timeline? (start date, duration, deadlines)

STEP 3: IDENTIFY PAYMENT TERMS
- What is the payment amount?
- When is payment due? (monthly, upfront, milestones)
- How should payment be made? (transfer, check, etc.)
- Are there performance bonuses? If yes, explain the calculation clearly
- Is there ad spend involved? If yes, note the amount and who controls the account

STEP 4: IDENTIFY RESPONSIBILITIES
- What must the CLIENT do? (provide access, feedback, materials, etc.)
- What must the SERVICE PROVIDER do? (deliver work, meet deadlines, quality standards)

STEP 5: IDENTIFY SPECIAL TERMS
- Duration: How long is the contract? (months, ongoing, project-based)
- Termination: What are the exit terms? (notice period, penalties if any)
- Ownership: Who owns the work created?
- Confidentiality: Is anything mentioned about keeping information private?

Now generate a JSON response in this EXACT format:

{
  "contractTitle": "[Type] Services Contract",
  "effectiveDate": "${todayFormatted}",
  "parties": {
    "serviceProvider": {
      "name": "[extracted name]",
      "address": "[extracted or 'To be determined']",
      "email": "[extracted or 'To be determined']",
      "phone": "[extracted or '']"
    },
    "client": {
      "name": "[extracted name]",
      "signingAuthority": "[if mentioned]",
      "address": "[extracted or 'To be determined']",
      "email": "[extracted or 'To be determined']",
      "phone": "[extracted or '']"
    }
  },
  "sections": [
    {
      "title": "AGREEMENT OVERVIEW",
      "content": "This [Type of Service] agreement is entered into on ${todayFormatted} between [Service Provider Name] (Service Provider) and [Client Name] (Client).\\n\\nPurpose: [Extract 1-2 sentences about what service provider will do]",
      "order": 1
    },
    {
      "title": "SCOPE OF WORK",
      "content": "The Service Provider will perform the following services:\\n\\n[List each service mentioned]\\n\\nDeliverables:\\n[List specific deliverables with quantities if mentioned]\\n\\nTimeline: [Extract timeline/schedule mentioned]",
      "order": 2
    },
    {
      "title": "PAYMENT TERMS",
      "content": "Total Fee: [Extract amount]\\nPayment Schedule: [When paid - monthly, upfront, etc.]\\nPayment Method: [How to pay]\\n\\n[If performance bonus mentioned: Add calculation details]\\n[If ad spend mentioned: Add account ownership and transparency clauses]",
      "order": 3
    },
    {
      "title": "RESPONSIBILITIES",
      "content": "Client Responsibilities:\\n[List what client must do]\\n\\nService Provider Responsibilities:\\n[List what provider must do]",
      "order": 4
    },
    {
      "title": "OWNERSHIP & USAGE RIGHTS",
      "content": "[If mentioned in transcription, use that. Otherwise use:]\\nService Provider retains ownership of all work created. Client receives a license to use deliverables for their business purposes. Service Provider may use work in portfolio.",
      "order": 5
    },
    {
      "title": "CONFIDENTIALITY",
      "content": "[If mentioned in transcription, use that. Otherwise use:]\\nBoth parties agree to keep all project information, communications, and deliverables confidential unless mutually agreed otherwise in writing.",
      "order": 6
    },
    {
      "title": "TERM & TERMINATION",
      "content": "Contract Duration: [Extract duration]\\nTermination: [Extract notice period and any penalties mentioned]\\n\\n[If performance goals mentioned, add exit clause for poor performance]",
      "order": 7
    },
    {
      "title": "GOVERNING LAW",
      "content": "This agreement shall be governed by the laws of [jurisdiction if mentioned, else 'the applicable jurisdiction'].\\n\\nDispute Resolution: Any disputes will be resolved through good faith negotiation, followed by mediation if necessary.",
      "order": 8
    },
    {
      "title": "SIGNATURES",
      "content": "IN WITNESS WHEREOF, the parties have executed this agreement:\\n\\nService Provider: ___________________\\nName: [Provider Name]\\nDate: _______\\n\\nClient: ___________________\\nName: [Client Name]\\nDate: _______",
      "order": 9
    }
  ]
}

IMPORTANT REMINDERS:
- Extract exact names, amounts, and dates from transcription
- Do NOT make up services, deliverables, or terms not mentioned
- Use simple, clear language based on what was said
- If something critical is missing, use "To be determined" not invented details`;

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
