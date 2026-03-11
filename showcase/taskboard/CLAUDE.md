# taskboard — Project Instructions

## What This Is

A collaborative task board: REST API + React frontend. Built by an agent team to demonstrate multi-agent coordination.

## Tech Stack

- **Runtime**: Bun
- **Server**: Hono (lightweight HTTP framework)
- **Database**: SQLite via bun:sqlite (zero deps)
- **Frontend**: React 19 + Tailwind CSS 4
- **Auth**: JWT tokens with bcrypt password hashing
- **Tests**: Bun test runner

## Architecture

```
src/
  db/
    schema.ts          # SQLite schema, migrations, seed data
    types.ts           # Shared TypeScript types (Task, User, Board)
  api/
    server.ts          # Hono app setup, route mounting
    routes/
      tasks.ts         # CRUD endpoints for tasks
      boards.ts        # Board management endpoints
      users.ts         # User registration, profile
    middleware/
      auth.ts          # JWT verification middleware
      validation.ts    # Request body validation
  auth/
    jwt.ts             # Token generation, verification, refresh
    passwords.ts       # Bcrypt hashing, comparison
    rbac.ts            # Role-based access: admin, member, viewer
  frontend/
    App.tsx            # Main React app
    components/
      BoardView.tsx    # Kanban board with columns
      TaskCard.tsx     # Draggable task card
      LoginForm.tsx    # Auth UI
      Header.tsx       # Nav with user info
    hooks/
      useAuth.ts       # Token management, login/logout
      useTasks.ts      # Task CRUD via API
  tests/
    api.test.ts        # API endpoint integration tests
    auth.test.ts       # Auth flow tests
    e2e.test.ts        # Full flow: register → login → create board → add task → move task
```

## Conventions

- Indentation: Tabs
- All API responses use `{ data, error }` envelope
- Auth tokens in `Authorization: Bearer <token>` header
- Task statuses: `todo`, `in_progress`, `review`, `done`
- Board roles: `admin` (full CRUD), `member` (create/edit tasks), `viewer` (read only)
- All database operations go through typed helper functions in schema.ts, not raw SQL in routes

## What to Build (in dependency order)

1. **schema** agent: Types, SQLite schema, migrations, seed data
2. **api** agent: Hono routes for tasks, boards, users (depends on schema types)
3. **auth** agent: JWT + bcrypt + RBAC middleware (depends on schema types)
4. **frontend** agent: React UI (depends on API contract from api agent)
5. **testing** agent: Integration + E2E tests (depends on api + auth)

## Critical Coordination Points

- `schema` must broadcast the TypeScript types to all agents once complete
- `api` and `auth` must agree on middleware ordering (auth before validation? or validation before auth?)
- `frontend` needs the API contract (route paths, request/response shapes) from `api`
- `auth` and `frontend` must agree on token storage strategy (localStorage vs httpOnly cookie)
- `testing` should write test scaffolds early but can only run full tests once api + auth are ready

## What NOT to Do

- Don't use an ORM — bun:sqlite with typed helpers is simpler
- Don't add WebSocket/real-time features — REST only for v1
- Don't implement OAuth/social login — email+password only
- Don't add file upload — text-only tasks
