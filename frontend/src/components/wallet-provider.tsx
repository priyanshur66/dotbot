"use client";

import { ethers } from "ethers";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import {
  ensureWalletOnChain,
  getInjectedWallet,
  normalizeWalletAddress,
  POLKADOT_HUB_TESTNET,
  type InjectedWalletProvider,
} from "@/lib/wallet";

type WalletContextValue = {
  walletAddress: string;
  chainId: number | null;
  isReady: boolean;
  isConnecting: boolean;
  connectWallet: () => Promise<void>;
  disconnectWallet: () => Promise<void>;
  getBrowserProvider: () => ethers.BrowserProvider | null;
};

const WalletContext = createContext<WalletContextValue | null>(null);
const DISCONNECTED_SESSION_KEY = "dotagent.wallet-session-disconnected";

function getDisconnectedSessionFlag() {
  try {
    return window.localStorage.getItem(DISCONNECTED_SESSION_KEY) === "1";
  } catch {
    return false;
  }
}

function setDisconnectedSessionFlag(isDisconnected: boolean) {
  try {
    if (isDisconnected) {
      window.localStorage.setItem(DISCONNECTED_SESSION_KEY, "1");
    } else {
      window.localStorage.removeItem(DISCONNECTED_SESSION_KEY);
    }
  } catch {
    // Ignore storage failures and fall back to in-memory state.
  }
}

export function WalletProvider({ children }: { children: React.ReactNode }) {
  const injectedProviderRef = useRef<InjectedWalletProvider | null>(null);
  const browserProviderRef = useRef<ethers.BrowserProvider | null>(null);
  const [walletAddress, setWalletAddress] = useState("");
  const [chainId, setChainId] = useState<number | null>(null);
  const [isReady, setIsReady] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);

  const getBrowserProvider = useCallback(() => {
    const injected = getInjectedWallet();
    if (!injected) {
      injectedProviderRef.current = null;
      browserProviderRef.current = null;
      return null;
    }

    if (!browserProviderRef.current || injectedProviderRef.current !== injected) {
      injectedProviderRef.current = injected;
      browserProviderRef.current = new ethers.BrowserProvider(
        injected as ethers.Eip1193Provider
      );
    }

    return browserProviderRef.current;
  }, []);

  const refreshWalletState = useCallback(async () => {
    if (getDisconnectedSessionFlag()) {
      setWalletAddress("");
      setChainId(null);
      setIsReady(true);
      return;
    }

    const provider = getBrowserProvider();
    if (!provider) {
      setWalletAddress("");
      setChainId(null);
      setIsReady(true);
      return;
    }

    try {
      const accounts = (await provider.send("eth_accounts", [])) as string[];
      setWalletAddress(normalizeWalletAddress(accounts[0]));

      try {
        const network = await provider.getNetwork();
        setChainId(Number(network.chainId));
      } catch {
        setChainId((current) => current);
      }
    } catch {
      setWalletAddress("");
      setChainId(null);
    } finally {
      setIsReady(true);
    }
  }, [getBrowserProvider]);

  useEffect(() => {
    const handleStorageChange = (event: StorageEvent) => {
      if (event.key !== DISCONNECTED_SESSION_KEY) {
        return;
      }

      void refreshWalletState();
    };

    window.addEventListener("storage", handleStorageChange);

    const injected = getInjectedWallet();
    if (!injected) {
      void refreshWalletState();
      return () => {
        window.removeEventListener("storage", handleStorageChange);
      };
    }

    injectedProviderRef.current = injected;
    browserProviderRef.current = new ethers.BrowserProvider(
      injected as ethers.Eip1193Provider
    );

    const handleAccountsChanged = () => {
      void refreshWalletState();
    };
    const handleChainChanged = () => {
      void refreshWalletState();
    };
    const handleDisconnect = () => {
      setWalletAddress("");
      setChainId(null);
      setIsReady(true);
    };

    injected.on?.("accountsChanged", handleAccountsChanged);
    injected.on?.("chainChanged", handleChainChanged);
    injected.on?.("disconnect", handleDisconnect);

    void refreshWalletState();

    return () => {
      window.removeEventListener("storage", handleStorageChange);
      injected.removeListener?.("accountsChanged", handleAccountsChanged);
      injected.removeListener?.("chainChanged", handleChainChanged);
      injected.removeListener?.("disconnect", handleDisconnect);
    };
  }, [refreshWalletState]);

  const connectWallet = useCallback(async () => {
    setIsConnecting(true);
    try {
      setDisconnectedSessionFlag(false);
      const provider = getBrowserProvider();
      if (!provider) {
        throw new Error("No wallet found. Install MetaMask or another injected wallet.");
      }

      await provider.send("eth_requestAccounts", []);
      await ensureWalletOnChain(provider, POLKADOT_HUB_TESTNET.chainId);
      await refreshWalletState();
    } finally {
      setIsConnecting(false);
    }
  }, [getBrowserProvider, refreshWalletState]);

  const disconnectWallet = useCallback(async () => {
    setDisconnectedSessionFlag(true);
    setWalletAddress("");
    setChainId(null);
    setIsReady(true);
  }, []);

  return (
    <WalletContext.Provider
      value={{
        walletAddress,
        chainId,
        isReady,
        isConnecting,
        connectWallet,
        disconnectWallet,
        getBrowserProvider,
      }}
    >
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const context = useContext(WalletContext);
  if (!context) {
    throw new Error("useWallet must be used within WalletProvider.");
  }
  return context;
}
