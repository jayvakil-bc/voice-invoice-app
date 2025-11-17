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
□ When are payments due? (Specific timing: immediate, within X hours, on anniversary, etc.)
□ How are invoices delivered? (Stripe, wire, check, number of invoices, etc.)
□ When does contract become effective? (On signing, on payment, on both payments clearing, etc.)
□ What payment method was specified?
□ Are there request volume tiers? (Baseline, cap, upgrade triggers, grace periods)
□ Are there incremental system costs? (Per-system pricing, prorating, integration costs)
□ What are performance guarantee remedies? (Specific consequences for missing metrics)

STEP 4: IDENTIFY RESPONSIBILITIES
□ What must the client provide/do?
□ What must the service provider deliver/do?
□ Are there any specific deadlines tied to responsibilities?

STEP 5: CHECK FOR SPECIAL TERMS
□ Ownership/IP rights mentioned?
□ Confidentiality requirements stated?
□ Performance metrics or goals discussed? (With specific percentages and consequences?)
□ Termination conditions specified? (Material breach, cure periods, binding commitment?)
□ Contract duration explicitly stated? (Including whether it's binding?)
□ Training and support details? (Team names, duration, topics, CSM assignment?)
□ Data volumes mentioned? (Terabytes, records, structured vs unstructured?)
□ System counts and names? (How many, which specific systems?)
□ Implementation milestones? (Week-by-week breakdown?)
□ Governing law and jurisdiction? (State, county, arbitration rules?)

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

4. PERFORMANCE GUARANTEE REMEDIES (TIER 1 PRIORITY)
IF the transcription mentions:
- Specific performance metrics (95%, 98%, 90% targets, etc.)
- Evaluation periods (120-day validation, 90-day checkpoints, etc.)
- Consequences for missing targets

THEN add detailed remedies in Section 3 (Payment Terms):
a) METRIC-SPECIFIC REMEDIES:
   For each metric mentioned, include:
   - Exact threshold (e.g., "If coverage falls below 95%")
   - Validation method (e.g., "validated via joint audit of 200 random data fields at day 90 with DPO")
   - Specific consequence (e.g., "extends contract by 6 months at no additional cost" OR "refunds 25% of first-year subscription")
   - Measurement source (e.g., "measured via platform dashboard logs" OR "measured via Jira tickets vs. DataVault timestamps")
   
b) STRUCTURED FORMAT:
   "Performance Guarantee Remedies ([evaluation period]):\\n
    a) [Metric Name]: If [condition] (validated via [method]), Service Provider [remedy]\\n
    b) [Metric Name]: If [condition] (measured via [method]), Service Provider [remedy]\\n
    c) [Metric Name]: If [condition] (measured via [method]), Service Provider [remedy]"

5. REQUEST VOLUME TIERS (TIER 1 PRIORITY)
IF the transcription mentions:
- Baseline request volumes (e.g., 50 requests per month)
- Capacity limits or headroom (e.g., up to 75 requests)
- Tier upgrade triggers or overage handling

THEN add complete volume structure in Section 3:
"Request Volume Structure:\\n
 - Baseline: [X requests per month]\\n
 - Included Headroom: Up to [Y requests per month]\\n
 - Tier Upgrade: If Client consistently exceeds [Y] requests for [X] consecutive months, pricing moves to $[amount]/month tier\\n
 - Grace Period: [X]-day grace period before overage enforcement\\n
 - Transparency: DataVault will discuss tier adjustment transparently rather than apply unexpected overage fees"

6. COMPLETE LEGAL ENTITY NAMES (TIER 1 PRIORITY)
Always extract and format complete legal names:
- Service Provider: Include entity type (Inc., LLC, Corp.) and full address if mentioned
- Client: Include full company legal name, state of incorporation if mentioned, authorized signatory with full name and title
- Flag with ⚠️ if entity type or full legal name is unclear

7. PAYMENT TIMING & CONTRACT START (TIER 2 PRIORITY)
IF transcription mentions specific payment delivery timing:
Extract and include:
- How invoices are delivered (e.g., "Two Stripe invoices sent within 4 hours")
- When each payment is due (e.g., "due immediately" vs "due on anniversary")
- When contract becomes effective (e.g., "when both payments clear")
- Kickoff timing relative to payment (e.g., "Executive kickoff within 48 hours of payment clearance")

