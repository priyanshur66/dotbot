const {
  AIMessage,
  HumanMessage,
  SystemMessage,
  ToolMessage,
} = require("@langchain/core/messages");
const {
  AgentBadRequestError,
  AgentModelError,
  AgentToolExecutionError,
} = require("../../lib/errors");
const { createNoopLogger, sanitizeForLogging } = require("../../lib/logging");
const { createAgentTools } = require("../tools");

const DEFAULT_MAX_ITERATIONS = 5;

function toTextContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === "string") {
          return item;
        }
        if (item && typeof item === "object" && typeof item.text === "string") {
          return item.text;
        }
        return "";
      })
      .join("\n")
      .trim();
  }

  return "";
}

function toLangChainMessages(messages) {
  return messages.map((message) => {
    if (message.role === "user") {
      return new HumanMessage(message.content);
    }

    if (message.role === "assistant") {
      return new AIMessage(message.content);
    }

    throw new AgentBadRequestError("Unsupported message role", {
      role: message.role,
    });
  });
}

function createAgentExecutor({
  model,
  provider,
  backendSigner,
  launchOrchestrator,
  logger,
  maxIterations = DEFAULT_MAX_ITERATIONS,
}) {
  const runtimeLogger = logger || createNoopLogger();

  async function executeChat({ messages, walletAddress, chainId, systemPrompt }) {
    const startedAt = Date.now();
    const actions = [];
    const emitActions = (items) => {
      for (const item of items) {
        actions.push(item);
      }
    };

    const tools = createAgentTools({
      provider,
      backendSigner,
      launchOrchestrator,
      chainId,
      emitActions,
      walletAddress,
    });
    const toolMap = new Map(tools.map((registeredTool) => [registeredTool.name, registeredTool]));

    const runnable = model.bindTools(tools);
    const conversation = [new SystemMessage(systemPrompt), ...toLangChainMessages(messages)];

    runtimeLogger.info({
      operation: "agent.execute",
      stage: "start",
      status: "start",
      context: {
        chainId,
        walletAddress,
        messageCount: messages.length,
      },
    });

    let finalAssistantText = "";

    for (let iteration = 0; iteration < maxIterations; iteration += 1) {
      let aiMessage;
      try {
        aiMessage = await runnable.invoke(conversation);
      } catch (error) {
        throw new AgentModelError(
          "OpenRouter model invocation failed",
          {
            stage: "model.invoke",
            iteration,
          },
          error
        );
      }

      conversation.push(aiMessage);
      finalAssistantText = toTextContent(aiMessage.content) || finalAssistantText;

      const toolCalls = Array.isArray(aiMessage.tool_calls) ? aiMessage.tool_calls : [];
      if (toolCalls.length === 0) {
        runtimeLogger.info({
          operation: "agent.execute",
          stage: "complete",
          status: "success",
          durationMs: Date.now() - startedAt,
          context: {
            iterations: iteration + 1,
            actionCount: actions.length,
          },
        });

        return {
          message: finalAssistantText || "Done.",
          actions,
        };
      }

      for (const toolCall of toolCalls) {
        const registeredTool = toolMap.get(toolCall.name);
        if (!registeredTool) {
          throw new AgentToolExecutionError("Model requested unavailable tool", {
            tool: toolCall.name,
          });
        }

        let toolOutput;
        try {
          toolOutput = await registeredTool.invoke(toolCall.args || {});
        } catch (error) {
          runtimeLogger.error({
            operation: "agent.execute",
            stage: "tool.failure",
            status: "failure",
            context: {
              tool: toolCall.name,
              args: sanitizeForLogging(toolCall.args),
            },
            error,
          });

          if (error instanceof AgentBadRequestError || error instanceof AgentToolExecutionError) {
            throw error;
          }
          if (error && typeof error === "object" && error.details?.launchRecordId) {
            throw error;
          }

          const wrappedDetails = {};
          if (error && typeof error === "object") {
            if (typeof error.code === "string") {
              wrappedDetails.toolErrorCode = error.code;
            }
            if (typeof error.statusCode === "number") {
              wrappedDetails.toolErrorStatusCode = error.statusCode;
            }
            if (error.details && typeof error.details === "object") {
              Object.assign(wrappedDetails, sanitizeForLogging(error.details));
            }
          }
          wrappedDetails.tool = toolCall.name;
          wrappedDetails.args = sanitizeForLogging(toolCall.args);

          throw new AgentToolExecutionError(
            error instanceof Error && error.message ? error.message : "Tool execution failed",
            wrappedDetails,
            error
          );
        }

        conversation.push(
          new ToolMessage({
            tool_call_id: toolCall.id,
            content:
              typeof toolOutput === "string" ? toolOutput : JSON.stringify(toolOutput),
          })
        );
      }
    }

    throw new AgentModelError("Agent exceeded maximum tool-calling iterations", {
      stage: "runtime.iteration_limit",
      maxIterations,
    });
  }

  return {
    executeChat,
  };
}

module.exports = {
  createAgentExecutor,
};
