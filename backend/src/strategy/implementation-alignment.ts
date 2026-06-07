import { isNormalizedStrategySpec, type NormalizedStrategySpec } from './normalized-spec';

type AlignmentArea = 'indicator' | 'entry' | 'exit' | 'risk' | 'filter';
type AlignmentSeverity = 'warning' | 'error';
type AlignmentStatus = 'ok' | 'warning' | 'mismatch' | 'unavailable';

type SemanticItem = {
  key: string;
  area: AlignmentArea;
  label: string;
  text: string;
};

type PineSemanticSummary = {
  items: SemanticItem[];
  warnings: string[];
  assumptions: string[];
};

export type StrategyImplementationAlignmentReport = {
  schema_name: 'strategy_implementation_alignment';
  schema_version: '1.0';
  strategy_version_id: string;
  status: AlignmentStatus;
  summary: {
    matched_count: number;
    mismatch_count: number;
    missing_in_pine_count: number;
    missing_in_spec_count: number;
  };
  matched: Array<{
    area: AlignmentArea;
    label: string;
    spec: string;
    pine: string;
  }>;
  mismatches: Array<{
    area: AlignmentArea;
    severity: AlignmentSeverity;
    label: string;
    spec: string;
    pine: string;
    message: string;
  }>;
  missing_in_pine: Array<{
    area: AlignmentArea;
    severity: AlignmentSeverity;
    label: string;
    spec: string;
  }>;
  missing_in_spec: Array<{
    area: AlignmentArea;
    severity: AlignmentSeverity;
    label: string;
    pine: string;
  }>;
  warnings: string[];
  assumptions: string[];
  reason?: string;
};

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function recordArray(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((item): item is Record<string, unknown> => Boolean(asRecord(item))) : [];
}

function text(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

function numberText(value: unknown): string {
  if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value.trim());
    if (Number.isFinite(parsed)) return String(parsed);
  }
  return '';
}

function indicatorId(type: string, record: Record<string, unknown>): string {
  const id = text(record.id);
  if (id) return id.toLowerCase();
  if (type === 'MACD') {
    return `macd_${numberText(record.fast) || '12'}_${numberText(record.slow) || '26'}_${numberText(record.signal) || '9'}`;
  }
  const length = numberText(record.length);
  return length ? `${type.toLowerCase()}_${length}` : type.toLowerCase();
}

function normalizeIndicatorType(type: unknown): string {
  const raw = text(type).toUpperCase();
  if (raw === 'VOLUME_SMA' || raw === 'VOLUMESMA') return 'VOLUME_SMA';
  return raw;
}

function item(key: string, area: AlignmentArea, label: string, value: string): SemanticItem {
  return { key, area, label, text: value };
}

function uniqueItems(items: SemanticItem[]): SemanticItem[] {
  const seen = new Set<string>();
  return items.filter((candidate) => {
    if (seen.has(candidate.key)) return false;
    seen.add(candidate.key);
    return true;
  });
}