8. IMPLEMENTATION MILESTONES (TIER 2 PRIORITY)
IF transcription mentions phase-by-phase timeline:
Break down into week-by-week or phase-by-phase structure:
"Implementation Timeline ([total duration]):\\n
 - Week 0: [Extract kickoff details]\\n
 - Weeks 1-2: [Extract milestone]\\n
 - Weeks 3-4: [Extract milestone with deliverables]\\n
 - Weeks 5-6: [Extract milestone]\\n
 - Weeks 7-8: [Extract milestone and go-live details]"

9. TRAINING & SUPPORT DETAILS (TIER 3 PRIORITY)
IF transcription mentions training sessions, CSM, or support:
Extract specific details:
- Who gets trained (team names, number of people)
- Duration (half-day, 2-hour, etc.)
- Topics covered
- CSM assignment duration and meeting frequency
- Self-sufficiency timeline

CRITICAL: DO NOT add late payment penalties, interest charges, or payment-related fees unless explicitly mentioned in the transcription.

═══════════════════════════════════════════════════════════════════════
PART D: ADAPTIVE OUTPUT STRUCTURE - BUILD WHAT YOU FIND
═══════════════════════════════════════════════════════════════════════

CRITICAL: The sections below are GUIDELINES, not rigid templates. 

YOUR JOB: Extract information from the transcription and intelligently organize it into appropriate contract sections. If the transcription mentions something that doesn't fit the examples below, CREATE A NEW SUBSECTION OR ADD IT WHERE IT MAKES SENSE.

DO NOT force information into predetermined templates if it doesn't fit naturally.
DO capture EVERY detail mentioned in the transcription, even if it's unconventional.

Return ONLY valid JSON (no markdown, no code blocks) with this structure:

{
    "title": "[Descriptive title based on the services discussed]",
    "effectiveDate": "${todayFormatted}",
    "sections": [
        {
            "title": "1. AGREEMENT OVERVIEW",
            "content": "[Extract and format professionally: Service Provider name, Client name, Effective Date, Contract Duration, Purpose/Description of agreement]"
        },
        {
            "title": "2. SCOPE OF WORK",
            "content": "[Extract ALL services, deliverables, timelines, milestones, technical specs, system counts, data volumes, implementation phases, operational notes, exclusions - CAPTURE EVERYTHING mentioned about what's being delivered]"
        },
        {
            "title": "3. PAYMENT TERMS",
            "content": "[Extract ALL payment information: total amounts, fee breakdowns, payment schedules, timing, methods, volume tiers, incremental pricing, performance guarantees with specific remedies, bonus structures, caps, when payments trigger, how invoices are sent - CAPTURE EVERY FINANCIAL DETAIL]"
        },
        {
            "title": "4. RESPONSIBILITIES",
            "content": "[Extract what Client must do and what Service Provider must do. Include training details, support details, CSM assignments, meeting frequencies, approval processes, cooperation requirements - CAPTURE ALL OBLIGATIONS]"
        },
        {
            "title": "5. INTELLECTUAL PROPERTY & USAGE RIGHTS",
            "content": "[If IP/ownership mentioned in transcription, extract it here. Otherwise use standard SaaS language: Platform Ownership (Provider retains), Client Data Ownership (Client retains, Provider is Data Processor), Data Maps/Configs (Client gets export rights), Anonymized Telemetry (Provider can use), Post-Termination (30-day export, 90-day deletion)]"
        },
        {
            "title": "6. CONFIDENTIALITY & DATA PROCESSING",
            "content": "[If confidentiality/DPA mentioned in transcription, extract it here. Otherwise use standard enterprise language: Mutual Confidentiality (5-year survival), Data Processor Role (GDPR/CCPA compliance), DPA requirement (30 days with SCCs), Security Standards (SOC 2 Type II, encryption, MFA), Subprocessors (30-day notice), Breach Notification (24 hours), Audit Rights (annual)]"
        },
        {
            "title": "7. TERM & TERMINATION",
            "content": "[Extract contract duration, binding period, termination rights, cure periods, notice requirements, non-renewal process, performance-based exit clauses, refund provisions, what happens to payments on termination - CAPTURE ALL TERMINATION TERMS]"
        },
        {
            "title": "8. GOVERNING LAW & DISPUTES",
            "content": "[Extract governing law, jurisdiction, arbitration rules if mentioned. Otherwise use reasonable defaults: State law (Delaware or mutual agreement), arbitration (AAA Commercial Rules), good faith negotiation]"
        },
        {
            "title": "9. SIGNATURES",
            "content": "[Standard signature block with extracted names, titles, company names for both Service Provider and Client]"
        }
    ]
}

