import { ethers } from "ethers";

export const POLKADOT_HUB_TESTNET = {
  chainId: 420420417,
  chainName: "Polkadot Hub TestNet",
  nativeCurrency: {
    name: "Paseo",
    symbol: "PAS",
    decimals: 18,
  },
  rpcUrls: [
    "https://eth-rpc-testnet.polkadot.io/",
    "https://services.polkadothub-rpc.com/testnet/",
  ],
  blockExplorerUrls: [
    "https://blockscout-testnet.polkadot.io/",
    "https://polkadot.testnet.routescan.io/",
  ],
} as const;

export type InjectedWalletProvider = {
  request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
  on?: (
    event: "accountsChanged" | "chainChanged" | "disconnect",
    listener: (...args: unknown[]) => void
  ) => void;
  removeListener?: (
    event: "accountsChanged" | "chainChanged" | "disconnect",
    listener: (...args: unknown[]) => void
  ) => void;
};

export function getInjectedWallet() {
  if (typeof window === "undefined") {
    return null;
  }

  return (window as Window & { ethereum?: InjectedWalletProvider }).ethereum || null;
}

export function normalizeWalletAddress(value?: string | null) {
  if (!value) {
    return "";
  }

  try {
    return ethers.getAddress(value);
  } catch {
    return value;
  }
}

export async function ensureWalletOnChain(
  provider: ethers.BrowserProvider,
  chainId: number
) {
  const chainHex = ethers.toQuantity(BigInt(chainId));

  try {
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  } catch (error) {
    const switchError = error as { code?: number };
    if (switchError.code !== 4902) {
      throw error;
    }

    await provider.send("wallet_addEthereumChain", [
      {
        chainId: chainHex,
        chainName: POLKADOT_HUB_TESTNET.chainName,
        nativeCurrency: POLKADOT_HUB_TESTNET.nativeCurrency,
        rpcUrls: POLKADOT_HUB_TESTNET.rpcUrls,
        blockExplorerUrls: POLKADOT_HUB_TESTNET.blockExplorerUrls,
      },
    ]);
    await provider.send("wallet_switchEthereumChain", [{ chainId: chainHex }]);
  }
}
