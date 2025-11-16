# Tests

## Running Tests

```bash
npm test
```

This will:
1. Start the adapter service in test mode
2. Run the assistant flow test
3. Clean up and stop the adapter

## Test Structure

### test-assist.spec.js

Tests the assistant flow:
- Starts adapter server in test mode
- Calls POST /assist with instruction "Add a simple function isEven(n) with tests"
- Asserts response contains 'PATCH' and 'isEven' strings
- Validates response structure

## Requirements

- Node.js 18+
- Mocha and Chai (installed as dev dependencies)
- OPENAI_API_KEY environment variable (or test will use mock key)

## Note

The test requires the adapter service to be able to start. If you don't have an OpenAI API key, the test will still run but the LLM call may fail. The test validates the response structure regardless.

