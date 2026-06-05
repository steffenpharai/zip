# Development Workflow Guide - ZIP Project

Step-by-step guide for AI agents working on the ZIP project.

## Workflow Overview

1. **Understand the Task**
2. **Plan the Implementation**
3. **Implement Following Patterns**
4. **Test Thoroughly**
5. **Submit PR with Documentation**

## Adding a New Tool

### Step 1: Understand Requirements

- What should the tool do?
- What are the inputs?
- What are the outputs?
- What permission tier? (READ/WRITE/ACT/ADMIN)
- Does it need user confirmation? (ACT tier)

### Step 2: Create Implementation File

Create `lib/tools/implementations/my-tool.ts`:

```typescript
import { z } from "zod";
import { trace } from "@/lib/observability/tracing";

// Define input schema
export const myInputSchema = z.object({
  // All input fields with validation
});

// Define output schema
export const myOutputSchema = z.object({
  // All output fields
});

// Implement tool
export async function myToolImplementation(
  input: z.infer<typeof myInputSchema>
): Promise<z.infer<typeof myOutputSchema>> {
  return trace("my_tool", async (span) => {
    try {
      // Tool logic here
      return result;
    } catch (error) {
      span.recordError(error);
      throw error;
    }
  });
}
```

### Step 3: Register in Registry

Edit `lib/tools/registry.ts`:

```typescript
import { myToolImplementation, myInputSchema, myOutputSchema } from "./implementations/my-tool";

toolRegistry.set("my_tool", {
  name: "my_tool",
  description: "Clear description for AI",
  inputSchema: myInputSchema,
  outputSchema: myOutputSchema,
  permissionTier: "READ", // or WRITE, ACT, ADMIN
  execute: (input: unknown) => 
    myToolImplementation(input as z.infer<typeof myInputSchema>),
});
```

### Step 4: Create API Endpoint (Optional)

Create `app/api/tools/my_tool/route.ts`:

```typescript
import { NextRequest, NextResponse } from "next/server";
import { rateLimit } from "@/lib/middleware/rate-limit";
import { toolExecutor } from "@/lib/tools/executor";
import { myInputSchema } from "@/lib/tools/implementations/my-tool";

export async function POST(req: NextRequest) {
  const rateLimitResult = await rateLimit(req);
  if (!rateLimitResult.success) {
    return NextResponse.json({ error: "Rate limited" }, { status: 429 });
  }

  try {
    const body = await req.json();
    const input = myInputSchema.parse(body);
    const result = await toolExecutor.execute("my_tool", input);
    return NextResponse.json(result);
  } catch (error) {
    // Error handling
  }
}
```

### Step 5: Test

1. Test via API endpoint
2. Test via AI Brain (chat interface)
3. Verify event emissions
4. Check audit logs

## Modifying Existing Features

### Step 1: Understand Current Implementation

- Read the existing code
- Understand the flow
- Check event bus usage
- Review related files

### Step 2: Plan Changes

- What needs to change?
- Will it break existing functionality?
- Do tests need updating?
- Does documentation need updating?

### Step 3: Implement Changes

- Follow existing patterns
- Maintain backward compatibility
- Use event bus for state changes
- Add tracing if needed

### Step 4: Update Tests

- Update existing tests
- Add new tests if needed
- Ensure all tests pass

### Step 5: Update Documentation

- Update README if needed
- Update API documentation
- Update agent docs if patterns change

## Fixing Bugs

### Step 1: Reproduce the Bug

- Understand the bug report
- Reproduce locally
- Identify steps to reproduce

### Step 2: Identify Root Cause

- Check event bus usage
- Check tool execution
- Check orchestration flow
- Check error handling

### Step 3: Fix the Issue

- Fix the root cause
- Don't just patch symptoms
- Follow existing patterns
- Add error handling if needed

### Step 4: Add Regression Tests

- Add tests to prevent regression
- Test the fix
- Test related functionality

### Step 5: Verify Fix

- Test the fix manually
- Run all tests
- Check for side effects

## Working with Events

### Emitting Events

```typescript
import { eventBus } from "@/lib/events/bus";

// Emit state change
eventBus.emit({
  type: "zip.state",
  payload: { state: "LISTENING" }
});

// Emit panel update
eventBus.emit({
  type: "panel.update",
  payload: { panel: "system_stats", data: stats }
});
```

### Subscribing to Events

```typescript
import { eventBus } from "@/lib/events/bus";

useEffect(() => {
  const unsubscribe = eventBus.subscribe((event) => {
    if (event.type === "zip.state") {
      // Handle state change
    }
  });
  
  return () => unsubscribe();
}, []);
```

## Testing Checklist

Before submitting PR:

- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] E2E tests pass (`npm run test:e2e`)
- [ ] Manual testing completed
- [ ] Tool tested via API endpoint (if new tool)
- [ ] Tool tested via AI Brain (if new tool)
- [ ] Event emissions verified
- [ ] Error handling tested
- [ ] Edge cases considered

## PR Submission Checklist

- [ ] PR description filled out
- [ ] Related issues linked
- [ ] Changes described
- [ ] Testing completed
- [ ] Code quality checklist verified
- [ ] Architecture compliance verified
- [ ] Documentation updated (if needed)
- [ ] Screenshots/demo added (if applicable)

## Common Patterns

### Error Handling

```typescript
try {
  const result = await operation();
  return result;
} catch (error) {
  span.recordError(error);
  throw new Error("Operation failed: " + error.message);
}
```

### Input Validation

```typescript
const input = inputSchema.parse(body); // Throws if invalid
```

### Timeout Protection

```typescript
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10000);

try {
  const response = await fetch(url, { signal: controller.signal });
  clearTimeout(timeoutId);
  // Process response
} catch (error) {
  clearTimeout(timeoutId);
  throw error;
}
```

## Best Practices

1. **Follow Patterns**: Use existing code as reference
2. **Type Safety**: No `any` types, use Zod schemas
3. **Event Bus**: Always use for state changes
4. **Error Handling**: Always handle errors gracefully
5. **Testing**: Write tests for new functionality
6. **Documentation**: Update docs if needed
7. **Security**: Validate inputs, sanitize URLs
8. **Observability**: Add tracing for complex operations

## Getting Help

1. Check `.cursorrules` for patterns
2. Review similar implementations
3. Check `docs/agents/` documentation
4. Review existing code patterns
5. Ask questions in issue comments

Remember: This is a production-grade system. Always prioritize type safety, error handling, security, and observability.

