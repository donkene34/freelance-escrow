# freelance-escrow

Smart contract d'escrow pour freelances : un client dépose des fonds en ETH, le freelancer livre le travail, puis le client valide et les fonds sont libérés au freelancer. En cas de désaccord, un arbitre désigné à la création tranche et envoie les fonds soit au freelancer, soit au client. Écrit en Solidity 0.8.24 avec Hardhat et OpenZeppelin (`ReentrancyGuard`).

## Cycle de vie

```
                 fund()              markDelivered()          release()
   Created ───────────────▶ Funded ───────────────▶ Delivered ───────────▶ Released
      │                       │  │                      │                      ▲
      │ refund()              │  │ release()            │                      │
      │ (annulation)          │  └──────────────────────┼──────────────────────┤
      ▼                       │                         │                      │
   Refunded ◀─────────────────┤ refund()                │ raiseDispute()       │ resolveDispute(true)
      ▲                       │ (après deadline,        ▼                      │
      │                       │  jamais livré)       Disputed ─────────────────┘
      │                       │ raiseDispute()          │
      │                       └────────────────────────▶│
      └─────────────────────────────────────────────────┘
                          resolveDispute(false)
```

| Fonction | Qui | Depuis | Vers |
|---|---|---|---|
| `fund()` | client | Created | Funded |
| `markDelivered()` | freelancer | Funded | Delivered |
| `release()` | client | Funded ou Delivered | Released |
| `raiseDispute()` | client ou freelancer | Funded ou Delivered | Disputed |
| `resolveDispute(bool)` | arbitre | Disputed | Released (`true`) ou Refunded (`false`) |
| `refund()` | client | Created, ou Funded après la deadline | Refunded |

Le déployeur du contrat est le client. Le freelancer, l'arbitre et la deadline sont fixés à la création.

## Sécurité

- `ReentrancyGuard` sur `release`, `resolveDispute` et `refund`
- Checks-effects-interactions : le state et le montant sont mis à jour avant tout transfert
- Transferts via `.call{value: amount}("")` avec `require(success)`
- `require()` explicites sur chaque contrôle d'accès et d'état
- Le constructeur refuse les adresses nulles, les rôles en double et une deadline passée

> Projet pédagogique, non audité. Ne pas l'utiliser avec des fonds importants sans audit.

## Installation

```bash
npm install
```

## Tests

```bash
npx hardhat test
```

## Déploiement sur Sepolia

1. Copier le fichier d'exemple et le remplir :

   ```bash
   cp .env.example .env
   ```

   Variables : `SEPOLIA_RPC_URL` (URL Sepolia, pas mainnet), `PRIVATE_KEY` (wallet de test, il devient le client), `FREELANCER_ADDRESS`, `ARBITER_ADDRESS`, et optionnellement `DEADLINE_DAYS` (défaut 14).

2. Récupérer de l'ETH Sepolia via un faucet pour le wallet déployeur.

3. Déployer :

   ```bash
   npx hardhat run scripts/deploy.js --network sepolia
   ```

   Le script affiche l'adresse du contrat, les 3 rôles et la deadline.

Pour tester le script en local : `npx hardhat run scripts/deploy.js`.

## Adresse du contrat déployé

| Réseau | Adresse |
|---|---|
| Sepolia | [`0x86895F11Fba78567Fa09C17b21025F6D718D495f`](https://sepolia.etherscan.io/address/0x86895F11Fba78567Fa09C17b21025F6D718D495f) |
