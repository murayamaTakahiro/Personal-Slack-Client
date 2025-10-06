# Task Completion Checklist

## Before Marking a Task Complete

### Code Quality Checks
- [ ] Code compiles without errors
- [ ] TypeScript types are correct (no `any` unless necessary)
- [ ] No console errors in browser
- [ ] Code follows project conventions

### Functionality Checks
- [ ] Feature works as expected
- [ ] Error cases are handled gracefully
- [ ] Fallback behavior works (e.g., GenericFilePreview for unsupported files)
- [ ] No regression in existing features

### File Preview Specific Checks
- [ ] File type detection works correctly
- [ ] Preview renders properly in message list
- [ ] Lightbox/full-screen view works
- [ ] Download link is available
- [ ] Large files are handled appropriately
- [ ] Keyboard navigation works (j/k, Esc)

### Integration Checks
- [ ] Component integrates with FileAttachments.svelte
- [ ] fileService.ts updated for new file types
- [ ] No breaking changes to existing previews

### Git Workflow
- **IMPORTANT**: Do NOT commit or push without explicit user approval
- Ask for review before committing
- Follow the guideline in CLAUDE.md

## Testing Strategy
Since this is a Tauri app:
- Manual testing in `npm run tauri:dev` mode
- Test with real Slack files when possible
- Test edge cases (large files, corrupted files, missing data)
- Verify in both light and dark modes
