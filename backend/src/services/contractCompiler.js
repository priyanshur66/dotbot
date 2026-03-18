const fs = require("fs");
const path = require("path");
const solc = require("solc");
const { CompileError } = require("../lib/errors");

const CONTRACT_FILE = path.resolve(__dirname, "../../contracts/FixedSupplyToken.sol");
const CONTRACT_NAME = "FixedSupplyToken";

let cachedArtifactPromise;

function findImports(importPath) {
  const fromNodeModules = path.resolve(__dirname, "../../node_modules", importPath);
  if (fs.existsSync(fromNodeModules)) {
    return { contents: fs.readFileSync(fromNodeModules, "utf8") };
  }

  const fromContracts = path.resolve(path.dirname(CONTRACT_FILE), importPath);
  if (fs.existsSync(fromContracts)) {
    return { contents: fs.readFileSync(fromContracts, "utf8") };
  }

  return { error: `File not found: ${importPath}` };
}

async function compileTokenContractUncached() {
  if (!fs.existsSync(CONTRACT_FILE)) {
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
    throw new CompileError("Failed to compile Solidity contract", {
      reason: error.message,
    });
  }

  const errors = (output.errors || []).filter(
    (item) => item.severity === "error"
  );
  if (errors.length > 0) {
    throw new CompileError("Solidity compilation failed", {
      errors: errors.map((item) => item.formattedMessage || item.message),
    });
  }

  const contractOutput =
    output.contracts?.[path.basename(CONTRACT_FILE)]?.[CONTRACT_NAME];

  if (!contractOutput?.abi || !contractOutput?.evm?.bytecode?.object) {
    throw new CompileError("Compiled artifact is missing ABI or bytecode");
  }

  return {
    abi: contractOutput.abi,
    bytecode: `0x${contractOutput.evm.bytecode.object}`,
  };
}

function compileTokenContract() {
  if (!cachedArtifactPromise) {
    cachedArtifactPromise = compileTokenContractUncached().catch((error) => {
      cachedArtifactPromise = undefined;
      throw error;
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
