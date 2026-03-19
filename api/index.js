require('dotenv').config();

const express  = require('express');
const mongoose = require('mongoose');
const cors     = require('cors');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const Groq     = require('groq-sdk');
const serverless = require("serverless-http");

const app        = express();
const JWT_SECRET = process.env.JWT_SECRET || 'automate-ai-secret-key-2026';

/* ============================================
   GROQ
============================================ */
const groq = process.env.GROQ_API_KEY
    ? new Groq({ apiKey: process.env.GROQ_API_KEY })
    : null;

/* ============================================
   MIDDLEWARE
============================================ */
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

/* ============================================
   MONGODB (FIXED)
============================================ */
const userSchema = new mongoose.Schema({
    name: String,
    email: String,
    password: String,
    plan: { type: String, default: 'free' },
    createdAt: { type: Date, default: Date.now }
});

let cached = global.mongoose;

if (!cached) {
    cached = global.mongoose = { conn: null, promise: null };
}

async function connectDB() {
    if (cached.conn) return cached.conn;

    if (!process.env.MONGODB_URI) {
        throw new Error("❌ MONGODB_URI missing");
    }

    if (!cached.promise) {
        cached.promise = mongoose.connect(process.env.MONGODB_URI, {
            bufferCommands: false,
        }).then((mongoose) => {
            console.log("✅ MongoDB connected");
            return mongoose;
        });
    }

    cached.conn = await cached.promise;
    return cached.conn;
}

function getUserModel() {
    try { return mongoose.model('User'); }
    catch { return mongoose.model('User', userSchema); }
}

/* ============================================
   LOGIN (FIXED + DEBUG)
============================================ */
app.post('/api/auth/login', async (req, res) => {
    console.log("🔥 LOGIN HIT");

    try {
        await connectDB();

        const UserModel = getUserModel();
        const { email, password } = req.body;

        console.log("📩 INPUT:", email);

        if (!email || !password) {
            return res.status(400).json({ success: false, error: 'Missing fields' });
        }

        const user = await UserModel.findOne({ email });
        console.log("👤 USER:", user);

        if (!user) {
            return res.status(401).json({ success: false, error: 'User not found' });
        }

        const match = await bcrypt.compare(password, user.password);
        console.log("🔑 MATCH:", match);

        if (!match) {
            return res.status(401).json({ success: false, error: 'Wrong password' });
        }

        const token = jwt.sign(
            { id: user._id },
            JWT_SECRET,
            { expiresIn: '7d' }
        );

        console.log("✅ LOGIN SUCCESS");

        return res.json({
            success: true,
            token,
            user: { id: user._id, email: user.email }
        });

    } catch (error) {
        console.error("💥 LOGIN ERROR:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   REGISTER (FIXED)
============================================ */
app.post('/api/auth/register', async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();

        const { name, email, password } = req.body;

        if (!name || !email || !password) {
            return res.status(400).json({ success: false, error: 'All fields required' });
        }

        const existing = await UserModel.findOne({ email });
        if (existing) {
            return res.status(409).json({ success: false, error: 'Email exists' });
        }

        const hashed = await bcrypt.hash(password, 10);

        const user = await UserModel.create({
            name,
            email,
            password: hashed
        });

        const token = jwt.sign({ id: user._id }, JWT_SECRET, { expiresIn: '7d' });

        return res.json({ success: true, token });

    } catch (error) {
        console.error("REGISTER ERROR:", error);
        return res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   HEALTH CHECK
============================================ */
app.get('/api/health', (req, res) => {
    res.json({
        status: "ok",
        mongodb: mongoose.connection.readyState === 1
    });
});

/* ============================================
   EXPORT (VERY IMPORTANT)
============================================ */
module.exports = serverless(app);