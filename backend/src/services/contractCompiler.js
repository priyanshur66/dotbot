const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { CompileError } = require("../lib/errors");
const { createLogger, getLogConfigFromEnv } = require("../lib/logging");

const CONTRACT_FILE = path.resolve(__dirname, "../../contracts/FixedSupplyToken.sol");
const CONTRACT_NAME = "FixedSupplyToken";
const compilerLogger = createLogger({
  service: "backend.compiler",
  ...getLogConfigFromEnv(process.env),
});

let cachedArtifactPromise;

function findImports(importPath) {
  const importStart = Date.now();
  const fromNodeModules = path.resolve(__dirname, "../../node_modules", importPath);
  if (fs.existsSync(fromNodeModules)) {
    compilerLogger.debug({
      operation: "compiler.resolveImport",
      stage: "success",
      status: "success",
      durationMs: Date.now() - importStart,
      context: {
        importPath,
        source: "node_modules",
      },
    });
    return { contents: fs.readFileSync(fromNodeModules, "utf8") };
  }

  const fromContracts = path.resolve(path.dirname(CONTRACT_FILE), importPath);
  if (fs.existsSync(fromContracts)) {
    compilerLogger.debug({
      operation: "compiler.resolveImport",
      stage: "success",
      status: "success",
      durationMs: Date.now() - importStart,
      context: {
        importPath,
        source: "contracts",
      },
    });
    return { contents: fs.readFileSync(fromContracts, "utf8") };
  }

  compilerLogger.warn({
    operation: "compiler.resolveImport",
    stage: "failure",
    status: "failure",
    durationMs: Date.now() - importStart,
    context: {
      importPath,
    },
  });
  return { error: `File not found: ${importPath}` };
}

async function compileTokenContractUncached() {
  const startedAt = Date.now();
  compilerLogger.info({
    operation: "compiler.compileTokenContract",
    stage: "start",
    status: "start",
    context: {
      contractFile: CONTRACT_FILE,
      contractName: CONTRACT_NAME,
    },
  });

  if (!fs.existsSync(CONTRACT_FILE)) {
    compilerLogger.error({
      operation: "compiler.compileTokenContract",
      stage: "validate.source",
      status: "failure",
      durationMs: Date.now() - startedAt,
      context: {
        contractFile: CONTRACT_FILE,
      },
    });
    throw new CompileError("Contract source file not found", {
      file: CONTRACT_FILE,
    });
  }

  const source = fs.readFileSync(CONTRACT_FILE, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [path.basename(CONTRACT_FILE)]: {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: false,
        runs: 200,
      },
      outputSelection: {
        "*": {
          "*": ["abi", "evm.bytecode.object"],
        },
      },
    },
  };

  let output;
  try {
    output = JSON.parse(solc.compile(JSON.stringify(input), { import: findImports }));
  } catch (error) {
    compilerLogger.error({
      operation: "compiler.compileTokenContract",
      stage: "solc.compile",
      status: "failure",
      durationMs: Date.now() - startedAt,
      error,
    });
    throw new CompileError("Failed to compile Solidity contract", {
      reason: error.message,
    });
  }

  const errors = (output.errors || []).filter(
    (item) => item.severity === "error"
  );
  if (errors.length > 0) {
    compilerLogger.error({
      operation: "compiler.compileTokenContract",
      stage: "solc.validation",
      status: "failure",
      durationMs: Date.now() - startedAt,
      context: {
        errors: errors.map((item) => item.formattedMessage || item.message),
      },
    });
    throw new CompileError("Solidity compilation failed", {
      errors: errors.map((item) => item.formattedMessage || item.message),
    });
  }

  const contractOutput =
    output.contracts?.[path.basename(CONTRACT_FILE)]?.[CONTRACT_NAME];

  if (!contractOutput?.abi || !contractOutput?.evm?.bytecode?.object) {
    compilerLogger.error({
      operation: "compiler.compileTokenContract",
      stage: "artifact.shape",
      status: "failure",
      durationMs: Date.now() - startedAt,
      context: {
        hasAbi: Boolean(contractOutput?.abi),
        hasBytecode: Boolean(contractOutput?.evm?.bytecode?.object),
      },
    });
    throw new CompileError("Compiled artifact is missing ABI or bytecode");
  }

  compilerLogger.info({
    operation: "compiler.compileTokenContract",
    stage: "success",
    status: "success",
    durationMs: Date.now() - startedAt,
    context: {
      abiItems: contractOutput.abi.length,
      bytecodeLength: String(contractOutput.evm.bytecode.object).length,
    },
  });
  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
  };
}

function compileTokenContract() {
  if (!cachedArtifactPromise) {
    compilerLogger.info({
      operation: "compiler.compileTokenContract.cache",
      stage: "miss",
      status: "start",
    });
    cachedArtifactPromise = compileTokenContractUncached().catch((error) => {
      cachedArtifactPromise = undefined;
      throw error;
    });
  } else {
    compilerLogger.debug({
      operation: "compiler.compileTokenContract.cache",
      stage: "hit",
      status: "success",
    });
  }
  return cachedArtifactPromise;
}

function resetCompiledContractCache() {
  cachedArtifactPromise = undefined;
}

module.exports = {
  compileTokenContract,
  resetCompiledContractCache,
};