function semanticConditionToken(area: AlignmentArea, condition: Record<string, unknown>): SemanticItem | null {
  const indicator = text(condition.indicator).toLowerCase();
  const operator = text(condition.operator);
  const left = text(condition.left).toLowerCase();
  const value = numberText(condition.value);
  const rightRecord = asRecord(condition.right);
  const rightIndicator = rightRecord ? text(rightRecord.indicator).toLowerCase() : '';
  const rightMultiplier = rightRecord ? numberText(rightRecord.multiplier) : '';
  const multiplier = numberText(condition.multiplier);
  const type = text(condition.type).toLowerCase();
  const bars = numberText(condition.bars);

  if (type === 'time_exit' && bars) {
    return item(`exit:time_exit:${bars}`, 'exit', `time exit ${bars}`, `time_exit bars ${bars}`);
  }
  if (indicator && ['>', '>=', '<', '<='].includes(operator) && value) {
    return item(`${area}:${indicator}:${operator}:${value}`, area, `${indicator} ${operator} ${value}`, `${indicator} ${operator} ${value}`);
  }
  if (indicator && ['crosses_above', 'crosses_below'].includes(operator) && value) {
    return item(`${area}:${indicator}:${operator}:${value}`, area, `${indicator} ${operator} ${value}`, `${indicator} ${operator} ${value}`);
  }
  if (left === 'close' && indicator && ['>', '>=', '<', '<='].includes(operator)) {
    return item(`${area}:close:${operator}:${indicator}`, area, `close ${operator} ${indicator}`, `close ${operator} ${indicator}`);
  }
  if (type.includes('price_vs_indicator') && indicator && ['>', '>=', '<', '<='].includes(operator)) {
    return item(`${area}:close:${operator}:${indicator}`, area, `close ${operator} ${indicator}`, `close ${operator} ${indicator}`);
  }
  if (type.includes('volume') && indicator && ['>', '>=', '<', '<='].includes(operator)) {
    const ratio = multiplier || '1';
    return item(`filter:volume:${operator}:${indicator}:x${ratio}`, 'filter', `volume ${operator} ${indicator} * ${ratio}`, `volume ${operator} ${indicator} * ${ratio}`);
  }
  if (left === 'volume' && rightIndicator && ['>', '>=', '<', '<='].includes(operator)) {
    const ratio = rightMultiplier || multiplier || '1';
    return item(`filter:volume:${operator}:${rightIndicator}:x${ratio}`, 'filter', `volume ${operator} ${rightIndicator} * ${ratio}`, `volume ${operator} ${rightIndicator} * ${ratio}`);
  }
  return null;
}

function specSemanticItems(spec: NormalizedStrategySpec): SemanticItem[] {
  const items: SemanticItem[] = [];
  for (const indicator of spec.indicators) {
    const record = asRecord(indicator);
    if (!record) continue;
    const type = normalizeIndicatorType(record.type);
    if (!type) continue;
    const id = indicatorId(type, record);
    const length = numberText(record.length);
    const label = type === 'MACD'
      ? `MACD ${numberText(record.fast) || '12'}-${numberText(record.slow) || '26'}-${numberText(record.signal) || '9'}`
      : `${type} ${length || id}`;
    items.push(item(`indicator:${id}`, 'indicator', label, label));
  }
  for (const condition of recordArray(spec.entry?.conditions)) {
    const token = semanticConditionToken('entry', condition);
    if (token) items.push(token);
  }
  for (const condition of recordArray(spec.exit?.conditions)) {
    const token = semanticConditionToken('exit', condition);
    if (token) items.push(token);
  }
  for (const condition of recordArray(spec.filters)) {
    const token = semanticConditionToken('filter', condition);
    if (token) items.push(token);
  }
  const risk = asRecord(spec.risk);
  const stopLoss = asRecord(risk?.stop_loss);
  if (stopLoss) {
    const type = text(stopLoss.type).toLowerCase();
    const value = numberText(stopLoss.value);
    const indicator = text(stopLoss.indicator_ref).toLowerCase();
    if (type === 'percent' && value) {
      items.push(item(`risk:stop_loss:percent:${value}`, 'risk', `stop loss ${value}%`, `stop_loss percent ${value}`));
    } else if (type === 'atr_multiple' && indicator && value) {
      items.push(item(`risk:stop_loss:atr:${indicator}:x${value}`, 'risk', `stop loss ${indicator} * ${value}`, `stop_loss ${indicator} * ${value}`));
    }
  }
  const timeExit = asRecord(risk?.time_exit);
  const timeExitBars = numberText(timeExit?.bars);
  if (timeExitBars) {
    items.push(item(`exit:time_exit:${timeExitBars}`, 'exit', `time exit ${timeExitBars}`, `time_exit bars ${timeExitBars}`));
  }
  return uniqueItems(items);
}

