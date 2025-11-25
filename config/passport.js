const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { User } = require('../models');

const configurePassport = () => {
    const PORT = process.env.PORT || 3000;
    let callbackBase = process.env.AUTH_PUBLIC_URL || `http://localhost:${PORT}`;
    
    if (callbackBase && !callbackBase.startsWith('http')) {
        callbackBase = `https://${callbackBase}`;
    }

    passport.use(new GoogleStrategy({
        clientID: process.env.GOOGLE_CLIENT_ID,
        clientSecret: process.env.GOOGLE_CLIENT_SECRET,
        callbackURL: `${callbackBase.replace(/\/$/, '')}/auth/google/callback`,
        accessType: 'offline', // Get refresh token
        prompt: 'consent' // Force consent to get refresh token
    }, async (accessToken, refreshToken, profile, done) => {
        try {
            let user = await User.findOne({ googleId: profile.id });
            
            if (!user) {
                user = await User.create({
                    googleId: profile.id,
                    email: profile.emails[0].value,
                    name: profile.displayName,
                    picture: profile.photos[0].value,
                    googleAccessToken: accessToken,
                    googleRefreshToken: refreshToken
                });
                console.log('[Auth] New user created:', user.email);
            } else {
                user.name = profile.displayName;
                user.picture = profile.photos[0].value;
                user.googleAccessToken = accessToken;
                // Only update refresh token if provided (Google doesn't always send it)
                if (refreshToken) {
                    user.googleRefreshToken = refreshToken;
                }
                await user.save();
            }
            
            return done(null, user);
        } catch (error) {
            console.error('[Auth] OAuth error:', error);
            return done(error, null);
        }
    }));

    passport.serializeUser((user, done) => {
        done(null, user._id);
    });

    passport.deserializeUser(async (id, done) => {
        try {
            const user = await User.findById(id);
            done(null, user);
        } catch (error) {
            done(error, null);
        }
    });
};

module.exports = configurePassport;
