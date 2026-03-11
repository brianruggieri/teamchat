# taskboard

A collaborative task board built by a Claude Code agent team. This project exists to demonstrate multi-agent coordination — the build process is the product, not the code.

## Purpose

This project was built by 6 AI agents working in parallel, captured by teamchat's recording system. The resulting session demonstrates:

- Dependency chains (schema → api → frontend)
- Inter-agent DM threads (api ↔ auth middleware negotiation)
- Broadcast messages (schema publishes types to all agents)
- Idle suppression (testing agent waits for implementations)
- Bug discovery and cross-agent coordination
- Task lifecycle from creation through completion

## Running

```bash
bun install
bun run dev    # Start API server
bun test       # Run tests
```
