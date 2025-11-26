/**
 * Stripe Connect Routes
 */

const express = require('express');
const router = express.Router();
const { requireAuth } = require('../middleware/auth');
const {
    startStripeOnboarding,
    checkStripeStatus,
    disconnectStripe
} = require('../controllers/stripeController');

// Start Stripe onboarding
router.post('/connect/onboard', requireAuth, startStripeOnboarding);

// Check Stripe account status
router.get('/connect/status', requireAuth, checkStripeStatus);

// Disconnect Stripe account
router.post('/connect/disconnect', requireAuth, disconnectStripe);

module.exports = router;
