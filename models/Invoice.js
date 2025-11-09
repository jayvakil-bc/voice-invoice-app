const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    userId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },
    invoiceNumber: {
        type: String,
        required: true
    },
    serviceName: String,
    currency: {
        type: String,
        default: 'USD'
    },
    from: {
        name: String,
        address: String,
        email: String,
        phone: String
    },
    to: {
        name: String,
        company: String,
        email: String
    },
    items: [{
        description: String,
        qty: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: Number,
    total: Number,
    date: Date,
    dueDate: Date,
    notes: String,
    transcript: String,
    pdfUrl: String,
    createdAt: {
        type: Date,
        default: Date.now
    }
});

module.exports = mongoose.model('Invoice', invoiceSchema);
