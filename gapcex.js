const ccxt = require('ccxt');
const { initLip, Lipgloss } = require('charsm');

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

const EXCHANGES = ccxt.exchanges;

const withTimeout = (promise, ms) => Promise.race([
    promise,
    new Promise((_, reject) => setTimeout(() => reject(), ms))
]);

async function main() {
    // Initialize charsm
    const isInit = await initLip();
    if (!isInit) {
        console.error('Failed to initialize charsm');
        return;
    }
    const lip = new Lipgloss();

    // Create styles
    lip.createStyle({
        id: 'header',
        canvasColor: { color: '#7D56F4' },
        border: { type: 'rounded', foreground: '#7D56F4', sides: [true] },
        padding: [0, 2, 0, 2],
        margin: [1, 0, 1, 0],
        bold: true,
    });

    lip.createStyle({
        id: 'stats',
        canvasColor: { color: '#FAFAFA' },
        padding: [0, 1, 0, 1],
        margin: [0, 0, 1, 0],
    });

    lip.createStyle({
        id: 'success',
        canvasColor: { color: '#00FF00' },
        bold: true,
    });

    lip.createStyle({
        id: 'top10',
        canvasColor: { color: '#FFD700' },
        border: { type: 'rounded', foreground: '#FFD700', sides: [true] },
        padding: [1, 2, 1, 2],
        margin: [1, 0, 0, 0],
    });

    const start = Date.now();
    const totalRequests = TOP_COINS.length * EXCHANGES.length;

    // Compact header with stats
    const date = new Date().toLocaleString();
    const headerParams = {
        value: `GapCex - CEX Arbitrage Scanner  |  ${date}  |  Coins: ${TOP_COINS.length}  |  Exchanges: ${EXCHANGES.length}`,
        id: 'header'
    };
    const header = lip.apply(headerParams);
    console.log(header);

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
        process.stdout.write(`\rProgress: ${pct}% (${completed}/${totalRequests}) | Found: ${found} prices | ${elapsed}s`);
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

    // Calculate arbitrage
    const opportunities = TOP_COINS
        .map(coin => {
            const prices = allPrices[coin].sort((a, b) => a.price - b.price);
            if (prices.length < 2) return null;
            const [low, high] = [prices[0], prices[prices.length - 1]];
            return { coin, low, high, spreadPct: ((high.price - low.price) / low.price) * 100, count: prices.length };
        })
        .filter(Boolean)
        .filter(o => o.spreadPct > 1) // Only show spreads > 1%
        .sort((a, b) => b.spreadPct - a.spreadPct);
    const elapsed = ((Date.now() - start) / 1000).toFixed(1);
    const summaryText = `Found ${opportunities.length} coins with arbitrage (>1% spread) in ${elapsed}s  |  Fetched ${results.length} prices from ${new Set(results.map(r => r.exchange)).size} exchanges`;

    // Clear progress line
    process.stdout.write('\r' + ' '.repeat(80) + '\r');

    // Create table for results with $100 profit simulation
    const INVESTMENT = 100;
    const rows = opportunities.map(o => {
        const fmt = p => p < 0.0001 ? p.toFixed(10) : p < 0.01 ? p.toFixed(8) : p < 1 ? p.toFixed(6) : p.toLocaleString();
        const margin = (INVESTMENT + (INVESTMENT * o.spreadPct / 100)).toFixed(2);
        return [
            o.coin,
            o.low.exchange,
            `$${fmt(o.low.price)}`,
            o.high.exchange,
            `$${fmt(o.high.price)}`,
            `${o.spreadPct.toFixed(2)}%`,
            `$100->$${margin}`,
            o.count.toString()
        ];
    });

    const table = lip.newTable({
        data: {
            headers: ['Coin', 'Buy From', 'Buy Price', 'Sell To', 'Sell Price', 'Spread', '$100 Margin', '#'],
            rows: rows
        },
        table: { border: 'rounded', color: '99', width: 120 },
        header: { color: '212', bold: true },
        rows: { even: { color: '246' } }
    });
    console.log(table);

    if (opportunities.length > 0) {
        // Color styles for different spread levels
        lip.createStyle({ id: 'high', canvasColor: { color: '#00FF00' }, bold: true }); // Green >20%
        lip.createStyle({ id: 'medium', canvasColor: { color: '#FFD700' }, bold: true }); // Yellow 5-20%
        lip.createStyle({ id: 'low', canvasColor: { color: '#00BFFF' } }); // Cyan <5%

        // Top 20 in 2 columns (left 1-10, right 11-20)
        const top20 = opportunities.slice(0, 20);
        const leftCol = top20.slice(0, 10);
        const rightCol = top20.slice(10, 20);

        const formatLine = (o, i) => {
            const line = `${(i + 1).toString().padStart(2)}. ${o.coin.padEnd(6)} ${o.spreadPct.toFixed(2).padStart(7)}% ${o.low.exchange.padEnd(10)}->${o.high.exchange}`;
            let styleId;
            if (o.spreadPct >= 20) styleId = 'high';
            else if (o.spreadPct >= 5) styleId = 'medium';
            else styleId = 'low';
            return lip.apply({ value: line, id: styleId });
        };

        const leftLines = leftCol.map((o, i) => formatLine(o, i)).join('\n');
        const rightLines = rightCol.map((o, i) => formatLine(o, i + 10)).join('\n');

        lip.createStyle({
            id: 'topbox',
            border: { type: 'rounded', foreground: '#FFD700', sides: [true] },
            padding: [1, 2, 1, 2],
            margin: [1, 0, 0, 0],
        });

        const leftBox = lip.apply({ value: `Top 20 Arbitrage\n\n${leftLines}`, id: 'topbox' });
        const rightBox = lip.apply({ value: `Opportunities\n\n${rightLines}`, id: 'topbox' });

        const combined = lip.join({ direction: 'horizontal', elements: [leftBox, rightBox], position: 'top' });
        console.log(combined);
    }

    // Print summary at the very bottom
    lip.createStyle({ id: 'summary', canvasColor: { color: '#00FF00' }, bold: true, margin: [1, 0, 1, 0] });
    console.log(lip.apply({ value: summaryText, id: 'summary' }));
}

main();
