# Financial Analysis & Modeling

Last reviewed: 2026-06-26

Libraries, data sources, and modeling patterns for quantitative finance, portfolio
analysis, algorithmic strategy testing, and financial data pipelines.

---

## Market data sources

| Source | Cost | Notes |
|---|---|---|
| **yfinance** | Free | Yahoo Finance; OHLCV, fundamentals, options, crypto; easiest start |
| **pandas-datareader** | Free | FRED, Quandl, Stooq, World Bank via unified interface |
| **FRED API** | Free | Federal Reserve Economic Data; macroeconomic time series; no key required for basic |
| **OpenBB** | Free (OSS) | Open-source "Bloomberg terminal" — data, charting, research; https://openbb.co |
| **Alpha Vantage** | Free tier | Fundamental data, forex, crypto, indicators; 25 req/day free |
| **Polygon.io** | Free tier | Real-time + historical equities, options, forex; better data quality than yfinance |

```python
import yfinance as yf
df = yf.download("AAPL", start="2020-01-01", end="2024-01-01")

import pandas_datareader.data as web
gdp = web.DataReader("GDP", "fred", "2000-01-01")
```

---

## Core analysis libraries

### QuantLib
https://www.quantlib.org / https://github.com/lballabio/quantlib

Industry-standard library for pricing derivatives, building yield curves, and modeling
interest rates. Python bindings via `QuantLib-Python`. Use for: bond pricing, options
valuation, swap curves, risk measures.

### numpy-financial
https://github.com/numpy/numpy-financial

Time-value-of-money functions (NPV, IRR, PMT, FV, PV). Extracted from numpy.
Lightweight; use for DCF, loan calculations, and basic financial math.

### statsmodels
https://www.statsmodels.org

Econometrics: OLS/GLS regression, ARIMA/SARIMA, VAR, cointegration tests, GARCH.
Use for: factor model estimation, time-series forecasting, event studies.

### PyPortfolioOpt
https://github.com/robertmartin8/PyPortfolioOpt

Mean-variance optimization, Black-Litterman, risk parity, efficient frontier.
Built on `cvxpy`. Use for portfolio construction and rebalancing.

### empyrical
https://github.com/quantopian/empyrical

Performance and risk metrics: Sharpe, Sortino, Calmar, max drawdown, alpha/beta,
rolling statistics. Pairs with pyfolio; use for strategy evaluation.

### pyfolio
https://github.com/quantopian/pyfolio

Portfolio and risk analytics with tear-sheet reports. Works with Zipline returns.
Good for visualizing backtest performance.

---

## Backtesting frameworks

### backtrader
https://www.backtrader.com

Event-driven backtesting with live trading support. Good documentation; flexible
data feeds; supports multiple assets, timeframes, and indicators.

### zipline-reloaded
https://github.com/stefan-jansen/zipline-reloaded

Community-maintained fork of Quantopian's zipline. Integrates with pyfolio and
alphalens. More opinionated than backtrader; good for systematic equity strategies.

### vectorbt
https://github.com/polakowo/vectorbt

Vectorized (numpy/pandas) backtesting — much faster than event-driven for parameter
sweeps. Use when you need to test thousands of strategy variants.

---

## Modeling patterns

### DCF (Discounted Cash Flow)

Use `numpy-financial.npv()` for basic DCF. Build explicit DCF models in pandas:
project cash flows, apply a WACC, sum the PV. Reference: Damodaran's valuation framework.

### Monte Carlo simulation

Use `numpy` random sampling for path simulation (equities, derivatives, risk). Key:
define the stochastic process (GBM, mean-reversion, jump-diffusion), simulate N paths,
compute statistics over terminal values.

```python
import numpy as np
S0, mu, sigma, T, N, paths = 100, 0.07, 0.2, 1, 252, 10_000
dt = T / N
returns = np.random.normal((mu - 0.5*sigma**2)*dt, sigma*np.sqrt(dt), (paths, N))
price_paths = S0 * np.exp(np.cumsum(returns, axis=1))
```

### Factor models

Fama-French 3/5-factor data available free from Ken French's data library
(via `pandas-datareader`). Use `statsmodels` OLS for factor regression.

### Options pricing

Black-Scholes in `numpy`; full Greeks and exotics via `QuantLib`.
`mibian` is a lightweight pure-Python Black-Scholes calculator.

---

## References

- Damodaran on Valuation: https://pages.stern.nyu.edu/~adamodar/
- Quantitative Finance resources: https://github.com/wilsonfreitas/awesome-quant
- FRED (macro data): https://fred.stlouisfed.org
