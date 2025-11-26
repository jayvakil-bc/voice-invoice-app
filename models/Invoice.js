const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: false, ref: 'User' },
    originalTranscript: String,
    invoiceNumber: String,
    date: String,
    dueDate: String,
    from: {
        name: String,
        address: String,
        phone: String,
        email: String
    },
    to: {
        name: String,
        address: String,
        phone: String,
        email: String
    },
    items: [{
        description: String,
        quantity: Number,
        rate: Number,
        amount: Number
    }],
    subtotal: Number,
    tax: Number,
    total: Number,
    notes: String,
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Invoice', invoiceSchema);
