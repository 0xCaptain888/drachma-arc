'use client'

import { useState } from 'react'

const VAULT_ADDRESS = process.env.NEXT_PUBLIC_VAULT_ADDRESS || '0xD3D5b81b28b51aDdc5A3a06231C5d0ED782E1995'

const SOURCE_CHAINS = [
  { id: 'Ethereum_Sepolia', name: 'Ethereum' },
  { id: 'Base_Sepolia', name: 'Base' },
  { id: 'Avalanche_Fuji', name: 'Avalanche' },
]

export function CrossChainDeposit() {
  const [sourceChain, setSourceChain] = useState('Ethereum_Sepolia')
  const [amount, setAmount] = useState('100')
  const [status, setStatus] = useState<'idle' | 'bridging' | 'done' | 'error'>('idle')
  const [txHash, setTxHash] = useState('')
  const [error, setError] = useState('')

  const handleDeposit = async () => {
    if (typeof window === 'undefined' || !(window as any).ethereum) {
      setError('Please connect a wallet')
      return
    }

    setStatus('bridging')
    setError('')

    try {
      // Circle App Kit — Unified Balance Kit
      // Single call handles: approve → CCTP burn → Arc mint → vault deposit
      const { createAppKit } = await import('@circle-cfx/app-kit')
      const { viemAdapter } = await import('@circle-cfx/app-kit-adapters-viem')
      const { createPublicClient, createWalletClient, custom, http } = await import('viem')
      const { sepolia } = await import('viem/chains')

      const publicClient = createPublicClient({ chain: sepolia, transport: http() })
      const walletClient = createWalletClient({
        chain: sepolia,
        transport: custom((window as any).ethereum)
      })

      const kit = createAppKit({
        projectId: process.env.NEXT_PUBLIC_CIRCLE_PROJECT_ID!,
        monetization: {
          feeRecipient: process.env.NEXT_PUBLIC_PROTOCOL_FEE_ADDRESS!,
          feeBps: 5, // 0.05% protocol fee
        }
      })

      const result = await (kit as any).bridge({
        from: {
          adapter: viemAdapter({ publicClient, walletClient }),
          chain: sourceChain,
        },
        to: {
          adapter: viemAdapter({ publicClient, walletClient }),
          chain: 'Arc_Testnet',
        },
        amount: amount,
        recipient: VAULT_ADDRESS,
      })

      setTxHash(result.transactionHash || '')
      setStatus('done')
    } catch (err: any) {
      setError(err.message || 'Transaction failed')
      setStatus('error')
    }
  }

  return (
    <div className="rounded-xl border border-blue-200 bg-blue-50 p-6">
      <h3 className="text-lg font-bold text-blue-900 mb-1">
        Cross-Chain Deposit
      </h3>
      <p className="text-sm text-blue-700 mb-4">
        Powered by Circle App Kit + Unified Balance Kit.
        Bridge USDC from any chain directly into Drachma on Arc.
      </p>

      <div className="space-y-3">
        <div>
          <label className="text-sm font-medium text-gray-700">From</label>
          <select
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            value={sourceChain}
            onChange={e => setSourceChain(e.target.value)}
            disabled={status === 'bridging'}
          >
            {SOURCE_CHAINS.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Amount (USDC)</label>
          <input
            type="number"
            min="1"
            value={amount}
            onChange={e => setAmount(e.target.value)}
            className="mt-1 block w-full rounded-md border border-gray-300 px-3 py-2 text-sm"
            disabled={status === 'bridging'}
          />
        </div>

        <button
          onClick={handleDeposit}
          disabled={status === 'bridging'}
          className="w-full rounded-lg bg-blue-600 py-2.5 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50 transition-colors"
        >
          {status === 'bridging'
            ? 'Bridging via CCTP...'
            : `Deposit ${amount} USDC from ${SOURCE_CHAINS.find(c => c.id === sourceChain)?.name}`}
        </button>

        {status === 'done' && (
          <div className="rounded-lg bg-green-50 border border-green-200 p-3">
            <p className="text-sm font-medium text-green-800">Deposit complete</p>
            {txHash && (
              <a
                href={`https://testnet.arcscan.app/tx/${txHash}`}
                target="_blank"
                rel="noreferrer"
                className="text-xs text-green-600 hover:underline"
              >
                View on Arc Explorer
              </a>
            )}
          </div>
        )}

        {status === 'error' && (
          <div className="rounded-lg bg-red-50 border border-red-200 p-3">
            <p className="text-sm text-red-700">{error}</p>
          </div>
        )}
      </div>

      <p className="mt-3 text-xs text-gray-400">
        Uses Circle App Kit (Unified Balance Kit) + CCTP v2. 0.05% protocol fee.
      </p>
    </div>
  )
}
