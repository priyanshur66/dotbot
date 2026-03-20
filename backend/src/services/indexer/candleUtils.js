const INTERVAL_TO_MS = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000,
  "1d": 24 * 60 * 60_000,
};

function toBigInt(value) {
  try {
    return BigInt(value || 0);
  } catch (_error) {
    return 0n;
  }
}

function eventToPoint(event) {
  if (event.eventType === "LiquidityInitialized") {
    return {
      timestamp: Number(event.blockTimestamp) * 1000,
      price: toBigInt(event.priceQuoteE18),
      volumeToken: 0n,
      volumeQuote: 0n,
      isTrade: false,
    };
  }

  if (event.eventType !== "SwapExecuted") {
    return null;
  }

  const isBuy = event.side === "buy";
  return {
    timestamp: Number(event.blockTimestamp) * 1000,
    price: toBigInt(event.priceQuoteE18),
    volumeToken: isBuy ? toBigInt(event.amountOut) : toBigInt(event.amountIn),
    volumeQuote: isBuy ? toBigInt(event.amountIn) : toBigInt(event.amountOut),
    isTrade: true,
  };
}

function buildCandles(events, interval) {
  const bucketMs = INTERVAL_TO_MS[interval];
  if (!bucketMs) {
    return [];
  }

  const candles = new Map();
  for (const event of events) {
    const point = eventToPoint(event);
    if (!point || point.price <= 0n) {
      continue;
    }

    const bucketStart = Math.floor(point.timestamp / bucketMs) * bucketMs;
    const existing = candles.get(bucketStart);

    if (!existing) {
      candles.set(bucketStart, {
        bucketStart,
        open: point.price,
        high: point.price,
        low: point.price,
        close: point.price,
        volumeToken: point.volumeToken,
        volumeQuote: point.volumeQuote,
        tradeCount: point.isTrade ? 1 : 0,
      });
      continue;
    }

    if (point.price > existing.high) {
      existing.high = point.price;
    }
    if (point.price < existing.low) {
      existing.low = point.price;
    }
    existing.close = point.price;
    existing.volumeToken += point.volumeToken;
    existing.volumeQuote += point.volumeQuote;
    if (point.isTrade) {
      existing.tradeCount += 1;
    }
  }

  return Array.from(candles.values())
    .sort((left, right) => left.bucketStart - right.bucketStart)
    .map((candle) => ({
      bucketStart: candle.bucketStart,
      open: candle.open.toString(),
      high: candle.high.toString(),
      low: candle.low.toString(),
      close: candle.close.toString(),
      volumeToken: candle.volumeToken.toString(),
      volumeQuote: candle.volumeQuote.toString(),
      tradeCount: candle.tradeCount,
    }));
}

function buildStats(events) {
  let latestPrice = 0n;
  let reserveToken = 0n;
  let reserveQuote = 0n;
  let totalVolumeQuote = 0n;
  let volume24hQuote = 0n;
  let lastTradeAt = null;
  let tradeCount = 0;
  const cutoffMs = Date.now() - 24 * 60 * 60 * 1000;

  for (const event of events) {
    if (event.priceQuoteE18) {
      latestPrice = toBigInt(event.priceQuoteE18);
    }
    if (event.reserveTokenAfter) {
      reserveToken = toBigInt(event.reserveTokenAfter);
    }
    if (event.reserveUsdtAfter) {
      reserveQuote = toBigInt(event.reserveUsdtAfter);
    }
    if (event.eventType === "SwapExecuted") {
      tradeCount += 1;
      lastTradeAt = Number(event.blockTimestamp) * 1000;
      const isBuy = event.side === "buy";
      const volumeQuote = isBuy ? toBigInt(event.amountIn) : toBigInt(event.amountOut);
      totalVolumeQuote += volumeQuote;
      if (lastTradeAt >= cutoffMs) {
        volume24hQuote += volumeQuote;
      }
    }
  }

  return {
    latestPrice: latestPrice.toString(),
    liquidityQuote: (reserveQuote * 2n).toString(),
    reserveToken: reserveToken.toString(),
    reserveQuote: reserveQuote.toString(),
    totalVolumeQuote: totalVolumeQuote.toString(),
    volume24hQuote: volume24hQuote.toString(),
    lastTradeAt,
    tradeCount,
  };
}

module.exports = {
  INTERVAL_TO_MS,
  buildCandles,
  buildStats,
};
