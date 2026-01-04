# GapCex

CEX arbitrage scanner utilizing ccxt to find price gaps and check arbitrage opportunities across 100+ crypto exchanges.

## Features

- Scans 89 top coins by market cap
- Checks 111+ centralized exchanges
- Fast parallel fetching (~4-5 seconds)
- Real-time progress display
- Shows arbitrage opportunities sorted by spread %

## Installation

```bash
pnpm install
```

## Usage

```bash
pnpm start
```

## Sample Output

```
GapCex - CEX Arbitrage Scanner
Coins: 89 | Exchanges: 111 | Requests: 9879

Progress: 93.1% (9200/9879) | Found: 182 prices | 4.4s

Top 10 Arbitrage Opportunities:
    1. TON      279.77% (arkham -> bitteam)
    2. DOGE      69.48% (bequant -> arkham)
    3. LTC       54.00% (bitteam -> hitbtc)
```

## Dependencies

- [ccxt](https://github.com/ccxt/ccxt) - CryptoCurrency eXchange Trading Library

## Disclaimer

This tool is for informational purposes only. High spread percentages may indicate low liquidity, data errors, or different token versions. Always verify manually before trading.

## License

ISC
