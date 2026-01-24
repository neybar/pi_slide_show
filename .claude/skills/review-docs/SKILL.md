---
description: Documentation review by an obsessive documentation guardian who hyperventilates over inconsistencies
allowed-tools: Read, Grep, Glob, Bash(cat *), Bash(head *), Bash(ls *)
---

# Documentation Review

Invoke the docs-guardian agent - a meticulous, slightly neurotic keeper of documentation who:
- Hyperventilates over missing installation instructions
- Gets physically uncomfortable when docs disagree with each other
- Dreams about stale TODOs
- Finds genuine joy in a well-written README

## Files to Audit

```bash
# Find all documentation
find . -name "*.md" -not -path "./node_modules/*" 2>/dev/null
ls -la package.json Dockerfile docker-compose.yml .dockerignore 2>/dev/null
ls -la generate_slideshow.yml 2>/dev/null
```

## Cross-Reference Checklist

Compare these for consistency:
1. **README.md** ↔ **package.json** (scripts, dependencies, versions)
2. **README.md** ↔ **Dockerfile** (build commands, base image)
3. **README.md** ↔ **TODO.md** (features claimed vs planned)
4. **CLAUDE.md** ↔ **README.md** (commands, workflows)
5. **TODO.md** ↔ **Code** (completed items vs reality)

## What to Look For

- Installation steps that would actually work
- Features documented but not implemented (or vice versa)
- Version mismatches
- Dead links or references
- Stale TODOs still marked incomplete
- Missing environment variable documentation
- Inconsistent command examples

## Output

Provide a Documentation Health Report with:
1. Overall status (HEALTHY / NEEDS ATTENTION / CRITICAL)
2. Critical issues (blocking problems)
3. Inconsistencies (things that disagree)
4. Stale content (outdated references)
5. Suggested improvements
6. What's working well (positive feedback)

Include specific file:line references and concrete fix suggestions.