ADAPTIVE INSTRUCTIONS:
- If transcription mentions ROI/business context, ADD it to Section 2 or create "Business Context" subsection
- If transcription mentions detailed SLAs, ADD them to Section 4 or create "Service Level Agreement" subsection
- If transcription mentions warranty/indemnification, ADD Section 10 for "Warranties & Indemnification"
- If transcription mentions specific compliance requirements (HIPAA, SOX, PCI), ADD them to Section 6
- If transcription mentions renewal terms/pricing, ADD subsection to Section 7
- The goal is to capture EVERYTHING discussed, not fit into a template

═══════════════════════════════════════════════════════════════════════
PART E: INTELLIGENT CONTENT MAPPING - BE ADAPTIVE, NOT RIGID
═══════════════════════════════════════════════════════════════════════

CORE PRINCIPLE: Your job is to CAPTURE EVERYTHING from the transcription and organize it intelligently, not force it into predetermined boxes.

1. COMPREHENSIVE EXTRACTION:
   Read the ENTIRE transcription carefully and identify ALL mentioned:
   - Party information (names, roles, titles, companies)
   - Services/deliverables (be specific - quantities, specs, systems, data volumes)
   - Payment details (amounts, timing, methods, volume tiers, incremental costs, guarantees)
   - Timeline/milestones (phases, weeks, deadlines, kickoff timing)
   - Responsibilities (who does what, when, with what resources)
   - Special terms (performance metrics, training, support, ROI context)
   - Legal requirements (termination, IP, confidentiality, compliance)

2. INTELLIGENT ORGANIZATION:
   - Group related information together logically
   - If something doesn't fit neatly into a section, ADD A SUBSECTION
   - If transcription is detailed about one topic, reflect that detail in the contract
   - If transcription is vague about something, note it but don't invent details
   - Think: "What would make this contract MOST useful to both parties?"

3. PROFESSIONAL FORMATTING:
   - Use numbered/lettered clauses for organization (a, b, c)
   - Write in complete sentences with proper legal phrasing
   - "The Client agrees to..." not "Client: agrees"
   - "Service Provider will deliver..." not "Provider does X"
   - Use subsection headers when needed ("Request Volume Structure:", "Performance Guarantee Remedies:")

4. DETAIL PRESERVATION:
   - If transcription says "17 systems" → List the count AND names if mentioned
   - If transcription says "95% accuracy" → Include the percentage, validation method, and consequence
   - If transcription says "$1,500/month per system" → Include the per-unit cost, prorating logic, and example calculation
   - If transcription says "8-week timeline" → Break down the week-by-week milestones if provided
   - DO NOT summarize away specifics - contracts need precision

5. ADAPTIVE STRUCTURE:
   - Unusual service model? Explain it clearly in Section 2
   - Complex payment structure? Break it down step-by-step in Section 3
   - Special compliance requirements? Add them to Section 6
   - Detailed SLAs? Add subsection to Section 4 or create Section 10
   - The 9-section structure is a STARTING POINT, not a constraint

6. HANDLING MISSING INFORMATION:
   A. For NON-CRITICAL information:
      → Use "To be determined"
   B. For CRITICAL information:
      → Use "⚠️ CLARIFICATION NEEDED: [describe what needs to be clarified]"
      
      CRITICAL info that REQUIRES flagging if missing:
      ✓ Payment amounts (total contract value)
      ✓ Payment calculation methods (if performance-based or variable)
      ✓ Contract duration, start/end dates
      ✓ Core deliverables and quantities
      ✓ Key project deadlines
      ✓ Performance metrics tied to payment/termination
      ✓ Termination penalties or early exit fees
      
      INFO that can use "To be determined" (DO NOT flag as missing):
      ✓ Complete legal entity names → Use company name provided, add "(To be determined at signing)" if entity type unclear
      ✓ Authorized signatory names → Use name provided, add "with authorized signatory title (to be confirmed at execution)"
      ✓ Governing law/jurisdiction → Use "Governing law and jurisdiction to be determined by mutual agreement (typically Delaware or state of Client's incorporation)"
      ✓ Payment net terms → Use "Payment due on receipt" as default
      ✓ Email addresses/phone numbers
      ✓ Exact street addresses
      ✓ Secondary contact info
      
      CRITICAL: Sections 5 (IP Rights) and 6 (Confidentiality/DPA) are now auto-generated with industry-standard language. DO NOT flag these sections as missing.

7. EXTRACT DATA VOLUMES & SYSTEM COUNTS:
   - Always include specific numbers: "15 terabytes", "17 systems", "50 requests per month"
   - List ALL system names mentioned, not just a count
   - Include data types: "structured data", "unstructured data", "PII", etc.

