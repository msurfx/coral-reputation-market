# APIs you can sell — a catalog for `deliverService`

The seller's fork point is `coral-agents/seller-agent/src/service.ts → deliverService(request)`. It
runs server-side in Node, so it can wrap **almost any API or computation** and return a string the
buyer pays **devnet SOL** for. This is a menu of options, grouped by category.

> **One thing to keep straight:** the *payment* is always **devnet SOL** (free, faucet-funded). What
> *network the data comes from* is a separate question — a service can read Solana **devnet**, read
> Solana **mainnet** (read-only, no funds), or read something with no chain at all. The table's
> "Devnet on-chain?" column means "does it read **devnet** chain data."

Legend: **Free** = usable on a free tier · **Key** = needs an API key · **Devnet** = reads devnet
on-chain data.

---

## 1. Solana / on-chain — the on-thesis category

An agent economy *on Solana* is most compelling when agents sell **Solana data**. These read on-chain
data; the first two are the only ones that read **devnet** specifically.

| API | Free | Key | Devnet | What service it makes |
|-----|:---:|:---:|:---:|---|
| **Solana devnet RPC** (`api.devnet.solana.com`) | ✅ | ❌ | ✅ | wallet balance, token holdings, tx lookup, account info, network stats, airdrop — *the* devnet-native services |
| **Helius** (`devnet.helius-rpc.com`) | ✅ tier | ✅ | ✅ | enhanced RPC + parsed transactions + `onAccountChange` (already used by `HeliusMonitorStrategy`) — "subscribe to a devnet account" |
| **CoinStats Solana** | ✅ 20k/mo | ✅ | ❌ (mainnet) | pass a wallet → SPL balances, tx history, DeFi positions as JSON |
| **Solana Tracker** | ✅ 2.5k req | ✅ | ❌ (mainnet) | 70+ endpoints — token price/volume/liquidity, wallet tracking, trade history |
| **Bitquery** (GraphQL) | ✅ tier | ✅ | ❌ (mainnet) | DEX trades, token transfers, holders — real-time + historical |

**The devnet-native ones to start with** (free, no key): wallet portfolio, tx explainer, token/mint
info, NFT metadata, network stats, priority-fee oracle — all just devnet RPC calls. See the
[`solana-dev`](../SKILLS.md) skill's RPC quick-lookups reference for the exact calls.

---

## 2. Crypto market data

Prices/quotes — mainnet liquidity, but read-only (no real funds move).

| API | Free | Key | What service it makes |
|-----|:---:|:---:|---|
| **Jupiter** (`api.jup.ag`) — *kit default* | ✅ | ❌ (key = higher limits) | best SOL→token swap quote |
| **CoinGecko** (`api.coingecko.com`) — *kit built-in* | ✅ | ❌ keyless endpoints | live token price, market cap, volume |
| **DIA** (`diadata.org`) | ✅ | ❌ **no key, no signup** | real-time + historical price for 3,000+ tokens, 60+ chains |
| **Birdeye** | ✅ tier | ✅ | Solana token analytics, OHLCV |

---

## 3. LLM / inference — sell intelligence

The seller can resell an LLM completion (`SERVICE=inference`). The buyer's *decision* loop also uses
an LLM. **Today both are Anthropic-only** — see [§ Codex / OpenAI](#codex--openai-the-llm-alternative).

| Provider | Key env | Models | What service it makes |
|----------|---------|--------|---|
| **Anthropic** (`api.anthropic.com`) — *kit default* | `ANTHROPIC_API_KEY` | `claude-opus-4-8`, `claude-haiku-4-5` | a Claude completion / analysis / summary |
| **OpenAI / Codex** (`api.openai.com`) | `OPENAI_API_KEY` | `gpt-5.x-codex` (code-specialized), general GPT | a code-gen / review / completion service |

Both are **paid APIs** (token-billed) with free-tier credits. They cost the seller real money per call
— fine on devnet (you're subsidizing), priced to cover cost in a real deployment.

---

## 4. General data — anything else

| API | Free | Key | What service it makes |
|-----|:---:|:---:|---|
| **open-meteo** (`open-meteo.com`) | ✅ | ❌ | weather (the runtime's `WeatherStrategy` uses this) |
| **NewsAPI** (`newsapi.org`) — *kit built-in* | ✅ | ✅ | headlines |
| **REST Countries / public-apis** | ✅ | ❌ | reference data, demos |
| **Your own API / DB / compute** | — | — | the real win — monetize *your* thing |

---

## Codex / OpenAI — the LLM alternative

**"Codex" in 2026 is OpenAI's code-specialized model line** (`gpt-5-codex` … `gpt-5.3-codex`),
reached through the **standard OpenAI API** with an `OPENAI_API_KEY` (token-billed; e.g. `gpt-5.3-codex`
≈ $1.75 / M input, $14 / M output). The ChatGPT *subscription* (Free/Plus/Pro) is separate — for the
kit you want an **API key**, not a plan.

**Can the kit use it?** Yes, with a small change. The LLM calls are Anthropic-only today
([`buyer-agent/src/llm_buyer.ts`](../coral-agents/buyer-agent/src/llm_buyer.ts) and the seller's
`inference` service). To use Codex/OpenAI:

1. **As the seller's service** — add a `SERVICE=codex` branch that POSTs to
   `https://api.openai.com/v1/chat/completions` (or the Responses API) with `Authorization: Bearer
   $OPENAI_API_KEY` and a `gpt-5.x-codex` model. Now the seller sells **code generation/review** for
   devnet SOL — very on-theme for a dev-tools agent.
2. **As the buyer's brain** — swap the `Anthropic` SDK in `llm_buyer.ts` for the OpenAI SDK (tool-use
   maps over directly). A student with an OpenAI/Codex key can then run the kit without an Anthropic
   key.

The clean version is a **provider interface** (`complete(prompt, opts)`) with Anthropic + OpenAI
implementations, selected by whichever key is set — this is the "provider lock-in" item in
[`PRODUCTION_HARDENING.md`](PRODUCTION_HARDENING.md).

---

## Can it really be *any* API? — the caveats

Practically yes (any HTTP API, SDK, on-chain read, or computation that returns a string), with four
honest limits:

| Caveat | Detail |
|---|---|
| **Keyed APIs** | the **seller** needs the key in its env; the buyer never sees it |
| **Paid APIs** | the seller pays the real bill per call — on devnet the SOL is worthless, so price to cover cost for real economics |
| **Payload size** | results are delivered as a string in a CoralOS message; for huge/binary data, return a **URL/reference** instead of the bytes |
| **Reliability** | the buyer waits for delivery; a slow/flaky upstream = a slow/flaky service (failures are caught and returned as `ERROR …`) |

---

## How to add one

```ts
// coral-agents/seller-agent/src/service.ts
case 'devnet-wallet': return devnetWallet(request)   // add a branch

async function devnetWallet(request: string): Promise<string> {
  const conn = new Connection('https://api.devnet.solana.com')  // free, devnet, no key
  const wallet = new PublicKey(request.trim())
  const sol = (await conn.getBalance(wallet)) / LAMPORTS_PER_SOL
  return JSON.stringify({ wallet: request, sol })
}
```
Set `SERVICE=devnet-wallet`, and the seller now sells on-chain devnet data for devnet SOL.

---

*Sources for the 2026 figures: OpenAI Codex pricing/rate-card; free-crypto-API roundups (DIA,
CoinGecko, CoinStats, Solana Tracker, Bitquery). Verify current limits before relying on them — API
tiers change.*
