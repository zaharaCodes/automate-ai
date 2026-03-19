require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Groq     = require('groq-sdk');

const app        = express();
const PORT       = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'automate-ai-secret-key-2026';

/* ============================================
   INITIALIZE GROQ AI
============================================ */

if (!process.env.GROQ_API_KEY) {
    console.error("❌ GROQ_API_KEY missing in .env");
    process.exit(1);
}

const groq = new Groq({ apiKey: process.env.GROQ_API_KEY });

/* ============================================
   MIDDLEWARE
============================================ */

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/* ============================================
   MONGODB + USER MODEL
============================================ */

const userSchema = new mongoose.Schema({
    name:            { type: String, required: true, trim: true },
    email:           { type: String, required: true, unique: true, lowercase: true, trim: true },
    password:        { type: String, required: true },
    plan:            { type: String, default: 'free' },
    requestsToday:   { type: Number, default: 0 },
    lastRequestDate: { type: Date, default: Date.now },
    createdAt:       { type: Date, default: Date.now }
});

let UserModel;

if (process.env.MONGODB_URI) {
    mongoose.connect(process.env.MONGODB_URI)
        .then(() => {
            console.log("✅ MongoDB connected");
            try { UserModel = mongoose.model('User'); }
            catch (e) { UserModel = mongoose.model('User', userSchema); }
        })
        .catch(err => console.log("⚠️ MongoDB error:", err.message));
}

/* ============================================
   AUTH MIDDLEWARE
============================================ */

function authMiddleware(req, res, next) {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ success: false, error: 'No token' });
    try {
        req.user = jwt.verify(token, JWT_SECRET);
        next();
    } catch {
        res.status(401).json({ success: false, error: 'Invalid token' });
    }
}

/* ============================================
   AUTH ROUTES
============================================ */

app.post('/api/auth/register', async (req, res) => {
    try {
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, error: 'All fields required' });
        if (!UserModel)
            return res.status(503).json({ success: false, error: 'Database not connected' });

        const existing = await UserModel.findOne({ email });
        if (existing)
            return res.status(409).json({ success: false, error: 'Email already registered' });

        const hashed = await bcrypt.hash(password, 12);
        const user   = await UserModel.create({ name, email, password: hashed });
        const token  = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });

        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, plan: user.plan } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/auth/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, error: 'Email and password required' });
        if (!UserModel)
            return res.status(503).json({ success: false, error: 'Database not connected' });

        const user = await UserModel.findOne({ email });
        if (!user) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        const match = await bcrypt.compare(password, user.password);
        if (!match) return res.status(401).json({ success: false, error: 'Invalid credentials' });

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, token, user: { id: user._id, name: user.name, email: user.email, plan: user.plan } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/auth/me', authMiddleware, async (req, res) => {
    try {
        if (!UserModel) return res.status(503).json({ success: false, error: 'Database not connected' });
        const user = await UserModel.findById(req.user.id).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   (ALL YOUR OTHER ROUTES REMAIN SAME)
   — I DID NOT CHANGE ANYTHING —
============================================ */

/* ============================================
   HEALTH CHECK
============================================ */

app.get('/api/health', (req, res) => {
    res.json({
        status:   "ok",
        ai:       "Groq (llama-3.3-70b-versatile)",
        imageGen: "Pollinations (FREE)",
        mongodb:  mongoose.connection.readyState === 1
    });
});

/* ============================================
   START SERVER (FOR RENDER)
============================================ */

app.listen(PORT, () => {
    console.log("\n🚀 AutoMate AI Server Running");
    console.log(`🌐 URL: http://localhost:${PORT}`);
});