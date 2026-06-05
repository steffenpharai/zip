# Agent Guide - ZIP Project

Quick reference guide for AI agents (GitHub Copilot and Cursor Agent) working on the ZIP project.

## Quick Links

- **[Agent Onboarding](docs/agents/README.md)** - Getting started guide
- **[Architecture Guide](docs/agents/architecture.md)** - System architecture details
- **[Development Workflow](docs/agents/development-workflow.md)** - How to work on tasks
- **[GitHub Copilot Instructions](.github/copilot-instructions.md)** - Copilot-specific guide
- **[Cursor Agent Instructions](.cursor/agent/instructions.md)** - Cursor-specific guide
- **[Project Rules](.cursorrules)** - Comprehensive code patterns

## Project Overview

ZIP is a production-grade Jarvis-style HUD assistant with:

- **Realtime Voice**: OpenAI Realtime WebRTC integration
- **AI Brain**: Intelligent orchestration system
- **Tool Ecosystem**: 39 tools with permission-based access (including printer and robot control)
- **Event-Driven**: Typed event bus for all state changes
- **Type-Safe**: Full TypeScript with Zod validation
- **Robot Control**: ELEGOO Smart Robot Car V4.0 integration
- **3D Printer**: Moonraker/Klipper printer integration

## Core Principles

1. **Event-Driven Architecture**: All UI state changes via event bus
2. **Type Safety**: TypeScript strict mode + Zod schemas
3. **Tool Registry Pattern**: All tools registered in `lib/tools/registry.ts`
4. **AI Brain Orchestration**: All requests route through `lib/orchestrators/brain.ts`
5. **Permission Tiers**: READ | WRITE | ACT | ADMIN

## Quick Reference

### Adding a New Tool

1. Create `lib/tools/implementations/my-tool.ts`
2. Define Zod schemas (input/output)
3. Implement tool function
4. Register in `lib/tools/registry.ts`
5. Create API endpoint (optional)
6. Test thoroughly

### Event Bus Usage

```typescript
import { eventBus } from "@/lib/events/bus";

// Emit event
eventBus.emit({
  type: "zip.state",
  payload: { state: "LISTENING" }
});
```

### API Route Pattern

```typescript
import { rateLimit } from "@/lib/middleware/rate-limit";
import { z } from "zod";

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }
  
  const body = await req.json();
  const input = inputSchema.parse(body);
  // Implementation
}
```

## Testing Requirements

Before submitting PR:

- ✅ Type checking: `npm run typecheck`
- ✅ Linting: `npm run lint`
- ✅ E2E tests: `npm run test:e2e`
- ✅ Manual testing

## Key Files

- `lib/orchestrators/brain.ts` - Main orchestration
- `lib/events/bus.ts` - Event bus
- `lib/tools/registry.ts` - Tool registry
- `lib/tools/executor.ts` - Tool executor
- `.cursorrules` - Code patterns

## Common Tasks

### Adding a Tool
See [Development Workflow](docs/agents/development-workflow.md#adding-a-new-tool)

### Fixing a Bug
See [Development Workflow](docs/agents/development-workflow.md#fixing-bugs)

### Modifying Features
See [Development Workflow](docs/agents/development-workflow.md#modifying-existing-features)

## Security

- ✅ Validate ALL inputs with Zod
- ✅ Sanitize URLs (reject unsafe protocols)
- ✅ Set timeouts for external calls
- ✅ Use rate limiting in API routes
- ✅ Never expose API keys to client

## Important Reminders

1. **Event Bus**: Always use for state changes
2. **Type Safety**: No `any` types, use Zod schemas
3. **Testing**: Write tests for new functionality
4. **Documentation**: Update docs if needed
5. **Security**: Validate inputs, sanitize URLs

## Getting Help

1. Check [Agent Onboarding](docs/agents/README.md)
2. Review [Architecture Guide](docs/agents/architecture.md)
3. Check [Development Workflow](docs/agents/development-workflow.md)
4. Review `.cursorrules` for patterns
5. Look at similar implementations

---

**Remember**: This is a production-grade system. Always prioritize type safety, error handling, security, and observability.

