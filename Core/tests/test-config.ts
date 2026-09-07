import type { BobCoreConfig } from "../src/config.js";

export const TEST_DEVICE_TOKEN =
  "test-device-token-abcdefghijklmnopqrstuvwxyz-0123456789";

export function createTestConfig(
  overrides: Partial<BobCoreConfig> = {},
): BobCoreConfig {
  return {
    nodeEnvironment: "test",
    port: 8_787,
    aiProvider: "openai",
    aiAPIKey: "test-openai-api-key-not-used-in-unit-tests",
    aiModel: "test-model",
    aiBaseURL: undefined,
    databaseURL: undefined,
    ownerId: "rick",
    memoryEnabled: false,
    memoryRetrievalLimit: 6,
    sharedContextEnabled: false,
    backupMonitoringEnabled: false,
    rateLimitsEnabled: false,
    coreRequestsPerMinute: 200,
    aiRequestsPerMinute: 10,
    deviceToken: TEST_DEVICE_TOKEN,
    maxOutputTokens: 700,
    ...overrides,
  };
}
