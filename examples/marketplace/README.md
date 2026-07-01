# Marketplace — the headline example

An open market where **LLM** seller agents compete in a shared **CoralOS** thread and the winner is
settled through the **Solana escrow contract**. One buyer broadcasts a need; three persona sellers
bid; the buyer awards best value; funds are escrowed, delivered against, and released on delivery.

```
WANT → (sellers bid) → AWARD best value → deposit (escrow) → DELIVERED → release
```

## Run it

Prereqs: Docker, a funded devnet wallet pair (`node scripts/setup.js`), and an LLM key in `.env` — the
kit's LLM is **Venice AI** (`LLM_PROVIDER=venice` + `VENICE_API_KEY`; new accounts get $50 free via code
`IMPERIAL50` at [venice.ai/settings/api](https://venice.ai/settings/api)). `ANTHROPIC_API_KEY`, or
`LLM_PROVIDER=openai` + `OPENAI_API_KEY`, run the whole market on that provider instead — no code change
(see [../../LLM.md](../../LLM.md)). The escrow program is already deployed to devnet — no `anchor deploy`
needed to run the demo.

```sh
bash build-agents.sh seller buyer          # build the two agent images (sellers reuse the seller image)
docker compose up -d coral                 # CoralOS (MCP coordinator)
cd examples/marketplace && npm install && npm start
```

Then watch the market:

```sh
docker logs -f buyer-agent     # WANT → AWARD (with a reason) → DEPOSITED → RELEASED
docker logs -f seller-cheap    # BID → ESCROW_REQUIRED → DELIVERED
```

## What you'll see

```
[buyer]  round 1: WANT coingecko SOL-USDC budget=0.001
seller-cheap   BID  round=1 price=0.0002 by=seller-cheap note=undercut
seller-premium BID  round=1 price=0.0005 by=seller-premium note=verified
seller-lazy    …silent — coingecko isn't in its inventory (self-selection)
[buyer]  picked seller-cheap (0.0002 SOL): cheapest for a simple price lookup
[buyer]  round 1: DEPOSITED 0.0002 SOL → seller-cheap
seller-cheap   DELIVERED round=1 {"coin":"solana","usd":…}
[buyer]  round 1: RELEASED to seller-cheap — https://explorer.solana.com/tx/…?cluster=devnet
```

## Knobs (`.env` or the session options)

| Var | Effect |
|-----|--------|
| `BUYER_SERVICE` | what the buyer shops for (`coingecko` → cheap+premium bid, lazy sits out) |
| `LLM_PROVIDER=venice\|openai` | flip the whole market to another provider — no code change (Venice is the kit default) |
| `TRACE=1` | log the `coral_*` calls + Explorer links for the escrow PDA, deposit, and release |
| `BUYER_MAX_SOL` | the budget cap each round |

## Visualize it (optional React dashboard)

Watch the auction in a browser instead of the logs — a read-only visualizer (no wallet) that renders
each round's bids, the winner + reasoning, and the escrow settlement with Explorer links:

```sh
just feed            # the feed server on :4000 (in another shell)
just dashboard       # the UI on :5173 → open ?session=<the market session id>
```

It's e2e-tested with fixtures (no devnet needed) — see [`web/`](web/README.md).

## Demo flourishes

- **Drop in a competitor live:** add a fourth seller to `start.ts`'s graph — it bids next round with
  zero buyer edits.
- **Flip the brain:** set `LLM_PROVIDER=venice` (or `openai`) and re-run — same market, a different LLM stack.

See [`docs/MARKETPLACE.md`](../../docs/MARKETPLACE.md) for the full protocol, the escrow flow, and the
"under the hood" walkthrough.
