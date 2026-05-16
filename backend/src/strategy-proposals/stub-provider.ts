import {
  StrategyProposalCandidate,
  StrategyProposalProvider,
  StrategyProposalRequest,
  StrategyType,
} from './types';

type ProposalTemplate = {
  strategyType: StrategyType;
  title: string;
  summary: string;
  entryLogic: string[];
  exitLogic: string[];
  riskManagement: string[];
  invalidationConditions: string[];
  expectedStrengths: string[];
  expectedWeaknesses: string[];
  requiredIndicators: string[];
  pineFeasibility: 'high' | 'medium' | 'low';
  backtestCautions: string[];
};

const TEMPLATES: ProposalTemplate[] = [
  {
    strategyType: 'trend_following',
    title: '移動平均トレンドフォロー候補',
    summary: '中期移動平均と出来高で上昇トレンドを確認してから入る検証候補。',
    entryLogic: ['終値が25日移動平均を上回る', '出来高が20日平均を上回る', 'RSIが50以上で推移する'],
    exitLogic: ['終値が5日移動平均を下回る', 'RSIが45を下回る'],
    riskManagement: ['1回の損失を限定する', '急騰後の追随を避ける'],
    invalidationConditions: ['レンジ相場でダマシが増える', '出来高を伴わない上抜け'],
    expectedStrengths: ['上昇トレンドに乗りやすい', 'Pineで表現しやすい'],
    expectedWeaknesses: ['急落転換に遅れる', '横ばい相場で損切りが増える'],
    requiredIndicators: ['SMA', 'RSI', 'Volume SMA'],
    pineFeasibility: 'high',
    backtestCautions: ['長期上昇相場に過剰適合しないか確認する'],
  },
  {
    strategyType: 'mean_reversion',
    title: 'RSI反転候補',
    summary: '短期的な売られすぎからの反発を狙う検証候補。',
    entryLogic: ['RSIが30以下から上向く', '終値が直近安値を割り込まない', '出来高が極端に低くない'],
    exitLogic: ['RSIが55以上に戻る', '終値がエントリー後の安値を下回る'],
    riskManagement: ['下落トレンド銘柄ではサイズを抑える', 'ギャップダウンを考慮する'],
    invalidationConditions: ['強い下落トレンドが継続する', '反発出来高がない'],
    expectedStrengths: ['短期反発を検証しやすい', '条件が単純で比較しやすい'],
    expectedWeaknesses: ['落ちるナイフになりやすい', '損切り設計が重要'],
    requiredIndicators: ['RSI', 'Recent Low', 'Volume'],
    pineFeasibility: 'high',
    backtestCautions: ['手数料とスリッページの影響を確認する'],
  },
  {
    strategyType: 'breakout',
    title: '高値ブレイクアウト候補',
    summary: '直近高値を出来高とともに上抜けたタイミングを検証する候補。',
    entryLogic: ['終値が20日高値を上回る', '出来高が20日平均の1.5倍以上', '終値が25日移動平均を上回る'],
    exitLogic: ['終値が10日安値を下回る', 'ブレイク後に出来高が急減する'],
    riskManagement: ['ブレイク直後の急反落を損切り条件に含める'],
    invalidationConditions: ['高値更新後に終値で維持できない', '流動性が低い'],
    expectedStrengths: ['強いモメンタムを拾いやすい', '条件がPineで実装しやすい'],
    expectedWeaknesses: ['高値掴みになりやすい', 'ボラティリティが高い'],
    requiredIndicators: ['Highest High', 'SMA', 'Volume SMA'],
    pineFeasibility: 'high',
    backtestCautions: ['直近高値の期間を変えて感度を確認する'],
  },
  {
    strategyType: 'momentum',
    title: 'モメンタム継続候補',
    summary: '価格変化率とRSIで短中期の勢いを確認する検証候補。',
    entryLogic: ['20日騰落率がプラス', 'RSIが55以上', '終値が25日移動平均を上回る'],
    exitLogic: ['20日騰落率がマイナスに転じる', 'RSIが50を下回る'],
    riskManagement: ['急騰後はエントリーを見送る条件を入れる'],
    invalidationConditions: ['材料一巡で勢いが失われる', '指数全体が弱い'],
    expectedStrengths: ['相場の強い局面を拾いやすい', '市場別に比較しやすい'],
    expectedWeaknesses: ['反転に弱い', '過熱局面で成績が悪化しやすい'],
    requiredIndicators: ['Rate of Change', 'RSI', 'SMA'],
    pineFeasibility: 'medium',
    backtestCautions: ['過熱回避条件の有無で比較する'],
  },
  {
    strategyType: 'volatility',
    title: 'ボラティリティ収束ブレイク候補',
    summary: '値幅が収束した後の上方向ブレイクを検証する候補。',
    entryLogic: ['直近の値幅が過去平均より低い', '終値が20日高値を上回る', '出来高が平均を上回る'],
    exitLogic: ['終値が10日移動平均を下回る', 'ブレイク後の高値更新が止まる'],
    riskManagement: ['収束期間の安値割れを損切り候補にする', '急拡大後の反落に注意する'],
    invalidationConditions: ['収束が長すぎて流動性が低い', '上抜けに出来高が伴わない'],
    expectedStrengths: ['ブレイク前の待機条件を明確にできる', '高ボラティリティ局面を避けやすい'],
    expectedWeaknesses: ['シグナル頻度が少ない', 'false breakout に弱い'],
    requiredIndicators: ['Range', 'Highest High', 'Volume SMA'],
    pineFeasibility: 'medium',
    backtestCautions: ['収束判定期間を複数パターンで確認する'],
  },
  {
    strategyType: 'risk_management',
    title: '損失限定重視候補',
    summary: 'エントリー条件を控えめにし、損切りと手仕舞いを明確にする検証候補。',
    entryLogic: ['終値が25日移動平均を上回る', 'RSIが45以上', '直近ボラティリティが極端に高くない'],
    exitLogic: ['終値がエントリー価格から一定率下落する', '終値が5日移動平均を下回る'],
    riskManagement: ['損切り率を固定する', '連続損失時は次回エントリーを見送る条件を検討する'],
    invalidationConditions: ['損切り幅が狭すぎてノイズで刈られる', '利益確定条件が曖昧'],
    expectedStrengths: ['リスク説明が明確', '検証前提をユーザーが調整しやすい'],
    expectedWeaknesses: ['利益を伸ばしにくい', '細かい損切りが増える可能性がある'],
    requiredIndicators: ['SMA', 'RSI', 'ATR or percent stop'],
    pineFeasibility: 'medium',
    backtestCautions: ['損切り率を複数パターンで確認する'],
  },
];

