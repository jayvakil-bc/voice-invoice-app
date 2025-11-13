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
        
        // Professional contract generation prompt based on talk2contract-ai proven methodology
        const prompt = `You are a professional contract generator. Your task is to take spoken/transcribed information and intelligently map it into a structured contract template.

═══════════════════════════════════════════════════════════════════════
PART A: CRITICAL RULES - READ THIS FIRST
═══════════════════════════════════════════════════════════════════════

🚨 ABSOLUTE PROHIBITIONS:

1. NEVER INVENT DATA
   - DO NOT create, guess, or fabricate any information not present in the transcription
   - DO NOT make assumptions about pricing, dates, deliverables, or terms not explicitly stated
   - DO NOT generate "reasonable" values for missing critical information
   - If information is unclear or missing, you MUST flag it explicitly

2. NEVER COPY FROM THE STYLE REFERENCE
   - The example contract below is ONLY for learning tone, structure, and formatting
   - DO NOT copy any specific details (names, amounts, dates, services) from the example
   - All actual content MUST come exclusively from the user's transcription

3. NEVER ADD UNSTATED CLAUSES
   - DO NOT add late payment penalties, fees, or interest unless explicitly mentioned
   - DO NOT add contract clauses about topics not discussed in the transcription
   - Only include terms that were actually stated or clearly implied by the parties

4. ALWAYS FLAG AMBIGUITIES
   - If payment structure is unclear → Flag it with "⚠️ CLARIFICATION NEEDED:"
   - If dates/deadlines are vague → Flag it
   - If scope boundaries are undefined → Flag it

═══════════════════════════════════════════════════════════════════════
PART B: STEP-BY-STEP EXTRACTION METHODOLOGY
═══════════════════════════════════════════════════════════════════════

Before generating the contract, follow this extraction process:

STEP 1: IDENTIFY CORE ENTITIES
□ Who is the service provider? (Exact name/entity)
□ Who is the client? (Exact name/entity)
□ What is the effective date? (Exact date or clear start condition)

STEP 2: MAP DELIVERABLES
□ What specific services will be provided?
□ What are the concrete deliverables?
□ What are the deadlines/timelines?
□ Are there any exclusions or scope boundaries mentioned?

STEP 3: DECODE PAYMENT STRUCTURE
□ What is the base fee amount?
□ Is there a variable/bonus component?
□ If yes: Is the total = base + bonus, OR does bonus REPLACE base?
□ When are payments due?
□ What payment method was specified?

STEP 4: IDENTIFY RESPONSIBILITIES
□ What must the client provide/do?
□ What must the service provider deliver/do?
□ Are there any specific deadlines tied to responsibilities?

STEP 5: CHECK FOR SPECIAL TERMS
□ Ownership/IP rights mentioned?
□ Confidentiality requirements stated?
□ Performance metrics or goals discussed?
□ Termination conditions specified?
□ Contract duration explicitly stated?

STEP 6: FLAG WHAT'S MISSING OR UNCLEAR
□ List any critical information that is:
  - Completely absent
  - Vaguely stated
  - Ambiguous
  - Open to multiple interpretations

═══════════════════════════════════════════════════════════════════════
TRANSCRIPTION TO EXTRACT FROM:
═══════════════════════════════════════════════════════════════════════

${transcript}

═══════════════════════════════════════════════════════════════════════
PART C: CRITICAL CONTRACT PROVISIONS - AUTO-DETECT & FIX
═══════════════════════════════════════════════════════════════════════

When generating contracts, automatically scan for these common legal gaps and ADD CLARIFYING LANGUAGE:

1. PAYMENT STRUCTURE AMBIGUITIES
IF the transcription mentions:
- Variable/performance-based fees (bonuses, ROAS-based, commission, etc.)
- Multiple fee components (base + bonus, retainer + commission, etc.)

THEN add these clarifications in Section 3 (Payment Terms):
a) CALCULATION METHOD:
   "Total monthly fee calculated as: [base amount] + [variable component] = [total]
    The [total] REPLACES the [base], not added to it."
b) PERFORMANCE METRICS:
   Define exactly how metrics are measured (what counts, what tracking system, time period, attribution)
c) PAYMENT CAPS:
   "Maximum monthly fee shall not exceed $[amount]"
d) DISPUTE RESOLUTION:
   "[Client's platform] shall be the authoritative source of truth"

2. AD SPEND / FUND MANAGEMENT ACCOUNTABILITY
IF the transcription mentions:
- Marketing/ad spend managed by provider
- Client providing budget/funds for ads

THEN add these protections in Section 3 & 4:
a) ACCOUNT OWNERSHIP:
   "Client maintains ownership and billing control of Ad Account. Service Provider operates as authorized administrator only."
b) TRANSPARENCY REQUIREMENTS:
   "Service Provider must grant Client view-only access and deliver weekly spend reports"
c) UNSPENT BUDGET HANDLING:
   "If monthly ad spend falls below threshold, Service Provider must provide written explanation. Unspent budget does not roll over unless agreed in writing."

3. PERFORMANCE-BASED TERMINATION RIGHTS
IF the transcription mentions:
- Performance goals/targets + Long contract duration (3+ months) + Early termination penalties

THEN add these protections in Section 7:
a) PERFORMANCE EXIT CLAUSE:
   "If [key metric] falls below [threshold] for two (2) consecutive months, Client may terminate immediately with [X] days notice and no early termination penalty."
b) REASONABLE TERMINATION PENALTIES:
   "Early termination fee = 50% of remaining monthly service fees, capped at $[reasonable maximum]."
c) MUTUAL TERMINATION OPTION:
   "Either party may terminate for convenience with [30-60] days written notice."

CRITICAL: DO NOT add late payment penalties, interest charges, or payment-related fees unless explicitly mentioned in the transcription.

═══════════════════════════════════════════════════════════════════════
PART D: REQUIRED OUTPUT STRUCTURE - JSON FORMAT
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
            "title": "1. AGREEMENT OVERVIEW",
            "content": "Service Provider: [Full legal name]\\nClient: [Full company name + authorized signatory]\\nEffective Date: [Extract or ${todayFormatted}]\\nContract Type: [Extract tier/plan if mentioned]\\nContract Duration: [Extract exact period]\\nPurpose: [Extract comprehensive purpose]"
        },
        {
            "title": "2. SCOPE OF WORK",
            "content": "The Service Provider agrees to perform the following services:\\na) [Service 1 with complete details]\\nb) [Service 2 with complete details]\\n\\nDeliverables:\\n- [Every specific deliverable with quantities/specs]\\n- [Include technical details]\\n\\nTimeline:\\n- Duration: [Extract period]\\n- Milestones: [Extract phases if mentioned]\\n- Deadlines: [Extract specific dates]\\n\\nExclusions: [Extract any scope boundaries or exclusions mentioned]"
        },
        {
            "title": "3. PAYMENT TERMS",
            "content": "a) The Client agrees to pay the Service Provider [Extract total amount or structure]\\nb) Payment Schedule: [Extract when payments are due]\\nc) Payment Method: [Extract method - Stripe, wire, check, etc.]\\nd) Breakdown:\\n   - [Component 1]: [Amount]\\n   - [Component 2]: [Amount]\\n\\n[IF performance/variable fees mentioned, ADD calculation clarity, caps, metrics, dispute resolution per Part C]\\n[IF ad spend mentioned, ADD account ownership, transparency, unspent budget handling per Part C]"
        },
        {
            "title": "4. RESPONSIBILITIES",
            "content": "Client Responsibilities:\\na) [Every client obligation from transcription]\\nb) [Include access/data requirements]\\nc) [Include approval/feedback timelines]\\n\\nService Provider Responsibilities:\\na) [Every provider deliverable and obligation]\\nb) [Include quality standards]\\nc) [Include timeline commitments]"
        },
        {
            "title": "5. OWNERSHIP & USAGE RIGHTS",
            "content": "CRITICAL: All ownership rights, intellectual property, and usage rights for all deliverables, content, and work product remain exclusively with the Service Provider unless explicitly transferred in writing.\\n\\nFinal Deliverables Ownership: [Extract or default to Service Provider]\\nClient Usage Rights: [Extract permitted usage]\\nService Provider Rights: [Extract what provider can do with work]"
        },
        {
            "title": "6. CONFIDENTIALITY",
            "content": "CRITICAL: All information, content, deliverables, and materials exchanged or created under this contract shall be kept strictly confidential by both parties unless otherwise agreed in writing.\\n\\nConfidential Information: [Extract what must be confidential]\\nObligations: Both parties must maintain confidentiality and not disclose to third parties\\nExceptions: [Extract any exceptions mentioned]\\nDuration: [Extract or use 'Duration of contract plus 2 years']"
        },
        {
            "title": "7. TERM & TERMINATION",
            "content": "Contract Duration: [Extract exact period - e.g., '3 months commencing November 6, 2024']\\nContract Plan/Tier: [Extract specific plan name if mentioned]\\n\\nTermination Rights:\\na) Either party may terminate with [Extract notice period or use '30 days'] written notice\\nb) Outstanding Payments: [Extract payment obligations on termination]\\n\\n[IF performance goals + long duration mentioned, ADD performance exit clause per Part C]\\n[IF harsh penalties mentioned, MODERATE to 50% cap per Part C]"
        },
        {
            "title": "8. GOVERNING LAW & DISPUTES",
            "content": "Governing Law: [Extract jurisdiction or '⚠️ CLARIFICATION NEEDED: Jurisdiction']\\nJurisdiction: [Extract court location or '⚠️ CLARIFICATION NEEDED: Court jurisdiction']\\nDispute Resolution: [Extract process or 'Good faith negotiation, followed by mediation if needed']"
        },
        {
            "title": "9. SIGNATURES",
            "content": "IN WITNESS WHEREOF, the parties hereto have executed this Contract as of the day and year first above written.\\n\\nService Provider:\\nSignature: ____________________\\nName: [Extract name]\\nDate: _______\\n\\nClient:\\nSignature: ____________________\\nName: [Extract name]\\nTitle: [Extract title if mentioned]\\nDate: _______"
        }
    ]
}

═══════════════════════════════════════════════════════════════════════
PART E: CONTENT MAPPING INSTRUCTIONS
═══════════════════════════════════════════════════════════════════════

How to map the transcription to the contract:

1. EXTRACT INFORMATION from the transcription for:
   - Party names, dates, services, payment, responsibilities, special terms

2. MAP TO APPROPRIATE SECTIONS:
   - Section 1: Party names, start date, general purpose
   - Section 2: Detailed services, deliverables, deadlines
   - Section 3: ALL payment information (amounts, schedule, method)
   - Section 4: What each party must do
   - Section 5: Ownership (stays with provider unless transferred)
   - Section 6: Confidentiality (all info confidential unless agreed)
   - Section 7: Duration and termination
   - Section 8: Legal jurisdiction
   - Section 9: Signature lines

3. ADD PROFESSIONAL CONTEXT:
   - Don't just dump raw transcription text
   - Wrap information in professional legal language
   - Use complete sentences and proper clause structure
   - Add standard legal phrasing where appropriate

4. USE PROFESSIONAL STYLE:
   - "The Client agrees to pay..." (not just "Payment: $500")
   - "The Service Provider will..." (not just "Provider: Does work")
   - Use lettered sub-clauses (a, b, c) for multiple related items
   - Use formal but clear language

5. MAINTAIN CONCISENESS & CLARITY:
   - Keep paragraphs to 2-3 sentences maximum
   - Use lettered clauses (a, b, c) for lists
   - Be direct and precise
   - Each sentence should convey essential information only

6. HANDLING MISSING OR UNCLEAR INFORMATION:
   A. For NON-CRITICAL information:
      → Use "To be determined"
   B. For CRITICAL information:
      → Use "⚠️ CLARIFICATION NEEDED: [describe what needs to be clarified]"
      
      CRITICAL info includes:
      ✓ Payment amounts, calculation methods, schedules
      ✓ Contract duration, start/end dates
      ✓ Core deliverables and quantities
      ✓ Key deadlines
      ✓ Performance metrics tied to payment/termination
      ✓ Termination penalties
      
      NON-CRITICAL info includes:
      ✓ Email addresses
      ✓ Exact street addresses
      ✓ Secondary contact info
      ✓ Meeting frequency details

7. REMEMBER: All content comes from the transcription, NOT from any example.

8. DO NOT ADD CLAUSES NOT MENTIONED:
   - NEVER add late payment terms, penalties, or fees unless explicitly stated
   - NEVER add clauses about topics not discussed
   - Only include what was actually mentioned

═══════════════════════════════════════════════════════════════════════
PART F: PRE-GENERATION CHECKLIST
═══════════════════════════════════════════════════════════════════════

Before outputting the final contract, verify you have:

✓ EXTRACTED all information from transcription (not invented)
✓ FLAGGED any critical ambiguities with "⚠️ CLARIFICATION NEEDED:"
✓ NOT INVENTED any data (pricing, dates, terms) not in transcription
✓ NOT COPIED any specifics from style references
✓ USED "To be determined" only for non-critical missing info
✓ ADDED relevant protective clauses from Part C where applicable
✓ MAINTAINED the 9-section JSON structure from Part D
✓ USED professional legal tone and formatting
✓ KEPT all sections concise with lettered sub-clauses

Generate the comprehensive contract JSON now using ONLY information from the transcription.`;
        
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
