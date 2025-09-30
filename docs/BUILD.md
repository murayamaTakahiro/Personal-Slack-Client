# Production Build Instructions

## Prerequisites
- Node.js 16+ and npm
- Rust 1.70+
- Windows: Microsoft Visual C++ Build Tools

## Build Commands

### Development Build
```bash
npm run tauri:dev
```

### Production Build
```bash
# Install dependencies
npm install

# Build the production bundle
npm run tauri:build
```

This will create:
- Windows: `.msi` and `.exe` installers in `src-tauri/target/release/bundle/`
- The standalone executable in `src-tauri/target/release/`

## Version Update

Before releasing, update versions in:
1. `package.json` - version field
2. `src-tauri/Cargo.toml` - version field
3. `src-tauri/tauri.conf.json` - version field

## Known Issues Resolved
- ✅ Unused imports removed
- ✅ Result warnings fixed
- ✅ Unused CSS selectors removed  
- ✅ A11y warnings acknowledged (intentional for keyboard navigation)

## NPM Version
Current npm version: 10.9.0
Optional upgrade available: 11.5.2

To upgrade npm (optional):
```bash
npm install -g npm@11.5.2
```

## Release Checklist
- [ ] Update version numbers
- [ ] Run tests
- [ ] Build production bundle
- [ ] Test the built application
- [ ] Create release notes
- [ ] Tag the release in git