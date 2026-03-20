const { createTwitter241Client } = require("../src/services/twitter/twitter241Client");

function createJsonResponse(payload, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: jest.fn(async () => JSON.stringify(payload)),
  };
}

describe("twitter241Client", () => {
  afterEach(() => {
    jest.restoreAllMocks();
  });

  test("resolveHandle returns the nested rest_id and username", async () => {
    global.fetch = jest.fn(async () =>
      createJsonResponse({
        result: {
          data: {
            user: {
              result: {
                id: "VXNlcjoxNjU1MjQ5MjU5Mjc5ODIyODQ5",
                rest_id: "1655249259279822849",
                core: {
                  screen_name: "TestingdevsAccs",
                },
              },
            },
          },
        },
      })
    );

    const client = createTwitter241Client({
      apiKey: "test-key",
      apiHost: "twitter241.p.rapidapi.com",
    });

    await expect(client.resolveHandle("@TestingdevsAccs")).resolves.toEqual(
      expect.objectContaining({
        id: "1655249259279822849",
        username: "TestingdevsAccs",
      })
    );
  });

  test("listRecentTweets requests user timeline by numeric user id and extracts tweets", async () => {
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            data: {
              user: {
                result: {
                  id: "VXNlcjoxNjU1MjQ5MjU5Mjc5ODIyODQ5",
                  rest_id: "1655249259279822849",
                  core: {
                    screen_name: "TestingdevsAccs",
                  },
                },
              },
            },
          },
        })
      )
      .mockResolvedValueOnce(
        createJsonResponse({
          result: {
            timeline: {
              instructions: [
                {
                  entries: [
                    {
                      content: {
                        itemContent: {
                          tweet_results: {
                            result: {
                              rest_id: "1992559494757523894",
                              legacy: {
                                full_text: "launch token with @dotagent",
                                created_at: "Sun Nov 23 11:42:58 +0000 2025",
                                entities: {
                                  user_mentions: [
                                    {
                                      screen_name: "dotagent",
                                    },
                                  ],
                                },
                              },
                            },
                          },
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        })
      );

    const client = createTwitter241Client({
      apiKey: "test-key",
      apiHost: "twitter241.p.rapidapi.com",
    });

    const result = await client.listRecentTweets("@TestingdevsAccs", null);

    expect(global.fetch).toHaveBeenCalledTimes(2);
    expect(global.fetch.mock.calls[0][0].toString()).toContain(
      "/user?username=TestingdevsAccs"
    );
    expect(global.fetch.mock.calls[1][0].toString()).toContain(
      "/user-tweets?user=1655249259279822849&count=20"
    );
    expect(result.resolvedHandle).toBe("TestingdevsAccs");
    expect(result.tweets).toEqual([
      expect.objectContaining({
        id: "1992559494757523894",
        text: "launch token with @dotagent",
        mentionedHandles: ["dotagent"],
        url: "https://x.com/TestingdevsAccs/status/1992559494757523894",
      }),
    ]);
  });
});
