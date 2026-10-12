require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config();

const { SEPOLIA_RPC_URL, PRIVATE_KEY, ETHERSCAN_API_KEY } = process.env;

// Accepte une clé privée avec ou sans préfixe 0x
const normalizedKey = PRIVATE_KEY
  ? PRIVATE_KEY.startsWith("0x")
    ? PRIVATE_KEY
    : `0x${PRIVATE_KEY}`
  : undefined;

/** @type import('hardhat/config').HardhatUserConfig */
module.exports = {
  solidity: {
    version: "0.8.24",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      evmVersion: "cancun",
    },
  },
  networks: {
    // Réseau local en mémoire (utilisé par défaut pour les tests)
    hardhat: {},
    // Sepolia : activé seulement si SEPOLIA_RPC_URL est défini dans .env
    ...(SEPOLIA_RPC_URL
      ? {
          sepolia: {
            url: SEPOLIA_RPC_URL,
            accounts: normalizedKey ? [normalizedKey] : [],
            chainId: 11155111,
          },
        }
      : {}),
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY || "",
  },
};
