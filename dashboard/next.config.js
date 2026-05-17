/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  env: {
    NEXT_PUBLIC_VAULT_ADDRESS:
      process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
      "0x0000000000000000000000000000000000000001",
    NEXT_PUBLIC_ARC_RPC:
      process.env.NEXT_PUBLIC_ARC_RPC || "https://rpc.arc.drachma.local",
    NEXT_PUBLIC_IPFS_GATEWAY:
      process.env.NEXT_PUBLIC_IPFS_GATEWAY ||
      "https://gateway.pinata.cloud/ipfs",
  },
};

module.exports = nextConfig;
