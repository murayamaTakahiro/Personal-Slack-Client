# Task Completion Checklist

When completing any coding task in this project, follow these steps:

## Before Starting
1. **Understand the task**: Read requirements carefully
2. **Check existing code**: Search for similar implementations
3. **Review conventions**: Follow existing patterns and style

## During Development

### For Rust Code (Backend)
1. **Write code** following Rust conventions
2. **Format code**: Run `cargo fmt` in src-tauri directory
3. **Check linting**: Run `cargo clippy` and fix any warnings
4. **Verify compilation**: Run `cargo check` to ensure no errors

### For TypeScript/Svelte Code (Frontend)
1. **Write code** following TypeScript/Svelte conventions
2. **Type checking**: Run `npx tsc --noEmit` to verify types
3. **Svelte check**: Run `npx svelte-check` for Svelte-specific issues
4. **Format code**: Ensure consistent formatting (no formatter configured yet)

## After Implementation

### Testing
1. **Run the application**: `npm run tauri:dev` to test changes
2. **Test functionality**: Verify the feature works as expected
3. **Check console**: Look for any errors in browser console and terminal
4. **Test edge cases**: Try invalid inputs, empty states, etc.

### Code Quality Checks
1. **No console.log**: Remove debug logging before committing
2. **Error handling**: Ensure proper error handling is in place
3. **Type safety**: All TypeScript types properly defined
4. **Security**: No exposed tokens or sensitive data

### Final Verification
1. **Build check**: Run `npm run build` to ensure production build works
2. **Rust build**: Run `cd src-tauri && cargo build --release` for release build
3. **Review changes**: Use `git diff` to review all modifications
4. **Test again**: One final test of the complete feature

## Common Issues to Check

### Rust/Backend
- [ ] All `unwrap()` calls replaced with proper error handling
- [ ] Async functions properly awaited
- [ ] Rate limiting considered for API calls
- [ ] Logging added for debugging (using `tracing`)

### TypeScript/Frontend
- [ ] All promises properly handled
- [ ] Svelte stores properly subscribed/unsubscribed
- [ ] Props validated and typed
- [ ] Event handlers properly bound

### Cross-cutting
- [ ] API commands match between frontend and backend
- [ ] Data models synchronized between Rust and TypeScript
- [ ] Error messages user-friendly
- [ ] Performance acceptable for large datasets

## Git Workflow
1. **Stage changes**: `git add .` or specific files
2. **Review staged**: `git diff --staged`
3. **Commit**: `git commit -m "descriptive message"`
4. **Push**: `git push` (if working with remote repository)

## Notes
- The project doesn't have automated tests yet - manual testing is crucial
- No automated formatter for TypeScript/Svelte - maintain consistency manually
- Watch for TypeScript strict mode violations
- Consider adding tests for critical new functionality