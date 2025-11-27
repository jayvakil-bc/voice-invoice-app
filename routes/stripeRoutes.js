/**
 * Stripe Connect Routes
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
    startStripeOnboarding,
    checkStripeStatus,
    disconnectStripe,
    handleWebhook
} = require('../controllers/stripeController');

// Webhook - must be BEFORE express.json() middleware
router.post('/webhook', express.raw({ type: 'application/json' }), handleWebhook);

// Start Stripe onboarding
router.post('/connect/onboard', requireAuth, startStripeOnboarding);

// Check Stripe account status
router.get('/connect/status', requireAuth, checkStripeStatus);

// Disconnect Stripe account
router.post('/connect/disconnect', requireAuth, disconnectStripe);

module.exports = router;

