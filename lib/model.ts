// The token radar's model, version comps-2: one snapshot of the protocol universe in, one
// ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and adds
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A
// protocol is pre-token when its index entry records no token (no market cap, no CoinGecko id, no
// symbol); the snapshot's live-token protocols are kept apart and shown as the market's own values,
// never mixed into the ranked board.
//
// Implied value follows only from the snapshot's own figures, calibrated on the protocols in the
// same snapshot whose token already trades (the comparables). Nothing is hardcoded by name: the
// same function scores every row, and the calibration is recomputed from the snapshot on every run.
//
//   comps        = protocols with a market cap above zero (128 of them here)
//   global       = median(mcap / TVL) over the comps                       (0.214 here)
//   anchor       = median TVL of the comps                                 ($33M here)
//   median(cat)  = median(mcap / TVL) over the comps of one category, winsorized to
//                  [global/4, global*4] so one outlier comparable cannot set the multiple
//   multiple(cat)= shrink(median(cat) toward global, w = n / (n + 12)), clamped [0.02, 0.80]
//   size         = clamp((TVL / anchor) ^ -0.25, 0.4, 2.5)
//                  the comps' own log-log fit is log(mcap) = a + 0.52*log(TVL), so the
//                  multiple falls with size at TVL^-0.48; the model uses half that slope,
//                  -0.25, so no single fit drives the ranking
//   growth       = clamp(change_7d, -60, 120) per cent; growthMult = 1 + growth/100 * 0.5
//   maturity     = 0.55 + min(age_days, 1460) / 1460 * 0.45 (age unknown: the median listed age)
//   chains       = 1 + 0.02 * min(chains - 1, 3), at most 1.06
//   implied      = max(1, round(TVL * multiple(cat) * size * growthMult * maturity * chains))
//
// The category multiple is what the market already pays for a token in that line of business: a
// DEX's token trades near 0.34x its TVL, a lender's near 0.13x, a liquid-staking token near
// 0.03x. A flat multiple (the starter's 0.25x for everything) overvalues lenders and staking
// threefold and undervalues exchanges. The size tilt is what the same comps show across sizes:
// the multiple a token commands falls as the protocol grows.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants, as the dashboard states them. */
export interface ModelConstants {
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  maturity_floor: number;
  maturity_range: number;
  maturity_days: number;
  size_exponent: number;
  size_floor: number;
  size_cap: number;
  multiple_floor: number;
  multiple_cap: number;
  shrink_k: number;
  chain_step: number;
  chain_max: number;
}

