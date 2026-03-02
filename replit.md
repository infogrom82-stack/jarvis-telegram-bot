# Jarvis Telegram Bot

## Overview
Telegram bot "Jarvis" — personal AI assistant with structured long-term memory, automatic fact extraction, and multi-role personality.

## Architecture
- **Runtime**: Node.js
- **Entry point**: `index.js`
- **Port**: 3000
- **Framework**: Express.js
- **Modular structure**: Code split into `src/` modules

## File Structure
```
index.js              - Express server, webhook, startup
src/
  config.js           - Environment validation, constants
  telegram.js         - Telegram API helpers (send, receive, webhook)
  memory.js           - Supabase operations, embeddings, fact extraction
  processor.js        - Message processing, system prompt, AI logic
  search.js           - Web search via Tavily API
  codegen.js          - GPT-4o code generation for static websites
  github.js           - GitHub API: repo creation, file push, GitHub Pages deploy
```

## Key Features
- Text, voice, and photo message processing via Telegram webhook
- **Photo analysis** — GPT-4o Vision analyzes images sent by the user
- **Web search** — Tavily API search triggered automatically when GPT needs current information
- **App creation** — GPT-4o generates static websites, auto-deploys to GitHub Pages via GitHub API
- AI responses using OpenAI GPT-4o with 5 roles (Psychologist, Board Member, Friend, Mentor, Assistant)
- **Structured fact extraction** — GPT-4o-mini automatically extracts personal facts after each conversation
- **User profile** — Facts organized by category (personal, business, health, relationships, goals, preferences, habits, emotions)
- Long-term memory in Supabase with vector embeddings (text-embedding-3-small)
- Short-term conversation memory (last ~12 messages)
- Voice transcription (Whisper) and text-to-speech (TTS-1, voice: onyx)
- Webhook authentication via secret token
- Proactive question-asking built into the system prompt
- JSON response validation with fallback
- Request size limits and timeouts on all external calls
- Daily Supabase keep-alive ping

## Dependencies
- express (^4.18.2)
- openai (^4.24.1)
- axios (^1.6.2)
- form-data (^4.0.0)
- dotenv (^16.3.1)
- @supabase/supabase-js (^2.39.3)
- duck-duck-scrape — web search (legacy)
- @tavily/core — web search via Tavily API

## Environment Secrets
- `OPENAI_API_KEY` — OpenAI API key
- `TELEGRAM_BOT_TOKEN` — Telegram bot token
- `MY_TELEGRAM_ID` — Owner's Telegram numeric ID
- `WEBHOOK_SECRET` — Secret token for webhook verification
- `SUPABASE_URL` — Supabase project URL
- `SUPABASE_KEY` — Supabase API key
- `TAVILY_API_KEY` — Tavily search API key
- `GITHUB_PERSONAL_ACCESS_TOKEN` — GitHub personal access token (repo scope)

## Supabase Tables
- **memory** — Conversation history (role, content, embedding vector(1536))
- **facts** — Extracted personal facts (category, fact, embedding vector(1536))
- **RPC function** `match_memory` — Semantic search on memory table
