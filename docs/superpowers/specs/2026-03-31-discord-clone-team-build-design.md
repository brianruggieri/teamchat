# Discord Clone — Team Build Design Spec

> **Purpose:** A full-stack Discord clone built from scratch in ~1 hour by 14 Claude agents, producing a runnable app with rich multi-agent coordination for teamchat capture & compare testing.

## Vision

Build a functional Discord clone — text chat, voice rooms, servers, channels, roles, file uploads, real-time presence, search, notifications, and Stripe billing — as a single Next.js monorepo. The primary goal is generating a richly coordinated team session that demonstrates teamchat's value proposition: making invisible agent coordination visible.

## Success Criteria

1. **Runnable app** — `npm run dev` launches a working Discord-like interface
2. **Rich coordination** — 400-700 teamchat events, 25-40 DM threads, 4-6 unblock cascades
3. **Full capture bundle** — session can be captured and turned into a comparison report
4. **All layers present** — auth, DB, API, real-time, payments, file uploads, search, CI/CD, frontend

## Tech Stack

| Layer | Choice | Rationale |
|-------|--------|-----------|
| Framework | Next.js 15 (App Router) | Server + client in one repo, agents know it well |
| Language | TypeScript (strict) | Shared types across all layers |
| Database | Prisma + SQLite | Zero external deps, instant setup |
| Auth | NextAuth v5 + Credentials | No OAuth config needed, works immediately |
| Real-time | Socket.io | Battle-tested WS library |
| UI | Tailwind CSS + shadcn/ui | Fast, consistent, well-documented components |
| Payments | Stripe (test mode) | Real payment integration with test keys |
| File uploads | Local filesystem + API routes | No S3 config needed |
| Search | SQLite FTS5 | Built into the DB, no external service |
| Package manager | npm | User preference |

## Domain Model

```
User ──┬── Member ──── Server ──── Channel ──── Message
       │      │           │           │            │
       │      └── Role ───┘           │         Reaction
       │                              │
       ├── DirectMessage              └── Attachment
       │
       ├── Notification
       │
       └── Subscription (Stripe)
```

### Entity Details

**User** — id, email, hashedPassword, username, displayName, avatarUrl, status (online/idle/dnd/offline), stripeCustomerId, createdAt

**Server** — id, name, imageUrl, inviteCode, ownerId, plan (free/pro), createdAt

**Channel** — id, name, type (TEXT/VOICE/ANNOUNCEMENT), serverId, categoryName, position, topic, slowMode, createdAt

**Member** — id, userId, serverId, roleId, nickname, joinedAt

**Role** — id, name, serverId, permissions (bigint bitfield), color, position, isDefault

**Message** — id, content, authorId, channelId, replyToId, pinned, editedAt, deleted, createdAt

**Reaction** — id, emoji, messageId, userId, createdAt

**Attachment** — id, url, filename, contentType, size, messageId, createdAt

**DirectMessage** — id, content, senderId, receiverId, conversationId, createdAt

**Conversation** — id, participantOneId, participantTwoId, createdAt

**Notification** — id, type (mention/reply/dm/server-invite), userId, referenceId, referenceType, read, createdAt

**Subscription** — id, userId, stripeSubscriptionId, stripePriceId, plan (free/pro), status (active/canceled/past_due), currentPeriodEnd, createdAt

### Permission Bitfield

```typescript
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
```

## Agent Roster (14 agents)

| # | Agent | Model | Responsibility |
|---|-------|-------|---------------|
| 1 | `db-architect` | sonnet | Prisma schema (all 12 models), migrations, seed data, shared types |
| 2 | `auth-engineer` | sonnet | NextAuth v5 config, login/register pages, session middleware, useSession hook |
| 3 | `permissions-eng` | sonnet | Permission bitfield system, role CRUD API, guard middleware for all routes |
| 4 | `server-engineer` | sonnet | Server CRUD, invite system, member management, Stripe plan limits + checkout |
| 5 | `channel-engineer` | sonnet | Channel CRUD, categories, ordering, settings (topic, slowmode, overrides) |
| 6 | `message-engineer` | sonnet | Message CRUD, replies, reactions, pins, edit/delete, attachment association |
| 7 | `realtime-eng` | sonnet | Socket.io server, presence tracking, typing indicators, live message delivery |
| 8 | `voice-engineer` | sonnet | Voice channel join/leave, room state machine, participant list, Socket.io events |
| 9 | `file-engineer` | sonnet | Upload API route (multipart), file serving, image thumbnails, size/type validation |
| 10 | `search-engineer` | sonnet | SQLite FTS5 virtual table, search API (messages, servers, users), result ranking |
| 11 | `notification-eng` | sonnet | Mention detection (@user/@role/@everyone), unread counts, notification feed, mark-read |
| 12 | `ui-engineer` | sonnet | shadcn/ui component library, Discord dark theme tokens, layout shells, core components |
| 13 | `frontend-eng` | sonnet | Page assembly, three-panel layout, routing, client state, infinite scroll, settings |
| 14 | `devops-engineer` | sonnet | Project init, Docker Compose, GitHub Actions CI, env config, README |