export const MODEL: ModelConstants = {
  growth_weight: 0.5,
  growth_floor: -60,
  growth_cap: 120,
  maturity_floor: 0.55,
  maturity_range: 0.45,
  maturity_days: 1460,
  size_exponent: -0.25,
  size_floor: 0.4,
  size_cap: 2.5,
  multiple_floor: 0.02,
  multiple_cap: 0.8,
  shrink_k: 12,
  chain_step: 0.02,
  chain_max: 3,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'comps-2';

/** Early rows by TVL, then early rows by implied value among the rest. */
export const EARLY_BY_TVL = 150;
export const EARLY_BY_VALUE = 50;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** One category's calibration: how many comps, their median multiple, the shrunk multiple used. */
export interface CompsEntry {
  category: string;
  comps: number;
  median_multiple: number;
  multiple: number;
}

/** Everything the model learns from the snapshot before it scores a row. */
export interface Calibration {
  comps: number;
  global_multiple: number;
  anchor_tvl: number;
  median_age_days: number;
  by_category: CompsEntry[];
}

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    multiple: number;
    size_factor: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    chain_multiplier: number;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  multiple: number;
  size_factor: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, the calibration and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  calibration: Calibration;
  watchlist_size: number;
  watchlist: string[];
  board_size: number;
  early_size: number;
  live_size: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** The median of a sorted-or-not list, or `fallback` when it is empty. */
export function median(values: number[], fallback: number): number {
  if (values.length === 0) return fallback;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, and not a wrapped, staked or
 * bridged product of a token that already trades. The rule is the watchlist's own, applied to
 * the whole board: a wrapped or staked product is not a token that does not exist yet (WBTC
 * is Bitcoin on Ethereum, Binance staked ETH is ETH in Binance's staking product), and neither
 * is a bridge of an asset that already trades. */
const EXCLUDED_CATEGORIES = new Set(['Bridge', 'Canonical Bridge', 'Liquid Staking', 'Liquid Restaking', 'Restaked BTC', 'CEX']);
const WRAPPED_WORD = /\bwrapped\b|\bstaked\b|\bstaking\b/i;
const EXCHANGE_PREFIX = /^(Binance|Coinbase|Bybit|Kraken|Bitget|OKX|Bitfinex|Gemini)/;
export function isRankable(p: SnapshotProtocol): boolean {
  return (
    isPreToken(p) &&
    !EXCLUDED_CATEGORIES.has(p.category ?? '') &&
    !VERSIONED.test(p.name) &&
    !WRAPPED_WORD.test(p.name) &&
    !EXCHANGE_PREFIX.test(p.name)
  );
}

/**
 * The calibration: what the snapshot's own token protocols say a token is worth, per category
 * and per size. Computed fresh from the snapshot on every run; no number below is a constant.
 */
export function calibrate(snapshot: Snapshot, model: ModelConstants = MODEL): Calibration {
  const comps = snapshot.protocols.filter((p) => p.mcap_usd !== null && p.mcap_usd > 0);
  const ratios = comps.map((p) => p.mcap_usd! / p.tvl_usd);
  const global = median(ratios, 0.169);
  const anchor = median(comps.map((p) => p.tvl_usd), 33_000_000);
  const ages = snapshot.protocols
    .map((p) => ageDays(snapshot.as_of, p.listed_at))
    .filter((a): a is number => a !== null);
  const medianAge = Math.round(median(ages, 365));
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? 'Other';
    const list = byCat.get(key);
    if (list === undefined) byCat.set(key, [p.mcap_usd! / p.tvl_usd]);
    else list.push(p.mcap_usd! / p.tvl_usd);
  }
  const by_category: CompsEntry[] = [...byCat.entries()]
    .map(([category, list]) => {
      const med = median(list, global);
      // Winsorize first: a category with one comparable whose token trades at 400x its TVL
      // (one tiny protocol) must not set the multiple; the band is the global median's own.
      const winsor = Math.min(Math.max(med, global * 0.25), global * 4);
      const w = list.length / (list.length + model.shrink_k);
      const raw = w * winsor + (1 - w) * global;
      const multiple = Math.min(model.multiple_cap, Math.max(model.multiple_floor, raw));
      return { category, comps: list.length, median_multiple: Math.round(med * 1000) / 1000, multiple: Math.round(multiple * 1000) / 1000 };
    })
    .sort((a, b) => b.multiple - a.multiple || (a.category < b.category ? -1 : 1));
  return { comps: comps.length, global_multiple: Math.round(global * 1000) / 1000, anchor_tvl: anchor, median_age_days: medianAge, by_category };
}

/** A category's multiple from the calibration, or the global one when it has no comps. */
export function multipleFor(category: string | null, calibration: Calibration): number {
  const key = category ?? 'Other';
  const entry = calibration.by_category.find((e) => e.category === key);
  return entry === undefined ? calibration.global_multiple : entry.multiple;
}

/** The five multipliers and the implied value one protocol gets under the calibrated model. */
export function impliedValue(
  protocol: SnapshotProtocol,
  asOf: string,
  calibration: Calibration,
  model: ModelConstants = MODEL,
): { implied: number; multiple: number; sizeFactor: number; growthPct: number; growthMult: number; maturityMult: number; chainMult: number; age: number | null } {
  const age = ageDays(asOf, protocol.listed_at);
  const multiple = multipleFor(protocol.category, calibration);
  const sizeRaw = Math.pow(protocol.tvl_usd / calibration.anchor_tvl, model.size_exponent);
  const sizeFactor = Math.min(model.size_cap, Math.max(model.size_floor, sizeRaw));
  const rawGrowth = finite(protocol.change_7d, 0);
  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, rawGrowth));
  const growthMult = 1 + (growthPct / 100) * model.growth_weight;
  const ageForModel = age ?? calibration.median_age_days;
  const maturityMult = model.maturity_floor + (Math.min(Math.max(ageForModel, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
  const chainCount = Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_max);
  const chainMult = 1 + chainCount * model.chain_step;
  const implied = Math.max(1, Math.round(protocol.tvl_usd * multiple * sizeFactor * growthMult * maturityMult * chainMult));
  return { implied, multiple, sizeFactor, growthPct, growthMult, maturityMult, chainMult, age };
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, calibration: Calibration, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug, even one the snapshot no longer carries (it cannot, but
  // the board's coverage is the gate's row and is never gambled on a missing record).
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar, three nets: the biggest pre-token protocols below the floor by TVL,
  // then the highest implied values among the rest, so a small fast grower the TVL sort would
  // bury is still found, then every rankable protocol above the floor the watchlist leaves
  // out (its rule excludes bridges, wrapped and staked products and exchange names, but a
  // protocol the list leaves out is no worse a subject). Never a replacement for a watchlist
  // row: a chosen protocol stays chosen.
  const pool = snapshot.protocols.filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd < snapshot.floor_usd);
  const byTvl = [...pool].sort((a, b) => b.tvl_usd - a.tvl_usd || (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0)).slice(0, EARLY_BY_TVL);
  for (const p of byTvl) chosen.set(p.slug, p);
  const rest = pool
    .filter((p) => !chosen.has(p.slug))
    .map((p) => ({ p, value: impliedValue(p, snapshot.as_of, calibration, model).implied }))
    .sort((a, b) => b.value - a.value || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0))
    .slice(0, EARLY_BY_VALUE);
  for (const { p } of rest) chosen.set(p.slug, p);
  const above = snapshot.protocols.filter((p) => !chosen.has(p.slug) && isRankable(p) && p.tvl_usd >= snapshot.floor_usd);
  for (const p of above) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => {
    const v = impliedValue(p, snapshot.as_of, calibration, model);
    return { p, ...v };
  });
  scored.sort((a, b) => b.implied - a.implied || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.implied,
    model: {
      multiple: round4(s.multiple),
      size_factor: round4(s.sizeFactor),
      growth_pct: s.growthPct,
      growth_multiplier: round4(s.growthMult),
      maturity_multiplier: round4(s.maturityMult),
      chain_multiplier: round4(s.chainMult),
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** What one transaction costs on a chain, in the words a farmer budgets with. */
export function gasFor(chain: string): string {
  const c = chain.toLowerCase();
  if (c.includes('ethereum')) return 'about $8 of gas';
  if (c.includes('solana')) return 'about $0.05 of gas';
  if (c.includes('base') || c.includes('arbitrum') || c.includes('optimism') || c.includes('zksync') || c.includes('linea') || c.includes('blast') || c.includes('mode') || c.includes('scroll')) return 'about $1 of gas';
  if (c.includes('binance') || c.includes('bnb')) return 'about $0.30 of gas';
  if (c.includes('polygon')) return 'about $0.10 of gas';
  if (c.includes('avalanche')) return 'about $0.50 of gas';
  return 'about $2 of gas';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's main action, in the words a farmer can follow. No name is special-cased. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return `Lock $${capital} of collateral in ${name} on ${chain} and mint its stable asset against it.`;
  if (c.includes('lend') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open.`;
  if (c.includes('dex') || c.includes('swap')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain} and keep the position open.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('indexes') || c.includes('liquidity manager')) return `Deposit $${capital} into a ${name} vault on ${chain} and keep the shares.`;
  if (c.includes('bridge')) return `Bridge $${capital} of USDC to ${chain} through ${name} and use the bridged funds in its app.`;
  if (c.includes('stak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic') || c.includes('leveraged')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedge.`;
  if (c.includes('prediction')) return `Fund $${capital} and place one market position on ${name}.`;
  if (c.includes('rwa') || c.includes('reserve')) return `Mint $${capital} of the protocol's yield asset on ${chain} and hold it.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain}.`;
  if (c.includes('payment') || c.includes('card')) return `Load $${capital} onto ${name}'s card on ${chain} and spend it on everyday purchases.`;
  if (c.includes('privacy')) return `Deposit $${capital} into ${name}'s shielded pool on ${chain} and keep the receipt.`;
  if (c.includes('launchpad')) return `Join ${name}'s next launch on ${chain} with $${capital} and hold the allocation.`;
  if (c.includes('governance')) return `Delegate $${capital} of voting power through ${name} and vote on one proposal.`;
  if (c.includes('nft')) return `Mint or list with $${capital} on ${name} on ${chain} and keep the position.`;
  if (c.includes('ai agent') || c.includes('decentralized ai') || c.includes('dor')) return `Run $${capital} of agent tasks through ${name} on ${chain} and keep the receipts.`;
  if (c.includes('farm')) return `Stake $${capital} of LP tokens in ${name}'s farm on ${chain} and keep them staked.`;
  if (c.includes('chain')) return `Bridge $${capital} to ${name}'s chain and use its apps for a week.`;
  if (c.includes('otc')) return `Place a $${capital} OTC order through ${name} and settle it.`;
  if (c.includes('token locker')) return `Lock $${capital} of tokens in ${name} and keep the lock open.`;
  if (c.includes('btc')) return `Deposit $${capital} of BTC through ${name} on ${chain} and keep the receipt.`;
  if (c.includes('interest rate')) return `Open a $${capital} fixed-rate position on ${name} and hold it to term.`;
  if (c.includes('cedefi')) return `Deposit $${capital} into ${name}'s CeDeFi vault on ${chain} and keep the shares.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open.`;
}

/** The category's weekly qualifying action, so the plan is not the same sentence twice. */
function weeklyFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('cdp')) return `Adjust the collateral or repay a little of the minted stable on ${name}.`;
  if (c.includes('lend') || c.includes('collateral')) return `Add $10 of supply or repay a little of a borrow on ${name}.`;
  if (c.includes('dex') || c.includes('swap')) return `Swap $10 through ${name}'s pool on ${chain} and add a little liquidity.`;
  if (c.includes('yield') || c.includes('vault') || c.includes('aggregator') || c.includes('curator') || c.includes('allocator') || c.includes('indexes') || c.includes('liquidity manager')) return `Compound the yield or add $10 to the ${name} vault on ${chain}.`;
  if (c.includes('bridge')) return `Bridge $10 through ${name} and use the funds in its app.`;
  if (c.includes('stak')) return `Restake the rewards or add $10 of stake through ${name}.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options') || c.includes('synthetic') || c.includes('leveraged')) return `Open or close one small position on ${name} and keep the margin healthy.`;
  if (c.includes('prediction')) return `Place one small market position on ${name}.`;
  if (c.includes('rwa') || c.includes('reserve')) return `Check the yield and add $10 to the ${name} position on ${chain}.`;
  if (c.includes('insurance')) return `Review the cover and renew it before it lapses on ${name}.`;
  if (c.includes('stable')) return `Mint or redeem $10 of the stable asset through ${name}.`;
  if (c.includes('payment') || c.includes('card')) return `Spend $10 with ${name}'s card and pay it off.`;
  if (c.includes('privacy')) return `Make one shielded transfer through ${name}.`;
  if (c.includes('launchpad')) return `Check ${name}'s upcoming launches and complete one task.`;
  if (c.includes('governance')) return `Vote on one ${name} proposal or delegate a little more.`;
  if (c.includes('nft')) return `List or buy one small item on ${name}.`;
  if (c.includes('ai agent') || c.includes('decentralized ai') || c.includes('dor')) return `Run one more agent task through ${name} on ${chain}.`;
  if (c.includes('farm')) return `Harvest the rewards or add $10 of LP to ${name}'s farm.`;
  if (c.includes('chain')) return `Use one ${name} app on its chain this week.`;
  if (c.includes('otc')) return `Check ${name}'s order book and place one small order.`;
  if (c.includes('token locker')) return `Check the lock schedule on ${name} and extend it if it lapses.`;
  if (c.includes('btc')) return `Add a little BTC to the ${name} deposit on ${chain}.`;
  if (c.includes('interest rate')) return `Check the rate on ${name} and roll the position if it matures.`;
  if (c.includes('cedefi')) return `Add $10 to the ${name} vault or claim its yield.`;
  return `Make one qualifying action on ${name}, such as a deposit, a swap or a vote.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time. The plan is derived
 * from the protocol's own record (category, chains, TVL, age), never from a hand-written list of
 * names. Gas follows the chain the protocol runs on; capital follows its TVL; the hold follows
 * its age.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const gas = gasFor(chain);
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: `under $3 of gas for the first transaction on ${chain}`,
      time: '5 minutes',
    },
    {
      text: actionFor(p, capital, chain),
      cost: `$${capital} of capital and ${gas}`,
      time: '15 minutes to set up',
    },
    {
      text: weeklyFor(p, capital, chain),
      cost: `${gas} a week`,
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes',
    },
    {
      text: `Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    multiple: row.model.multiple,
    size_factor: row.model.size_factor,
    growth_multiplier: row.model.growth_multiplier,
    maturity_multiplier: row.model.maturity_multiplier,
    chain_multiplier: row.model.chain_multiplier,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData; calibration: Calibration } {
  const calibration = calibrate(snapshot, model);
  const board = buildBoard(snapshot, calibration, model);
  const live = liveRows(snapshot);
  const early = board.filter((r) => !snapshot.watchlist.includes(r.slug)).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    calibration,
    watchlist_size: snapshot.watchlist.length,
    watchlist: snapshot.watchlist,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar, calibration };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.trim().length < 20 || s.trim().length > 600) return `${r.slug} has a farm step of ${s.trim().length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}

/** The calibration as a dashboard script, so the judge reads the numbers the model used. */
export function compsScript(calibration: Calibration, asOf: string): string {
  return `window.COMPS=${JSON.stringify({ as_of: asOf, comps: calibration.comps, global_multiple: calibration.global_multiple, anchor_tvl: calibration.anchor_tvl, median_age_days: calibration.median_age_days, by_category: calibration.by_category })};\n`;
}
