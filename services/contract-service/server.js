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
        const prompt = `You are a professional contract generator. Your task is to take spoken/transcribed information and intelligently map it into a structured contract template.

═══════════════════════════════════════════════════════════════════════
PART A: PROFESSIONAL STYLE REFERENCE
═══════════════════════════════════════════════════════════════════════

Below is an example of a REAL, PROFESSIONAL contract. Use this ONLY as a STYLE REFERENCE to learn:
- Professional legal tone and language
- How to structure sub-clauses (a, b, c formatting)
- How to phrase terms naturally and professionally
- How to present detailed information clearly

⚠️ CRITICAL SAFEGUARD: DO NOT copy any specific details from this example (names, dates, amounts, addresses, services, etc.). 
This example is ONLY for learning STYLE, TONE, and FORMATTING. All actual content MUST come from the user's transcription.

--- EXAMPLE CONTRACT (STYLE REFERENCE ONLY) ---

Personal Branding Contract

This Social Media Manager Contract ("Contract") is entered into on October 29, 2024, by and Between:

Client:
Name: 1437753 Canada Inc.
Signing authority: Fahad Rehman
Address: 62, Stannardville Drive, Ajax, ON, L1T0M5
Email: fahad@nextgenrealestate.ca

Service Provider:
Name: Naman Newatia
Address: 108 Peter Street, Toronto, ON, M5V0W2
Email: naman23.nn@gmail.com

1. Scope of Work:
The Service Provider agrees to perform the following services for the Client:
a) Filming Sessions: At least two (2) filming sessions per month. More if necessary
b) Content Creation: Forty-five (45) Instagram reels per month. (30 Video + 15 Text Quotes) per month
Total deliverables: 45 reels as to the total that is mentioned above.
c) Demo/Consultation Calls: As and when scheduled and necessary
d) Social Media Management and Posting: For Instagram, Facebook, YouTube Shorts and TikTok
e) Any scope of work, ideas completely outside this scope will not be included.

2. Contract Term:
a) This Contract will commence on filming day, November 6th, 2024

3. Compensation:
a) The Client agrees to pay the Service Provider $1250 per month for the duration of the Contract.
b) Payment will be due on the 6th of every month for the 3 months.
c) The transfer will be made by interac on the service provider's email address.
d) For the first month, the client will not be charged for the additional week required for demo calls and filming.
e) For the first month, the service provider is making an exception of starting the filming before the first month's deposit is paid in full. The service provider will be accepting $250 as deposit and $1000 will be due before the post production begins by the service provider. From the second month, the process will go back to normal and the client will have to make the transfer in full on the ascertained date above.

4. Responsibilities of the Service Provider:
a) Schedule and conduct at least two (2) filming sessions per month.
b) Create and deliver forty five (45) Instagram reels per month.
c) Ensure all content aligns with the Client's brand and marketing strategy.
d) Post and manage on all mentioned platforms - instagram, tiktok, youtube shorts, facebook.
The service provider won't share client's content publicly (unless mutually agreed) without permission but can use it for his portfolio and meetings.

5. Responsibilities of the Client:
a) Provide necessary access to social media accounts and any other resources needed for content creation.
b) Communicate any changes in strategy or content requirements promptly.
c) Approve or provide feedback on content within a reasonable timeframe.
d) Set days for filming content.

6. Confidentiality:
The Service Provider agrees to keep all Client information confidential and not to disclose any such information to any third party without the Client's prior consent.

7. Termination:
Either party may terminate this Contract with thirty (30) days written notice. If the Client terminates the Contract without cause, the Client will pay the Service Provider up to the termination date for the leftover months of the contract.

8. Governing Law:
This Contract shall be governed by and construed in accordance with the laws of the State of Ontario.

9. Amendments:
Any amendments or modifications to this Contract must be made in writing and signed by both Parties.

10. Signatures:
IN WITNESS WHEREOF, the parties hereto have executed this Social Media Manager Contract as of the day and year first above written.

Service Provider:
Signature: ____
Name: Naman Newatia
Date: October 29, 2024

Client:
Signature: ____
Name: Fahad Rehman
Date: October 29, 2024

--- END OF EXAMPLE CONTRACT ---

═══════════════════════════════════════════════════════════════════════
CRITICAL INSTRUCTIONS FOR JSON OUTPUT
═══════════════════════════════════════════════════════════════════════

You MUST output a JSON object with this exact structure:

{
  "contractTitle": "[Service Type] Contract",
  "effectiveDate": "${todayFormatted}",
  "parties": {
    "serviceProvider": {
      "name": "[Extract from transcription]",
      "address": "[Extract or 'To be determined']",
      "email": "[Extract or 'To be determined']",
      "phone": "[Extract or '']"
    },
    "client": {
      "name": "[Extract from transcription]",
      "signingAuthority": "[Extract if mentioned]",
      "address": "[Extract or 'To be determined']",
      "email": "[Extract or 'To be determined']",
      "phone": "[Extract or '']"
    }
  },
  "sections": [
    {
      "title": "AGREEMENT OVERVIEW",
      "content": "[Extract and format professionally using example style]",
      "order": 1
    },
    {
      "title": "SCOPE OF WORK",
      "content": "[Use lettered sub-clauses (a, b, c) like example]",
      "order": 2
    },
    {
      "title": "PAYMENT TERMS",
      "content": "[Extract payment details, add safeguards if needed]",
      "order": 3
    },
    {
      "title": "RESPONSIBILITIES",
      "content": "[Separate Client and Service Provider responsibilities]",
      "order": 4
    },
    {
      "title": "OWNERSHIP & USAGE RIGHTS",
      "content": "[Default: Service Provider retains all rights unless specified]",
      "order": 5
    },
    {
      "title": "CONFIDENTIALITY",
      "content": "[Standard confidentiality clause unless specified]",
      "order": 6
    },
    {
      "title": "TERM & TERMINATION",
      "content": "[Extract duration and termination terms]",
      "order": 7
    },
    {
      "title": "GOVERNING LAW",
      "content": "[Extract jurisdiction or use 'To be determined']",
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
CONTENT MAPPING INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════

1. EXTRACT information from transcription - DO NOT invent
2. Use professional legal language like the example
3. Use lettered sub-clauses (a, b, c) for multiple items
4. If info missing, use "To be determined"
5. DO NOT add late fees/penalties unless explicitly stated
6. DO NOT copy example contract details

SPECIAL AUTO-DETECT & ADD SAFEGUARDS:

IF performance-based payment mentioned:
- Clarify calculation method (total replaces base, not cumulative)
- Define metrics clearly (ROAS formula, attribution window)
- Add payment cap
- Specify source of truth for disputes

IF ad spend mentioned:
- Clarify client owns account, provider is admin
- Require view-only access + weekly reports
- Explain unspent budget handling

IF long contract + performance goals:
- Add performance exit clause (can leave if metrics bad for 2 months)

IF harsh termination penalties:
- Modify to 50% of remaining fees, capped at reasonable max

TRANSCRIPTION TO EXTRACT FROM:
"${transcript}"

Generate the JSON contract using ONLY information from the transcription above, formatted professionally like the example.`;

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
