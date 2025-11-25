const express = require('express');
const passport = require('passport');
const authController = require('../controllers/authController');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

const PORT = process.env.PORT || 3000;
let clientURL = process.env.CLIENT_URL || `http://localhost:${PORT}`;
if (clientURL && !clientURL.startsWith('http')) {
    clientURL = `https://${clientURL}`;
}

// Health check
router.get('/api/health', (req, res) => {
    res.json({ service: 'auth-service', status: 'healthy' });
});

// OAuth routes
router.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

router.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: clientURL || 'http://localhost:3000/' }),
    (req, res) => {
        if (!req.user.businessInfo || !req.user.businessInfo.setupCompleted) {
            console.log('[Auth] New user detected, redirecting to onboarding');
            res.redirect((clientURL || 'http://localhost:3000') + '/onboarding.html');
        } else {
            console.log('[Auth] Existing user, redirecting to dashboard');
            res.redirect((clientURL || 'http://localhost:3000') + '/dashboard');
        }
    }
);

// User routes
router.get('/auth/user', authController.getUser);
router.get('/auth/logout', authController.logout);
router.post('/auth/verify', authController.verifyToken);

// Business info routes
router.post('/api/user/business-info', requireAuth, authController.saveBusinessInfo);
router.get('/api/user/business-info', requireAuth, authController.getBusinessInfo);
router.get('/api/user/business-context', requireAuth, authController.getBusinessContext);

module.exports = router;