function buildNaturalLanguageSpec(template: ProposalTemplate, params: StrategyProposalRequest): string {
  const target = params.symbol_code ? `対象銘柄は ${params.symbol_code}、` : '';
  const riskText = params.risk_preference === 'conservative'
    ? '損切りを早めにし、エントリー条件を厳しめにします。'
    : params.risk_preference === 'aggressive'
      ? '勢いがある局面ではエントリーを許容しますが、損切り条件を必ず明記します。'
      : 'エントリー条件と損切り条件のバランスを重視します。';
  const hintText = params.user_hint ? `補足条件: ${params.user_hint}` : '';
  return [
    `${target}${params.market} / ${params.timeframe} を前提に、${template.title}を検証します。`,
    `エントリー条件: ${template.entryLogic.join('。')}。`,
    `手仕舞い条件: ${template.exitLogic.join('。')}。`,
    `リスク管理: ${template.riskManagement.join('。')}。${riskText}`,
    `無効化条件: ${template.invalidationConditions.join('。')}。`,
    hintText,
  ].filter(Boolean).join('\n');
}

function buildCandidate(template: ProposalTemplate, index: number, input: StrategyProposalRequest): StrategyProposalCandidate {
  const confidence = template.pineFeasibility === 'high' && input.risk_preference !== 'aggressive' ? 'medium' : 'low';
  return {
    candidate_id: `stub-${index + 1}`,
    title: template.title,
    summary: template.summary,
    market_assumption: input.market,
    timeframe_assumption: input.timeframe,
    strategy_type: template.strategyType,
    entry_logic: template.entryLogic,
    exit_logic: template.exitLogic,
    risk_management: template.riskManagement,
    invalidation_conditions: template.invalidationConditions,
    expected_strengths: template.expectedStrengths,
    expected_weaknesses: template.expectedWeaknesses,
    required_indicators: template.requiredIndicators,
    pine_feasibility: template.pineFeasibility,
    backtest_cautions: template.backtestCautions,
    research_basis: [
      {
        source_type: 'internal',
        label: 'deterministic strategy proposal stub',
        url: null,
      },
    ],
    confidence,
    uncertainty: [
      '市場環境や銘柄固有材料は未評価です。',
      'Pine生成後にbacktestとユーザー確認が必要です。',
    ],
    suggested_natural_language_spec: buildNaturalLanguageSpec(template, input),
    suggested_pine_constraints: ['long_only', 'daily first', 'no automatic execution'],
  };
}

export class StubStrategyProposalProvider implements StrategyProposalProvider {
  async generate(input: StrategyProposalRequest) {
    const filteredTemplates = input.strategy_type_bias === 'any'
      ? TEMPLATES
      : TEMPLATES.filter((template) => template.strategyType === input.strategy_type_bias);
    const selectedTemplates = filteredTemplates.slice(0, input.proposal_count);

    return {
      provider: {
        name: 'stub',
        mode: 'deterministic',
        web_search: false,
        persisted: false,
      },
      candidates: selectedTemplates.map((template, index) => buildCandidate(template, index, input)),
      disclaimer: '検証候補の提案です。投資助言ではありません。Pine生成とbacktest、ユーザー確認を前提にしてください。',
    };
  }
}
