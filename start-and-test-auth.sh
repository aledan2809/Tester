#!/bin/bash

# Authentication System Test Script
# Starts the server and runs comprehensive authentication tests

set -e

echo "=== Authentication System Test ==="
echo ""

# Check if .env exists
if [ ! -f .env ]; then
  echo "Creating .env file from .env.example..."
  cp .env.example .env
  echo "⚠️  Please edit .env and set TESTER_API_SECRET before running this script"
  exit 1
fi

# Load environment variables
export $(grep -v '^#' .env | xargs)

# Check if API secret is set
if [ -z "$TESTER_API_SECRET" ]; then
  echo "⚠️  TESTER_API_SECRET not set in .env"
  echo "Setting default for testing: tester_test-key-min-32-chars-total"
  export TESTER_API_SECRET="tester_test-key-min-32-chars-total"
fi

# Build the project
echo "Building project..."
npm run build

# Start the server in background
echo "Starting server on port ${TESTER_PORT:-3012}..."
npm run start:server &
SERVER_PID=$!

# Wait for server to be ready
echo "Waiting for server to start..."
sleep 5

# Check if server is running
if ! kill -0 $SERVER_PID 2>/dev/null; then
  echo "✗ Server failed to start"
  exit 1
fi

echo "✓ Server started (PID: $SERVER_PID)"
echo ""

# Run validation tests
echo "Running authentication tests..."
node validate-auth.mjs
TEST_RESULT=$?

# Clean up
echo ""
echo "Stopping server..."
kill $SERVER_PID 2>/dev/null || true
wait $SERVER_PID 2>/dev/null || true

# Exit with test result
if [ $TEST_RESULT -eq 0 ]; then
  echo ""
  echo "✓ All tests passed!"
  exit 0
else
  echo ""
  echo "✗ Some tests failed"
  exit 1
fi
