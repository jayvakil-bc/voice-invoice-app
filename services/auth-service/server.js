require('dotenv').config({ path: '../../.env' });

const express = require('express');
const session = require('express-session');
const MongoStore = require('connect-mongo');
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const mongoose = require('mongoose');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || process.env.AUTH_SERVICE_PORT || 3001;

// MongoDB Connection
mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('[Auth Service] MongoDB Connected'))
    .catch(err => console.error('[Auth Service] MongoDB Error:', err));

// User Model (lightweight for auth)
const userSchema = new mongoose.Schema({
    googleId: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true },
    name: String,
    picture: String,
    createdAt: { type: Date, default: Date.now }
});

const User = mongoose.model('User', userSchema);

// Passport Google Strategy
// Build callback URL dynamically for Render / production
const callbackBase = process.env.AUTH_PUBLIC_URL || `http://localhost:${PORT}`;
passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: `${callbackBase.replace(/\/$/, '')}/auth/google/callback`
}, async (accessToken, refreshToken, profile, done) => {
    try {
        let user = await User.findOne({ googleId: profile.id });
        
        if (!user) {
            user = await User.create({
                googleId: profile.id,
                email: profile.emails[0].value,
                name: profile.displayName,
                picture: profile.photos[0].value
            });
            console.log('[Auth Service] New user created:', user.email);
        } else {
            // Update user info
            user.name = profile.displayName;
            user.picture = profile.photos[0].value;
            await user.save();
        }
        
        return done(null, user);
    } catch (error) {
        console.error('[Auth Service] OAuth error:', error);
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

// Middleware
// Trust proxy so secure cookies work behind Nginx / AWS load balancer
app.set('trust proxy', 1);
app.use(cors({ origin: process.env.CLIENT_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json());

// Session
app.use(session({
    secret: process.env.SESSION_SECRET || 'auth-secret',
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({ mongoUrl: process.env.MONGODB_URI }),
    cookie: {
        maxAge: 1000 * 60 * 60 * 24 * 7,
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production', // true for HTTPS in production
        sameSite: process.env.NODE_ENV === 'production' ? 'none' : 'lax',
        domain: process.env.NODE_ENV === 'production' 
            ? process.env.CLIENT_URL?.replace(/https?:\/\//, '') 
            : 'localhost'
    }
}));

app.use(passport.initialize());
app.use(passport.session());

// Routes
app.get('/health', (req, res) => {
    res.json({ service: 'auth-service', status: 'healthy' });
});

app.get('/auth/google', 
    passport.authenticate('google', { scope: ['profile', 'email'] })
);

app.get('/auth/google/callback',
    passport.authenticate('google', { failureRedirect: process.env.CLIENT_URL || 'http://localhost:3000/' }),
    (req, res) => {
        res.redirect((process.env.CLIENT_URL || 'http://localhost:3000') + '/dashboard');
    }
);

app.get('/auth/logout', (req, res) => {
    req.logout((err) => {
        if (err) return res.status(500).json({ error: 'Logout failed' });
        res.json({ success: true });
    });
});

app.get('/auth/user', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({
            authenticated: true,
            user: {
                id: req.user._id,
                email: req.user.email,
                name: req.user.name,
                picture: req.user.picture
            }
        });
    } else {
        res.status(401).json({ authenticated: false });
    }
});

// Verify token endpoint (for other services)
app.post('/auth/verify', (req, res) => {
    if (req.isAuthenticated()) {
        res.json({ 
            valid: true, 
            userId: req.user._id.toString(),
            email: req.user.email 
        });
    } else {
        res.status(401).json({ valid: false });
    }
});

app.listen(PORT, () => {
    console.log(`[Auth Service] Running on http://localhost:${PORT}`);
});

module.exports = app;
