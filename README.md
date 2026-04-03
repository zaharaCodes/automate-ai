Automate AI — Full-Stack AI SaaS Platform
A multi-tool AI SaaS web application powered by LLaMA models via Groq API, featuring real-time AI responses, JWT authentication with usage limits, and an activity tracking dashboard.

What is Automate AI?
Automate AI is an AI SaaS platform that bundles multiple AI-powered tools into one application. Instead of switching between different services, users get a chat assistant, text summarizer, content generator, email writer, and image generation — all in one place, with a single account and usage tracking.

Features
AI Tools
Chat Assistant

Conversational AI powered by LLaMA via Groq API
Streaming responses for real-time feel
Maintains conversation context within session

Text Summarizer

Paste any long-form text and get a concise summary
Adjustable summary length

Content Generator

Generate blog posts, social media captions, product descriptions
Specify tone, audience, and length

Email Writer

Write professional emails from a brief description
Supports formal, casual, and follow-up styles

Image Generation

Generate images from text prompts

Authentication & Usage Control

JWT authentication built from scratch — no third-party auth library
Access tokens with expiry
Usage limits per user — prevents API abuse
Middleware enforces limits before any AI request reaches Groq

Dashboard

Per-tool usage statistics
Request history with timestamps
Visual activity tracking
Usage remaining indicator

UX Extras

Voice input support — speak your prompt instead of typing
Keyboard shortcuts for power users
Streaming AI responses (text appears word by word)

Deployment
Live on Render: automate-ai.onrender.com
Both frontend and backend deployed on Render. MongoDB hosted on MongoDB Atlas.

License
MIT
