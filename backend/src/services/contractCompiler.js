const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { CompileError } = require("../lib/errors");
const { createLogger, getLogConfigFromEnv } = require("../lib/logging");

const CONTRACTS_DIR = path.resolve(__dirname, "../../contracts");
const DEFAULT_TOKEN_CONTRACT_FILE = path.resolve(CONTRACTS_DIR, "FixedSupplyToken.sol");
const DEFAULT_TOKEN_CONTRACT_NAME = "FixedSupplyToken";
const compilerLogger = createLogger({
  service: "backend.compiler",
  ...getLogConfigFromEnv(process.env),
});

const artifactCache = new Map();

function getCacheKey(contractFile, contractName) {
  return `${path.resolve(contractFile)}::${contractName}`;
}

function resolveImport(importPath) {
  const nodeModulesPath = path.resolve(__dirname, "../../node_modules", importPath);
  if (fs.existsSync(nodeModulesPath)) {
    return nodeModulesPath;
  }

  const contractsPath = path.resolve(CONTRACTS_DIR, importPath);
  if (fs.existsSync(contractsPath)) {
    return contractsPath;
  }

  const fallbackContractsPath = path.resolve(path.dirname(DEFAULT_TOKEN_CONTRACT_FILE), importPath);
  if (fs.existsSync(fallbackContractsPath)) {
    return fallbackContractsPath;
  }

  return null;
}

function findImports(importPath) {
  const importStartedAt = Date.now();
  const resolvedPath = resolveImport(importPath);

  if (!resolvedPath) {
    compilerLogger.warn({
      operation: "compiler.resolveImport",
      stage: "failure",
      status: "failure",
      durationMs: Date.now() - importStartedAt,
      context: {
        importPath,
      },
    });
    return { error: `File not found: ${importPath}` };
  }

  compilerLogger.debug({
    operation: "compiler.resolveImport",
    stage: "success",
    status: "success",
    durationMs: Date.now() - importStartedAt,
    context: {
      importPath,
      resolvedPath,
    },
  });

  return {
    contents: fs.readFileSync(resolvedPath, "utf8"),
  };
}

async function compileContractUncached({ contractFile, contractName }) {
  const startedAt = Date.now();
  const absoluteFile = path.resolve(contractFile);

  compilerLogger.info({
    operation: "compiler.compileContract",
    stage: "start",
    status: "start",
    context: {
      contractFile: absoluteFile,
      contractName,
    },
  });

  if (!fs.existsSync(absoluteFile)) {
    throw new CompileError("Contract source file not found", {
      file: absoluteFile,
      contractName,
    });
  }

  const source = fs.readFileSync(absoluteFile, "utf8");
  const input = {
    language: "Solidity",
    sources: {
      [path.basename(absoluteFile)]: {
        content: source,
      },
    },
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true,
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
      operation: "compiler.compileContract",
      stage: "solc.compile",
      status: "failure",
      durationMs: Date.now() - startedAt,
      error,
      context: {
        contractFile: absoluteFile,
        contractName,
      },
    });
    throw new CompileError("Failed to compile Solidity contract", {
      file: absoluteFile,
      contractName,
      reason: error instanceof Error ? error.message : String(error),
    });
  }

  const errors = (output.errors || []).filter((item) => item.severity === "error");
  if (errors.length > 0) {
    throw new CompileError("Solidity compilation failed", {
      file: absoluteFile,
      contractName,
      errors: errors.map((item) => item.formattedMessage || item.message),
    });
  }

  const contractOutput = output.contracts?.[path.basename(absoluteFile)]?.[contractName];
  if (!contractOutput?.abi || !contractOutput?.evm?.bytecode?.object) {
    throw new CompileError("Compiled artifact is missing ABI or bytecode", {
      file: absoluteFile,
      contractName,
    });
  }

  const artifact = {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
  };

  compilerLogger.info({
    operation: "compiler.compileContract",
    stage: "success",
    status: "success",
    durationMs: Date.now() - startedAt,
    context: {
      contractFile: absoluteFile,
      contractName,
      abiItems: artifact.abi.length,
      bytecodeLength: artifact.bytecode.length,
    },
  });

  return artifact;
}

function compileContract({ contractFile, contractName }) {
  const cacheKey = getCacheKey(contractFile, contractName);
  const cached = artifactCache.get(cacheKey);
  if (cached) {
    compilerLogger.debug({
      operation: "compiler.compileContract.cache",
      stage: "hit",
      status: "success",
      context: {
        contractFile: path.resolve(contractFile),
        contractName,
      },
    });
    return cached;
  }

  const promise = compileContractUncached({ contractFile, contractName }).catch((error) => {
    artifactCache.delete(cacheKey);
    throw error;
  });

  artifactCache.set(cacheKey, promise);
  return promise;
}

function compileTokenContract() {
  return compileContract({
    contractFile: DEFAULT_TOKEN_CONTRACT_FILE,
    contractName: DEFAULT_TOKEN_CONTRACT_NAME,
  });
}

function resetCompiledContractCache() {
  artifactCache.clear();
}

module.exports = {
  CONTRACTS_DIR,
  compileContract,
  compileTokenContract,
  resetCompiledContractCache,
};