function extractPineIndicators(script: string): { items: SemanticItem[]; aliases: Map<string, string> } {
  const items: SemanticItem[] = [];
  const aliases = new Map<string, string>();
  const patterns: Array<{ type: string; regex: RegExp }> = [
    { type: 'SMA', regex: /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ta\.sma\s*\(\s*close\s*,\s*(\d{1,4})\s*\)/gi },
    { type: 'EMA', regex: /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ta\.ema\s*\(\s*close\s*,\s*(\d{1,4})\s*\)/gi },
    { type: 'RSI', regex: /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ta\.rsi\s*\(\s*close\s*,\s*(\d{1,4})\s*\)/gi },
    { type: 'ATR', regex: /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ta\.atr\s*\(\s*(\d{1,4})\s*\)/gi },
    { type: 'VOLUME_SMA', regex: /\b([A-Za-z_][A-Za-z0-9_]*)\s*=\s*ta\.sma\s*\(\s*volume\s*,\s*(\d{1,4})\s*\)/gi },
  ];
  for (const { type, regex } of patterns) {
    let match: RegExpExecArray | null;
    while ((match = regex.exec(script)) !== null) {
      const variable = match[1];
      const length = match[2];
      const id = type === 'VOLUME_SMA' ? `volume_sma_${length}` : `${type.toLowerCase()}_${length}`;
      aliases.set(variable.toLowerCase(), id);
      items.push(item(`indicator:${id}`, 'indicator', `${type} ${length}`, `${type} ${length}`));
    }
  }
  const macdRegex = /\[\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*([A-Za-z_][A-Za-z0-9_]*)\s*\]\s*=\s*ta\.macd\s*\(\s*close\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*\)/gi;
  let macdMatch: RegExpExecArray | null;
  while ((macdMatch = macdRegex.exec(script)) !== null) {
    const [, macdLine, signalLine, histLine, fast, slow, signal] = macdMatch;
    const id = `macd_${fast}_${slow}_${signal}`;
    aliases.set(macdLine.toLowerCase(), id);
    aliases.set(signalLine.toLowerCase(), id);
    aliases.set(histLine.toLowerCase(), id);
    items.push(item(`indicator:${id}`, 'indicator', `MACD ${fast}-${slow}-${signal}`, `MACD ${fast}-${slow}-${signal}`));
  }
  return { items, aliases };
}

function variableToIndicator(variable: string, aliases: Map<string, string>): string {
  const normalized = variable.toLowerCase();
  return aliases.get(normalized) ?? normalized;
}