## Dependency Graph

```
WAVE 0 (immediate, no deps):
  db-architect, ui-engineer, devops-engineer

WAVE 1 (after db-architect completes schema):
  auth-engineer, server-engineer, file-engineer

WAVE 2 (after auth + servers):
  permissions-eng, channel-engineer, realtime-eng

WAVE 3 (after channels):
  message-engineer, voice-engineer

WAVE 4 (after messages):
  search-engineer, notification-eng

WAVE 5 (ongoing, assembles as APIs become available):
  frontend-eng (starts after ui-engineer, integrates APIs incrementally)
```

### Detailed Dependencies

| Agent | Blocked By | Blocks |
|-------|-----------|--------|
| `db-architect` | — | auth, servers, channels, messages, files, search, notifications, permissions |
| `auth-engineer` | db-architect | permissions, realtime, notifications, frontend |
| `permissions-eng` | db-architect, auth | channels (enforcement), servers (enforcement) |
| `server-engineer` | db-architect | channels, frontend |
| `channel-engineer` | db-architect, servers | messages, voice |
| `message-engineer` | db-architect, channels | search, notifications |
| `realtime-eng` | auth | frontend |
| `voice-engineer` | channels | frontend |
| `file-engineer` | db-architect | messages (attachment refs), frontend |
| `search-engineer` | messages | frontend |
| `notification-eng` | messages, auth | frontend |
| `ui-engineer` | — | frontend |
| `frontend-eng` | ui-engineer, all APIs (incremental) | — |
| `devops-engineer` | — | — (parallel throughout) |

## Predicted Coordination Hotspots

These are the moments that will generate the richest teamchat content:

### 1. Schema Broadcast (minute ~5)
`db-architect → all`: "Prisma schema complete. 12 models ready. Run `npx prisma generate` to get the client. Shared types exported from `src/types/db.ts`."
**Impact:** 6+ agents unblock simultaneously. Cascade of "acknowledged" reactions.

### 2. Auth Shape Broadcast (minute ~10)
`auth-engineer → all`: "Session shape finalized. `getServerSession()` returns `{ user: { id, email, username, avatarUrl } }`. Import auth config from `src/lib/auth.ts`."
**Impact:** 4 agents need to update their middleware imports.

### 3. Permissions Threading (minutes 12-20)
`permissions-eng` DMs each service agent individually: "Here's the `requirePermission(permission)` middleware. Add it to your routes. Import from `src/lib/permissions.ts`."
**Impact:** 4-5 separate DM threads, each with back-and-forth about which routes need which permissions.

### 4. Realtime ↔ Messages Negotiation (minutes 15-25)
`realtime-eng ↔ message-engineer`: "When a new message is created, who emits the Socket.io event? You or me?"
**Impact:** Design negotiation DM thread, potentially 6-10 messages resolving the ownership boundary.

### 5. Channel ↔ Voice Ownership (minutes 18-25)
`channel-engineer ↔ voice-engineer`: "Voice channels are a channel type, but voice state is separate. Who handles the `/api/channels/[id]/voice` endpoint?"
**Impact:** Another negotiation thread.

### 6. Billing Limits Enforcement (minutes 15-20)
`server-engineer` DMs `channel-engineer` and `file-engineer`: "Free plan: max 5 channels, 10MB uploads. Pro: unlimited, 100MB. You need to check `server.plan` before allowing creation."
**Impact:** Cross-cutting concern threading through multiple agents.

### 7. Design System Cascade (minute ~12)
`ui-engineer → all frontend`: "Component library shipped. Available: ServerSidebar, ChannelList, MessageArea, MemberList, Avatar, Modal, Tooltip. Import from `@/components/ui/*`."
**Impact:** Frontend agent unblocks for assembly.

### 8. Frontend Contract Requests (minutes 20-35)
`frontend-eng` DMs each API agent: "What's the endpoint for X? What shape does the response have?"
**Impact:** 5-8 DM threads as frontend discovers and integrates each API.

## Project Structure

