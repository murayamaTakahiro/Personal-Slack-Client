#!/bin/bash

echo "Starting development server..."
export RUST_LOG=info

# Kill any existing server
pkill -f "target/debug/personal-slack-client" 2>/dev/null

# Build and run
cargo build
echo "Build complete, starting server..."

./target/debug/personal-slack-client &
SERVER_PID=$!
echo "Server started with PID: $SERVER_PID"

# Wait for server to be ready
echo "Waiting for server to be ready..."
for i in {1..20}; do
    if curl -s http://localhost:3001/health > /dev/null 2>&1; then
        echo "Server is ready!"
        break
    fi
    echo -n "."
    sleep 1
done

echo ""
echo "Server PID: $SERVER_PID"