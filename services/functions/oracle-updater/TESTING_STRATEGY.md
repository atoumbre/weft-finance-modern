# Oracle Updater Testing Strategy

This document outlines the testing strategy for the `oracle-updater` service, focusing on reliability, data accuracy, and integration with real-world price providers.

## Objectives

1.  **Reliability**: Ensure the service can handle API failures, timeouts, and malformed data gracefully.
2.  **Accuracy**: Verify that price data is correctly fetched, parsed, and normalized to XRD.
3.  **Integration**: Validate that all plugins work correctly with their respective real-world APIs.
4.  **Verification**: Confirm that the generated Radix Engine manifest correctly reflects the fetched prices.

## Testing Layers

### 1. Unit Tests (`test/unit/*.test.ts`)
Focus on internal logic that does not depend on external services.
- **Utility Functions**: Test decimal parsing, formatting, and normalization logic.
- **Asset Configuration**: Verify that asset definitions, resource addresses, and price feeds are correctly structured.
- **Handler Logic (Mocked)**: Use mocked API responses to test complex fallback scenarios and manifest generation logic.

### 2. Individual Plugin Tests (`test/plugins.test.ts`)
Focus on the interaction between the service and each price provider.
- **Real Data**: Perform actual API calls to each provider.
- **Parsing Logic**: Ensure each plugin correctly extracts and type-checks data from real API responses.
- **Contract Fulfillment**: Verify that each plugin adheres to the `PriceFeedPlugin` interface.
- **Timeout & Error Handling**: Simulate (where possible) or verify handling of real-world network conditions.

### 3. Full Handler Integration Tests (`test/handler.test.ts`)
Focus on the end-to-end execution of the service.
- **End-to-End Flow**: Execute the full `handler()` function from start to finish.
- **Real Data Aggregation**: Fetch prices from all configured plugins simultaneously.
- **Manifest Generation**: Validate the final manifest contains the expected number of updates with realistic price values.
- **Environment Parity**: Run tests in an environment that closely matches production (e.g., matching env vars).

## Test Execution

All tests are run using the Bun test runner.

```bash
# Run all tests
bun test

# Run only unit tests
bun test services/functions/oracle-updater/test/oracle-updater.test.ts

# Run individual plugin tests (Integration)
bun test services/functions/oracle-updater/test/plugins.test.ts

# Run full handler integration tests
bun test services/functions/oracle-updater/test/handler.test.ts
```

## Best Practices

- **Timeout Management**: Integration tests should have appropriate timeouts (e.g., 30s) to account for network latency.
- **Environment Isolation**: Use separate environment configurations for local testing vs. CI/CD if necessary, but aim for high parity.
- **Logging**: Use the standard logger to capture API response shapes during integration tests for easier debugging of parsing issues.
