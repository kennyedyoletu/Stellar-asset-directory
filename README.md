# Stellar Atlas — Testnet Asset Directory

A responsive React + TypeScript asset directory for the Stellar **testnet**. The app reads public data from the Stellar Horizon testnet API; it does not connect a wallet, sign transactions, or handle private keys.

## Features

- Browse assets returned by Stellar Horizon testnet.
- Search by exact asset code or issuer public key.
- View issuer address, authorized trustlines, balance totals, and asset type.
- Copy issuer keys and asset identifiers.
- Sort by asset code or trustline count, paginate loaded results, and request more records from Horizon.
- Open the asset in Stellar Expert's testnet explorer.
- Responsive desktop and mobile layouts.

## Run locally

Requires Node.js 20 or newer.

```bash
npm install
npm run dev
```

Build for production:

```bash
npm run build
npm run preview
```

## Network

The app uses `https://horizon-testnet.stellar.org`. Testnet assets have no real-world value. Asset presence and trustline counts are not safety endorsements, and the app does not independently verify issuers or label scams.

## Deploy to GitHub Pages

The Vite base path is set to `/Stellar-asset-directory/`. The GitHub Actions workflow builds the TypeScript app and deploys the generated `dist` directory. In repository Settings → Pages, select **GitHub Actions** as the build and deployment source.
