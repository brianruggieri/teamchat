# Discord Clone — Team Build Kickoff Plan

> **For agentic workers:** This plan is executed via Claude Code Agent Teams (team mode), NOT subagent-driven development. The lead agent reads this plan, creates tasks with dependencies, and dispatches 13 specialist agents.

**Goal:** Build a full-stack Discord clone from scratch in ~1 hour using 14 coordinating agents, generating a rich teamchat session for capture & compare testing.

**Architecture:** Next.js 15 monorepo with Prisma + SQLite, NextAuth v5, Socket.io, Tailwind/shadcn, and Stripe test mode. All agents work in the same repo, sharing types and negotiating contracts via DMs and broadcasts.

**Spec:** `docs/superpowers/specs/2026-03-31-discord-clone-team-build-design.md`

---

## Pre-Kickoff Setup

Before starting the team session, the project must be initialized. Run these commands:

```bash
# Create project directory
mkdir -p ~/git/discord-clone && cd ~/git/discord-clone

# Initialize git
git init

# Initialize Next.js project
npx create-next-app@latest . --typescript --tailwind --eslint --app --src-dir --import-alias "@/*" --use-npm --no-turbopack

# Install core dependencies
npm install prisma @prisma/client next-auth@beta socket.io socket.io-client stripe @stripe/stripe-js
npm install -D @types/node

# Initialize Prisma with SQLite
npx prisma init --datasource-provider sqlite

# Initialize shadcn/ui
npx shadcn@latest init -d

# Add common shadcn components
npx shadcn@latest add button input label card dialog dropdown-menu avatar badge tooltip scroll-area separator sheet popover command

# Create directory structure
mkdir -p src/lib src/types src/hooks src/components/{ui,layout,server,channel,message,shared}
mkdir -p src/app/api/{servers,channels,messages,files,search,notifications,voice,dms,stripe}
mkdir -p src/app/"(auth)"/{login,register}
mkdir -p src/app/"(main)"/servers/"[serverId]"/{channels/"[channelId]",settings}
mkdir -p src/app/"(main)"/dms/"[conversationId]"
mkdir -p server public/uploads .github/workflows

# Create .env.example
cat > .env.example << 'ENVEOF'
DATABASE_URL="file:./dev.db"
NEXTAUTH_SECRET="your-secret-here-change-in-production"
NEXTAUTH_URL="http://localhost:3000"
STRIPE_SECRET_KEY="sk_test_placeholder"
STRIPE_WEBHOOK_SECRET="whsec_placeholder"
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_test_placeholder"
NEXT_PUBLIC_SOCKET_URL="http://localhost:3001"
ENVEOF

# Copy to .env
cp .env.example .env

# Generate a real NextAuth secret
NEXTAUTH_SECRET=$(openssl rand -base64 32)
sed -i '' "s|your-secret-here-change-in-production|$NEXTAUTH_SECRET|" .env

# Create initial commit
git add -A
git commit -m "chore: initialize Next.js project with Prisma, NextAuth, Socket.io, shadcn/ui"
```

Then copy the CLAUDE.md and AGENTS.md from this plan (see sections below) into the project root.

---

## CLAUDE.md (copy to ~/git/discord-clone/CLAUDE.md)

