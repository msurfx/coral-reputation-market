# seller-cheap — the budget seller (swarm)

A **low-priced seller instance** used by the broker swarm. It isn't a new agent — it's a thin
manifest (`coral-agent.toml`) that **reuses the already-built `seller-agent:0.1.0` image** at a low
`PRICE_SOL` (default `0.0001`). Same protocol as `seller-agent`
(`request → PAYMENT_REQUIRED → paid → DELIVERED`).

Why a separate folder? CoralOS resolves an agent by its registry **name**, so the swarm needs
`seller-cheap` and `seller-premium` as distinct names — but they can point at the same Docker image.
No code, no extra build.

## Options

Same as `seller-agent` (`SELLER_WALLET`, `PRICE_SOL`, `SERVICE`, `SOLANA_RPC_URL`, the API keys). The
broker passes a low `PRICE_SOL` so this one usually wins the broker's price comparison.

See `coral-agents/broker/README.md` and `docs/SWARM.md`.
