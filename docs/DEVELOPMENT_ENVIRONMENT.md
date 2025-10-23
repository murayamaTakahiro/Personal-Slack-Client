# Development Environment Setup Guide

## Overview
This project is a desktop application built with Tauri. Development is possible in both WSL (Windows Subsystem for Linux) and Windows environments, but each environment requires appropriate setup.

## Important: Platform-Specific Binaries

### Background
Node.js native modules (especially Tauri CLI) use platform-specific binary files:
- **WSL/Linux**: `cli-linux-x64-gnu.node`
- **Windows**: `cli.win32-x64-msvc.node`

These binaries are not compatible, so **you cannot run node_modules installed in WSL from Windows PowerShell** (and vice versa).

## Setup Instructions by Environment

### When Developing in Windows PowerShell

1. Open **Windows PowerShell** (administrator privileges not required)

2. Navigate to the project directory:
   ```powershell
   cd C:\Users\[username]\personal-slack-client
   ```

3. If there are existing node_modules (installed in WSL), delete them:
   ```powershell
   Remove-Item -Recurse -Force node_modules
   Remove-Item -Force package-lock.json
   ```

4. Install dependencies for the Windows environment:
   ```powershell
   npm install
   ```

5. Start the Tauri application:
   ```powershell
   npm run tauri:dev
   ```

### When Developing in WSL

1. Open a **WSL terminal**

2. Navigate to the project directory:
   ```bash
   cd /mnt/c/Users/[username]/personal-slack-client
   ```

3. If there are existing node_modules (installed in Windows), delete them:
   ```bash
   rm -rf node_modules package-lock.json
   ```

4. Install dependencies for the WSL environment:
   ```bash
   npm install
   ```

5. Start the Tauri application:
   ```bash
   npm run tauri:dev
   ```

## Common Errors and Solutions

### Error: "Cannot find module './cli.win32-x64-msvc.node'"
- **Environment**: Windows PowerShell
- **Cause**: Using node_modules installed in WSL
- **Solution**:
  ```powershell
  Remove-Item -Recurse -Force node_modules
  npm install
  ```

### Error: "Cannot find module './cli-linux-x64-gnu.node'"
- **Environment**: WSL
- **Cause**: Using node_modules installed in Windows PowerShell
- **Solution**:
  ```bash
  rm -rf node_modules
  npm install
  ```

### Error: "Found version mismatched Tauri packages"
- **Cause**: Version mismatch between NPM packages and Rust crates
- **Solution**: Check the versions specified in package.json and adjust as necessary

## Best Practices

1. **Maintain a Consistent Environment**
   - Once you start development, continue using the same environment (Windows or WSL)
   - For team development, it's recommended to standardize the environment

2. **Precautions When Switching Environments**
   - When switching environments, always delete `node_modules` before running `npm install`
   - Deleting `package-lock.json` as well allows you to start from a clean state

3. **Recommended Development Environment**
   - **Windows developers**: Windows PowerShell or Command Prompt
   - **Linux/Mac experienced users**: WSL
   - **When using Visual Studio Code**: Standardize the terminal environment

## Tauri-Specific Notes

- Tauri works in both environments, but the build output is for the host OS (Windows)
- Even when running from WSL, the generated executable is for Windows (.exe)
- The development server works the same way in both environments

## Summary

The most important thing is to **match the environment where you installed node_modules with the environment where you run it**. As long as you follow this, you can develop without problems in either environment.
