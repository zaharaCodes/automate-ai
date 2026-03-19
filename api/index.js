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
   GROQ AI — no process.exit on Vercel!
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
   MONGODB — cached connection for Vercel serverless
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

// Cache connection across serverless invocations
let isConnected = false;

async function connectDB() {
    if (isConnected && mongoose.connection.readyState === 1) return;
    if (!process.env.MONGODB_URI) return;
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 10000,
            socketTimeoutMS: 45000,
        });
        isConnected = true;
        console.log("✅ MongoDB connected");
    } catch (err) {
        console.log("❌ MongoDB error:", err.message);
        isConnected = false;
    }
}

function getUserModel() {
    try { return mongoose.model('User'); }
    catch { return mongoose.model('User', userSchema); }
}

// Connect on startup
connectDB();

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
        await connectDB();
        const UserModel = getUserModel();
        const { name, email, password } = req.body;
        if (!name || !email || !password)
            return res.status(400).json({ success: false, error: 'All fields required' });
        if (mongoose.connection.readyState !== 1)
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
        await connectDB();
        const UserModel = getUserModel();
        const { email, password } = req.body;
        if (!email || !password)
            return res.status(400).json({ success: false, error: 'Email and password required' });
        if (mongoose.connection.readyState !== 1)
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
        await connectDB();
        const UserModel = getUserModel();
        const user = await UserModel.findById(req.user.id).select('-password');
        res.json({ success: true, user });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   SETTINGS ROUTES
