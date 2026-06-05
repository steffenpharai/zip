# Agent Onboarding Guide - ZIP Project

Welcome! This guide will help you (as an AI agent) understand the ZIP project and how to work on it effectively.

## Quick Start

1. **Read this guide** - Understand the project structure
2. **Review Architecture** - Read `architecture.md` for system design
3. **Check Workflow** - Read `development-workflow.md` for how to work
4. **Follow Patterns** - Check `.cursorrules` for code patterns
5. **Start Working** - Use issue templates and PR templates

## Project Overview

ZIP is a production-grade Jarvis-style HUD assistant with:

- **Realtime Voice**: OpenAI Realtime WebRTC integration
- **AI Brain**: Intelligent orchestration system
- **Tool Ecosystem**: 39 tools with permission-based access (including printer and robot control)
- **Event-Driven**: Typed event bus for all state changes
- **Type-Safe**: Full TypeScript with Zod validation
- **Production-Ready**: Error handling, logging, tracing, rate limiting
- **Robot Control**: ELEGOO Smart Robot Car V4.0 integration via bridge server
- **3D Printer**: Moonraker/Klipper printer integration

## Project Structure

```
zip/
├── app/                    # Next.js app directory
│   ├── api/               # API routes
│   └── (hud)/            # HUD page
├── components/            # React components
│   ├── hud/              # HUD-specific components
│   └── robot/            # Robot control UI components
├── hooks/                 # React hooks
├── lib/                   # Core libraries
│   ├── events/           # Event bus system
│   ├── orchestrators/    # AI Brain orchestration
│   ├── tools/            # Tool registry and executor
│   ├── robot/            # Robot client integration
│   ├── memory/           # Memory management
│   ├── observability/    # Tracing and audit
│   └── openai/           # OpenAI integration
├── robot/                # Robot integration
│   ├── bridge/           # Robot bridge server
│   ├── firmware/         # Arduino firmware
│   └── tools/            # Testing utilities
├── scripts/              # Utility scripts
└── data/                 # Runtime data (auto-created)
```

## Key Files

### Core Architecture

- **`lib/orchestrators/brain.ts`** - Main orchestration entry point
- **`lib/events/bus.ts`** - Event bus system
- **`lib/tools/registry.ts`** - Tool registry
- **`lib/tools/executor.ts`** - Tool executor

### Configuration

- **`.cursorrules`** - Comprehensive project rules
- **`README.md`** - Project documentation
- **`package.json`** - Dependencies and scripts

### Documentation

- **`docs/agents/architecture.md`** - Architecture details
- **`docs/agents/development-workflow.md`** - Development workflow
- **`.github/copilot-instructions.md`** - GitHub Copilot instructions
- **`.cursor/agent/instructions.md`** - Cursor Agent instructions

## Common Tasks

### Adding a New Tool

1. Create `lib/tools/implementations/my-tool.ts`
2. Define input/output Zod schemas
3. Implement tool function
4. Register in `lib/tools/registry.ts`
5. Create API endpoint (optional)
6. Test thoroughly
7. Update documentation

See `development-workflow.md` for detailed steps.

### Fixing a Bug

1. Reproduce the bug
2. Identify root cause
3. Check event bus usage
4. Fix the issue
5. Add tests to prevent regression
6. Test thoroughly

### Modifying Existing Features

1. Understand current implementation
2. Check event bus usage
3. Maintain backward compatibility
4. Update tests
5. Update documentation

## Architecture Principles

### 1. Event-Driven Architecture

**CRITICAL**: All UI state changes MUST flow through the event bus.

- Pattern: `User Input → Event Bus → State Reducer → UI Updates`
- Never mutate state directly
- Use `eventBus.emit()` for all state changes

### 2. Type Safety

- Full TypeScript strict mode
- Zod schemas for all tool inputs/outputs
- No `any` types without justification

### 3. Tool Registry Pattern

- All tools registered in `lib/tools/registry.ts`
- Permission tiers: READ | WRITE | ACT | ADMIN
- Automatic audit logging via executor

### 4. AI Brain Orchestration

- All requests route through `orchestrateConversation()`
- Intelligent routing to sub-graphs
- Context filtering for token efficiency

## Testing Requirements

Before submitting a PR:

1. **Type Check**: `npm run typecheck` must pass
2. **Lint**: `npm run lint` must pass
3. **E2E Tests**: `npm run test:e2e` must pass
4. **Manual Testing**: Test the feature manually

## Code Quality Standards

- **TypeScript**: Strict mode, no `any` types
- **Zod**: All inputs validated
- **Error Handling**: Try/catch with proper error messages
- **Observability**: Tracing for complex operations
- **Security**: Input validation, URL sanitization, rate limiting

## Security Requirements

- **Input Validation**: ALL inputs validated with Zod
- **URL Sanitization**: Reject unsafe protocols
- **File Size Limits**: Enforce limits
- **Timeout Protection**: Set timeouts for external calls
- **Rate Limiting**: Use rate limiter for API endpoints
- **API Key Protection**: Never expose to client

## Getting Help

1. **Check Documentation**: Read relevant docs
2. **Review Similar Code**: Look at existing implementations
3. **Check Patterns**: Review `.cursorrules`
4. **Ask Questions**: Use issue comments if stuck

## Important Reminders

1. **Event Bus**: Always use for state changes
2. **Type Safety**: No `any` types, use Zod schemas
3. **Testing**: Write tests for new functionality
4. **Documentation**: Update docs if needed
5. **Security**: Validate inputs, sanitize URLs
6. **Observability**: Add tracing for complex operations

## Next Steps

1. Read `architecture.md` for detailed architecture
2. Read `development-workflow.md` for workflow details
3. Review `.cursorrules` for code patterns
4. Check issue templates for task structure
5. Start working on assigned tasks!

Remember: This is a production-grade system. Always prioritize type safety, error handling, security, and observability.