```
discord-clone/
├── prisma/
│   ├── schema.prisma
│   ├── seed.ts
│   └── migrations/
├── src/
│   ├── app/
│   │   ├── (auth)/
│   │   │   ├── login/page.tsx
│   │   │   ├── register/page.tsx
│   │   │   └── layout.tsx
│   │   ├── (main)/
│   │   │   ├── servers/[serverId]/
│   │   │   │   ├── channels/[channelId]/page.tsx
│   │   │   │   └── settings/page.tsx
│   │   │   ├── dms/[conversationId]/page.tsx
│   │   │   └── layout.tsx
│   │   ├── api/
│   │   │   ├── auth/[...nextauth]/route.ts
│   │   │   ├── servers/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [serverId]/route.ts
│   │   │   │   ├── [serverId]/members/route.ts
│   │   │   │   ├── [serverId]/invite/route.ts
│   │   │   │   └── [serverId]/roles/route.ts
│   │   │   ├── channels/
│   │   │   │   ├── route.ts
│   │   │   │   ├── [channelId]/route.ts
│   │   │   │   └── [channelId]/messages/route.ts
│   │   │   ├── messages/
│   │   │   │   ├── [messageId]/route.ts
│   │   │   │   ├── [messageId]/reactions/route.ts
│   │   │   │   └── [messageId]/pin/route.ts
│   │   │   ├── files/
│   │   │   │   ├── upload/route.ts
│   │   │   │   └── [fileId]/route.ts
│   │   │   ├── search/route.ts
│   │   │   ├── notifications/
│   │   │   │   ├── route.ts
│   │   │   │   └── [notificationId]/read/route.ts
│   │   │   ├── voice/
│   │   │   │   └── [channelId]/route.ts
│   │   │   ├── dms/
│   │   │   │   ├── route.ts
│   │   │   │   └── [conversationId]/messages/route.ts
│   │   │   └── stripe/
│   │   │       ├── checkout/route.ts
│   │   │       └── webhook/route.ts
│   │   ├── layout.tsx
│   │   └── page.tsx
│   ├── components/
│   │   ├── ui/                    # shadcn/ui primitives
│   │   ├── layout/
│   │   │   ├── ServerSidebar.tsx
│   │   │   ├── ChannelSidebar.tsx
│   │   │   ├── MemberList.tsx
│   │   │   └── NavigationBar.tsx
│   │   ├── server/
│   │   │   ├── CreateServerModal.tsx
│   │   │   ├── InviteModal.tsx
│   │   │   └── ServerSettings.tsx
│   │   ├── channel/
│   │   │   ├── CreateChannelModal.tsx
│   │   │   ├── ChannelHeader.tsx
│   │   │   └── VoiceChannel.tsx
│   │   ├── message/
│   │   │   ├── MessageItem.tsx
│   │   │   ├── MessageInput.tsx
│   │   │   ├── ReactionPicker.tsx
│   │   │   └── MessageList.tsx
│   │   └── shared/
│   │       ├── Avatar.tsx
│   │       ├── Badge.tsx
│   │       ├── Modal.tsx
│   │       └── Tooltip.tsx
│   ├── hooks/
│   │   ├── useSocket.ts
│   │   ├── usePresence.ts
│   │   ├── useMessages.ts
│   │   ├── useNotifications.ts
│   │   └── useVoice.ts
│   ├── lib/
│   │   ├── db.ts               # Prisma client singleton
│   │   ├── auth.ts             # NextAuth config
│   │   ├── permissions.ts      # Permission bitfield utilities
│   │   ├── socket.ts           # Socket.io client init
│   │   └── stripe.ts           # Stripe client config
│   └── types/
│       ├── db.ts               # Prisma-generated type re-exports
│       └── api.ts              # API request/response shapes
├── server/
│   └── socket.ts               # Socket.io server (custom server entry)
├── public/
│   └── uploads/                # Local file storage
├── docker-compose.yml
├── Dockerfile
├── .github/workflows/ci.yml
├── .env.example
├── package.json
├── tsconfig.json
├── tailwind.config.ts
├── CLAUDE.md                   # Agent instructions
├── AGENTS.md                   # Agent-specific guidelines
└── README.md
```

## Stripe Integration

Handled by `server-engineer` as part of server plan management:

**Plans:**
- Free: 5 channels, 50 members, 10MB file uploads
- Pro ($9/mo): unlimited channels, 500 members, 100MB uploads

**Flow:**
1. Server owner clicks "Upgrade to Pro" → `POST /api/stripe/checkout` creates Stripe Checkout Session
2. User completes payment on Stripe → redirected back
3. Stripe webhook `checkout.session.completed` → update server plan to "pro"
4. Stripe webhook `customer.subscription.deleted` → downgrade to "free"

**Enforcement:**
- `channel-engineer` checks `server.plan` limits before channel creation
- `file-engineer` checks plan upload size limits
- `server-engineer` checks member count limits on join

## Session Predictions

| Metric | Estimate |
|--------|----------|
| Duration | 45-75 minutes |
| Total teamchat events | 400-700 |
| DM threads | 25-40 |
| Broadcasts | 15-25 |
| Unblock cascades | 4-6 |
| Task count | 35-42 |
| Files created | 80-120 |
| Lines of code | 4,000-8,000 |

## Scoped Out (Explicit Non-Goals)

- Video/screen share (WebRTC media streams)
- Discord Nitro / cosmetic upgrades
- Bot API / webhooks
- OAuth providers (Google, GitHub) — credentials only
- Server boosting
- Custom emoji uploads
- Thread channels (Discord forum-style)
- Audit log
- Rate limiting (beyond Stripe)
