const { User } = require('../models');
const { getOpenAIClient } = require('./openai');

/**
 * 🧠 AI LEARNING AGENT
 * 
 * This agent learns about the user's business from EVERY interaction:
 * - Voice transcripts (what they say, how they say it)
 * - Contract data (services offered, pricing structures, client types)
 * - Patterns over time (typical deal sizes, project durations)
 * 
 * The more they use the system, the SMARTER it gets!
 */
async function learnFromContract(userId, transcript, contractData) {
    try {
        console.log('[AI Learning Agent] 🧠 Starting to learn from contract for user:', userId);
        
        const user = await User.findById(userId);
        if (!user) {
            console.log('[AI Learning Agent] User not found');
            return;
        }
        
        const openai = getOpenAIClient();
        
        // Prepare learning prompt for GPT-4
        const learningPrompt = `You are an AI business intelligence agent. Analyze this contract and voice transcript to extract key business insights about the user's business.

VOICE TRANSCRIPT:
${transcript}

CONTRACT DATA:
- Title: ${contractData.contractTitle}
- Service Provider: ${contractData.parties?.serviceProvider?.name || 'N/A'}
- Client: ${contractData.parties?.client?.name || 'N/A'}
- Sections: ${contractData.sections?.map(s => s.title).join(', ') || 'N/A'}

CURRENT BUSINESS CONTEXT (what we already know):
${JSON.stringify(user.businessContext || {}, null, 2)}

YOUR TASK:
Extract and update the following information. If you can't determine something with high confidence, leave it as null.

Return a JSON object with:
{
    "industry": "string - What industry/sector is this business in? (e.g., 'Digital Marketing Agency', 'SaaS Company', 'IT Consulting')",
    "serviceTypes": ["array", "of", "services"] - What specific services do they offer? Extract from transcript and contract sections,
    "commonClients": ["array", "of", "client", "types"] - What type of clients do they serve? (e.g., 'E-commerce businesses', 'Small businesses'),
    "averageDealSize": number - Estimated average contract value in dollars (extract from payment terms),
    "typicalProjectDuration": "string - How long are typical projects/contracts? (e.g., '3-6 months', 'Ongoing monthly', '1 year')",
    "commonPhrases": ["array", "of", "phrases"] - Extract 3-5 common phrases or terminology the user uses in their transcript,
    "serviceDescriptions": ["array", "of", "descriptions"] - How do they describe their services? Extract natural language descriptions,
    "pricingStructure": "string - What's their pricing model? (e.g., 'Monthly retainer', 'Per-project flat fee', 'Performance-based + retainer', 'Hourly rate')",
    "confidenceScore": number - Rate your confidence in these insights from 0-100
}

IMPORTANT: 
- Be conservative. Only extract what's CLEARLY stated or strongly implied.
- Merge with existing context intelligently (add new items to arrays, don't duplicate)
- If analyzing multiple contracts over time, identify PATTERNS not one-offs
- Focus on insights that help AUTO-FILL future contracts`;

        console.log('[AI Learning Agent] 📡 Calling OpenAI for business intelligence...');
        
        const response = await openai.chat.completions.create({
            model: 'gpt-4o',
            messages: [
                { 
                    role: 'system', 
                    content: 'You are a business intelligence AI that learns about users\' businesses from their contracts and transcripts. Always return valid JSON.' 
                },
                { role: 'user', content: learningPrompt }
            ],
            temperature: 0.3,
            response_format: { type: "json_object" }
        });
        
        const insights = JSON.parse(response.choices[0].message.content);
        console.log('[AI Learning Agent] 🎯 Insights extracted:', insights);
        
        // Merge insights with existing context
        const currentContext = user.businessContext || {};
        
        // Smart merging - add new items, don't duplicate
        const mergeArrays = (existing, newItems) => {
            const combined = [...(existing || []), ...(newItems || [])];
            return [...new Set(combined)].slice(0, 10);
        };
        
        const updatedContext = {
            industry: insights.industry || currentContext.industry,
            serviceTypes: mergeArrays(currentContext.serviceTypes, insights.serviceTypes),
            commonClients: mergeArrays(currentContext.commonClients, insights.commonClients),
            averageDealSize: insights.averageDealSize || currentContext.averageDealSize,
            typicalProjectDuration: insights.typicalProjectDuration || currentContext.typicalProjectDuration,
            voicePatterns: {
                commonPhrases: mergeArrays(currentContext.voicePatterns?.commonPhrases, insights.commonPhrases),
                serviceDescriptions: mergeArrays(currentContext.voicePatterns?.serviceDescriptions, insights.serviceDescriptions),
                pricingStructure: insights.pricingStructure || currentContext.voicePatterns?.pricingStructure
            },
            totalContracts: (currentContext.totalContracts || 0) + 1,
            totalInvoices: currentContext.totalInvoices || 0,
            lastUpdated: new Date(),
            confidenceScore: Math.min(
                (currentContext.confidenceScore || 0) + (insights.confidenceScore || 10), 
                100
            )
        };
        
        user.businessContext = updatedContext;
        await user.save();
        
        console.log('[AI Learning Agent] ✅ Business context updated! Confidence:', updatedContext.confidenceScore);
        console.log('[AI Learning Agent] 📊 Learned:', {
            industry: updatedContext.industry,
            serviceCount: updatedContext.serviceTypes?.length || 0,
            totalContracts: updatedContext.totalContracts
        });
        
    } catch (error) {
        console.error('[AI Learning Agent] ❌ Error:', error.message);
    }
}

module.exports = {
    learnFromContract
};
