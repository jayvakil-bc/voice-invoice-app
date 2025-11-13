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
        
        // ULTRA-COMPREHENSIVE contract generation prompt - extracts EVERY detail
        const prompt = `You are an expert contract generator specializing in extracting COMPLETE information from sales calls and business discussions. Your task is to capture EVERY mentioned detail, specification, metric, timeline, and commitment.

═══════════════════════════════════════════════════════════════════════
PART A: CRITICAL EXTRACTION RULES
═══════════════════════════════════════════════════════════════════════

🚨 YOUR MISSION: CAPTURE EVERYTHING

1. NEVER SKIP DETAILS
   - Extract ALL numbers: prices, percentages, quantities, metrics, timelines
   - Extract ALL commitments: guarantees, SLAs, performance targets, penalties
   - Extract ALL specifications: system names, data volumes, request volumes, team sizes
   - Extract ALL business context: current costs, ROI, risk exposure, justifications

2. PARTY IDENTIFICATION (CRITICAL)
   - Service Provider: Extract FULL legal name of company/person providing service
   - Client: Extract FULL company name AND authorized signatory's name/title
   - ⚠️ FLAG if either party name is missing or unclear

3. ALWAYS FLAG AMBIGUITIES
   - Use "⚠️ CLARIFICATION NEEDED:" for critical missing information
   - Use "To be determined" only for minor administrative details

4. NEVER INVENT - BUT NEVER SKIP
   - DO NOT fabricate information not in transcription
   - DO extract and document EVERYTHING that IS mentioned
   - DO include exact quotes for critical commitments

═══════════════════════════════════════════════════════════════════════
TRANSCRIPTION TO EXTRACT FROM:
═══════════════════════════════════════════════════════════════════════

${transcript}

═══════════════════════════════════════════════════════════════════════
DETAILED EXTRACTION CHECKLIST - SEARCH FOR ALL OF THESE:
═══════════════════════════════════════════════════════════════════════

PARTY DETAILS:
□ Service provider legal name (company/person)
□ Client company name + authorized signatory
□ Contact information (addresses, emails, phones)

FINANCIAL TERMS:
□ Total contract value and breakdown
□ Annual/monthly subscription amounts
□ One-time fees (setup, onboarding, implementation)
□ Per-unit pricing (per system, per request, per user, etc.)
□ Volume tiers and upgrade triggers
□ Payment schedule and timing
□ Payment methods
□ Refund conditions
□ Prorated calculations

PERFORMANCE GUARANTEES:
□ Specific metrics with target percentages
□ Measurement methodology
□ Evaluation periods and checkpoints
□ Penalties for missing targets (refunds, extensions, termination rights)
□ Audit processes
□ Performance review schedules

SCOPE & SPECIFICATIONS:
□ All services and deliverables listed
□ System counts and names (list every one mentioned)
□ Data volumes (TB, GB, records)
□ Request volumes (baseline, cap, overage handling)
□ Team sizes and roles
□ Technical specifications
□ Integration requirements

TIMELINES & MILESTONES:
□ Contract duration (years, months)
□ Implementation period with phase breakdown
□ Kickoff timing
□ Training schedules
□ Delivery deadlines
□ Review checkpoints

INCLUDED SERVICES:
□ Customer success manager assignments
□ Training sessions (duration, attendees, topics)
□ Reports and documentation
□ Support levels
□ Maintenance and updates

BUSINESS CONTEXT:
□ Current costs/pain points
□ ROI calculations
□ Risk exposure
□ Payback periods
□ Time savings

SCALING PROVISIONS:
□ How to add systems/users/volume
□ Incremental pricing
□ Tier upgrade conditions
□ Grace periods for overages

TERMINATION & RENEWAL:
□ Contract binding period
□ Early termination conditions
□ Performance-based exit clauses
□ Renewal terms
□ What happens to fees if terminated

═══════════════════════════════════════════════════════════════════════
REQUIRED OUTPUT: JSON FORMAT
═══════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks) with this structure:

{
    "title": "Brief descriptive title",
    "serviceProvider": {
        "name": "EXTRACT FULL LEGAL NAME - flag with ⚠️ if missing",
        "address": "Extract or 'To be determined'",
        "email": "Extract or 'To be determined'",
        "phone": "Extract or 'To be determined'"
    },
    "client": {
        "name": "EXTRACT FULL COMPANY NAME + signatory - flag with ⚠️ if missing",
        "address": "Extract or 'To be determined'",
        "email": "Extract or 'To be determined'",
        "phone": "Extract or 'To be determined'"
    },
    "effectiveDate": "${todayFormatted}",
    "sections": [
        {
            "title": "AGREEMENT OVERVIEW",
            "content": "Service Provider: [Full legal name]\\nClient: [Full company name + authorized signatory]\\nEffective Date: [Extract or ${todayFormatted}]\\nContract Type: [Extract tier/plan]\\nContract Duration: [Extract exact period - years/months]\\nPurpose: [Extract comprehensive purpose with business context]"
        },
        {
            "title": "SCOPE OF WORK",
            "content": "Services:\\na) [Service 1 with complete specifications]\\nb) [Service 2 with complete specifications]\\nc) [Continue for all services]\\n\\nSystems Under Management: [Extract COUNT and list ALL system names mentioned]\\n\\nData Volume: [Extract TB/GB if mentioned]\\n\\nRequest Volume:\\n- Baseline: [Extract]\\n- Capacity: [Extract cap]\\n- Overage: [Extract handling]\\n\\nDeliverables:\\n- [Every specific deliverable with metrics and specs]\\n- [Include technical details]\\n- [Include documentation/reports]\\n\\nImplementation Timeline:\\n- Duration: [Extract period]\\n- Phase 1: [Extract milestone]\\n- Phase 2: [Extract milestone]\\n- [Continue for all phases]\\n\\nKickoff: [Extract timing]"
        },
        {
            "title": "PAYMENT TERMS",
            "content": "Total Contract Value: [Extract with full breakdown]\\n\\nFee Structure:\\na) Annual/Monthly Subscription: [Extract amount per period]\\nb) Onboarding/Setup Fee: [Extract one-time charges]\\nc) Per-Unit Pricing: [Extract incremental costs]\\n   - Per additional system: [Extract amount]\\n   - Per tier upgrade: [Extract amount]\\n   - [Any other per-unit costs]\\n\\nTotal Amount: [Extract final sum]\\n\\nPayment Schedule:\\n- [Extract timing of each payment]\\n- [Extract invoice delivery method]\\n- [Extract when contract starts relative to payment]\\n\\nPayment Method: [Extract method]\\n\\nVolume Tiers:\\n- Current Tier: [Extract]\\n- Baseline: [Extract volume]\\n- Upgrade Trigger: [Extract conditions]\\n- Next Tier Cost: [Extract amount]\\n- Grace Period: [Extract overage tolerance]\\n\\nProrated Terms: [Extract how partial periods are calculated]\\n\\n[IF performance/bonus: Add calculation formulas, caps, measurement sources]\\n[IF ad spend: Add account ownership, transparency requirements, unspent fund handling]"
        },
        {
            "title": "PERFORMANCE GUARANTEES",
            "content": "Guarantee Period: [Extract evaluation window]\\n\\nCommitments:\\na) [Metric 1]: Target [X%] - [Extract measurement method]\\n   Penalty if missed: [Extract consequence]\\nb) [Metric 2]: Target [X%] - [Extract measurement method]\\n   Penalty if missed: [Extract consequence]\\nc) [Metric 3]: Target [X reduction/improvement] - [Extract baseline and target]\\n   Penalty if missed: [Extract consequence]\\n\\nMeasurement & Audit:\\n- Review Date: [Extract checkpoint timing]\\n- Audit Process: [Extract methodology]\\n- Reporting: [Extract frequency and format]\\n\\nRemediation: [Extract what happens if targets missed]\\n\\n[IF no guarantees mentioned, use: 'No specific performance guarantees documented in this agreement']"
        },
        {
            "title": "INCLUDED SERVICES",
            "content": "Customer Success:\\n- [Extract CSM assignment details]\\n- [Extract meeting frequency]\\n- [Extract duration of dedicated support]\\n\\nTraining:\\n- Session 1: [Extract duration, attendees, topics]\\n- Session 2: [Extract duration, attendees, topics]\\n- [Continue for all training]\\n\\nDocumentation:\\n- [Extract all reports/documentation included]\\n\\nSupport: [Extract support level included]\\n\\n[IF nothing specific mentioned, use: 'Standard support as per service provider's policies']"
        },
        {
            "title": "RESPONSIBILITIES",
            "content": "Client Responsibilities:\\n- [Extract every client obligation]\\n- [Include access/data requirements]\\n- [Include cooperation requirements]\\n\\nService Provider Responsibilities:\\n- [Extract every deliverable and obligation]\\n- [Include timeline commitments]\\n- [Include quality standards]"
        },
        {
            "title": "SCALING & INCREMENTAL PRICING",
            "content": "Adding Systems/Capacity:\\n- Cost per additional system: [Extract amount]\\n- Integration work: [Extract if included or separate charge]\\n- Prorated: [Extract prorating terms]\\n\\nTier Upgrades:\\n- Trigger: [Extract conditions]\\n- New pricing: [Extract amount]\\n- Effective: [Extract when change takes effect]\\n\\nRenewal Terms:\\n- [Extract what happens at contract end]\\n- [Extract how incremental fees roll into renewal]\\n\\n[IF not discussed, use: '⚠️ CLARIFICATION NEEDED: Scaling and incremental pricing terms']"
        },
        {
            "title": "OWNERSHIP & USAGE RIGHTS",
            "content": "Final Deliverables Ownership: [Extract or default to Service Provider]\\nClient Usage Rights: [Extract permitted usage]\\nService Provider Rights: [Extract what provider can do]\\n\\n[Standard clause]: All proprietary systems, methodologies, and intellectual property remain the exclusive property of Service Provider."
        },
        {
            "title": "CONFIDENTIALITY",
            "content": "Confidential Information: [Extract what must be kept confidential]\\nObligations: Both parties agree to maintain strict confidentiality of all proprietary information, business data, and trade secrets.\\nExceptions: [Extract any exceptions mentioned]\\nDuration: [Extract confidentiality period or use 'Duration of contract plus 2 years']"
        },
        {
            "title": "TERM & TERMINATION",
            "content": "Contract Duration: [Extract exact period]\\nBinding Period: [Extract if explicitly binding]\\nContract Plan/Tier: [Extract specific tier name]\\n\\nTermination Rights:\\n- Standard Notice: [Extract notice period]\\n- Performance-Based Exit: [Extract if client can exit due to missed metrics]\\n- Early Termination: [Extract conditions and financial obligations]\\n\\nPayment on Termination:\\n- [Extract what happens to remaining payments]\\n- [Extract any refund provisions]\\n- [Extract any penalty caps]\\n\\nRenewal: [Extract renewal terms or flag as TBD]\\n\\n[IF long contract + performance goals: Add clause about exit if metrics fail repeatedly]\\n[IF harsh penalties: Moderate to reasonable caps]"
        },
        {
            "title": "BUSINESS CONTEXT & ROI",
            "content": "Current State:\\n- Existing Costs: [Extract current spend]\\n- Pain Points: [Extract problems being solved]\\n- Risk Exposure: [Extract compliance/financial risks]\\n\\nExpected Outcomes:\\n- ROI: [Extract payback period and savings]\\n- Time Savings: [Extract efficiency improvements]\\n- Risk Mitigation: [Extract risk reductions]\\n\\n[IF not discussed, use: 'Business context not documented in this agreement']"
        },
        {
            "title": "GOVERNING LAW & DISPUTES",
            "content": "Governing Law: [Extract jurisdiction or flag with ⚠️]\\nJurisdiction: [Extract court location or flag with ⚠️]\\nDispute Resolution: [Extract process or use 'Good faith negotiation, followed by mediation if needed']"
        },
        {
            "title": "SIGNATURES",
            "content": "Service Provider: ___________________ Date: _______\\n(Name & Title)\\n\\nClient: ____________________________ Date: _______\\n(Name & Title)"
        }
    ]
}

═══════════════════════════════════════════════════════════════════════
FORMATTING RULES:
═══════════════════════════════════════════════════════════════════════

1. Use lettered sub-clauses (a, b, c) for payment breakdowns and metrics
2. Use dashes (-) for lists of items
3. Use "⚠️ CLARIFICATION NEEDED:" for missing critical information
4. Extract exact numbers, percentages, and dollar amounts
5. Include ALL system names if listed
6. Document ALL phases if implementation timeline mentioned
7. If a section has no relevant information, state that clearly rather than inventing

Generate the comprehensive contract JSON now, extracting EVERY detail from the transcription.`;
        
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
        
        // Map the OpenAI response to our database schema structure
        const contractToSave = {
            userId,
            originalTranscript: transcript,
            contractTitle: contractData.title,
            effectiveDate: contractData.effectiveDate,
            parties: {
                serviceProvider: {
                    name: contractData.serviceProvider?.name || '⚠️ CLARIFICATION NEEDED: Service Provider Name',
                    address: contractData.serviceProvider?.address || 'To be determined',
                    email: contractData.serviceProvider?.email || 'To be determined',
                    phone: contractData.serviceProvider?.phone || 'To be determined'
                },
                client: {
                    name: contractData.client?.name || '⚠️ CLARIFICATION NEEDED: Client Name',
                    signingAuthority: contractData.client?.signingAuthority || '',
                    address: contractData.client?.address || 'To be determined',
                    email: contractData.client?.email || 'To be determined',
                    phone: contractData.client?.phone || 'To be determined'
                }
            },
            sections: contractData.sections || []
        };
        
        // Save to database
        const contract = await Contract.create(contractToSave);
        
        console.log('[Contract Service] Contract created:', contract._id);
        
        // Return the properly structured contract data for the frontend
        res.json({ 
            contractId: contract._id, 
            contractData: {
                contractTitle: contract.contractTitle,
                effectiveDate: contract.effectiveDate,
                parties: contract.parties,
                sections: contract.sections
            }
        });
        
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
