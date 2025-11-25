const OpenAI = require('openai');

// Singleton OpenAI instance
let openaiInstance = null;

const getOpenAIClient = () => {
    if (!openaiInstance) {
        if (!process.env.OPENAI_API_KEY) {
            throw new Error('OPENAI_API_KEY is not configured');
        }
        openaiInstance = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
    }
    return openaiInstance;
};

module.exports = {
    getOpenAIClient
};
