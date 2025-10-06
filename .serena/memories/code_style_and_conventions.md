# Code Style and Conventions

## TypeScript/Svelte Style
- **File naming**: camelCase for services/utils, PascalCase for components
- **Component structure**: Svelte components in `.svelte` files
- **Type annotations**: Use TypeScript for all new code
- **Imports**: Use relative imports for local modules
- **State management**: Svelte stores for global state

## Component Patterns
- **Props**: Use `export let` for component props
- **Events**: Use `createEventDispatcher()` for custom events
- **Reactivity**: Use Svelte's reactive declarations (`$:`)
- **Stores**: Subscribe with `$` prefix (e.g., `$settings`)

## File Organization
- Components in `src/lib/components/`
- Services (business logic) in `src/lib/services/`
- API calls in `src/lib/api/`
- Types in `src/lib/types/`
- Utilities in `src/lib/utils/`

## Rust Code Style
- Follow Rust standard conventions
- Use `#[tauri::command]` for Tauri commands
- Error handling with `Result<T, E>`

## Design Patterns
- **Service Layer**: Separate business logic from UI
- **Store Pattern**: Centralized state management with Svelte stores
- **Component Composition**: Small, reusable components
- **Error Boundaries**: Graceful error handling
- **Fallback Pattern**: Always provide fallback for unsupported features
