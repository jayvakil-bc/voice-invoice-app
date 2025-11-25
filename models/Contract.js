const mongoose = require('mongoose');

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
    signatures: {
        serviceProvider: {
            signatureData: String,
            signedBy: String,
            signedAt: Date,
            ipAddress: String
        },
        client: {
            signatureData: String,
            signedBy: String,
            signedAt: Date,
            ipAddress: String
        }
    },
    status: {
        type: String,
        enum: ['draft', 'awaiting_signatures', 'partially_signed', 'fully_signed'],
        default: 'draft'
    },
    shareableLink: {
        token: { type: String, unique: true, sparse: true },
        createdAt: Date,
        expiresAt: Date,
        accessCount: { type: Number, default: 0 }
    },
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Contract', contractSchema);