```markdown
# Discord Clone — Project Instructions

## What This Is

A full-stack Discord clone built by a team of 14 AI agents. Text chat with servers, channels, roles, real-time messaging, voice room state, file uploads, search, notifications, and Stripe billing. Single Next.js monorepo.

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript (strict mode)
- **Database**: Prisma + SQLite
- **Auth**: NextAuth v5 (Credentials provider)
- **Real-time**: Socket.io (separate server on port 3001)
- **UI**: Tailwind CSS + shadcn/ui
- **Payments**: Stripe (test mode)
- **File uploads**: Local filesystem (public/uploads/)
- **Search**: SQLite FTS5
- **Package manager**: npm

## Quick Commands

\`\`\`bash
npm run dev              # Start Next.js (port 3000)
npm run dev:socket       # Start Socket.io server (port 3001)
npm run db:push          # Push Prisma schema to SQLite
npm run db:seed          # Seed test data
npm run db:studio        # Open Prisma Studio
npm run build            # Production build
npm run lint             # ESLint
npm run typecheck        # tsc --noEmit
\`\`\`

## Project Structure

\`\`\`
prisma/
  schema.prisma          # All 12 models
  seed.ts                # Test users, server, channels, messages
src/
  app/
    (auth)/              # Login, register pages
    (main)/              # Server/channel views (authenticated)
    api/                 # All API routes
      servers/           # Server CRUD, invites, members, roles
      channels/          # Channel CRUD, categories
      messages/          # Message CRUD, reactions, pins
      files/             # Upload + serving
      search/            # Full-text search
      notifications/     # Feed + mark-read
      voice/             # Voice state
      dms/               # Direct messages
      stripe/            # Checkout + webhook
  components/
    ui/                  # shadcn/ui primitives (pre-installed)
    layout/              # ServerSidebar, ChannelSidebar, MemberList, NavigationBar
    server/              # CreateServerModal, InviteModal, ServerSettings
    channel/             # CreateChannelModal, ChannelHeader, VoiceChannel
    message/             # MessageItem, MessageInput, ReactionPicker, MessageList
    shared/              # Avatar, Badge, Modal, Tooltip
  hooks/                 # useSocket, usePresence, useMessages, useNotifications, useVoice
  lib/
    db.ts                # Prisma client singleton
    auth.ts              # NextAuth config
    permissions.ts       # Permission bitfield utilities
    socket.ts            # Socket.io client init
    stripe.ts            # Stripe client config
  types/
    db.ts                # Prisma-generated type re-exports
    api.ts               # API request/response shapes
server/
  socket.ts              # Socket.io server (custom entry point)
public/uploads/          # Local file storage
\`\`\`

## Domain Model

12 Prisma models: User, Server, Channel, Member, Role, Message, Reaction, Attachment, DirectMessage, Conversation, Notification, Subscription.

Key relationships:
- User has many Members (one per server they've joined)
- Member has one Role (per server)
- Server has many Channels, Members, Roles
- Channel has many Messages
- Message has many Reactions, Attachments
- User has many DirectMessages via Conversations

## Permission Bitfield

Permissions are stored as a bigint on each Role:

\`\`\`typescript
export const Permissions = {
  ADMINISTRATOR:     1n << 0n,
  MANAGE_SERVER:     1n << 1n,
  MANAGE_CHANNELS:   1n << 2n,
  MANAGE_ROLES:      1n << 3n,
  MANAGE_MESSAGES:   1n << 4n,
  KICK_MEMBERS:      1n << 5n,
  BAN_MEMBERS:       1n << 6n,
  SEND_MESSAGES:     1n << 7n,
  ATTACH_FILES:      1n << 8n,
  ADD_REACTIONS:     1n << 9n,
  CONNECT_VOICE:     1n << 10n,
  SPEAK_VOICE:       1n << 11n,
  MENTION_EVERYONE:  1n << 12n,
} as const;
\`\`\`

Server owners have implicit ADMINISTRATOR. The @everyone role gets SEND_MESSAGES + ADD_REACTIONS + CONNECT_VOICE + SPEAK_VOICE + ATTACH_FILES by default.

## Stripe Plans

- **Free**: 5 channels, 50 members, 10MB file uploads
- **Pro ($9/mo)**: unlimited channels, 500 members, 100MB uploads

Enforcement: channel creation checks channel count, member join checks member count, file upload checks file size. All checks read `server.plan`.

## Critical Coordination Points

These are the moments where agents MUST communicate:

1. **Schema broadcast** — When db-architect finishes the Prisma schema, they MUST broadcast to all agents: "Schema ready. Run \`npx prisma generate\` to get the client. Types in \`src/types/db.ts\`."

2. **Auth shape broadcast** — When auth-engineer finishes NextAuth config, they MUST broadcast: "Session shape: \`getServerSession()\` returns \`{ user: { id, email, username, avatarUrl } }\`. Auth middleware at \`src/lib/auth.ts\`."

3. **Permission middleware broadcast** — When permissions-eng ships the guard middleware, they MUST DM each API agent: "Import \`requirePermission(perm)\` from \`src/lib/permissions.ts\`. Wrap your routes."

4. **Socket event negotiation** — realtime-eng and message-engineer MUST agree on who emits Socket.io events for new messages. DM to negotiate. Recommended: message-engineer calls a Socket.io emit helper after DB write.

5. **Plan limits enforcement** — server-engineer MUST DM channel-engineer and file-engineer with plan limit details so they can enforce them.

6. **Component library broadcast** — When ui-engineer ships core components, they MUST broadcast: "Layout components ready. Import from \`@/components/layout/*\` and \`@/components/shared/*\`."

7. **API contract DMs** — frontend-eng will DM each API agent asking for endpoint shapes. API agents MUST respond with route path, method, request body, and response shape.

## Open Decisions (agents should negotiate these via DM)

1. **Message creation event flow** — Does message-engineer emit Socket.io events directly, or does realtime-eng poll/subscribe to DB changes? (Recommended: message-engineer imports a socket emit helper from realtime-eng's module)

2. **Voice channel state** — Is voice state stored in the DB or only in Socket.io memory? (Recommended: Socket.io memory only, since voice state is ephemeral)

3. **Notification delivery** — Does notification-eng create DB records synchronously in the message creation flow, or asynchronously? (Recommended: synchronously for v1, extract later)

4. **Search indexing** — Does search-engineer create FTS triggers in the schema, or manually index on message create? (Recommended: Prisma middleware or manual indexing, since SQLite FTS5 triggers are complex with Prisma)

## Conventions

- **Indentation**: Tabs (but respect prettier/eslint if configured)
- **API responses**: Always return `{ data: T }` for success, `{ error: string }` for errors
- **Auth guard**: Every API route in `/api/` (except auth routes) must call `getServerSession()` and return 401 if null
- **Error handling**: Use try/catch in API routes, return appropriate HTTP status codes
- **Prisma client**: Always import from `@/lib/db` (singleton pattern)
- **Types**: Export API request/response types from `src/types/api.ts`

## What NOT to Do

- Don't use any external database — SQLite only
- Don't implement OAuth providers — credentials auth only
- Don't implement WebRTC media streams — voice is state-only (join/leave/mute)
- Don't implement Discord bots or webhook API
- Don't add rate limiting beyond Stripe plan limits
- Don't use server components for real-time features — use client components with Socket.io
```

