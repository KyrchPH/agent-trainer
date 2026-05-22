# WiseAI

Training data builder for the company's Livestreamer AI Agent. Users ask questions in a chat interface; the AI answers using context retrieved from MySQL. When no answer exists, users can suggest one and the AI decides whether to merge or replace.

## Stack

- Client: Vite, React, TypeScript, React Router, Tailwind
- Server: Express, TypeScript, MySQL (mysql2)
- LLM: Anthropic Claude or OpenAI (configurable in the admin panel)
- Monorepo: npm workspaces

## Layout

```
agent-trainer/
├── packages/
│   ├── client/   # Vite + React app
│   └── server/   # Express + MySQL API
├── package.json  # workspaces
└── tsconfig.base.json
```

## Setup

1. Install dependencies from the repo root:

   ```bash
   npm install
   ```

2. Create the MySQL database and apply the schema:

   ```bash
   mysql -u root -p -e "CREATE DATABASE agent_trainer CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;"
   mysql -u root -p agent_trainer < packages/server/src/schema.sql
   ```

3. Configure the server environment:

   ```bash
   cp packages/server/.env.example packages/server/.env
   # edit DB credentials, ANTHROPIC_API_KEY and/or OPENAI_API_KEY
   ```

4. Start the dev server (client + server in parallel):

   ```bash
   npm run dev
   ```

   Client: http://localhost:5173
   Server: http://localhost:4000

## Client routes

- `/` chat interface
- `/list` paginated Q&A table; supports `?search=<keyword>`
- `/admin-config` system prompt and LLM provider configuration

## Server API

- `POST /api/chat` ask a question
- `GET  /api/qa?page=&pageSize=&search=` list Q&A entries
- `POST /api/qa/suggest` suggest an answer for a question
- `GET  /api/admin/config` read configuration
- `PUT  /api/admin/config` update configuration
- `GET  /api/health` database connectivity check
