const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    googleId: {
        type: String,
        required: true,
        unique: true
    },
    email: {
        type: String,
        required: true,
        unique: true
    },
    name: {
        type: String,
        required: true
    },
    picture: String,
    // Business context saved for future invoices
    businessContext: {
        companyName: String,
        address: String,
        phone: String,
        email: String,
        defaultCurrency: {
            type: String,
            default: 'USD'
        },
        defaultPaymentTerms: String,
        // Common clients for autocomplete
        frequentClients: [{
            name: String,
            company: String,
            email: String,
            lastUsed: Date
        }],
        // Common services/products for autocomplete
        commonServices: [{
            description: String,
            rate: Number,
            lastUsed: Date
        }]
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('User', userSchema);
