const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    businessInfo: {
        businessName: String,
        businessAddress: String,
        businessEmail: String,
        businessPhone: String,
        website: String,
        taxId: String,
        setupCompleted: { type: Boolean, default: false }
    },
    businessContext: {
        // AI-learned context about the user's business
        industry: String,
        serviceTypes: [String],
        commonClients: [String],
        averageDealSize: Number,
        typicalProjectDuration: String,
        
        // Extracted from voice transcripts and contracts
        voicePatterns: {
            commonPhrases: [String],
            serviceDescriptions: [String],
            pricingStructure: String
        },
        
        // Learning metadata
        totalContracts: { type: Number, default: 0 },
        totalInvoices: { type: Number, default: 0 },
        lastUpdated: Date,
        confidenceScore: { type: Number, default: 0, min: 0, max: 100 }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('User', userSchema);
