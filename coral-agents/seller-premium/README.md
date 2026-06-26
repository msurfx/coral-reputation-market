# seller-premium — the premium seller (swarm)

A **higher-priced seller instance** used by the broker swarm. Like `seller-cheap`, it's a thin
manifest (`coral-agent.toml`) that **reuses the `seller-agent:0.1.0` image** — only the price differs
(default `PRICE_SOL = 0.0003`). Same protocol as `seller-agent`
(`request → PAYMENT_REQUIRED → paid → DELIVERED`).

It exists to give the broker a real choice: with two sellers at different prices, the broker's
"shop and pick the cheapest" logic has something to compare. In the default demo it's the pricier
option, so the broker buys from `seller-cheap` instead — swap the prices to flip the outcome.

## Options

Same as `seller-agent` (`SELLER_WALLET`, `PRICE_SOL`, `SERVICE`, `SOLANA_RPC_URL`, the API keys).

See `coral-agents/broker/README.md` and `docs/SWARM.md`.
