const mongoose = require('mongoose');

const invoiceSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: 'User' },
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
    
    // Payment fields (Tier 1)
    currency: { type: String, default: 'USD' },
    paymentStatus: { 
        type: String, 
        enum: ['pending', 'paid', 'overdue', 'cancelled'],
        default: 'pending'
    },
    paymentLink: String,
    paymentDate: Date,
    stripePaymentId: String,
    
    // Recurring invoice fields (Tier 1)
    isRecurring: { type: Boolean, default: false },
    recurringSchedule: {
        frequency: {
            type: String,
            enum: ['weekly', 'bi-weekly', 'monthly', 'quarterly', 'yearly']
        },
        nextInvoiceDate: Date,
        endDate: Date,
        lastGeneratedDate: Date
    },
    parentInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'Invoice' }, // For recurring invoices
    
    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Invoice', invoiceSchema);