function extractPineSemanticSummary(script: string): PineSemanticSummary {
  const warnings: string[] = [];
  const assumptions = ['Pine semantic parser は common pattern の deterministic 診断です。TradingView parity を保証しません。'];
  const { items, aliases } = extractPineIndicators(script);

  const closeVsIndicator = /\bclose\s*(>=|<=|>|<)\s*([A-Za-z_][A-Za-z0-9_]*)|([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|>|<)\s*close/gi;
  let closeMatch: RegExpExecArray | null;
  while ((closeMatch = closeVsIndicator.exec(script)) !== null) {
    if (closeMatch[1] && closeMatch[2]) {
      const operator = closeMatch[1];
      const indicator = variableToIndicator(closeMatch[2], aliases);
      const area: AlignmentArea = operator.includes('<') ? 'exit' : 'entry';
      items.push(item(`${area}:close:${operator}:${indicator}`, area, `close ${operator} ${indicator}`, `close ${operator} ${indicator}`));
    } else if (closeMatch[3] && closeMatch[4]) {
      const rawOperator = closeMatch[4];
      const operator = rawOperator === '>' ? '<' : rawOperator === '>=' ? '<=' : rawOperator === '<' ? '>' : '>=';
      const indicator = variableToIndicator(closeMatch[3], aliases);
      const area: AlignmentArea = operator.includes('<') ? 'exit' : 'entry';
      items.push(item(`${area}:close:${operator}:${indicator}`, area, `close ${operator} ${indicator}`, `close ${operator} ${indicator}`));
    }
  }

  const threshold = /\b([A-Za-z_][A-Za-z0-9_]*)\s*(>=|<=|>|<)\s*(-?\d+(?:\.\d+)?)/gi;
  let thresholdMatch: RegExpExecArray | null;
  while ((thresholdMatch = threshold.exec(script)) !== null) {
    const indicator = variableToIndicator(thresholdMatch[1], aliases);
    if (!/^(rsi|macd|atr)/.test(indicator)) continue;
    const operator = thresholdMatch[2];
    const value = String(Number(thresholdMatch[3]));
    const area: AlignmentArea = operator.includes('<') ? 'exit' : 'entry';
    items.push(item(`${area}:${indicator}:${operator}:${value}`, area, `${indicator} ${operator} ${value}`, `${indicator} ${operator} ${value}`));
  }

  const crossover = /\bta\.(crossover|crossunder)\s*\(\s*([A-Za-z_][A-Za-z0-9_]*)\s*,\s*(-?\d+(?:\.\d+)?|[A-Za-z_][A-Za-z0-9_]*)\s*\)/gi;
  let crossMatch: RegExpExecArray | null;
  while ((crossMatch = crossover.exec(script)) !== null) {
    const operator = crossMatch[1].toLowerCase() === 'crossover' ? 'crosses_above' : 'crosses_below';
    const indicator = variableToIndicator(crossMatch[2], aliases);
    const valueOrIndicator = /^\d/.test(crossMatch[3]) ? String(Number(crossMatch[3])) : variableToIndicator(crossMatch[3], aliases);
    const area: AlignmentArea = operator === 'crosses_below' ? 'exit' : 'entry';
    items.push(item(`${area}:${indicator}:${operator}:${valueOrIndicator}`, area, `${indicator} ${operator} ${valueOrIndicator}`, `${indicator} ${operator} ${valueOrIndicator}`));
  }

  const volumeFilter = /\bvolume\s*(>=|<=|>|<)\s*([A-Za-z_][A-Za-z0-9_]*)(?:\s*\*\s*(\d+(?:\.\d+)?))?/gi;
  let volumeMatch: RegExpExecArray | null;
  while ((volumeMatch = volumeFilter.exec(script)) !== null) {
    const operator = volumeMatch[1];
    const indicator = variableToIndicator(volumeMatch[2], aliases);
    if (!indicator.startsWith('volume_sma')) continue;
    const multiplier = String(Number(volumeMatch[3] ?? '1'));
    items.push(item(`filter:volume:${operator}:${indicator}:x${multiplier}`, 'filter', `volume ${operator} ${indicator} * ${multiplier}`, `volume ${operator} ${indicator} * ${multiplier}`));
  }

  const percentStop = /\bstrategy\.exit\s*\([^)]*\bstop\s*=\s*[^,\n)]*(?:1\s*-\s*(\d+(?:\.\d+)?)\s*\/\s*100|0\.(\d+))/gi;
  let stopMatch: RegExpExecArray | null;
  while ((stopMatch = percentStop.exec(script)) !== null) {
    const value = stopMatch[1] ? Number(stopMatch[1]) : Number(`0.${stopMatch[2]}`) * 100;
    if (Number.isFinite(value)) {
      items.push(item(`risk:stop_loss:percent:${value}`, 'risk', `stop loss ${value}%`, `stop_loss percent ${value}`));
    }
  }
  if (/strategy\.exit\s*\([^)]*\bstop\s*=/.test(script) && !items.some((candidate) => candidate.key.startsWith('risk:stop_loss'))) {
    warnings.push('Pine の stop 条件を検出しましたが、percent / ATR 形式としては特定できませんでした。');
  }
  if (/\bstrategy\.entry\s*\([^)]*strategy\.short/i.test(script)) {
    warnings.push('Pine に short entry が含まれる可能性があります。');
  }
  return { items: uniqueItems(items), warnings, assumptions };
}

function isRsiThresholdVsCrossMismatch(spec: SemanticItem, pine: SemanticItem): boolean {
  const specMatch = spec.key.match(/^entry:(rsi_\d+):(>=|>|<=|<):(\d+(?:\.\d+)?)$/);
  const pineMatch = pine.key.match(/^entry:(rsi_\d+):(crosses_above|crosses_below):(\d+(?:\.\d+)?)$/);
  return Boolean(specMatch && pineMatch && specMatch[1] === pineMatch[1] && specMatch[3] === pineMatch[3]);
}

