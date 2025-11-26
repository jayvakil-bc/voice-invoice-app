/**
 * Stripe Connect Controller
 * Handles Stripe Connect onboarding and account management
 */

const { createConnectAccount, getAccountLink, getAccountStatus } = require('../utils/paymentService');
const { sendPaymentConfirmationEmail } = require('../utils/emailService');
const User = require('../models/User');
const Invoice = require('../models/Invoice');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

/**
 * Start Stripe Connect onboarding
 * Creates a connected account and returns onboarding URL
 */
const startStripeOnboarding = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        let accountId = user.stripeAccountId;
        let onboardingUrl;

        // If user already has an account, just get a new onboarding link
        if (accountId) {
            onboardingUrl = await getAccountLink(accountId);
        } else {
            // Create new account
            const result = await createConnectAccount(user._id.toString(), user.email);
            accountId = result.accountId;
            onboardingUrl = result.onboardingUrl;
            
            // Save account ID to user
            user.stripeAccountId = accountId;
            await user.save();
        }

        res.json({
            success: true,
            onboardingUrl,
            accountId
        });

    } catch (error) {
        console.error('[Stripe] Onboarding error:', error);
        res.status(500).json({ error: error.message || 'Failed to start Stripe onboarding' });
    }
};

/**
 * Check Stripe account status
 * Called after user returns from onboarding
 */
const checkStripeStatus = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user || !user.stripeAccountId) {
            return res.json({
                connected: false,
                onboarded: false
            });
        }

        const status = await getAccountStatus(user.stripeAccountId);
        
        // Update user record
        user.stripeOnboarded = status.detailsSubmitted;
        user.stripeChargesEnabled = status.chargesEnabled;
        user.stripeDetailsSubmitted = status.detailsSubmitted;
        await user.save();

        res.json({
            connected: true,
            accountId: user.stripeAccountId,
            ...status
        });

    } catch (error) {
        console.error('[Stripe] Status check error:', error);
        res.status(500).json({ error: error.message || 'Failed to check Stripe status' });
    }
};

/**
 * Disconnect Stripe account
 */
const disconnectStripe = async (req, res) => {
    try {
        const user = await User.findById(req.user.id);
        
        if (!user) {
            return res.status(404).json({ error: 'User not found' });
        }

        // Clear Stripe data
        user.stripeAccountId = undefined;
        user.stripeOnboarded = false;
        user.stripeChargesEnabled = false;
        user.stripeDetailsSubmitted = false;
        await user.save();

        res.json({
            success: true,
            message: 'Stripe account disconnected'
        });

    } catch (error) {
        console.error('[Stripe] Disconnect error:', error);
        res.status(500).json({ error: error.message || 'Failed to disconnect Stripe' });
    }
};

/**
 * Handle Stripe webhook events (payment confirmations)
 */
const handleWebhook = async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event;

    try {
        // Verify webhook signature
        if (webhookSecret) {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } else {
            // For testing without webhook secret
            event = req.body;
        }

        console.log('[Stripe Webhook] Event received:', event.type);

        // Handle successful payment
        if (event.type === 'checkout.session.completed' || event.type === 'payment_intent.succeeded') {
            const session = event.data.object;
            
            // Extract invoice number from metadata
            const invoiceNumber = session.metadata?.invoice_number;
            const userEmail = session.customer_email || session.metadata?.customer_email;
            
            console.log('[Stripe Webhook] Payment successful for invoice:', invoiceNumber);
            
            if (invoiceNumber) {
                // Find invoice and update status
                const invoice = await Invoice.findOne({ invoiceNumber });
                
                if (invoice) {
                    invoice.status = 'paid';
                    invoice.paidAt = new Date();
                    await invoice.save();
                    
                    console.log('[Stripe Webhook] Invoice marked as paid:', invoiceNumber);
                    
                    // Find the user who owns this invoice
                    const user = await User.findById(invoice.userId);
                    
                    if (user) {
                        // Send payment confirmation email
                        try {
                            await sendPaymentConfirmationEmail({
                                to: user.email,
                                invoiceNumber: invoice.invoiceNumber,
                                amount: invoice.total,
                                currency: invoice.currency || 'USD',
                                customerName: invoice.billTo?.name || 'Customer',
                                paymentDate: new Date()
                            });
                            
                            console.log('[Stripe Webhook] ✅ Payment confirmation email sent to:', user.email);
                        } catch (emailError) {
                            console.error('[Stripe Webhook] Email error:', emailError);
                        }
                    }
                }
            }
        }

        res.json({ received: true });

    } catch (err) {
        console.error('[Stripe Webhook] Error:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }
};

module.exports = {
    startStripeOnboarding,
    checkStripeStatus,
    disconnectStripe,
    handleWebhook
};
