module.exports = {
    ensureAuth: function(req, res, next) {
        console.log('Auth check - isAuthenticated:', req.isAuthenticated(), 'Session:', req.session?.passport);
        if (req.isAuthenticated()) {
            return next();
        }
        res.status(401).json({ error: 'Not authenticated' });
    },
    
    ensureGuest: function(req, res, next) {
        if (req.isAuthenticated()) {
            res.redirect('/dashboard');
        } else {
            return next();
        }
    }
};