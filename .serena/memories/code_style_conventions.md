# Code Style and Conventions

## TypeScript/JavaScript
- Uses strict TypeScript with proper type definitions
- Interface-based type system for Slack entities
- Camel case for variables and functions
- Pascal case for interfaces and types
- Optional chaining and nullish coalescing preferred

## Svelte Components
- Single file components with `<script>`, `<style>` blocks
- Reactive statements with `$:` syntax
- Store subscriptions with `$` prefix
- Event handling with `on:event` syntax
- Proper lifecycle management (onMount, onDestroy)

## State Management
- Svelte stores for global state
- Separate stores for different concerns (search, settings, workspaces)
- Async initialization patterns with persistent storage
- Proper subscription cleanup in components

## Services Architecture
- Service classes for business logic (KeyboardService, ReactionService)
- Singleton pattern for global services
- Promise-based async operations
- Comprehensive error handling

## CSS Styling
- CSS custom properties for theming
- BEM-like class naming conventions
- Responsive design with flexbox
- Smooth transitions and hover effects
- Dark/light theme support

## Error Handling
- Try-catch blocks for async operations
- Proper error logging with console.error
- User-friendly error messages
- Graceful degradation

## Keyboard Shortcuts
- KeyboardService for centralized shortcut management
- Handler registration/unregistration pattern
- Cross-platform modifier key support
- Input field awareness (allowInInput flag)