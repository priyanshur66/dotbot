# DotBot Local Setup

This repo contains:

- `frontend/`: Next.js app on port `3001`
- `backend/`: Express API, Convex integration, launchpad bootstrap, Twitter bot logic
- `backend/convex/`: Convex functions and schema
- `backend/contracts/` + `script/`: Solidity contracts and Foundry deploy script


## 1. Prerequisites

Install these first:

- Node.js 20+ and npm
- Foundry (`forge`, `cast`, `anvil`) if you want to use the Solidity tooling
- A browser wallet such as MetaMask
- A Convex account/project
- An OpenRouter API key
- A funded wallet/private key for Polkadot Hub TestNet 

## 2. Install Dependencies

From the repo root:

```bash
cd backend
npm install

cd ../frontend
npm install
```

## 3. Configure The Backend

Copy the example env file:

```bash
cp .env.example .env
```
use these for quick setup 

- `RPC_URL=https://services.polkadothub-rpc.com/testnet`
- `RPC_WRITE_URL=https://eth-rpc-testnet.polkadot.io/`
- `RPC_WRITE_USE_LEGACY=true`
- `BACKEND_PRIVATE_KEY=`
- `PORT=3030`
- `CONVEX_URL=`
- `OPENROUTER_API_KEY=`

- `PROTOCOL_TREASURY_ADDRESS=0x6574E8DBb3a69991c4DB5c41dC99507eB31e8b46`

- `EVENT_HUB_ADDRESS=0x6AA22fa4b6B4Afd6f27C7Eb361030BDd5eb1D35E`
- `QUOTE_TOKEN_ADDRESS=0x4DE0df239240cead24621631453f2FAf653f9A71`
- `LAUNCHPAD_ADDRESS=0x1749d1Cc0Cf9937f7FeEED330204F5e0F9f95d27`
- `AGENT_TRADE_EXECUTOR_ADDRESS=0x099d4993672027c50FFdE130229a3fA21dE55592`


- `LAUNCHPAD_POOL_ALLOCATION_BPS=8000`
- `LAUNCHPAD_SWAP_FEE_BPS=100`
- `LAUNCHPAD_CREATOR_FEE_SHARE_BPS=5000`
- `LAUNCHPAD_INITIAL_USDT_LIQUIDITY=50000`
- `LAUNCHPAD_BOOTSTRAP_USDT_MULTIPLIER=1000`


- `TWITTER_BOT_ENABLED=true`
- `TWITTER_BOT_TARGET_HANDLE=@TestingdevsAccs`
- `TWITTER_BOT_POLL_MS=20000`
- `TWITTER241_RAPIDAPI_KEY=`
- `TWITTER241_RAPIDAPI_HOST=twitter241.p.rapidapi.com`

Update `backend/.env` with real values for at least:

- `RPC_URL`
- `RPC_WRITE_URL`
- `BACKEND_PRIVATE_KEY`
- `CONVEX_URL`
- `OPENROUTER_API_KEY`
- `PROTOCOL_TREASURY_ADDRESS`
- `OPENROUTER_MODEL`
- `TWITTER_BOT_ENABLED`
- `TWITTER_BOT_TARGET_HANDLE`
- `TWITTER_BOT_POLL_MS`
- `TWITTER241_RAPIDAPI_KEY`
- `TWITTER241_RAPIDAPI_HOST`

Launchpad contract addresses:

- Leave `EVENT_HUB_ADDRESS`, `QUOTE_TOKEN_ADDRESS`, and `LAUNCHPAD_ADDRESS` blank on first run if you want the backend to bootstrap infrastructure automatically.
- Fill them in if you already have deployed contracts you want to reuse.


## 4. Configure Convex

From `backend/`:

```bash
npx convex dev --configure existing
```

If you already linked the right project and just want to push code:

```bash
npx convex dev --once
```

What this does:

- links the local `backend/convex/` folder to a Convex deployment
- pushes schema/function changes
- writes Convex settings such as `CONVEX_DEPLOYMENT`, `CONVEX_URL`, and `CONVEX_SITE_URL` to `backend/.env.local`

Important:

- Make sure the Convex deployment you configure is the one you actually want the backend to use.
- If the backend points at one deployment and the CLI pushes to another, you will see confusing runtime mismatches.

## 5. Configure The Frontend

The frontend reads `frontend/.env` and expects a backend base URL.

Create `frontend/.env` with:

```bash
BACKEND_BASE_URL=http://localhost:3030
```


## 6. Start The Backend

From `backend/`:

```bash
npm start
```

What to expect:

- there is no `dev` script in the backend package
- startup may take a bit because contracts are compiled
- if launchpad addresses are blank, the backend can deploy/bootstrap the required infrastructure on startup
- the backend listens on port `3030`

## 7. Start The Frontend

From `frontend/`:

```bash
npm run dev
```

The frontend runs on:

- `http://localhost:3001`

Notes:

- use `npm run dev` for local development
- `npm start` in the frontend only works after `npm run build`



## 8. Connect Your Wallet

Open `http://localhost:3001` and connect a wallet.

The frontend will prompt the wallet to use:

- Chain name: `Polkadot Hub TestNet`
- Chain ID: `420420417`
- Native token: `PAS`

If the network is missing in the wallet, the app will try to add it automatically.

## 9. Common Local Workflow

Typical development loop:

1. Start Convex from `backend/` with `npx convex dev`
2. Start the backend with `npm start`
3. Start the frontend with `npm run dev`
4. Open `http://localhost:3001`
5. Connect wallet and test flows

If you change Convex functions or schema:

```bash
cd backend
npx convex dev --once
```

Then restart the backend if needed.


## 10. Optional: Deploy Launchpad Manually With Foundry

If you prefer to deploy contracts manually instead of relying on backend bootstrap:

```bash
forge script script/DeployLaunchpad.s.sol:DeployLaunchpadScript \
  --rpc-url "$RPC_WRITE_URL" \
  --broadcast
```

The script writes deployment output to:

- `deployments/launchpad-polkadot-hub-testnet.json`

After deploying manually, copy the resulting addresses into:

- `EVENT_HUB_ADDRESS`
- `QUOTE_TOKEN_ADDRESS`
- `LAUNCHPAD_ADDRESS`

## 12. Troubleshooting

### Backend says `Missing script: "dev"`

Use:

```bash
npm start
```

### Frontend says no production build was found

Use:

```bash
npm run dev
```

or build first:

```bash
npm run build
npm start
```

### Convex changes do not seem to apply

Make sure all three line up:

- the deployment linked by `npx convex dev`
- `backend/.env.local`
- the effective `CONVEX_URL` used by the backend process

Then rerun:

```bash
cd backend
npx convex dev --once
npm start
```

### Twitter api is easily exhausted make sure to have a short polling window