---

## AGENTS.md (copy to ~/git/discord-clone/AGENTS.md)

```markdown
# Discord Clone — Agent Team

## Team Structure

- **Lead**: opus — orchestrates tasks, reviews milestones, resolves conflicts
- **All specialists**: sonnet — focused domain experts

---

### db-architect
**Model**: sonnet
**Role**: Database schema architect — owns the Prisma schema, migrations, seed data, and shared type exports.

**Prompt**: You are the database architect. Your job is to create the complete Prisma schema with all 12 models (User, Server, Channel, Member, Role, Message, Reaction, Attachment, DirectMessage, Conversation, Notification, Subscription), run the migration, create seed data with test users/server/channels/messages, and export shared types from `src/types/db.ts`. You also create the Prisma client singleton at `src/lib/db.ts`. You are the critical path — every other agent is blocked on you. Work fast and broadcast immediately when done. See CLAUDE.md "Domain Model" and "Permission Bitfield" for the full entity spec.

**Blocked on**: Nothing — start immediately.
**Blocks**: auth-engineer, server-engineer, channel-engineer, message-engineer, file-engineer, search-engineer, notification-eng, permissions-eng

**Open Decisions**: None — schema is fully specified in CLAUDE.md.

---

### auth-engineer
**Model**: sonnet
**Role**: Authentication engineer — owns NextAuth config, login/register pages, session middleware.

**Prompt**: You own authentication. Set up NextAuth v5 with the Credentials provider (email + password with bcrypt hashing). Create the auth config at `src/lib/auth.ts`, the login page at `src/app/(auth)/login/page.tsx`, register page at `src/app/(auth)/register/page.tsx`, and the auth API route at `src/app/api/auth/[...nextauth]/route.ts`. Also create a `getCurrentUser()` helper that wraps `getServerSession()` for easy use in API routes. The session must include `{ user: { id, email, username, avatarUrl } }`. Broadcast the session shape to all agents when done.

**Blocked on**: db-architect (needs User model)
**Blocks**: permissions-eng, realtime-eng, notification-eng, frontend-eng

---

### permissions-eng
**Model**: sonnet
**Role**: Permissions engineer — owns the role/permission system, guard middleware, role management API.

**Prompt**: You own permissions. Create `src/lib/permissions.ts` with the permission bitfield constants (from CLAUDE.md), `hasPermission(memberPermissions, requiredPermission)` check function, and `requirePermission(permission)` middleware wrapper for API routes. Create role CRUD API routes at `src/app/api/servers/[serverId]/roles/`. The @everyone role (isDefault=true) gets SEND_MESSAGES + ADD_REACTIONS + CONNECT_VOICE + SPEAK_VOICE + ATTACH_FILES. Server owners have implicit ADMINISTRATOR. After shipping the middleware, DM each API agent (server-engineer, channel-engineer, message-engineer) to integrate it into their routes.

**Blocked on**: db-architect, auth-engineer
**Blocks**: None directly, but all API agents should integrate permission checks

---

### server-engineer
**Model**: sonnet
**Role**: Server engineer — owns server CRUD, invite system, member management, and Stripe billing integration.

**Prompt**: You own servers and billing. Create API routes at `src/app/api/servers/` for: create server (auto-create @everyone role, make creator owner+admin), get server, update server, delete server (owner only). Create invite system at `src/app/api/servers/[serverId]/invite/` — generate random invite codes, join via code. Create member management at `src/app/api/servers/[serverId]/members/` — list, kick, ban, update nickname, assign role. Handle Stripe integration: create `src/lib/stripe.ts` config, checkout route at `src/app/api/stripe/checkout/route.ts`, webhook at `src/app/api/stripe/webhook/route.ts`. DM channel-engineer and file-engineer with plan limit details (free: 5 channels/50 members/10MB, pro: unlimited/500/100MB).

**Blocked on**: db-architect
**Blocks**: channel-engineer, frontend-eng

---

### channel-engineer
**Model**: sonnet
**Role**: Channel engineer — owns channel CRUD, categories, ordering, and settings.

**Prompt**: You own channels. Create API routes at `src/app/api/channels/` for: create channel (enforce plan limit — max 5 for free plan), get channel, update channel (topic, slowmode), delete channel, reorder channels. Channels have a `type` field (TEXT, VOICE, ANNOUNCEMENT) and `categoryName` for grouping. Before creating a channel, check the server's plan and current channel count. Import permission middleware from permissions-eng when available.

**Blocked on**: db-architect, server-engineer (for plan limits)
**Blocks**: message-engineer, voice-engineer

---

### message-engineer
**Model**: sonnet
**Role**: Message engineer — owns message CRUD, reactions, replies, pins, and edit/delete.

**Prompt**: You own messages. Create API routes at `src/app/api/channels/[channelId]/messages/` for: list messages (cursor-based pagination, 50 per page, include author + reactions + attachments), create message. Create routes at `src/app/api/messages/[messageId]/` for: edit, delete (soft-delete), pin/unpin. Create reaction routes at `src/app/api/messages/[messageId]/reactions/` for: add reaction, remove reaction. When a message is created, emit a Socket.io event via the helper from realtime-eng (DM them to agree on the contract). Associate attachments from file-engineer's upload response.

**Blocked on**: db-architect, channel-engineer
**Blocks**: search-engineer, notification-eng

**Open Decisions**: Negotiate with realtime-eng on who emits Socket.io events for new messages. Recommended approach: import an emit helper and call it after successful DB write.

---

### realtime-eng
**Model**: sonnet
**Role**: Real-time engineer — owns the Socket.io server, presence tracking, typing indicators, and live event delivery.

**Prompt**: You own real-time. Create the Socket.io server at `server/socket.ts` that runs on port 3001. Implement: auth middleware (validate JWT from NextAuth), room management (users join server/channel rooms), presence tracking (online/idle/dnd/offline with `lastSeen`), typing indicators (`typing:start`/`typing:stop` events per channel). Create `src/lib/socket.ts` for client-side Socket.io initialization. Export a `emitToChannel(channelId, event, data)` helper that other agents (especially message-engineer) can import to emit events after DB writes. Create `src/hooks/useSocket.ts` and `src/hooks/usePresence.ts` for the frontend. Add a `dev:socket` script to package.json.

**Blocked on**: auth-engineer (needs JWT validation)
**Blocks**: frontend-eng

**Open Decisions**: Negotiate with message-engineer on the message event contract.

---

### voice-engineer
**Model**: sonnet
**Role**: Voice engineer — owns voice channel state machine, join/leave, participant tracking.

**Prompt**: You own voice state. This is state-only — no WebRTC media streams. Create API routes at `src/app/api/voice/[channelId]/` for: get participants, join (add user to voice state), leave, toggle mute, toggle deafen. Voice state lives in Socket.io server memory (not the database) — coordinate with realtime-eng on this. Create `src/hooks/useVoice.ts` for the frontend. Voice channels show a participant list with mute/deafen indicators instead of a message feed.

**Blocked on**: channel-engineer (needs VOICE channel type)
**Blocks**: frontend-eng

**Open Decisions**: Negotiate with realtime-eng on whether voice state is stored in Socket.io memory or a shared Map. Recommended: in-memory Map in the Socket.io server module.

---

### file-engineer
**Model**: sonnet
**Role**: File engineer — owns upload API, file serving, image handling, and attachment model.

**Prompt**: You own file uploads. Create an upload route at `src/app/api/files/upload/route.ts` that accepts multipart form data, validates file type and size (enforce plan limits — 10MB free, 100MB pro), saves to `public/uploads/{uuid}.{ext}`, and returns the file metadata. Create a serving route for thumbnails if the file is an image. The upload response should return `{ id, url, filename, contentType, size }` so message-engineer can associate it as an Attachment. DM message-engineer with the response shape.

**Blocked on**: db-architect
**Blocks**: message-engineer (attachment association)

---

### search-engineer
**Model**: sonnet
**Role**: Search engineer — owns full-text search across messages, servers, and users.

**Prompt**: You own search. Set up SQLite FTS5 for message search. Create a Prisma `$executeRaw` migration to create the FTS virtual table: `CREATE VIRTUAL TABLE IF NOT EXISTS message_fts USING fts5(content, message_id UNINDEXED)`. Create a search API at `src/app/api/search/route.ts` that accepts `?q=query&type=messages|servers|users` and returns ranked results. For messages, query the FTS table and join with Message for metadata. For servers and users, use Prisma `contains` filter. Index new messages into FTS on creation — export an `indexMessage(id, content)` helper that message-engineer calls.

**Blocked on**: message-engineer (needs message creation flow to hook into)
**Blocks**: frontend-eng

---

### notification-eng
**Model**: sonnet
**Role**: Notification engineer — owns mention detection, unread counts, notification feed, and mark-read.

**Prompt**: You own notifications. Create mention detection: parse message content for `@username`, `@rolename`, `@everyone` patterns and create Notification records for matched users. Create unread count tracking: store last-read message ID per member-channel pair in a `ChannelRead` model (memberId + channelId + lastReadMessageId). Unread count = messages in channel where id > lastReadMessageId. Update lastReadMessageId when user opens a channel. Create API routes at `src/app/api/notifications/` for: list notifications (paginated), mark single as read, mark all as read. Create `src/hooks/useNotifications.ts` for the frontend. Export a `createNotifications(message, channelId)` helper that message-engineer calls after creating a message.

**Blocked on**: message-engineer, auth-engineer
**Blocks**: frontend-eng

---

### ui-engineer
**Model**: sonnet
**Role**: UI/design system engineer — owns the component library, theme, and layout shells.

**Prompt**: You own the design system. Create Discord's dark theme using Tailwind — configure `tailwind.config.ts` with Discord's color palette (dark backgrounds: #1e1f22, #2b2d31, #313338, #383a40; text: #f2f3f5, #b5bac1, #949ba4; brand: #5865f2). Create layout shell components: `ServerSidebar.tsx` (vertical icon strip on the left), `ChannelSidebar.tsx` (channel list with categories), `MemberList.tsx` (right sidebar with online/offline sections), `NavigationBar.tsx` (top bar with channel name + search). Create shared components: `Avatar.tsx` (with status indicator dot), `Badge.tsx` (for unread counts), `Modal.tsx` (wrapper around shadcn Dialog), `Tooltip.tsx`. Broadcast to all frontend agents when the component library is ready.

**Blocked on**: Nothing — start immediately alongside db-architect.
**Blocks**: frontend-eng

---

### frontend-eng
**Model**: sonnet
**Role**: Frontend engineer — owns page assembly, routing, client state, and interactive views.

**Prompt**: You own the pages. Build the main three-panel layout at `src/app/(main)/layout.tsx`: servers sidebar | channel sidebar + chat area | member list. Create the server/channel view at `src/app/(main)/servers/[serverId]/channels/[channelId]/page.tsx` with infinite-scroll message list, message input with file upload button, typing indicator, and reaction picker. Create server settings page. Create DM view. Create search modal (triggered by Ctrl+K). Create user settings page. Wire up Socket.io for live message updates, presence, and typing indicators using the hooks from realtime-eng. You'll need to DM each API agent for their endpoint contracts — don't guess, ask.

**Blocked on**: ui-engineer (components), all API agents (endpoints)
**Blocks**: Nothing — you're the final assembly agent.

---

### devops-engineer
**Model**: sonnet
**Role**: DevOps engineer — owns Docker, CI/CD, env config, and documentation.

**Prompt**: You own infrastructure. Create `Dockerfile` (multi-stage: deps → build → production with Node 20 alpine). Create `docker-compose.yml` (app service + volume for SQLite). Create `.github/workflows/ci.yml` (checkout → install → lint → typecheck → build). Update `package.json` with scripts: `dev:socket` (runs `server/socket.ts`), `db:push`, `db:seed`, `db:studio`, `typecheck`. Create a comprehensive `README.md` with: project description, screenshots placeholder, setup instructions, environment variables, architecture overview, and tech stack. Update `.env.example` with all required vars. Ensure `.gitignore` includes: `.env`, `*.db`, `public/uploads/*`, `node_modules/`.

**Blocked on**: Nothing — start immediately.
**Blocks**: Nothing — parallel throughout.
```

---

## Task Definitions for Lead Agent

The lead agent should create these tasks after spawning all agents. Tasks use `blockedBy` to enforce the dependency graph.

### Wave 0 (no dependencies)

**Task 1**: `db-architect` — Create Prisma schema with all 12 models, run migration, create seed data, export types
**Task 2**: `ui-engineer` — Create Discord dark theme, layout shell components, shared components
**Task 3**: `devops-engineer` — Create Dockerfile, docker-compose, CI/CD, scripts, README

### Wave 1 (blocked by Task 1)

**Task 4**: `auth-engineer` — Set up NextAuth v5 with credentials, login/register pages, session helpers
- `blockedBy`: [Task 1]

**Task 5**: `server-engineer` — Server CRUD, invites, member management, Stripe checkout/webhook
- `blockedBy`: [Task 1]

**Task 6**: `file-engineer` — File upload API, serving, thumbnail generation, size validation
- `blockedBy`: [Task 1]

### Wave 2 (blocked by Tasks 4, 5)

**Task 7**: `permissions-eng` — Permission bitfield, role CRUD API, guard middleware
- `blockedBy`: [Task 1, Task 4]

**Task 8**: `channel-engineer` — Channel CRUD, categories, ordering, plan limit enforcement
- `blockedBy`: [Task 1, Task 5]

**Task 9**: `realtime-eng` — Socket.io server, auth middleware, presence, typing, emit helpers
- `blockedBy`: [Task 4]

### Wave 3 (blocked by Task 8)

**Task 10**: `message-engineer` — Message CRUD, reactions, replies, pins, Socket.io integration
- `blockedBy`: [Task 1, Task 6, Task 8]

**Task 11**: `voice-engineer` — Voice state machine, join/leave, participant tracking
- `blockedBy`: [Task 8]

### Wave 4 (blocked by Task 10)

**Task 12**: `search-engineer` — FTS5 setup, search API, message indexing hook
- `blockedBy`: [Task 10]

**Task 13**: `notification-eng` — Mention detection, unread counts, notification feed
- `blockedBy`: [Task 10, Task 4]

### Wave 5 (ongoing assembly)

**Task 14**: `frontend-eng` — Page assembly, routing, state, Socket.io wiring
- `blockedBy`: [Task 2, Task 4, Task 5, Task 8, Task 9, Task 10, Task 11]

---

## Kickoff Command

After the project is initialized and CLAUDE.md/AGENTS.md are in place:

```bash
cd ~/git/discord-clone
claude
```

Then in the Claude session:
```
Read CLAUDE.md and AGENTS.md, then create a team and dispatch all 13 specialist agents with the roles defined in AGENTS.md. Create 14 tasks with the dependency graph from the kickoff plan. Start with Wave 0 agents (db-architect, ui-engineer, devops-engineer) immediately, and let the dependency chain handle the rest.
```

## Session Monitoring

teamchat will auto-launch via the PostToolUse hook on TeamCreate. Once the session is running:

```bash
# In another terminal, monitor the session
cd ~/git/claude-team-chat
bun run dev

# After session completes, capture it
bun run bin/teamchat.ts capture <session-id>

# Generate the comparison report
bun run bin/teamchat.ts report ~/.teamchat/captures/<bundle-name>
```

## Expected Output

After ~1 hour, the Discord clone project should have:

- **80-120 files** across the directory structure
- **4,000-8,000 lines of TypeScript**
- **Working app** that launches with `npm run dev` + `npm run dev:socket`
- **Seed data** with test users, a server, channels, and messages
- **Docker setup** for containerized deployment
- **CI pipeline** for automated checks
- **Comprehensive README**

The teamchat session should produce:

- **400-700 events** in the journal
- **25-40 DM threads** (contract negotiations, plan limits, event ownership)
- **15-25 broadcasts** (schema ready, auth shape, components ready, etc.)
- **4-6 unblock cascades** (visible as burst activity after foundational tasks complete)
- **A rich capture & compare report** demonstrating teamchat's value proposition
