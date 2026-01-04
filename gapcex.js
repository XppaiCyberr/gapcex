const ccxt = require('ccxt');

const TIMEOUT_MS = 4000;

// Top 100 coins by market cap from CoinMarketCap (Jan 2026) - excluding stablecoins
const TOP_COINS = [
    'BTC', 'ETH', 'XRP', 'BNB', 'SOL', 'TRX', 'DOGE', 'ADA', 'BCH', 'LINK',
    'HYPE', 'ZEC', 'LEO', 'XMR', 'XLM', 'SUI', 'LTC', 'AVAX', 'CC', 'HBAR',
    'SHIB', 'WLFI', 'TON', 'CRO', 'UNI', 'DOT', 'MNT', 'PEPE', 'TAO', 'AAVE',
    'BGB', 'OKB', 'NEAR', 'ETC', 'M', 'ASTER', 'ENA', 'XAUt', 'PI', 'ICP',
    'PAXG', 'WLD', 'NIGHT', 'MYX', 'KCS', 'SKY', 'APT', 'ONDO', 'KAS', 'POL',
    'ARB', 'ALGO', 'ATOM', 'FIL', 'TRUMP', 'BONK', 'VET', 'XDC', 'QNT', 'RENDER',
    'FLR', 'GT', 'PUMP', 'SEI', 'PENGU', 'IP', 'CAKE', 'JUP', 'LIT', 'CRV',
    'OP', 'NEXO', 'STX', 'XTZ', 'SPX', 'FET', 'VIRTUAL', 'IMX', 'FLOKI', 'DASH',
    'LDO', 'AERO', 'ETHFI', 'INJ', 'PIPPIN', 'TIA', 'CHZ', '2Z', 'STRK'
];

// Use ALL ccxt exchanges
const EXCHANGES = ccxt.exchanges;

const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(), ms))
]);

async function main() {
    const start = Date.now();
    const totalRequests = TOP_COINS.length * EXCHANGES.length;

    console.log(`\n🔍 GapCex - CEX Arbitrage Scanner`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
    console.log(`📊 Coins: ${TOP_COINS.length} | 🏦 Exchanges: ${EXCHANGES.length} | 📡 Requests: ${totalRequests}\n`);

    const allPrices = {};
    TOP_COINS.forEach(c => allPrices[c] = []);

    // Create exchange instances
    const instances = {};
    for (const id of EXCHANGES) {
        try {
            instances[id] = new ccxt[id]({ enableRateLimit: true, timeout: TIMEOUT_MS });
        } catch { }
    }

    // Progress tracking
    let completed = 0;
    let found = 0;
    const updateProgress = () => {
        const pct = ((completed / totalRequests) * 100).toFixed(1);
        const elapsed = ((Date.now() - start) / 1000).toFixed(1);
        process.stdout.write(`\r⏳ Progress: ${pct}% (${completed}/${totalRequests}) | ✅ Found: ${found} prices | ⏱️ ${elapsed}s`);
    };

    // Fetch all prices in parallel with progress
    const promises = [];
    for (const coin of TOP_COINS) {
        for (const [id, exchange] of Object.entries(instances)) {
            promises.push((async () => {
                try {
                    const ticker = await withTimeout(exchange.fetchTicker(`${coin}/USDT`), TIMEOUT_MS);
                    if (ticker?.last) {
                        found++;
                        updateProgress();
                        return { exchange: id, coin, price: ticker.last };
                    }
                } catch { }
                completed++;
                if (completed % 100 === 0) updateProgress();
                return null;
            })());
        }
    }

    const results = (await Promise.allSettled(promises))
        .filter(r => r.status === 'fulfilled' && r.value)
        .map(r => r.value);

    results.forEach(r => allPrices[r.coin].push(r));

    // Clear progress line
    process.stdout.write('\r' + ' '.repeat(80) + '\r');
    console.log(`✅ Fetched ${results.length} prices from ${new Set(results.map(r => r.exchange)).size} exchanges\n`);

    // Calculate arbitrage
    const opportunities = TOP_COINS
        .map(coin => {
            const prices = allPrices[coin].sort((a, b) => a.price - b.price);
            if (prices.length < 2) return null;
            const [low, high] = [prices[0], prices[prices.length - 1]];
            return { coin, low, high, spreadPct: ((high.price - low.price) / low.price) * 100, count: prices.length };
        })
        .filter(Boolean)
        .sort((a, b) => b.spreadPct - a.spreadPct);

    console.log('Coin     | Buy From        | Price         | Sell To         | Price         | Spread  | #');
    console.log('━'.repeat(105));

    opportunities.forEach(o => {
        const fmt = p => p < 0.0001 ? p.toFixed(10) : p < 0.01 ? p.toFixed(8) : p < 1 ? p.toFixed(6) : p.toLocaleString();
        console.log(
            `${o.coin.padEnd(8)} | ${o.low.exchange.padEnd(15)} | $${fmt(o.low.price).padEnd(12)} | ` +
            `${o.high.exchange.padEnd(15)} | $${fmt(o.high.price).padEnd(12)} | ${o.spreadPct.toFixed(2).padStart(6)}% | ${o.count}`
        );
    });

    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    console.log(`\n✅ Found ${opportunities.length} coins with arbitrage opportunities in ${elapsed}s`);

    if (opportunities.length > 0) {
        console.log(`\n🔥 Top 10 Arbitrage Opportunities:`);
        opportunities.slice(0, 10).forEach((o, i) => {
            console.log(`   ${(i + 1).toString().padStart(2)}. ${o.coin.padEnd(8)} ${o.spreadPct.toFixed(2).padStart(6)}% (${o.low.exchange} → ${o.high.exchange})`);
        });
    }
}

main();