export function buildImplementationAlignmentReport(params: {
  strategyVersionId: string;
  generatedPine: string | null;
  normalizedRuleJson: unknown;
}): StrategyImplementationAlignmentReport {
  const baseReport = {
    schema_name: 'strategy_implementation_alignment' as const,
    schema_version: '1.0' as const,
    strategy_version_id: params.strategyVersionId,
    summary: {
      matched_count: 0,
      mismatch_count: 0,
      missing_in_pine_count: 0,
      missing_in_spec_count: 0,
    },
    matched: [],
    mismatches: [],
    missing_in_pine: [],
    missing_in_spec: [],
    warnings: [],
    assumptions: [],
  };

  if (!params.generatedPine?.trim()) {
    return {
      ...baseReport,
      status: 'unavailable',
      reason: 'generated Pine is missing.',
      warnings: ['Pineが未生成のため比較できません。'],
    };
  }
  if (!isNormalizedStrategySpec(params.normalizedRuleJson)) {
    return {
      ...baseReport,
      status: 'unavailable',
      reason: 'normalized strategy spec is missing.',
      warnings: ['構造化specが未生成のため比較できません。'],
    };
  }

  const specItems = specSemanticItems(params.normalizedRuleJson);
  const pineSummary = extractPineSemanticSummary(params.generatedPine);
  const pineItems = pineSummary.items;
  const pineByKey = new Map(pineItems.map((candidate) => [candidate.key, candidate]));
  const specMatchedKeys = new Set<string>();
  const pineMatchedKeys = new Set<string>();
  const matched: StrategyImplementationAlignmentReport['matched'] = [];
  const mismatches: StrategyImplementationAlignmentReport['mismatches'] = [];

  for (const specItem of specItems) {
    const pineItem = pineByKey.get(specItem.key);
    if (pineItem) {
      specMatchedKeys.add(specItem.key);
      pineMatchedKeys.add(pineItem.key);
      matched.push({
        area: specItem.area,
        label: specItem.label,
        spec: specItem.text,
        pine: pineItem.text,
      });
      continue;
    }
    const mismatchPineItem = pineItems.find((candidate) => !pineMatchedKeys.has(candidate.key) && isRsiThresholdVsCrossMismatch(specItem, candidate));
    if (mismatchPineItem) {
      specMatchedKeys.add(specItem.key);
      pineMatchedKeys.add(mismatchPineItem.key);
      mismatches.push({
        area: specItem.area,
        severity: 'warning',
        label: specItem.label,
        spec: specItem.text,
        pine: mismatchPineItem.text,
        message: 'RSI condition differs between spec and Pine.',
      });
    }
  }

  const missingInPine = specItems
    .filter((candidate) => !specMatchedKeys.has(candidate.key))
    .map((candidate) => ({
      area: candidate.area,
      severity: 'warning' as const,
      label: candidate.label,
      spec: candidate.text,
    }));
  const missingInSpec = pineItems
    .filter((candidate) => !pineMatchedKeys.has(candidate.key))
    .map((candidate) => ({
      area: candidate.area,
      severity: 'warning' as const,
      label: candidate.label,
      pine: candidate.text,
    }));

  const mismatchCount = mismatches.length;
  const status: AlignmentStatus = mismatchCount > 0 || missingInPine.length > 0 || missingInSpec.length > 0
    ? (mismatches.some((candidate) => candidate.severity === 'error') ? 'mismatch' : 'warning')
    : 'ok';

  return {
    ...baseReport,
    status,
    summary: {
      matched_count: matched.length,
      mismatch_count: mismatchCount,
      missing_in_pine_count: missingInPine.length,
      missing_in_spec_count: missingInSpec.length,
    },
    matched,
    mismatches,
    missing_in_pine: missingInPine,
    missing_in_spec: missingInSpec,
    warnings: pineSummary.warnings,
    assumptions: pineSummary.assumptions,
  };
}
