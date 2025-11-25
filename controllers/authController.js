const { User } = require('../models');

const getUser = (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                picture: req.user.picture,
                businessInfo: req.user.businessInfo
            }
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
};

const logout = (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        req.session.destroy((err) => {
            if (err) {
                console.error('[Auth] Session destroy error:', err);
            }
            res.redirect('/');
        });
    });
};

const verifyToken = (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            valid: true, 
            userId: req.user._id.toString(),
            email: req.user.email 
        });
    } else {
        res.status(401).json({ valid: false });
    }
};

const saveBusinessInfo = async (req, res) => {
    try {
        console.log('[Onboarding] Saving business info for user:', req.user._id);
        
        const { businessName, businessAddress, businessEmail, businessPhone, website, taxId } = req.body;
        
        if (!businessName || !businessAddress || !businessEmail || !businessPhone) {
            return res.status(400).json({ error: 'Missing required business information' });
        }
        
        req.user.businessInfo = {
            businessName,
            businessAddress,
            businessEmail,
            businessPhone,
            website: website || null,
            taxId: taxId || null,
            setupCompleted: true
        };
        
        await req.user.save();
        
        console.log('[Onboarding] Business info saved successfully');
        
        res.json({
            success: true,
            message: 'Business information saved successfully',
            businessInfo: req.user.businessInfo
        });
    } catch (error) {
        console.error('[Onboarding] Error saving business info:', error);
        res.status(500).json({ error: 'Failed to save business information' });
    }
};

const getBusinessInfo = async (req, res) => {
    try {
        res.json({
            businessInfo: req.user.businessInfo || null
        });
    } catch (error) {
        console.error('[Business Info] Error fetching:', error);
        res.status(500).json({ error: 'Failed to fetch business information' });
    }
};

const getBusinessContext = async (req, res) => {
    try {
        const user = await User.findById(req.user._id);
        
        res.json({
            businessContext: user.businessContext || null,
            insights: {
                hasContext: !!(user.businessContext && user.businessContext.confidenceScore > 0),
                confidenceScore: user.businessContext?.confidenceScore || 0,
                totalContracts: user.businessContext?.totalContracts || 0,
                canAutofill: user.businessContext?.confidenceScore >= 50,
                summary: user.businessContext ? 
                    `${user.businessContext.industry || 'Unknown industry'} | ${user.businessContext.totalContracts || 0} contracts` :
                    'No context learned yet'
            }
        });
    } catch (error) {
        console.error('[Business Context] Error fetching:', error);
        res.status(500).json({ error: 'Failed to fetch business context' });
    }
};

module.exports = {
    getUser,
    logout,
    verifyToken,
    saveBusinessInfo,
    getBusinessInfo,
    getBusinessContext
};
