"use client";

import { useState, useCallback } from "react";
import { DepositWithdraw } from "./DepositWithdraw";
import { BandSliders } from "./BandSliders";
import { OwnerProfile } from "./OwnerProfile";
import { DecisionLogTable } from "@/components/DecisionLogTable";
import { mockDecisionLog } from "@/lib/mockData";

const MOCK_FULL_ADDRESS = "0x7a3b1C29Df08aE4c5bE61d90Ac2eD8fA91b0f9e2";

function truncateAddress(addr: string) {
  return `${addr.slice(0, 6)}...${addr.slice(-4)}`;
}

function ConnectWalletModal({
  onConnect,
}: {
  onConnect: (wallet: string) => void;
}) {
  const wallets = [
    { name: "MetaMask", icon: "M" },
    { name: "Coinbase Wallet", icon: "C" },
    { name: "WalletConnect", icon: "W" },
    { name: "Injected", icon: "I" },
  ];

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center">
      <div className="w-full max-w-sm rounded-2xl border border-dark-border bg-dark-card p-6 shadow-xl">
        {/* ConnectKit-style header */}
        <div className="mb-6 text-center">
          <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-usdc/20 text-usdc">
            <svg
              className="h-6 w-6"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z"
              />
            </svg>
          </div>
          <h2 className="text-lg font-bold text-white">Connect Wallet</h2>
          <p className="mt-1 text-sm text-gray-400">
            Choose a wallet to manage your Drachma vault
          </p>
        </div>

        {/* Wallet options */}
        <div className="space-y-2">
          {wallets.map((w) => (
            <button
              key={w.name}
              onClick={() => onConnect(w.name)}
              className="flex w-full items-center gap-3 rounded-xl border border-dark-border bg-dark-bg px-4 py-3 text-left transition hover:border-usdc/50 hover:bg-white/5"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/10 text-sm font-bold text-white">
                {w.icon}
              </span>
              <span className="text-sm font-medium text-white">{w.name}</span>
              <svg
                className="ml-auto h-4 w-4 text-gray-500"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M9 5l7 7-7 7"
                />
              </svg>
            </button>
          ))}
        </div>

        <p className="mt-4 text-center text-xs text-gray-600">
          By connecting, you agree to the Terms of Service
        </p>
      </div>
    </div>
  );
}

function WalletBadge({
  address,
  walletName,
  onDisconnect,
}: {
  address: string;
  walletName: string;
  onDisconnect: () => void;
}) {
  const [showMenu, setShowMenu] = useState(false);

  return (
    <div className="relative">
      <button
        onClick={() => setShowMenu(!showMenu)}
        className="flex items-center gap-2 rounded-full border border-dark-border bg-dark-card px-3 py-1.5 transition hover:border-usdc/50"
      >
        {/* Jazzicon-style colored circle */}
        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-gradient-to-br from-usdc to-eurc text-[8px] font-bold text-white">
          {address.slice(2, 4).toUpperCase()}
        </span>
        <span className="text-sm font-medium text-gray-200">
          {truncateAddress(address)}
        </span>
        <svg
          className={`h-3 w-3 text-gray-500 transition ${showMenu ? "rotate-180" : ""}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {showMenu && (
        <div className="absolute right-0 top-full z-20 mt-2 w-64 rounded-xl border border-dark-border bg-dark-card p-3 shadow-xl">
          {/* Address info */}
          <div className="mb-3 rounded-lg bg-dark-bg p-3">
            <div className="mb-1 text-xs text-gray-500">Connected with {walletName}</div>
            <div className="break-all font-mono text-xs text-gray-300">
              {address}
            </div>
          </div>
          {/* Copy address */}
          <button
            onClick={() => navigator.clipboard?.writeText(address)}
            className="mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-gray-400 transition hover:bg-white/5 hover:text-white"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
              />
            </svg>
            Copy Address
          </button>
          {/* Disconnect */}
          <button
            onClick={() => {
              setShowMenu(false);
              onDisconnect();
            }}
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-400 transition hover:bg-red-500/10"
          >
            <svg
              className="h-4 w-4"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
              strokeWidth={2}
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
              />
            </svg>
            Disconnect
          </button>
        </div>
      )}
    </div>
  );
}

export default function AppPage() {
  const [connected, setConnected] = useState(false);
  const [walletName, setWalletName] = useState("");

  const handleConnect = useCallback((wallet: string) => {
    setWalletName(wallet);
    setConnected(true);
  }, []);

  const handleDisconnect = useCallback(() => {
    setConnected(false);
    setWalletName("");
  }, []);

  if (!connected) {
    return <ConnectWalletModal onConnect={handleConnect} />;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Control Panel</h1>
          <p className="text-sm text-gray-400">Manage your Drachma vault</p>
        </div>
        <WalletBadge
          address={MOCK_FULL_ADDRESS}
          walletName={walletName}
          onDisconnect={handleDisconnect}
        />
      </div>

      {/* Top row */}
      <div className="grid gap-4 lg:grid-cols-2">
        <DepositWithdraw />
        <BandSliders />
      </div>

      {/* Owner profile */}
      <OwnerProfile />

      {/* Full decision log */}
      <DecisionLogTable entries={mockDecisionLog} />
    </div>
  );
}