8. EXTRACT DETAILED DELIVERABLES:
   If transcription mentions comprehensive deliverables, include specific items like:
   - Data inventory with classifications
   - Real-time vs snapshot reporting
   - Access logs and flow diagrams
   - Deletion verification methods
   - Compliance report formats
   - Shadow IT discovery capabilities
   - Cryptographic proof logging
   - Machine learning-based classification
   - Retention policy enforcement details

9. EXTRACT INCREMENTAL PRICING:
   If transcription mentions adding systems/users/capacity:
   - Per-unit costs (e.g., "$1,500/month per system")
   - Prorating calculations (e.g., "6 months into 2-year contract = $9,000 for remaining 18 months")
   - What's included (e.g., "integration engineering work included")
   - Renewal treatment (e.g., "rolls into standard renewal pricing")

10. REMEMBER: All content comes from the transcription, NOT from any example.

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
        
        // Super flexible party extraction - checks ALL sections if needed
        const allContent = contractData.sections?.map(s => s.content).join('\n') || '';
        
        const extractServiceProvider = (content) => {
            // Remove common words that aren't company names
            const removeNoise = (str) => str.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
            
            // Try everything - be aggressive
            const patterns = [
                /(?:service\s*provider|provider|vendor|contractor|seller|consultant|freelancer|company|business|firm)[:\s-]+([^,\n.]+?)(?:\n|,|\.|$)/gi,
                /(?:this\s+agreement\s+is\s+(?:made\s+)?(?:by\s+and\s+)?between|entered\s+into\s+by|agreement\s+between)\s+([^,\n.]+?)(?:\s+and|\s+\(|,)/gi,
                /(?:^|\n)([A-Z][A-Za-z0-9\s&.,''-]+?(?:Inc\.|LLC|Corp\.|Corporation|Ltd\.|Limited|Co\.|Company))/gm,
                /(?:services\s+(?:provided|offered)\s+by|delivered\s+by)\s+([^,\n.]+)/gi
            ];
            
            const candidates = new Set();
            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const name = removeNoise(match[1]);
                    if (name && name.length > 2 && name.length < 100 && !name.includes('⚠️')) {
                        candidates.add(name);
                    }
                }
            }
            
            // Return first valid candidate
            const validCandidates = Array.from(candidates).filter(c => 
                c && !c.toLowerCase().includes('clarification') && !c.toLowerCase().includes('to be determined')
            );
            
            return validCandidates[0] || 'Service Provider (To be determined at signing)';
        };
        
        const extractClient = (content) => {
            const removeNoise = (str) => str.replace(/\(.*?\)/g, '').replace(/\[.*?\]/g, '').trim();
            
            // Try everything for client too
            const patterns = [
                /(?:client|customer|buyer|purchaser|recipient)[:\s-]+([^,\n.]+?)(?:\n|,|\.|$)/gi,
                /(?:and|with)\s+([A-Z][A-Za-z0-9\s&.,''-]+?)(?:\s+\(|,|\.|$)/g,
                /(?:services\s+(?:to|for)|provided\s+to)\s+([^,\n.]+)/gi,
                /(?:entered\s+into\s+with)\s+([^,\n.]+)/gi
            ];
            
            const candidates = new Set();
            for (const pattern of patterns) {
                let match;
                while ((match = pattern.exec(content)) !== null) {
                    const name = removeNoise(match[1]);
                    if (name && name.length > 2 && name.length < 100 && !name.includes('⚠️')) {
                        // Skip if it's the service provider
                        if (!name.toLowerCase().includes('provider') && 
                            !name.toLowerCase().includes('vendor') &&
                            !name.toLowerCase().includes('contractor')) {
                            candidates.add(name);
                        }
                    }
                }
            }
            
            const validCandidates = Array.from(candidates).filter(c => 
                c && !c.toLowerCase().includes('clarification') && !c.toLowerCase().includes('to be determined')
            );
            
            return validCandidates[0] || 'Client (To be determined at signing)';
        };
        
        // Map the OpenAI response to our database schema structure
        const contractToSave = {
            userId,
            originalTranscript: transcript,
            contractTitle: contractData.title,
            effectiveDate: contractData.effectiveDate,
            parties: {
                serviceProvider: {
                    name: extractServiceProvider(allContent),
                    address: 'To be determined',
                    email: 'To be determined',
                    phone: 'To be determined'
                },
                client: {
                    name: extractClient(allContent),
                    signingAuthority: '',
                    address: 'To be determined',
                    email: 'To be determined',
                    phone: 'To be determined'
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
