jest.mock("../src/agent/llm/openRouterModel", () => ({
  DEFAULT_OPENROUTER_MODEL: "test-model",
  createOpenRouterModel: jest.fn(),
}));

const {
  createTwitterBotClassifierService,
  deriveSymbolFromName,
  extractTokenNameFromTweet,
} = require("../src/services/twitterBotClassifierService");
const { createOpenRouterModel } = require("../src/agent/llm/openRouterModel");

describe("twitterBotClassifierService", () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test("extracts short launch commands like chat flow and derives the symbol", async () => {
    createOpenRouterModel.mockReturnValue({
      invoke: jest.fn(async () => ({
        content: JSON.stringify({
          shouldLaunch: false,
          confidence: 0.31,
          tokenName: null,
          tokenSymbol: null,
          reason: "The tweet looks ambiguous.",
        }),
      })),
    });

    const service = createTwitterBotClassifierService({
      openRouterApiKey: "test-key",
    });

    const result = await service.classifyTweet({
      tweetText: "launch msk @dotbot",
      authorHandle: "testingdevsaccs",
      targetHandle: "dotbot",
    });

    expect(result).toEqual(
      expect.objectContaining({
        shouldLaunch: true,
        tokenName: "msk",
        tokenSymbol: "MSK",
        confidence: 0.9,
      })
    );
  });

  test("derives missing symbol when the model already extracted a token name", async () => {
    createOpenRouterModel.mockReturnValue({
      invoke: jest.fn(async () => ({
        content: JSON.stringify({
          shouldLaunch: true,
          confidence: 0.82,
          tokenName: "Moon Skull",
          tokenSymbol: null,
          reason: "The tweet explicitly asks to launch a token.",
        }),
      })),
    });

    const service = createTwitterBotClassifierService({
      openRouterApiKey: "test-key",
    });

    const result = await service.classifyTweet({
      tweetText: "please launch Moon Skull @dotbot",
      authorHandle: "testingdevsaccs",
      targetHandle: "dotbot",
    });

    expect(result).toEqual(
      expect.objectContaining({
        shouldLaunch: true,
        tokenName: "Moon Skull",
        tokenSymbol: "MS",
      })
    );
  });

  test("exports extraction helpers consistent with chat symbol derivation", () => {
    expect(extractTokenNameFromTweet("launch msk @dotbot")).toBe("msk");
    expect(extractTokenNameFromTweet("deploy token moonbag @dotbot")).toBe("moonbag");
    expect(deriveSymbolFromName("Moon Skull")).toBe("MS");
  });
});
