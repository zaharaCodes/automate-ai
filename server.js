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
        .catch(err => console.log("⚠️  MongoDB error:", err.message));
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
   SETTINGS ROUTES
============================================ */

// UPDATE PROFILE
app.put('/api/auth/profile', authMiddleware, async (req, res) => {
    try {
        const { name, email } = req.body;
        if (!name || !email) return res.status(400).json({ success: false, error: 'Name and email required' });
        if (!UserModel) return res.status(503).json({ success: false, error: 'Database not connected' });

        const existing = await UserModel.findOne({ email, _id: { $ne: req.user.id } });
        if (existing) return res.status(409).json({ success: false, error: 'Email already in use' });

        const user = await UserModel.findByIdAndUpdate(
            req.user.id,
            { name, email },
            { new: true }
        ).select('-password');

        const token = jwt.sign({ id: user._id, email: user.email, name: user.name }, JWT_SECRET, { expiresIn: '7d' });
        res.json({ success: true, user, token });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// CHANGE PASSWORD
app.put('/api/auth/password', authMiddleware, async (req, res) => {
    try {
        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ success: false, error: 'Both passwords required' });
        if (newPassword.length < 8) return res.status(400).json({ success: false, error: 'New password must be at least 8 characters' });
        if (!UserModel) return res.status(503).json({ success: false, error: 'Database not connected' });

        const user = await UserModel.findById(req.user.id);
        const match = await bcrypt.compare(currentPassword, user.password);
        if (!match) return res.status(401).json({ success: false, error: 'Current password is incorrect' });

        const hashed = await bcrypt.hash(newPassword, 12);
        await UserModel.findByIdAndUpdate(req.user.id, { password: hashed });
        res.json({ success: true, message: 'Password updated successfully' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// DELETE ACCOUNT
app.delete('/api/auth/account', authMiddleware, async (req, res) => {
    try {
        if (!UserModel) return res.status(503).json({ success: false, error: 'Database not connected' });
        await UserModel.findByIdAndDelete(req.user.id);
        res.json({ success: true, message: 'Account deleted' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// STATS
app.get('/api/stats', authMiddleware, async (req, res) => {
    try {
        if (!UserModel) return res.status(503).json({ success: false, error: 'Database not connected' });
        const user = await UserModel.findById(req.user.id).select('-password');
        res.json({
            success: true,
            stats: {
                plan: user.plan,
                requestsToday: user.requestsToday || 0,
                memberSince: user.createdAt,
                dailyLimit: user.plan === 'pro' ? 'Unlimited' : 100
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/* ============================================
   GROQ AI HELPER
============================================ */

async function callAI(prompt) {
    try {
        const completion = await groq.chat.completions.create({
            messages: [{ role: 'user', content: prompt }],
            model:    'llama-3.3-70b-versatile',
            max_tokens: 1024,
        });
        return completion.choices[0].message.content;
    } catch (error) {
        console.error("❌ Groq error:", error.message);
        throw error;
    }
}

/* ============================================
   PARSE EMAIL REPLIES
============================================ */

function parseEmailReplies(text) {
    const replies  = [];
    const sections = text.split(/\d+\.\s+/);
    const types    = ["Professional Reply", "Casual Reply", "Short Reply"];

    sections.slice(1).forEach((section, index) => {
        const clean = section
            .replace(/Professional Reply:|Casual Reply:|Short Reply:/gi, '')
            .trim();
        if (clean && index < 3) replies.push({ type: types[index], text: clean });
    });

    if (replies.length === 0) replies.push({ type: "AI Reply", text });
    return replies;
}

/* ============================================
   PARSE CONTENT RESPONSE
============================================ */

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

        const prompt  = `Generate exactly 3 email replies with these labels:\n\n1. Professional Reply\n2. Casual Reply\n3. Short Reply\n\nOriginal email:\n${email}`;
        const aiText  = await callAI(prompt);
        const replies = parseEmailReplies(aiText);
        res.json({ success: true, replies });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/summarize', async (req, res) => {
    try {
        const { text } = req.body;
        if (!text) return res.status(400).json({ success: false, error: "Text required" });
        const summary = await callAI("Summarize the following text in exactly 5 concise bullet points. Start each bullet with '•':\n\n" + text);
        res.json({ success: true, summary });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

app.post('/api/generate-content', async (req, res) => {
    try {
        const { topic, platform } = req.body;
        if (!topic || !platform) return res.status(400).json({ success: false, error: "Topic and platform required" });

        const prompt  = `Create a ${platform} social media post about: ${topic}\n\nRespond in exactly this format:\nCaption: [write the caption here]\nHashtags: [write hashtags here]`;
        const aiText  = await callAI(prompt);
        const content = parseContentResponse(aiText);
        res.json({ success: true, ...content });
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

        const stylePrompts = {
            realistic: `${prompt}, photorealistic, high quality, detailed, professional photography, 8k`,
            artistic:  `${prompt}, digital art, beautiful artwork, artistic, vibrant colors, trending on artstation`,
            anime:     `${prompt}, anime style, studio ghibli, vibrant colors, detailed illustration`,
            '3d':      `${prompt}, 3d render, octane render, volumetric lighting, cinema 4d, highly detailed`
        };

        const enhancedPrompt = stylePrompts[style] || stylePrompts.realistic;
        console.log("🎨 Generating image:", enhancedPrompt.slice(0, 60) + "...");

        const { HfInference } = require('@huggingface/inference');
        const hf = new HfInference(process.env.HF_TOKEN);

        const imageBlob = await hf.textToImage({
            model: 'stabilityai/stable-diffusion-xl-base-1.0',
            inputs: enhancedPrompt,
            parameters: { num_inference_steps: 25, guidance_scale: 7.5 }
        });

        const buffer = Buffer.from(await imageBlob.arrayBuffer());
        console.log("✅ Image generated:", buffer.length, "bytes");

        res.set('Content-Type', 'image/jpeg');
        res.set('Cache-Control', 'no-cache');
        res.send(buffer);

    } catch (error) {
        console.error("❌ Image error:", error.message);
        res.status(500).json({ success: false, error: error.message });
    }
});


/* ============================================
   SECRET ADMIN ROUTES
   Protected by ADMIN_SECRET env variable
============================================ */

function adminAuth(req, res, next) {
    const secret = req.headers['x-admin-secret'] || req.query.secret;
    if (!secret || secret !== process.env.ADMIN_SECRET) {
        return res.status(403).json({ success: false, error: 'Forbidden' });
    }
    next();
}

// GET all users + stats
app.get('/api/admin/stats', adminAuth, async (req, res) => {
    try {
        if (!UserModel) return res.status(503).json({ success: false, error: 'DB not connected' });

        const totalUsers   = await UserModel.countDocuments();
        const proUsers     = await UserModel.countDocuments({ plan: 'pro' });
        const freeUsers    = await UserModel.countDocuments({ plan: 'free' });

        // Signups in last 7 days
        const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
        const newThisWeek = await UserModel.countDocuments({ createdAt: { $gte: weekAgo } });

        // Signups in last 24h
        const dayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
        const newToday = await UserModel.countDocuments({ createdAt: { $gte: dayAgo } });

        // Last 10 signups
        const recentUsers = await UserModel.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .limit(10);

        // Signups per day for last 7 days
        const dailySignups = await UserModel.aggregate([
            { $match: { createdAt: { $gte: weekAgo } } },
            { $group: {
                _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
                count: { $sum: 1 }
            }},
            { $sort: { _id: 1 } }
        ]);

        res.json({
            success: true,
            stats: {
                totalUsers,
                proUsers,
                freeUsers,
                newThisWeek,
                newToday,
                recentUsers,
                dailySignups
            }
        });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

// GET all users list
app.get('/api/admin/users', adminAuth, async (req, res) => {
    try {
        if (!UserModel) return res.status(503).json({ success: false, error: 'DB not connected' });
        const page  = parseInt(req.query.page)  || 1;
        const limit = parseInt(req.query.limit) || 20;
        const skip  = (page - 1) * limit;

        const users = await UserModel.find()
            .select('-password')
            .sort({ createdAt: -1 })
            .skip(skip)
            .limit(limit);

        const total = await UserModel.countDocuments();

        res.json({ success: true, users, total, page, pages: Math.ceil(total / limit) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

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
   START SERVER
============================================ */

app.listen(PORT, () => {
    console.log("\n🚀 AutoMate AI Server");
    console.log("══════════════════════════════");
    console.log(`📡 Server:   http://localhost:${PORT}`);
    console.log(`🤖 AI:       ${process.env.GROQ_API_KEY ? '✅ Groq Ready' : '❌ GROQ_API_KEY missing'}`);
    console.log(`🎨 Image:    ✅ AI Image Generation`);
    console.log(`💾 MongoDB:  ${process.env.MONGODB_URI ? '✅ Configured' : '⚪ Optional'}`);
    console.log("══════════════════════════════\n");
});