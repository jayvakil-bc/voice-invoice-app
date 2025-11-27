const express = require('express');
const router = express.Router();
const analyticsController = require('../controllers/analyticsController');
const { requireAuth } = require('../middleware/auth');

// All analytics routes require authentication
router.use(requireAuth);

// Analytics endpoints
router.get('/overview', analyticsController.getOverview);
router.get('/revenue-trends', analyticsController.getRevenueTrends);
router.get('/top-clients', analyticsController.getTopClients);
router.get('/payment-status', analyticsController.getPaymentStatusBreakdown);
router.get('/recent-activity', analyticsController.getRecentActivity);
router.get('/currency-breakdown', analyticsController.getCurrencyBreakdown);

module.exports = router;

