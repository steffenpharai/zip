# Pull Request

## Description

<!-- Provide a clear description of what this PR does -->

## Type of Change

<!-- Check the relevant option -->

- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update
- [ ] Code refactoring
- [ ] Performance improvement
- [ ] Test addition or update

## Related Issues

<!-- Link to related issues using #issue-number -->
Closes #
Related to #

## Changes Made

<!-- List the main changes in this PR -->

- 
- 
- 

## Testing

<!-- Describe the tests you ran and their results -->

- [ ] All existing tests pass (`npm run test:e2e`)
- [ ] Type checking passes (`npm run typecheck`)
- [ ] Linting passes (`npm run lint`)
- [ ] New tests added for new functionality
- [ ] Manual testing completed

### Test Results

```
<!-- Paste test output here if relevant -->
```

## Code Quality Checklist

<!-- Verify these before submitting -->

- [ ] Code follows the project's style guidelines (see `.cursorrules`)
- [ ] TypeScript strict mode compliance (no `any` types without justification)
- [ ] All inputs validated with Zod schemas (if applicable)
- [ ] Event bus used correctly for state changes (if applicable)
- [ ] Tool registered in `lib/tools/registry.ts` (if new tool)
- [ ] Permission tier correctly assigned (if new tool)
- [ ] Error handling implemented
- [ ] Observability/tracing added (if applicable)
- [ ] Rate limiting considered (if applicable)
- [ ] Security considerations addressed

## Architecture Compliance

<!-- Verify these for architectural changes -->

- [ ] Follows event-driven architecture pattern
- [ ] Uses tool registry pattern (if applicable)
- [ ] Integrates with AI Brain orchestration (if applicable)
- [ ] Respects permission tiers (READ/WRITE/ACT/ADMIN)
- [ ] Audit logging in place (if applicable)

## Documentation

- [ ] README.md updated (if needed)
- [ ] Code comments added for complex logic
- [ ] API documentation updated (if applicable)
- [ ] Agent documentation updated (if applicable)

## Screenshots / Demo

<!-- If applicable, add screenshots or a demo -->

## Additional Notes

<!-- Any additional information reviewers should know -->

## Agent Notes

<!-- If this PR was created by an AI agent, note any specific considerations -->

- Agent used: [GitHub Copilot / Cursor Agent / Both]
- Instructions followed: [Link to relevant docs]
- Special considerations:

