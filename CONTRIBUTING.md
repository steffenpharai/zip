# Contributing to ZIP Robot

Thank you for your interest in contributing to ZIP Robot! This document provides guidelines and instructions for contributing to the project.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
- [Coding Standards](#coding-standards)
- [Testing](#testing)
- [Documentation](#documentation)
- [Pull Request Process](#pull-request-process)
- [For AI Agents](#for-ai-agents)

## Code of Conduct

This project adheres to a code of conduct that all contributors are expected to follow. Please be respectful, inclusive, and constructive in all interactions.

## Getting Started

1. **Fork the repository** and clone your fork
2. **Set up your development environment**:
   ```bash
   npm install
   cp .env.example .env
   # Add your OPENAI_API_KEY to .env
   ```
3. **Read the documentation**:
   - [README.md](README.md) - Project overview
   - [AGENT_GUIDE.md](AGENT_GUIDE.md) - Quick reference for AI agents
   - [docs/agents/README.md](docs/agents/README.md) - Agent onboarding
   - [docs/agents/architecture.md](docs/agents/architecture.md) - System architecture

## Development Workflow

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/updates

### Making Changes

1. **Create a feature branch** from `master`:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** following the [Coding Standards](#coding-standards)

3. **Test your changes**:
   ```bash
   npm run typecheck
   npm run lint
   npm run test:e2e
   ```

4. **Commit your changes** with clear, descriptive messages:
   ```bash
   git commit -m "feat: add new tool for X"
   ```

### Commit Message Format

We follow [Conventional Commits](https://www.conventionalcommits.org/):

- `feat:` - New feature
- `fix:` - Bug fix
- `docs:` - Documentation changes
- `style:` - Code style changes (formatting, etc.)
- `refactor:` - Code refactoring
- `test:` - Test additions/updates
- `chore:` - Build process or auxiliary tool changes

Examples:
```
feat: add web search tool with citation support
fix: resolve memory leak in event bus
docs: update installation guide for Jetson
```

## Coding Standards

### TypeScript

- **Strict mode**: All code must pass TypeScript strict mode checks
- **No `any` types**: Use proper types or `unknown` with type guards
- **Zod schemas**: All inputs/outputs must be validated with Zod schemas

### Architecture Patterns

1. **Event-Driven Architecture**: All UI state changes must go through the event bus
   ```typescript
   import { eventBus } from "@/lib/events/bus";
   eventBus.emit({ type: "zip.state", payload: { state: "LISTENING" } });
   ```

2. **Tool Registry Pattern**: All tools must be registered in `lib/tools/registry.ts`
   - Define Zod schemas for input/output
   - Assign appropriate permission tier (READ/WRITE/ACT/ADMIN)
   - Implement tool function
   - Register in registry

3. **AI Brain Orchestration**: All AI requests route through `lib/orchestrators/brain.ts`

### Code Style

- Follow patterns in `.cursorrules`
- Use meaningful variable names
- Add comments for complex logic
- Keep functions focused and small
- Prefer composition over inheritance

### Security

- ✅ **Always validate inputs** with Zod schemas
- ✅ **Sanitize URLs** (reject unsafe protocols)
- ✅ **Set timeouts** for external API calls
- ✅ **Use rate limiting** in API routes
- ✅ **Never expose API keys** to client-side code
- ✅ **Audit log** all tool executions

## Testing

### Before Submitting

All tests must pass:

```bash
# Type checking
npm run typecheck

# Linting
npm run lint

# E2E tests
npm run test:e2e

# Integration tests
npm run test:integration

# Health checks
npm run test:health
```

### Writing Tests

- Write tests for new functionality
- Update tests when modifying existing features
- Use Playwright for E2E tests
- Test error cases and edge conditions

## Documentation

### Code Documentation

- Add JSDoc comments for public functions
- Document complex algorithms and business logic
- Keep comments up-to-date with code changes

### User Documentation

- Update README.md for user-facing changes
- Add examples for new features
- Update API documentation if endpoints change

### Developer Documentation

- Update architecture docs for structural changes
- Document new patterns or conventions
- Keep agent guides current

## Pull Request Process

1. **Update documentation** if your changes affect users or developers
2. **Ensure all tests pass** (see [Testing](#testing))
3. **Update CHANGELOG.md** with your changes
4. **Create a pull request** with:
   - Clear description of changes
   - Reference to related issues
   - Screenshots/demos if applicable
   - Checklist from PR template

### PR Checklist

- [ ] Code follows project style guidelines
- [ ] TypeScript strict mode compliance
- [ ] All inputs validated with Zod schemas
- [ ] Event bus used correctly (if applicable)
- [ ] Tool registered in registry (if new tool)
- [ ] Permission tier correctly assigned
- [ ] Error handling implemented
- [ ] Observability/tracing added (if applicable)
- [ ] Rate limiting considered (if applicable)
- [ ] Security considerations addressed
- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] CHANGELOG.md updated

### Review Process

- PRs require at least one approval
- All CI checks must pass
- Address review feedback promptly
- Maintain a clean commit history

## For AI Agents

This project is optimized for AI agent collaboration. See:

- **[AGENT_GUIDE.md](AGENT_GUIDE.md)** - Quick reference
- **[docs/agents/README.md](docs/agents/README.md)** - Onboarding guide
- **[docs/agents/architecture.md](docs/agents/architecture.md)** - Architecture details
- **[docs/agents/development-workflow.md](docs/agents/development-workflow.md)** - Workflow guide
- **[.github/copilot-instructions.md](.github/copilot-instructions.md)** - Copilot guide

### Agent-Specific Guidelines

1. **Follow the architecture**: Event-driven, type-safe, tool registry pattern
2. **Use existing patterns**: Look at similar implementations before creating new ones
3. **Test thoroughly**: Run all test suites before submitting
4. **Document decisions**: Explain why you made certain choices
5. **Ask for clarification**: If requirements are unclear, ask rather than guess

## Questions?

- Open an issue for bugs or feature requests
- Check existing documentation first
- Review similar implementations in the codebase
- Ask in discussions or issues

Thank you for contributing to ZIP Robot! 🚀
