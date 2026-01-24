---
description: Review Node.js/JavaScript code for security, performance, and best practices
allowed-tools: Read, Grep, Glob, Bash(git diff*), Bash(git log*), Bash(git show*), Bash(npm *)
---

# Node.js Code Review

You are invoking the nodejs-reviewer agent to perform a comprehensive code review.

## Instructions

1. If a specific file or directory is provided, review that
2. Otherwise, run `git diff HEAD~1` to see recent changes
3. Focus on JavaScript/TypeScript files (.js, .mjs, .ts, .jsx, .tsx)
4. Use the nodejs-reviewer agent guidelines for categorizing issues

## Review Scope

When reviewing, analyze:
- **Security**: Vulnerabilities, exposed secrets, input validation
- **Performance**: Bottlenecks, memory leaks, bundle size
- **Code Quality**: Readability, DRY, naming, error handling
- **Async Patterns**: Proper promise/await usage
- **Testing**: Coverage gaps, test quality

## Commands to Run

```bash
# See what changed
git diff HEAD

# Check for TODO/FIXME comments
grep -rn "TODO\|FIXME\|HACK\|XXX" --include="*.js" --include="*.mjs" .

# Check package.json for issues
cat package.json
```

## Output

Provide a structured review with:
1. Critical issues (blockers)
2. Important issues (should fix)
3. Suggestions (nice to have)
4. Summary with overall assessment
