# pythathon

A Cardano project that reads ADA/USD price data from [Pyth Lazer](https://pyth.network/) on-chain, detects price movement, generates a mood-based meme, and mints it as a CIP-68 NFT — all in one transaction.

## How it works

1. Samples the ADA/USD price twice (3 s apart) via the Pyth Lazer oracle
2. Submits the price update on-chain through a Plutus V3 spend validator that verifies the feed
3. Determines sentiment — **bullish**, **bearish**, or **neutral** — from the price delta
4. Generates a meme matching the mood (30+ templates via memegen.link)
5. Mints a CIP-68 NFT whose metadata includes the meme image, price, and sentiment

## Project structure

```
validators/
  pythathon.ak       # Spend validator — verifies Pyth Lazer price feed
  meme_nft.ak        # CIP-68 minting policy for the meme NFT
offchain/
  src/
    fetch-and-verify.ts  # Off-chain logic: price sampling, meme gen, tx building
  run.sh             # Convenience runner (loads .env and calls the CLI)
  .env.example       # Environment variable template
```

## Prerequisites

- [Aiken](https://aiken-lang.org) v1.1.21+
- Node.js 18+
- A funded Cardano wallet (preprod or mainnet)
- A [Pyth Lazer](https://pyth.network/) access token

## Setup

### 1. Build the on-chain validators

```sh
aiken build
```

### 2. Install off-chain dependencies

```sh
cd offchain
npm install
```

### 3. Configure environment

```sh
cp offchain/.env.example offchain/.env
```

Fill in the values:

| Variable | Description |
|---|---|
| `CARDANO_MNEMONIC` | 24-word wallet seed phrase |
| `LAZER_TOKEN` | Pyth Lazer authentication token |
| `POLICY_ID` | Hex-encoded policy ID of the Cardano Pyth deployment |
| `NETWORK` | `preprod` / `preview` / `mainnet` |
| `PROVIDER` | `koios` / `blockfrost` / `maestro` |
| `PROVIDER_TOKEN` | Required for Blockfrost/Maestro, optional for Koios |

### 4. Run

```sh
cd offchain
./run.sh
```

Or run directly:

```sh
cd offchain
npm run verify -- \
  --network preprod \
  --policy-id <POLICY_ID> \
  --lazer-token <LAZER_TOKEN> \
  --provider koios
```

## Testing

```sh
aiken check
```

## Resources

- [Aiken user manual](https://aiken-lang.org)
- [Pyth Lazer docs](https://docs.pyth.network/)
- [CIP-68 token standard](https://cips.cardano.org/cip/CIP-0068)