============================================ */
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        const { name, email } = req.body;
        if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email required' });

        const existing = await UserModel.findOne({ email, _id: { $ne: req.user.id } });
        if (existing) return res.status(409).json({ success: false, error: 'Email already in use' });

        const user = await UserModel.findByIdAndUpdate(req.user.id, { name, email }, { new: true }).select('-password');
        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, user, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.put('/api/auth/password', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Both passwords required' });
        if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'Password must be at least 8 characters' });

        const user  = await UserModel.findById(req.user.id);
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

        const hashed = await bcrypt.hash(newPassword, 12);
        await UserModel.findByIdAndUpdate(req.user.id, { password: hashed });
        res.json({ success: true, message: 'Password updated' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.delete('/api/auth/account', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        await UserModel.findByIdAndDelete(req.user.id);
        res.json({ success: true });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        const user = await UserModel.findById(req.user.id).select('-password');
        res.json({ success: true, stats: {
            plan: user.plan,
            requestsToday: user.requestsToday || 0,
            memberSince: user.createdAt,
            dailyLimit: user.plan === 'pro' ? 'Unlimited' : 100
        }});
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   AI HELPER
============================================ */
async function callAI(prompt) {
    if (!groq) throw new Error('AI not configured');
    const completion = await groq.chat.completions.create({
        messages: [{ role: 'user', content: prompt }],
        model: 'llama-3.3-70b-versatile',
        max_tokens: 1024,
    });
    return completion.choices[0].message.content;
}

function parseEmailReplies(text) {
    const replies  = [];
    const sections = text.split(/\d+\.\s+/);
    const types    = ["Professional Reply", "Casual Reply", "Short Reply"];
    sections.slice(1).forEach((section, index) => {
        const clean = section.replace(/Professional Reply:|Casual Reply:|Short Reply:/gi, '').trim();
        if (clean && index < 3) replies.push({ type: types[index], text: clean });
    });
    if (replies.length === 0) replies.push({ type: "AI Reply", text });
    return replies;
}

function parseContentResponse(text) {
    const captionMatch  = text.match(/Caption:\s*([\s\S]*?)(?=Hashtags:|$)/i);
    const hashtagsMatch = text.match(/Hashtags:\s*([\s\S]*?)$/i);
    return {
        caption:  captionMatch  ? captionMatch[1].trim()  : text,
        hashtags: hashtagsMatch ? hashtagsMatch[1].trim() : "#AI #Automation #Tech"
    };
}

/* ============================================
   AI ROUTES
============================================ */
app.post('/api/generate-email', async (req, res) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ success: false, error: "Email required" });
        const aiText  = await callAI(`Generate exactly 3 email replies:\n\n1. Professional Reply\n2. Casual Reply\n3. Short Reply\n\nOriginal email:\n${email}`);
        res.json({ success: true, replies: parseEmailReplies(aiText) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: "Text required" });
        const summary = await callAI("Summarize in exactly 5 bullet points starting with '•':\n\n" + text);
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate-content', async (req, res) => {
    try {
        const { topic, platform } = req.body;
        if (!topic || !platform) return res.status(400).json({ success: false, error: "Topic and platform required" });
        const aiText = await callAI(`Create a ${platform} post about: ${topic}\n\nFormat:\nCaption: [caption]\nHashtags: [hashtags]`);
        res.json({ success: true, ...parseContentResponse(aiText) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/chat', async (req, res) => {
    try {
        const { message } = req.body;
        if (!message) return res.status(400).json({ success: false, error: "Message required" });
        const response = await callAI(message);
        res.json({ success: true, response });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate-image', async (req, res) => {
    try {
        const { prompt, style } = req.body;
        if (!prompt) return res.status(400).json({ success: false, error: "Prompt required" });

        const styles = {
            realistic: `${prompt}, photorealistic, high quality, 8k`,
            artistic:  `${prompt}, digital art, vibrant colors`,
            anime:     `${prompt}, anime style, studio ghibli`,
            '3d':      `${prompt}, 3d render, octane render`
        };
        const enhancedPrompt = styles[style] || styles.realistic;

        const { HfInference } = require('@huggingface/inference');
        const hf = new HfInference(process.env.HF_TOKEN);
        const imageBlob = await hf.textToImage({
            model: 'stabilityai/stable-diffusion-xl-base-1.0',
            inputs: enhancedPrompt,
            parameters: { num_inference_steps: 25, guidance_scale: 7.5 }
        });

        const buffer = Buffer.from(await imageBlob.arrayBuffer());
        res.set('Content-Type', 'image/jpeg');
        res.send(buffer);
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   ADMIN ROUTES
============================================ */
function adminAuth(req, res, next) {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.ADMIN_SECRET)
        return res.status(403).json({ success: false, error: 'Forbidden' });
    next();
}

app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        const totalUsers  = await UserModel.countDocuments();
        const proUsers    = await UserModel.countDocuments({ plan: 'pro' });
        const weekAgo     = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const dayAgo      = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const newThisWeek = await UserModel.countDocuments({ createdAt: { $gte: weekAgo } });
        const newToday    = await UserModel.countDocuments({ createdAt: { $gte: dayAgo } });
        const recentUsers = await UserModel.find().select('-password').sort({ createdAt: -1 }).limit(10);
        const dailySignups = await UserModel.aggregate([
            { $match: { createdAt: { $gte: weekAgo } } },
            { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
            { $sort: { _id: 1 } }
        ]);
        res.json({ success: true, stats: { totalUsers, proUsers, freeUsers: totalUsers - proUsers, newThisWeek, newToday, recentUsers, dailySignups } });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.get('/api/admin/users', adminAuth, async (req, res) => {
    try {
        await connectDB();
        const UserModel = getUserModel();
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const users = await UserModel.find().select('-password').sort({ createdAt: -1 }).skip((page-1)*limit).limit(limit);
        const total = await UserModel.countDocuments();
        res.json({ success: true, users, total, page, pages: Math.ceil(total/limit) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   HEALTH CHECK
============================================ */
app.get('/api/health', (req, res) => {
    res.json({ status: "ok", ai: !!groq, mongodb: mongoose.connection.readyState === 1 });
});

/* ============================================
   START — local dev only
============================================ */
if (process.env.IS_LOCAL) {
    app.listen(PORT, () => {
        console.log(`\n🚀 AutoMate AI → http://localhost:${PORT}\n`);
    });
}

module.exports = app;