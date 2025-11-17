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
PART D: REQUIRED OUTPUT STRUCTURE - JSON FORMAT
═══════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks) with this structure:

{
    "title": "Brief descriptive title (e.g., 'Data Governance Platform Services Agreement')",
    "effectiveDate": "${todayFormatted}",
    "sections": [
        {
            "title": "1. AGREEMENT OVERVIEW",
            "content": "Service Provider: [Full legal name]\\nClient: [Full company name + authorized signatory]\\nEffective Date: [Extract or ${todayFormatted}]\\nContract Type: [Extract tier/plan if mentioned]\\nContract Duration: [Extract exact period]\\nPurpose: [Extract comprehensive purpose]"
        },
        {
            "title": "2. SCOPE OF WORK",
            "content": "The Service Provider agrees to perform the following services:\\na) [Service 1 with complete details]\\nb) [Service 2 with complete details]\\nc) [Continue for all services mentioned]\\n\\nSystems Under Management: [Extract COUNT - e.g., 17 systems] including [list ALL system names: Salesforce, Zendesk, AWS RDS, Snowflake, etc.]\\n\\nData Volume: [Extract if mentioned - e.g., 15 terabytes of structured data under management]\\n\\nDeliverables:\\n- Complete data inventory with sensitivity classifications\\n- [List ALL specific deliverables with quantities/specs]\\n- [Include technical details: real-time metadata maps, access logs, flow diagrams, deletion verification, compliance reports]\\n- [Shadow IT discovery if mentioned]\\n- [Cryptographic proof logging if mentioned]\\n\\nImplementation Timeline:\\n- Duration: [Extract period - e.g., 8 weeks from contract start]\\n- Week 0: [Extract kickoff details - e.g., Executive kickoff within 48 hours of payment clearance]\\n- Weeks 1-2: [Extract milestone - e.g., System connections for all systems]\\n- Weeks 3-4: [Extract milestone - e.g., Automated data discovery scan, classification, data map build]\\n- Weeks 5-6: [Extract milestone - e.g., Policy configuration, retention rules, pilot testing]\\n- Weeks 7-8: [Extract milestone - e.g., Full rollout, team training, go-live]\\n- [Extract operational notes - e.g., All operations via read-only API connections, no production disruption]\\n\\nExclusions: [Extract any scope boundaries mentioned - e.g., work completely outside this scope not included]"
        },
        {
            "title": "3. PAYMENT TERMS",
            "content": "a) The Client agrees to pay the Service Provider [Extract total amount - e.g., $412,200 total]\\nb) Fee Breakdown:\\n   - [Component 1 - e.g., Annual Subscription Year 1: $183,600]\\n   - [Component 2 - e.g., Annual Subscription Year 2: $183,600]\\n   - [Component 3 - e.g., Onboarding Fee: $45,000]\\n\\nPayment Schedule:\\n- [Extract detailed timing - e.g., Two Stripe invoices sent within 4 hours of agreement execution]\\n- [Invoice 1 details - e.g., $45,000 onboarding fee due immediately]\\n- [Invoice 2 details - e.g., $183,600 Year 1 subscription due immediately]\\n- [Subsequent payments - e.g., Year 2 payment of $183,600 due on first anniversary]\\n- Contract Effective Date: [Extract - e.g., When both initial payments clear]\\n- [Kickoff timing - e.g., Executive kickoff scheduled within 48 hours of payment clearance]\\n\\nPayment Method: [Extract method - Stripe, wire transfer, check, etc.]\\n\\nRequest Volume Structure (if mentioned):\\n- Baseline: [Extract - e.g., 50 data subject requests per month]\\n- Included Headroom: [Extract - e.g., Up to 75 requests per month]\\n- Tier Upgrade Trigger: [Extract - e.g., If exceeds 75 requests for 3 consecutive months, pricing moves to $24,000/month tier]\\n- Grace Period: [Extract - e.g., 90-day grace period before overage enforcement]\\n- Transparency: [Extract - e.g., No surprise charges; tier adjustments discussed transparently]\\n\\nIncremental System Pricing (if mentioned):\\n- New Major Systems: [Extract - e.g., $1,500/month per system, prorated for remaining contract term]\\n- Example Calculation: [Extract if provided - e.g., System added 6 months in = $9,000 for remaining 18 months]\\n- Integration Work: [Extract - e.g., Engineering work included at no additional charge]\\n- Renewal: [Extract - e.g., New systems roll into standard renewal pricing]\\n\\nPerformance Guarantee Remedies (if mentioned - CRITICAL):\\n[If transcription mentions performance metrics with 95%, 98%, 90% or similar targets, include:]\\na) [Metric 1 - e.g., Data Discovery Coverage]: If falls below [X%] (validated via [audit method] at day [X] with [party]), Service Provider [remedy - e.g., extends contract by 6 months at no additional cost]\\nb) [Metric 2 - e.g., Deletion Success Rate]: If falls below [X%] in any [period] (measured via [method]), Service Provider [remedy]\\nc) [Metric 3 - e.g., Fulfillment Time]: If does not achieve [X% improvement] from baseline of [X] to [target] within [timeframe] (measured via [method]), Service Provider [remedy - e.g., refunds 25% of first-year subscription]\\n\\n[IF performance/variable fees mentioned, ADD calculation clarity, caps, metrics, dispute resolution per Part C]\\n[IF ad spend mentioned, ADD account ownership, transparency, unspent budget handling per Part C]"
        },
        {
            "title": "4. RESPONSIBILITIES",
            "content": "Client Responsibilities:\\na) [Every client obligation from transcription]\\nb) [Include access/data requirements - e.g., Provide necessary access to all systems]\\nc) [Include approval/feedback timelines - e.g., Approve content within reasonable timeframe]\\nd) [Include cooperation requirements]\\n\\nService Provider Responsibilities:\\na) [Every provider deliverable and obligation]\\nb) [Include quality standards - e.g., Ensure content aligns with Client's strategy]\\nc) [Include timeline commitments - e.g., Conduct at least 2 sessions per month]\\n\\nTraining & Support (if mentioned as included in onboarding/setup fee):\\n- [Team 1 Training - e.g., DPO/Compliance Team: Half-day workshop covering request submission, audit trail review, compliance report generation, policy configuration]\\n- [Team 2 Training - e.g., Engineering Team: 2-hour session covering integration architecture, data map review, new system connection setup]\\n- [Dedicated Support - e.g., Customer Success Manager: 6 months with weekly check-ins and participation in compliance stand-ups]\\n- [Self-sufficiency Target - e.g., Week 10]"
        },
        {
            "title": "5. INTELLECTUAL PROPERTY & USAGE RIGHTS",
            "content": "a) Platform Ownership: Service Provider retains all rights, title, and interest in its platform, software, algorithms, ML models, and proprietary technology.\\n\\nb) Client Data Ownership: Client retains all rights to its data. Service Provider acts as Data Processor under GDPR Article 28 and CCPA Section 1798.100.\\n\\nc) Data Maps & Configurations: Client receives perpetual, non-exclusive license to export and use data maps, policy configurations, audit reports, and compliance documentation generated during the contract term for internal compliance and operational purposes. Service Provider will provide full export within 30 days of termination.\\n\\nd) Anonymized Telemetry: Service Provider may use anonymized, aggregated usage data and system performance metrics for product improvement, analytics, and benchmarking, provided no personally identifiable information or Client-specific business data is included.\\n\\ne) Post-Termination: Upon contract termination, Service Provider will:\\n   - Provide Client with complete data export (data maps, policies, audit logs, configurations) within 30 days\\n   - Delete all Client data from Service Provider systems within 90 days unless retention required by law\\n   - Certify deletion in writing upon Client request"
        },
        {
            "title": "6. CONFIDENTIALITY & DATA PROCESSING",
            "content": "a) Mutual Confidentiality: All business terms, pricing, technical information, data maps, system architectures, and materials exchanged under this contract are confidential and may not be disclosed to third parties without prior written consent. This obligation survives contract termination for 5 years.\\n\\nb) Data Processor Role: Service Provider acts as Data Processor under GDPR Article 28 and CCPA. Client is Data Controller. Service Provider will process Client data only as instructed by Client and in accordance with applicable data protection laws.\\n\\nc) Data Processing Agreement: Parties will execute a separate Data Processing Agreement (DPA) within 30 days of contract execution, incorporating EU Standard Contractual Clauses for any transfers of personal data outside the European Economic Area.\\n\\nd) Security Standards: Service Provider maintains SOC 2 Type II certification and implements industry-standard security controls including:\\n   - Encryption of data at rest (AES-256) and in transit (TLS 1.3)\\n   - Role-based access controls and multi-factor authentication\\n   - Regular security audits and penetration testing\\n   - Continuous monitoring and threat detection\\n\\ne) Subprocessors: Service Provider may use subprocessors (cloud infrastructure providers) with 30-day advance notice to Client. Current subprocessors available upon request.\\n\\nf) Breach Notification: Service Provider will notify Client within 24 hours of discovering any security incident or suspected data breach affecting Client data, and will cooperate with Client's incident response procedures.\\n\\ng) Audit Rights: Client may audit Service Provider's security controls annually upon 30 days' written notice, either directly or through an independent third-party auditor bound by confidentiality obligations. Service Provider will provide reasonable access to documentation, systems, and personnel."
        },
        {
            "title": "7. TERM & TERMINATION",
            "content": "Contract Duration: [Extract exact period - e.g., 2 years commencing November 6, 2024]\\nBinding Period: [Extract if explicitly binding - e.g., 2-year binding commitment]\\nContract Plan/Tier: [Extract specific plan name - e.g., Enterprise Tier]\\n\\nTermination Rights:\\n- Standard Termination: [Extract - e.g., Early termination permitted only for material breach with 30-day cure period]\\n- Non-Renewal: [Extract - e.g., Either party may provide 30-day written notice before end of term to prevent automatic renewal]\\n- Notice Period: [Extract if different from above - e.g., 30 days written notice]\\n- Performance-Based Exit: [Extract if client can exit due to missed metrics - e.g., Performance guarantee extensions add 6 months to contract term, not optional cancellation rights]\\n\\nPayment on Termination:\\n- [Extract what happens to remaining payments - e.g., Outstanding payments non-refundable except as specified in performance guarantee remedies]\\n- [Extract any refund provisions]\\n- [Extract any penalty structure]\\n\\n[IF long contract + performance goals mentioned, ADD performance exit clause per Part C]\\n[IF harsh penalties mentioned, MODERATE to 50% cap per Part C]"
        },
        {
            "title": "8. GOVERNING LAW & DISPUTES",
            "content": "Governing Law: [Extract jurisdiction - e.g., Delaware law, California law] [If not mentioned: 'The laws of the State of Delaware (or state of mutual agreement), without regard to conflicts of law principles']\\nJurisdiction: [Extract court location - e.g., Courts of New Castle County, Delaware] [If not mentioned: 'Courts of competent jurisdiction in the applicable state']\\nDispute Resolution: [Extract process if mentioned - e.g., Good faith negotiation for 30 days, then binding arbitration under AAA Commercial Rules] [If not mentioned: 'Parties agree to good faith negotiation for 30 days. If unresolved, disputes shall be resolved through binding arbitration under the Commercial Arbitration Rules of the American Arbitration Association (AAA), with arbitration conducted in a mutually agreed location. Each party bears its own costs unless arbitrator decides otherwise.']"
        },
        {
            "title": "9. SIGNATURES",
            "content": "IN WITNESS WHEREOF, the parties hereto have executed this Contract as of the day and year first above written.\\n\\nService Provider:\\nSignature: ____________________\\nName: [Extract name with title - e.g., John Smith, CEO]\\n[Extract company name - e.g., DataVault Inc.]\\nDate: _______\\n\\nClient:\\nSignature: ____________________\\nName: [Extract full name with title - e.g., Rajesh Kumar, CTO]\\n[Extract company legal name]\\nDate: _______"
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
        
        // Extract party information from Section 1 content
        const section1Content = contractData.sections?.[0]?.content || '';
        const extractField = (content, fieldName) => {
            const regex = new RegExp(`${fieldName}:\\s*([^\\n]+)`, 'i');
            const match = content.match(regex);
            return match ? match[1].trim() : 'To be determined';
        };
        
        // Map the OpenAI response to our database schema structure
        const contractToSave = {
            userId,
            originalTranscript: transcript,
            contractTitle: contractData.title,
            effectiveDate: contractData.effectiveDate,
            parties: {
                serviceProvider: {
                    name: extractField(section1Content, 'Service Provider'),
                    address: 'To be determined',
                    email: 'To be determined',
                    phone: 'To be determined'
                },
                client: {
                    name: extractField(section1Content, 'Client'),
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
