/**
 * Stripe Connect Controller
 * Handles Stripe Connect onboarding and account management
 */

const { createConnectAccount, getAccountLink, getAccountStatus } = require('../utils/paymentService');
const User = require('../models/User');

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

module.exports = {
    startStripeOnboarding,
    checkStripeStatus,
    disconnectStripe
};
