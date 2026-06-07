import type { InternalBacktestBar } from './types';

type SeriesMap = Map<string, Array<number | null>>;

type IndicatorRecord = Record<string, unknown>;

function numberFrom(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function integerFrom(value: unknown): number | null {
  const parsed = numberFrom(value);
  if (parsed === null || !Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function sourceValue(bar: InternalBacktestBar, source: string): number | null {
  switch (source) {
    case 'open':
      return bar.open;
    case 'high':
      return bar.high;
    case 'low':
      return bar.low;
    case 'volume':
      return bar.volume;
    case 'close':
    default:
      return bar.close;
  }
}

function sma(values: Array<number | null>, length: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  let sum = 0;
  let count = 0;
  const queue: number[] = [];
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) {
      queue.push(Number.NaN);
    } else {
      queue.push(value);
      sum += value;
      count += 1;
    }
    if (queue.length > length) {
      const removed = queue.shift();
      if (removed !== undefined && Number.isFinite(removed)) {
        sum -= removed;
        count -= 1;
      }
    }
    if (queue.length === length && count === length) {
      result[index] = sum / length;
    }
  }
  return result;
}

function ema(values: Array<number | null>, length: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  const alpha = 2 / (length + 1);
  let seedSum = 0;
  let seedCount = 0;
  let previous: number | null = null;
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (value === null) continue;
    if (previous === null) {
      seedSum += value;
      seedCount += 1;
      if (seedCount === length) {
        previous = seedSum / length;
        result[index] = previous;
      }
      continue;
    }
    previous = value * alpha + previous * (1 - alpha);
    result[index] = previous;
  }
  return result;
}

function rsi(values: Array<number | null>, length: number): Array<number | null> {
  const result = Array<number | null>(values.length).fill(null);
  let averageGain: number | null = null;
  let averageLoss: number | null = null;
  let seedGain = 0;
  let seedLoss = 0;
  let seedCount = 0;
  for (let index = 1; index < values.length; index += 1) {
    const current = values[index];
    const previous = values[index - 1];
    if (current === null || previous === null) continue;
    const change = current - previous;
    const gain = Math.max(change, 0);
    const loss = Math.max(-change, 0);
    if (averageGain === null || averageLoss === null) {
      seedGain += gain;
      seedLoss += loss;
      seedCount += 1;
      if (seedCount === length) {
        averageGain = seedGain / length;
        averageLoss = seedLoss / length;
      }
    } else {
      averageGain = (averageGain * (length - 1) + gain) / length;
      averageLoss = (averageLoss * (length - 1) + loss) / length;
    }
    if (averageGain !== null && averageLoss !== null) {
      result[index] = averageLoss === 0 ? 100 : 100 - 100 / (1 + averageGain / averageLoss);
    }
  }
  return result;
}

function atr(bars: InternalBacktestBar[], length: number): Array<number | null> {
  const trueRanges = bars.map((bar, index) => {
    if (index === 0) return bar.high - bar.low;
    const previousClose = bars[index - 1].close;
    return Math.max(bar.high - bar.low, Math.abs(bar.high - previousClose), Math.abs(bar.low - previousClose));
  });
  const result = Array<number | null>(bars.length).fill(null);
  let previous: number | null = null;
  for (let index = 0; index < trueRanges.length; index += 1) {
    if (index === length - 1) {
      previous = trueRanges.slice(0, length).reduce((sum, value) => sum + value, 0) / length;
      result[index] = previous;
      continue;
    }
    if (index >= length && previous !== null) {
      previous = (previous * (length - 1) + trueRanges[index]) / length;
      result[index] = previous;
    }
  }
  return result;
}

function macd(values: Array<number | null>, fastLength: number, slowLength: number, signalLength: number) {
  const fast = ema(values, fastLength);
  const slow = ema(values, slowLength);
  const line = values.map((_, index) => {
    const fastValue = fast[index];
    const slowValue = slow[index];
    return fastValue === null || slowValue === null ? null : fastValue - slowValue;
  });
  const signal = ema(line, signalLength);
  const histogram = values.map((_, index) => {
    const lineValue = line[index];
    const signalValue = signal[index];
    return lineValue === null || signalValue === null ? null : lineValue - signalValue;
  });
  return { line, signal, histogram };
}

export function buildIndicatorSeries(indicators: IndicatorRecord[], bars: InternalBacktestBar[]): SeriesMap {
  const result: SeriesMap = new Map();
  const closes = bars.map((bar) => bar.close);
  for (const indicator of indicators) {
    const id = typeof indicator.id === 'string' ? indicator.id : null;
    const type = typeof indicator.type === 'string' ? indicator.type.toUpperCase() : null;
    if (!id || !type) continue;
    const source = typeof indicator.source === 'string' ? indicator.source : type === 'VOLUME_SMA' ? 'volume' : 'close';
    const sourceValues = bars.map((bar) => sourceValue(bar, source));
    if (type === 'SMA' || type === 'VOLUME_SMA') {
      const length = integerFrom(indicator.length);
      if (length) result.set(id, sma(sourceValues, length));
      continue;
    }
    if (type === 'EMA') {
      const length = integerFrom(indicator.length);
      if (length) result.set(id, ema(sourceValues, length));
      continue;
    }
    if (type === 'RSI') {
      const length = integerFrom(indicator.length) ?? 14;
      result.set(id, rsi(sourceValues, length));
      continue;
    }
    if (type === 'ATR') {
      const length = integerFrom(indicator.length) ?? 14;
      result.set(id, atr(bars, length));
      continue;
    }
    if (type === 'MACD') {
      const fast = integerFrom(indicator.fast) ?? 12;
      const slow = integerFrom(indicator.slow) ?? 26;
      const signal = integerFrom(indicator.signal) ?? 9;
      const macdSeries = macd(closes, fast, slow, signal);
      result.set(id, macdSeries.histogram);
      result.set(`${id}.histogram`, macdSeries.histogram);
      result.set(`${id}.macd`, macdSeries.line);
      result.set(`${id}.signal`, macdSeries.signal);
    }
  }
  return result;
}

export function readNumericSeriesValue(series: SeriesMap, id: string, index: number): number | null {
  return series.get(id)?.[index] ?? null;
}
