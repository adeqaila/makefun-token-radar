// Token Radar's dashboard, model comps-2. It reads window.RADAR (written beside dashboard/
// by main.ts) and window.COMPS (the calibration table, written into dashboard/ by main.ts)
// and renders the ranked board, a filterable table, a per-protocol detail drawer with the
// model's own inputs and the protocol's farm plan. No network: every byte it shows is in
// data.js or comps.js.
//
// The model in full, so a reader can check any row against the board: the category multiple
// comes from the snapshot's own token protocols (median mcap/TVL per category, shrunk toward
// the global median), the size tilt halves the comps' own log-log slope, growth is clamped,
// maturity follows the listing age, and multi-chain protocols get a small bonus. No protocol
// name is special-cased, and no row is hand-picked.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var COMPS = window.COMPS;
  if (!DATA || !COMPS) return;
  var app = document.getElementById('board');
  var WATCH = {};
  (DATA.watchlist || []).forEach(function (s) { WATCH[s] = true; });
  var state = { q: '', category: 'all', chain: 'all', tab: 'pre-token', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }

  // The model in one function: the page recomputes a row from the snapshot figures and checks
  // the number board.json carries, so the page's code and the board's data are visibly the same
  // arithmetic. The multiplication order matches lib/model.ts exactly, so the recompute is exact.
  function multipleFor(category) {
    var key = category || 'Other';
    for (var i = 0; i < COMPS.by_category.length; i++) {
      if (COMPS.by_category[i].category === key) return COMPS.by_category[i].multiple;
    }
    return COMPS.global_multiple;
  }
  function impliedOf(row, model) {
    var multiple = multipleFor(row.category);
    var size = Math.min(model.size_cap, Math.max(model.size_floor, Math.pow(row.tvl_usd / COMPS.anchor_tvl, model.size_exponent)));
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? COMPS.median_age_days : row.age_days;
    var maturity = model.maturity_floor + (Math.min(Math.max(age, 0), model.maturity_days) / model.maturity_days) * model.maturity_range;
    var chains = Math.min(Math.max((row.chains || []).length - 1, 0), model.chain_max);
    var chainMult = 1 + chains * model.chain_step;
    return {
      implied: Math.max(1, Math.round(row.tvl_usd * multiple * size * growthMult * maturity * chainMult)),
      multiple: multiple, size: size, growthMult: growthMult, maturity: maturity, chainMult: chainMult, growth: growth, age: age
    };
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  // The farm plan is the same derivation main.ts writes to board.json: category, chains, TVL
  // and age decide the action, the capital, the hold and every cost and time. No name is
  // special-cased. Gas follows the chain the protocol runs on.
  function chainOf(p) { return p.chains && p.chains.length > 0 ? p.chains[0] : 'its main chain'; }
  function gasFor(chain) {
    var c = chain.toLowerCase();
    if (c.indexOf('ethereum') >= 0) return 'about $8 of gas';
    if (c.indexOf('solana') >= 0) return 'about $0.05 of gas';
    if (c.indexOf('base') >= 0 || c.indexOf('arbitrum') >= 0 || c.indexOf('optimism') >= 0 || c.indexOf('zksync') >= 0 || c.indexOf('linea') >= 0 || c.indexOf('blast') >= 0 || c.indexOf('mode') >= 0 || c.indexOf('scroll') >= 0) return 'about $1 of gas';
    if (c.indexOf('binance') >= 0 || c.indexOf('bnb') >= 0) return 'about $0.30 of gas';
    if (c.indexOf('polygon') >= 0) return 'about $0.10 of gas';
    if (c.indexOf('avalanche') >= 0) return 'about $0.50 of gas';
    return 'about $2 of gas';
  }
  function capitalFor(p) {
    if (p.tvl_usd >= 5e9) return 250;
    if (p.tvl_usd >= 1e9) return 150;
    if (p.tvl_usd >= 1e8) return 100;
    return 50;
  }
  function holdDaysFor(age) {
    if (age === null || age === undefined) return 30;
    if (age < 180) return 60;
    if (age < 365) return 45;
    return 30;
  }
  function actionFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('cdp') >= 0) return 'Lock $' + capital + ' of collateral in ' + name + ' on ' + chain + ' and mint its stable asset against it.';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'Supply $' + capital + ' of USDC to ' + name + ' on ' + chain + ' and keep the position open.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return 'Provide $' + capital + " of liquidity to " + name + "'s main pool on " + chain + ' and keep the position open.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('indexes') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Deposit $' + capital + ' into a ' + name + ' vault on ' + chain + ' and keep the shares.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $' + capital + ' of USDC to ' + chain + ' through ' + name + ' and use the bridged funds in its app.';
    if (c.indexOf('stak') >= 0) return "Stake $" + capital + " of the chain's staking asset through " + name + ' and keep the receipt.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('leveraged') >= 0) return 'Deposit $' + capital + ' of USDC as margin on ' + name + ' and open one small hedge.';
    if (c.indexOf('prediction') >= 0) return 'Fund $' + capital + ' and place one market position on ' + name + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('reserve') >= 0) return "Mint $" + capital + " of the protocol's yield asset on " + chain + ' and hold it.';
    if (c.indexOf('insurance') >= 0) return 'Buy $' + capital + ' of cover from ' + name + ' on ' + chain + ' and keep the policy.';
    if (c.indexOf('stable') >= 0) return 'Mint or deposit $' + capital + ' of the stable asset through ' + name + ' on ' + chain + '.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return "Load $" + capital + " onto " + name + "'s card on " + chain + ' and spend it on everyday purchases.';
    if (c.indexOf('privacy') >= 0) return 'Deposit $' + capital + " into " + name + "'s shielded pool on " + chain + ' and keep the receipt.';
    if (c.indexOf('launchpad') >= 0) return "Join " + name + "'s next launch on " + chain + ' with $' + capital + ' and hold the allocation.';
    if (c.indexOf('governance') >= 0) return 'Delegate $' + capital + ' of voting power through ' + name + ' and vote on one proposal.';
    if (c.indexOf('nft') >= 0) return 'Mint or list with $' + capital + ' on ' + name + ' on ' + chain + ' and keep the position.';
    if (c.indexOf('ai agent') >= 0 || c.indexOf('decentralized ai') >= 0 || c.indexOf('dor') >= 0) return 'Run $' + capital + ' of agent tasks through ' + name + ' on ' + chain + ' and keep the receipts.';
    if (c.indexOf('farm') >= 0) return "Stake $" + capital + " of LP tokens in " + name + "'s farm on " + chain + ' and keep them staked.';
    if (c.indexOf('chain') >= 0) return 'Bridge $' + capital + ' to ' + name + "'s chain and use its apps for a week.";
    if (c.indexOf('otc') >= 0) return 'Place a $' + capital + ' OTC order through ' + name + ' and settle it.';
    if (c.indexOf('token locker') >= 0) return 'Lock $' + capital + ' of tokens in ' + name + ' and keep the lock open.';
    if (c.indexOf('btc') >= 0) return 'Deposit $' + capital + ' of BTC through ' + name + ' on ' + chain + ' and keep the receipt.';
    if (c.indexOf('interest rate') >= 0) return 'Open a $' + capital + ' fixed-rate position on ' + name + ' and hold it to term.';
    if (c.indexOf('cedefi') >= 0) return "Deposit $" + capital + " into " + name + "'s CeDeFi vault on " + chain + ' and keep the shares.';
    return 'Deposit $' + capital + ' of USDC into ' + name + ' on ' + chain + ' and keep the position open.';
  }
  function weeklyFor(p, capital, chain) {
    var c = (p.category || '').toLowerCase();
    var name = p.name;
    if (c.indexOf('cdp') >= 0) return 'Adjust the collateral or repay a little of the minted stable on ' + name + '.';
    if (c.indexOf('lend') >= 0 || c.indexOf('collateral') >= 0) return 'Add $10 of supply or repay a little of a borrow on ' + name + '.';
    if (c.indexOf('dex') >= 0 || c.indexOf('swap') >= 0) return "Swap $10 through " + name + "'s pool on " + chain + ' and add a little liquidity.';
    if (c.indexOf('yield') >= 0 || c.indexOf('vault') >= 0 || c.indexOf('aggregator') >= 0 || c.indexOf('curator') >= 0 || c.indexOf('allocator') >= 0 || c.indexOf('indexes') >= 0 || c.indexOf('liquidity manager') >= 0) return 'Compound the yield or add $10 to the ' + name + ' vault on ' + chain + '.';
    if (c.indexOf('bridge') >= 0) return 'Bridge $10 through ' + name + ' and use the funds in its app.';
    if (c.indexOf('stak') >= 0) return 'Restake the rewards or add $10 of stake through ' + name + '.';
    if (c.indexOf('perpetual') >= 0 || c.indexOf('derivative') >= 0 || c.indexOf('options') >= 0 || c.indexOf('synthetic') >= 0 || c.indexOf('leveraged') >= 0) return 'Open or close one small position on ' + name + ' and keep the margin healthy.';
    if (c.indexOf('prediction') >= 0) return 'Place one small market position on ' + name + '.';
    if (c.indexOf('rwa') >= 0 || c.indexOf('reserve') >= 0) return 'Check the yield and add $10 to the ' + name + ' position on ' + chain + '.';
    if (c.indexOf('insurance') >= 0) return 'Review the cover and renew it before it lapses on ' + name + '.';
    if (c.indexOf('stable') >= 0) return 'Mint or redeem $10 of the stable asset through ' + name + '.';
    if (c.indexOf('payment') >= 0 || c.indexOf('card') >= 0) return "Spend $10 with " + name + "'s card and pay it off.";
    if (c.indexOf('privacy') >= 0) return 'Make one shielded transfer through ' + name + '.';
    if (c.indexOf('launchpad') >= 0) return "Check " + name + "'s upcoming launches and complete one task.";
    if (c.indexOf('governance') >= 0) return 'Vote on one ' + name + ' proposal or delegate a little more.';
    if (c.indexOf('nft') >= 0) return 'List or buy one small item on ' + name + '.';
    if (c.indexOf('ai agent') >= 0 || c.indexOf('decentralized ai') >= 0 || c.indexOf('dor') >= 0) return 'Run one more agent task through ' + name + ' on ' + chain + '.';
    if (c.indexOf('farm') >= 0) return 'Harvest the rewards or add $10 of LP to ' + name + "'s farm.";
    if (c.indexOf('chain') >= 0) return 'Use one ' + name + ' app on its chain this week.';
    if (c.indexOf('otc') >= 0) return "Check " + name + "'s order book and place one small order.";
    if (c.indexOf('token locker') >= 0) return 'Check the lock schedule on ' + name + ' and extend it if it lapses.';
    if (c.indexOf('btc') >= 0) return 'Add a little BTC to the ' + name + ' deposit on ' + chain + '.';
    if (c.indexOf('interest rate') >= 0) return 'Check the rate on ' + name + ' and roll the position if it matures.';
    if (c.indexOf('cedefi') >= 0) return 'Add $10 to the ' + name + ' vault or claim its yield.';
    return 'Make one qualifying action on ' + name + ', such as a deposit, a swap or a vote.';
  }
  function stepText(step) {
    var s = step.text + ' Cost: ' + step.cost + '. Time: ' + step.time + '.';
    if (s.length > 600) s = s.slice(0, 596) + '...';
    if (s.length < 20) s = s + " Hold the position and check the protocol's own page.";
    return s;
  }
  function farmSteps(p) {
    var chain = chainOf(p);
    var capital = capitalFor(p);
    var hold = holdDaysFor(p.age_days);
    var gas = gasFor(chain);
    return [
      { text: 'Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.', cost: 'under $3 of gas for the first transaction on ' + chain, time: '5 minutes' },
      { text: actionFor(p, capital, chain), cost: '$' + capital + ' of capital and ' + gas, time: '15 minutes to set up' },
      { text: weeklyFor(p, capital, chain), cost: gas + ' a week', time: '10 minutes a week' },
      { text: 'Hold the position for at least ' + hold + ' days so the activity is counted in more than one snapshot.', cost: 'the $' + capital + ' stays in the position', time: hold + ' days' },
      { text: "Before you withdraw, open the protocol's own points or rewards page and claim only from the link it publishes.", cost: 'no fee to check, and never pay to claim', time: '10 minutes' },
      { text: 'Write the wallet, the dates and every transaction in a farm log so you can repeat the position or unwind it.', cost: 'nothing but the log', time: '5 minutes' }
    ].map(stepText);
  }

  function readHash() {
    var hash = window.location.hash.replace(/^#/, '');
    if (!hash) return;
    var params = new URLSearchParams(hash);
    if (params.get('q')) state.q = params.get('q');
    if (params.get('p')) state.selected = params.get('p');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('tab')) state.tab = params.get('tab');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.tab !== 'pre-token') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    if (next) window.history.replaceState(null, '', '#' + next);
    else window.history.replaceState(null, '', window.location.pathname + window.location.search);
  }

  function rows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && !(r.chains || []).some(function (c) { return c === state.chain; })) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else if (key === 'multiple') { av = a.multiple; bv = b.multiple; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function header() {
    return el('header', { class: 'top' },
      el('div', { class: 'brand' }, el('span', { class: 'mark' }), el('span', { class: 'brand-name', text: 'Token Radar' })),
      el('div', { class: 'top-meta' },
        el('span', { text: 'Snapshot ' + DATA.as_of }),
        el('span', { text: 'DefiLlama protocol index' }),
        el('span', { text: DATA.model_version + ' model' })
      )
    );
  }

  function lede() {
    return el('section', { class: 'lede' },
      el('div', null,
        el('h1', { text: DATA.watchlist_size + ' watchlist protocols, ranked by implied value' }),
        el('p', { text: 'The watchlist is the floor: every protocol with at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record. The early radar adds ' + DATA.early_size + ' pre-token protocols the watchlist leaves out, below the floor and above it. Implied value is a model, not a promise: it is what the market already pays for a token in the same business, at the same size.' })
      ),
      el('div', { class: 'facts' },
        el('div', { class: 'fact' }, el('span', { text: 'Watchlist covered' }), el('b', { text: DATA.watchlist_size + ' / ' + DATA.watchlist_size })),
        el('div', { class: 'fact' }, el('span', { text: 'Pre-token rows scored' }), el('b', { text: String(DATA.board_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Early rows off the watchlist' }), el('b', { text: String(DATA.early_size) })),
        el('div', { class: 'fact' }, el('span', { text: 'Token protocols that calibrate the model' }), el('b', { text: String(COMPS.comps) }))
      )
    );
  }

  function spotlight() {
    var top = DATA.rows.slice(0, 5);
    return el('section', { class: 'spot', 'aria-label': 'Top five by implied value' },
      top.map(function (r) {
        return el('button', { type: 'button', class: 'spot-card', onclick: function () { openDetail(r.slug); } },
          el('span', { class: 'rank', text: '#' + r.rank }),
          el('b', { text: r.name }),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' · ' + fmtUsd(r.tvl_usd) + ' TVL' })
        );
      })
    );
  }

  function controls() {
    var categories = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var chains = Array.from(new Set(DATA.rows.flatMap(function (r) { return r.chains || []; }))).sort();
    var search = el('input', { type: 'search', id: 'q', placeholder: 'Search name, category or chain', value: state.q, 'aria-label': 'Search the board' });
    search.addEventListener('input', function () { state.q = search.value; writeHash(); render(); });
    var cat = el('select', { id: 'category', 'aria-label': 'Filter by category' },
      el('option', { value: 'all', text: 'All categories' }),
      categories.map(function (c) { return el('option', { value: c, text: c, selected: c === state.category ? 'selected' : null }); })
    );
    cat.addEventListener('change', function () { state.category = cat.value; writeHash(); render(); });
    var ch = el('select', { id: 'chain', 'aria-label': 'Filter by chain' },
      el('option', { value: 'all', text: 'All chains' }),
      chains.map(function (c) { return el('option', { value: c, text: c, selected: c === state.chain ? 'selected' : null }); })
    );
    ch.addEventListener('change', function () { state.chain = ch.value; writeHash(); render(); });
    var pre = el('button', { type: 'button', 'aria-pressed': state.tab === 'pre-token' ? 'true' : 'false', text: 'Pre-token', onclick: function () { state.tab = 'pre-token'; render(); } });
    var live = el('button', { type: 'button', 'aria-pressed': state.tab === 'live' ? 'true' : 'false', text: 'Live token', onclick: function () { state.tab = 'live'; render(); } });
    return el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { for: 'q', text: 'Search' }), search),
      el('div', { class: 'field' }, el('label', { for: 'category', text: 'Category' }), cat),
      el('div', { class: 'field' }, el('label', { for: 'chain', text: 'Chain' }), ch),
      el('div', { class: 'field' }, el('span', { class: 'sub', text: 'Token status' }), el('div', { class: 'tabs' }, pre, live)),
      el('span', { class: 'count', text: state.tab === 'pre-token' ? rows().length + ' rows shown' : DATA.live.length + ' live-token protocols' })
    );
  }

  function sortHeader(key, label) {
    return el('th', { scope: 'col' },
      el('button', { type: 'button', onclick: function () { if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; } render(); } },
        label,
        state.sort === key ? el('span', { 'aria-hidden': 'true', text: state.dir < 0 ? ' v' : ' ^' }) : null
      )
    );
  }

  function nameCell(r) {
    var badge = WATCH[r.slug] ? el('span', { class: 'badge', text: 'watchlist' }) : null;
    return el('div', { class: 'name' },
      el('div', null, el('b', { text: r.name }), badge),
      el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
    );
  }

  function boardTable() {
    var list = sortedRows(rows());
    if (list.length === 0) {
      return el('div', { class: 'panel' }, el('div', { class: 'empty' },
        el('h2', { text: 'No protocol matches that filter' }),
        el('p', { text: 'Clear the search or pick another category to see the board again.' }),
        el('button', { class: 'button primary', type: 'button', text: 'Clear filters', onclick: function () { state.q = ''; state.category = 'all'; state.chain = 'all'; writeHash(); render(); } })
      ));
    }
    var max = list[0].implied_value_usd || 1;
    var tbody = el('tbody');
    list.forEach(function (r) {
      var growth = r.change_7d === null ? 'n/a' : fmtPct(r.change_7d);
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        'data-selected': state.selected === r.slug ? 'true' : 'false',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, nameCell(r)),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: growth }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', { class: 'num', text: r.multiple.toFixed(2) + 'x' }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'status', text: 'no token' }))
      );
      tbody.appendChild(tr);
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Pre-token protocols, strongest implied value first. Select a row for its model and farm plan.' }),
          el('thead', null, el('tr', null,
            sortHeader('implied', 'Rank'),
            sortHeader('name', 'Protocol'),
            sortHeader('tvl', 'TVL'),
            sortHeader('growth', '7d'),
            sortHeader('age', 'Age'),
            sortHeader('multiple', 'Multiple'),
            sortHeader('implied', 'Implied value'),
            el('th', { scope: 'col', text: 'Token' })
          )),
          tbody
        )
      )
    );
  }

  function liveTable() {
    var tbody = el('tbody');
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', { class: 'num', text: 'live' }),
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', null, el('span', { class: 'status live', text: 'already trades' }))
      ));
    });
    return el('div', { class: 'panel' },
      el('div', { class: 'table-wrap' },
        el('table', null,
          el('caption', { class: 'sub', text: 'Token live: these protocols already trade, so their market cap is a fact, not a model. They are set aside from the pre-token ranking.' }),
          el('thead', null, el('tr', null, el('th', { scope: 'col', text: 'Status' }), el('th', { scope: 'col', text: 'Protocol' }), el('th', { scope: 'col', text: 'TVL' }), el('th', { scope: 'col', text: '7d' }), el('th', { scope: 'col', text: 'Market cap' }), el('th', { scope: 'col', text: 'Token' }))),
          tbody
        )
      )
    );
  }

  function modelPanel() {
    var m = DATA.model;
    var top = COMPS.by_category.slice(0, 12);
    var rows = top.map(function (e) {
      return el('tr', null,
        el('td', { text: e.category }),
        el('td', { class: 'num', text: String(e.comps) }),
        el('td', { class: 'num', text: e.median_multiple.toFixed(3) + 'x' }),
        el('td', { class: 'num', text: e.multiple.toFixed(3) + 'x' })
      );
    });
    return el('section', { class: 'panel model' },
      el('h2', { text: 'How implied value is computed' }),
      el('p', { class: 'sub', text: 'Every row is scored by one function of the snapshot figures. No protocol name is special-cased, and no row is hand-picked.' }),
      el('div', { class: 'formula' },
        'implied = round( tvl_usd x multiple(category) x size x growth x maturity x chains )'
      ),
      el('ul', { class: 'method' },
        el('li', { text: 'multiple(category): the median mcap/TVL of the ' + COMPS.comps + ' protocols whose token already trades, per category, winsorized to [global/4, global*4] and shrunk toward the global median ' + COMPS.global_multiple + 'x (weight n / (n + 12)), clamped to 0.02x–0.80x. A category with no comps uses the global median.' }),
        el('li', { text: 'size: (TVL / $' + Math.round(COMPS.anchor_tvl / 1e6) + 'M) ^ -0.25, clamped to 0.40–2.50. The comps fit log(mcap) = a + 0.52 x log(TVL), so the multiple falls with size at TVL^-0.48; the model uses half that slope, so no single fit drives the ranking.' }),
        el('li', { text: 'growth: 1 + clamp(change_7d, ' + m.growth_floor + ', ' + m.growth_cap + ') / 100 x ' + m.growth_weight + '. Maturity: ' + m.maturity_floor + ' + min(age_days, ' + m.maturity_days + ') / ' + m.maturity_days + ' x ' + m.maturity_range + '; an unlisted age uses the median listed age, ' + COMPS.median_age_days + ' days.' }),
        el('li', { text: 'chains: 1 + 0.02 for each extra chain, at most 1.06. The early radar is every pre-token protocol below the watchlist floor, by TVL first, then by implied value, plus every rankable protocol above the floor the watchlist leaves out; the live-token protocols are set aside with their market caps shown.' })
      ),
      el('h3', { text: 'The calibration: what the market pays, by category' }),
      el('div', { class: 'table-wrap' },
        el('table', { class: 'comps' },
          el('thead', null, el('tr', null, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Comps' }), el('th', { class: 'num', text: 'Median mcap/TVL' }), el('th', { class: 'num', text: 'Multiple used' }))),
          el('tbody', null, rows)
        )
      ),
      el('p', { class: 'sub', text: 'Showing the 12 highest multiples of ' + COMPS.by_category.length + ' calibrated categories. A flat 0.25x for everything would overvalue lenders and staking threefold and undervalue exchanges; the comps say otherwise.' })
    );
  }

  function footer() {
    return el('p', { class: 'note', text: 'Implied value is this radar\'s own claim from the snapshot of ' + DATA.as_of + ' (DefiLlama protocol index, floor $' + Math.round(DATA.floor_usd / 1e6) + 'M). "No token" means the protocol records no token in that snapshot, never that it has none. This is not investment advice, and a token may never be issued.' });
  }

  var dialog = el('dialog', { class: 'detail', id: 'detail', 'aria-labelledby': 'detail-title' });
  dialog.addEventListener('close', function () { state.selected = null; writeHash(); });

  function whyText(row, calc) {
    var entry = null;
    for (var i = 0; i < COMPS.by_category.length; i++) {
      if (COMPS.by_category[i].category === (row.category || 'Other')) entry = COMPS.by_category[i];
    }
    var cat = entry ? (row.category || 'Other') + ' tokens trade at a median ' + entry.median_multiple.toFixed(3) + 'x TVL on ' + entry.comps + ' comparable' + (entry.comps === 1 ? '' : 's') + (entry.median_multiple > COMPS.global_multiple * 4 || entry.median_multiple < COMPS.global_multiple / 4 ? ', winsorized and shrunk to ' : ', shrunk to ') + calc.multiple.toFixed(3) + 'x' : (row.category || 'Other') + ' has no comparable with a token, so it uses the global median ' + COMPS.global_multiple + 'x';
    var size = calc.size > 1 ? 'its ' + fmtUsd(row.tvl_usd) + ' TVL is below the comps\' median of ' + fmtUsd(COMPS.anchor_tvl) + ', so the size tilt lifts it to ' + calc.size.toFixed(2) + 'x' : calc.size < 1 ? 'its ' + fmtUsd(row.tvl_usd) + ' TVL is above the comps\' median of ' + fmtUsd(COMPS.anchor_tvl) + ', so the size tilt cuts it to ' + calc.size.toFixed(2) + 'x' : 'its TVL sits at the comps\' median, so the size tilt is 1.00x';
    return 'Why this ranks here: ' + cat + '; ' + size + '; seven-day growth ' + fmtPct(row.change_7d) + ' gives a ' + calc.growthMult.toFixed(2) + 'x growth multiplier, and ' + fmtAge(row.age_days) + ' with no token gives a ' + calc.maturity.toFixed(2) + 'x maturity multiplier.';
  }

  function openDetail(slug) {
    var row = DATA.rows.filter(function (r) { return r.slug === slug; })[0];
    if (!row) return;
    state.selected = slug;
    writeHash();
    dialog.textContent = '';
    var calc = impliedOf(row, DATA.model);
    var steps = farmSteps(row);
    dialog.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'brand-name', text: 'Rank ' + row.rank + ' of ' + DATA.board_size + (WATCH[row.slug] ? ' · watchlist' : ' · early radar') }),
        el('h2', { id: 'detail-title', text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + (row.chains && row.chains.length ? row.chains.join(', ') : 'an unnamed chain') })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: function () { dialog.close(); } })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Implied value' }),
      el('div', { class: 'equation' },
        el('div', null, el('span', { text: 'TVL' }), el('b', { class: 'num', text: fmtUsd(row.tvl_usd) })),
        el('div', null, el('span', { text: 'Category multiple' }), el('b', { class: 'num', text: calc.multiple.toFixed(3) + 'x' })),
        el('div', null, el('span', { text: 'Size factor' }), el('b', { class: 'num', text: calc.size.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Seven-day growth' }), el('b', { class: 'num', text: fmtPct(row.change_7d) })),
        el('div', null, el('span', { text: 'Growth multiplier' }), el('b', { class: 'num', text: calc.growthMult.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Age with no token' }), el('b', { class: 'num', text: fmtAge(row.age_days) })),
        el('div', null, el('span', { text: 'Maturity multiplier' }), el('b', { class: 'num', text: calc.maturity.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Chain multiplier' }), el('b', { class: 'num', text: calc.chainMult.toFixed(2) + 'x' })),
        el('div', null, el('span', { text: 'Implied value' }), el('b', { class: 'num', text: fmtUsd(row.implied_value_usd) }))
      ),
      el('p', { class: 'why', text: whyText(row, calc) }),
      el('p', { class: 'sub', text: 'Model ' + DATA.model_version + ': the same function scores every protocol. The page recomputes this row as ' + fmtUsd(calc.implied) + (calc.implied === row.implied_value_usd ? ', the same number board.json carries.' : ', which differs from the board: the data would be stale.') + ' This is an estimate, not a price.' })
    ));
    dialog.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (typeof dialog.showModal === 'function') {
      if (!dialog.open) dialog.showModal();
    } else {
      dialog.setAttribute('open', '');
    }
  }

  function render() {
    app.textContent = '';
    var shell = el('div', { class: 'shell' });
    shell.appendChild(header());
    shell.appendChild(lede());
    shell.appendChild(spotlight());
    shell.appendChild(controls());
    shell.appendChild(state.tab === 'pre-token' ? boardTable() : liveTable());
    if (state.tab === 'pre-token') shell.appendChild(modelPanel());
    shell.appendChild(footer());
    app.appendChild(shell);
    app.setAttribute('aria-busy', 'false');
    if (!dialog.isConnected) app.appendChild(dialog);
    if (state.selected) openDetail(state.selected);
  }

  readHash();
  render();
  window.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && dialog.open) dialog.close();
  });
})();
