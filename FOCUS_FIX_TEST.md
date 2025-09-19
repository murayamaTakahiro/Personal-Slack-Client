# Focus Trap Fix Test Plan

## Issue Summary
The H and E keys were incorrectly moving focus in the message list when the thread view had focus, instead of navigating within the thread view.

## Fix Implemented
1. **ResultList.svelte**: Added focus context checking to H and E key handlers
   - Check if thread view has focus before handling shortcuts
   - Check if result list actually has focus before executing jump actions
   - Added same checks for J/K navigation keys

2. **ThreadView.svelte**: Added H and E key handling for thread navigation
   - H key now jumps to first message in thread
   - E key now jumps to last message in thread
   - Added user feedback via toast notifications

3. **KeyboardService.ts**: Updated thread view navigation key detection
   - Added h, H, e, E, Home, End to the list of keys handled by thread view

## Test Cases

### Test 1: Result List Navigation
1. Click on the results panel to focus it (or press Ctrl+1)
2. Press H key - should jump to first message in results
3. Press E key - should jump to last message in results
4. Press J/K or Arrow keys - should navigate up/down in results

### Test 2: Thread View Navigation
1. Select a message to view its thread
2. Click on the thread panel to focus it (or press Ctrl+2)
3. Press H key - should jump to first message in thread (not affect results)
4. Press E key - should jump to last message in thread (not affect results)
5. Press J/K or Arrow keys - should navigate within thread

### Test 3: Focus Switching
1. Focus results panel and navigate with H/E keys
2. Switch focus to thread panel (Ctrl+2)
3. Press H/E keys - should only affect thread navigation
4. Switch back to results (Ctrl+1)
5. Press H/E keys - should only affect results navigation

## Expected Behavior
- H and E keys only affect the component that currently has focus
- Visual focus indicators show which panel is active
- Toast notifications confirm jump actions in appropriate context
- Navigation keys (J/K/arrows) also respect focus context

## Files Modified
- `/src/lib/components/ResultList.svelte`
- `/src/lib/components/ThreadView.svelte`
- `/src/lib/services/keyboardService.ts`
- `/src/lib/components/KeyboardHelp.svelte`