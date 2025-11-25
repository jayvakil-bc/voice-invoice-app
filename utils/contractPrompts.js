/**
 * Contract generation prompts
 */

const getContractGenerationPrompt = (transcript, todayFormatted, businessContext) => {
    let contextEnhancement = '';
    if (businessContext && businessContext.confidenceScore >= 30) {
        contextEnhancement = `

═══════════════════════════════════════════════════════════════════════
📊 AI-LEARNED BUSINESS CONTEXT (Use this to enhance contract accuracy!)
═══════════════════════════════════════════════════════════════════════

The system has learned the following about this user's business from ${businessContext.totalContracts || 0} previous contracts:

Industry: ${businessContext.industry || 'Unknown'}
Services Offered: ${businessContext.serviceTypes?.join(', ') || 'Unknown'}
Typical Clients: ${businessContext.commonClients?.join(', ') || 'Unknown'}
Pricing Model: ${businessContext.voicePatterns?.pricingStructure || 'Unknown'}
Average Deal Size: ${businessContext.averageDealSize ? '$' + businessContext.averageDealSize.toLocaleString() : 'Unknown'}
Typical Duration: ${businessContext.typicalProjectDuration || 'Unknown'}

Common Phrases/Terminology:
${businessContext.voicePatterns?.commonPhrases?.map(p => `- "${p}"`).join('\n') || '- None yet'}

Service Descriptions:
${businessContext.voicePatterns?.serviceDescriptions?.map(d => `- ${d}`).join('\n') || '- None yet'}

💡 USE THIS CONTEXT TO:
1. Better understand ambiguous terms in the transcript
2. Fill in missing details with high-probability defaults (if confidence is high)
3. Recognize patterns in their service offerings
4. Suggest appropriate contract structures based on their typical deals

⚠️ IMPORTANT: This context is ASSISTIVE ONLY. Always prioritize the actual transcript content.`;
    }

    return `You are a professional contract generator. Your task is to take spoken/transcribed information and intelligently map it into a structured contract template.
${contextEnhancement}

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
TRANSCRIPTION TO EXTRACT FROM:
═══════════════════════════════════════════════════════════════════════

${transcript}

═══════════════════════════════════════════════════════════════════════
OUTPUT STRUCTURE
═══════════════════════════════════════════════════════════════════════

Return ONLY valid JSON (no markdown, no code blocks) with this structure:

{
    "title": "[Descriptive title based on the services discussed]",
    "effectiveDate": "${todayFormatted}",
    "parties": {
        "serviceProvider": {
            "name": "[Extract from transcript or 'Service Provider']",
            "address": "[Extract if mentioned or 'To be determined']",
            "email": "[Extract if mentioned or 'To be determined']",
            "phone": "[Extract if mentioned or 'To be determined']"
        },
        "client": {
            "name": "[Extract from transcript or 'Client']",
            "signingAuthority": "",
            "address": "[Extract if mentioned or 'To be determined']",
            "email": "[Extract if mentioned or 'To be determined']",
            "phone": "[Extract if mentioned or 'To be determined']"
        }
    },
    "sections": [
        {
            "title": "1. AGREEMENT OVERVIEW",
            "content": "[Extract: Service Provider name, Client name, Effective Date (USE ${todayFormatted}), Contract Duration, Purpose]"
        },
        {
            "title": "2. SCOPE OF WORK",
            "content": "[Extract ALL services, deliverables, timelines, milestones, technical specs, exclusions]"
        },
        {
            "title": "3. PAYMENT TERMS",
            "content": "[Extract ALL payment info: amounts, schedules, timing, methods, volume tiers, performance guarantees, SLAs]"
        },
        {
            "title": "4. RESPONSIBILITIES",
            "content": "[Extract what Client and Service Provider must do]"
        },
        {
            "title": "5. INTELLECTUAL PROPERTY & USAGE RIGHTS",
            "content": "[If IP/ownership mentioned, extract it. Otherwise use standard SaaS language]"
        },
        {
            "title": "6. CONFIDENTIALITY & DATA PROCESSING",
            "content": "[If confidentiality/DPA mentioned, extract it. Otherwise use standard enterprise language]"
        },
        {
            "title": "7. TERM & TERMINATION",
            "content": "[Extract contract duration, termination rights, notice requirements]"
        },
        {
            "title": "8. GOVERNING LAW & DISPUTES",
            "content": "[Extract governing law if mentioned. Otherwise use reasonable defaults]"
        },
        {
            "title": "9. SIGNATURES",
            "content": "[Standard signature block]"
        }
    ]
}

CRITICAL INSTRUCTIONS:
- Use ONLY information from the transcription
- Flag critical missing information with "⚠️ CLARIFICATION NEEDED:"
- For Sections 5 & 6, auto-generate industry-standard language if not explicitly discussed
- DO NOT add late payment penalties unless mentioned
- ALWAYS use ${todayFormatted} as the effective date
- Be adaptive - if transcript mentions unusual terms, include them intelligently

Generate the comprehensive contract JSON now using ONLY information from the transcription.`;
};

module.exports = {
    getContractGenerationPrompt
};
