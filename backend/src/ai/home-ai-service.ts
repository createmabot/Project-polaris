import { AlertSummaryContext } from './adapter';
import { env } from '../env';
import { reviewGeneratedPineScriptDeterministic } from '../strategy/pine';
import type { PineReviewIssue, PineReviewIssueCode, PineReviewResult } from '../strategy/pine';
import {
  BacktestSummaryContext,
  BacktestSummaryOutput,
  ComparisonSummaryContext,
  ComparisonSummaryOutput,
  createHomeAiProvider,
  createStubHomeAiProvider,
  DailySummaryContext,
  DailySummaryOutput,
  HomeAiProvider,
  NaturalLanguageRuleRewriteContext,
  NaturalLanguageRuleRewriteOutput,
  PineGenerationContext,
  PineGenerationOutput,
  SymbolThesisContext,
  SymbolThesisOutput,
} from './home-provider';

export type HomeAiExecutionLog = {
  initialModel: string;
  finalModel: string;
  escalated: boolean;
  escalationReason: string | null;
  retryCount: number;
  durationMs: number;
  estimatedTokens: number;
  estimatedCostUsd: number;
  provider: string;
  fallbackToStub: boolean;
};

type PineRepairValidation = {
  normalizedScript: string | null;
  warnings: string[];
  failureReason: string | null;
  retryable: boolean;
  invalidReasonCodes: string[];
};

type PineReview = (script: string) => PineReviewResult | Promise<PineReviewResult>;

type SanitizedPineReviewIssue = {
  code: string;
  severity: 'error' | 'warning' | 'info';
  repair_hint: string;
  repair_template?: string;
};

const PINE_REVIEW_REPAIR_PRIORITIES: Record<PineReviewIssueCode, number> = {
  pine_syntax_risk: 100,
  unsupported_color_alias: 90,
  unsupported_color_namespace: 100,
  unsupported_plot_style: 90,
  unsupported_function_alias: 100,
  dmi_property_access: 100,
  unsupported_dmi_property_access: 100,
  unsupported_adx_function: 100,
  block_local_variable_scope_risk: 100,
  na_type_inference_risk: 100,
  uninitialized_stop_loss_price: 100,
  stop_order_guard_risk: 95,
  setup_trigger_state_risk: 90,
  entry_guard_risk: 95,
  below_vs_crossunder_mismatch: 0,
  oscillator_plot_overlay_risk: 0,
  overlay_oscillator_plot: 0,
  entry_price_reference_risk: 95,
  stop_order_semantics_risk: 95,
  unused_state_variable: 0,
  narrative_comment: 0,
  long_only_violation: 100,
  setup_trigger_same_bar: 90,
  entry_atr_na_capture: 95,
  donchian_current_bar_self_reference: 95,
  entry_time_atr_not_persisted: 95,
  provider_review_unavailable: 0,
  other: 0,
};

const PINE_REVIEW_REPAIR_TEMPLATES: Partial<Record<PineReviewIssueCode, string>> = {
  entry_guard_risk:
    'Wrap each long-only strategy.entry call in a flat-position guard: if entryCondition and strategy.position_size == 0 then strategy.entry("Long", strategy.long). Do not allow unguarded long entries.',
  entry_time_atr_not_persisted:
    'Use persisted entry-time ATR state: declare var float entryAtr = na, set entryAtr on the position-open transition with if strategy.position_size > 0 and strategy.position_size[1] == 0 then entryAtr := atrValue, calculate stops from entryAtr while not na(entryAtr), and reset entryAtr only on the open-to-flat transition.',
  stop_order_guard_risk:
    'Declare float stopLossPrice = na or var float stopLossPrice = na in outer scope, assign stopLossPrice only under strategy.position_size > 0, and call strategy.exit(..., stop=stopLossPrice) only under strategy.position_size > 0 and not na(stopLossPrice).',
  setup_trigger_state_risk:
    'Keep the setup-state variable true after setup until trigger entry or explicit invalidation. Do not clear it in a generic else branch before trigger. After strategy.entry in the entry block, reset the same state variable to false.',
  unsupported_adx_function:
    'Replace ta.adx(...) with supported DMI tuple output such as [plusDI, minusDI, adxValue] = ta.dmi(adxLength, adxLength), then use adxValue for ADX conditions.',
  dmi_property_access:
    'Replace direct ta.dmi(...).property access with tuple destructuring: [plusDI, minusDI, adxValue] = ta.dmi(diLength, adxSmoothing), then reference plusDI, minusDI, or adxValue.',
  unsupported_dmi_property_access:
    'Replace direct ta.dmi(...).property access with tuple destructuring: [plusDI, minusDI, adxValue] = ta.dmi(diLength, adxSmoothing), then reference plusDI, minusDI, or adxValue.',
  donchian_current_bar_self_reference:
    'For Donchian breakouts or exits, compare close against the prior channel value, for example upperBand = ta.highest(high, len), lowerBand = ta.lowest(low, len), entryCondition = close > upperBand[1], exitCondition = close < lowerBand[1].',
  unsupported_function_alias:
    'Replace unsupported ta.crossabove(...) with ta.crossover(...) and ta.crossbelow(...) with ta.crossunder(...). Preserve the original signal direction.',
};

export type PineGenerationProgressStage =
  | '生成リクエスト送信'
  | 'LLMでPine生成'
  | '生成結果レビュー'
  | '必要に応じて修正'
  | '最終確認';

export type PineGenerationProgressUpdate = {
  stage: PineGenerationProgressStage;
  progressPercent: number;
};

type PineGenerationProgressHandler = (update: PineGenerationProgressUpdate) => void | Promise<void>;

export class HomeAiService {
  constructor(
    private readonly provider: HomeAiProvider = createHomeAiProvider(),
    private readonly stubProvider: HomeAiProvider = createStubHomeAiProvider(),
    private readonly enableStubFallback: boolean = env.AI_ENABLE_STUB_FALLBACK,
  ) {}

  async generateAlertSummary(context: AlertSummaryContext): Promise<{ output: any; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.generateAlertSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generateAlertSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async generateDailySummary(context: DailySummaryContext): Promise<{ output: DailySummaryOutput; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.generateDailySummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generateDailySummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async generateSymbolThesisSummary(
    context: SymbolThesisContext,
  ): Promise<{ output: SymbolThesisOutput; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.generateSymbolThesisSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generateSymbolThesisSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async generateComparisonSummary(
    context: ComparisonSummaryContext,
  ): Promise<{ output: ComparisonSummaryOutput; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.generateComparisonSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generateComparisonSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async generateBacktestSummary(
    context: BacktestSummaryContext,
  ): Promise<{ output: BacktestSummaryOutput; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.generateBacktestSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generateBacktestSummary(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.bodyMarkdown ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async rewriteNaturalLanguageRuleDraft(
    context: NaturalLanguageRuleRewriteContext,
  ): Promise<{ output: NaturalLanguageRuleRewriteOutput; log: HomeAiExecutionLog }> {
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    try {
      const output = await this.provider.rewriteNaturalLanguageRuleDraft(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil(output.naturalLanguageRule.length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch {
      if (!this.shouldFallbackToStub()) {
        throw new Error('natural_language_rule_rewrite_failed');
      }
      const output = await this.stubProvider.rewriteNaturalLanguageRuleDraft(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil(output.naturalLanguageRule.length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }

  async generatePineScript(
    context: PineGenerationContext,
    options?: {
      maxRepairAttempts?: number;
      validateOutput?: (script: string | null) => PineRepairValidation;
      reviewOutput?: PineReview;
      onProgress?: PineGenerationProgressHandler;
    },
  ): Promise<{ output: PineGenerationOutput; log: HomeAiExecutionLog }> {
    const maxRepairAttempts = Math.max(0, Math.min(options?.maxRepairAttempts ?? env.MAX_LOCAL_RETRY_COUNT, 2));
    const validateOutput = options?.validateOutput;
    const reviewOutput = options?.reviewOutput;
    const aggregateWarnings: string[] = [];
    const startedAt = Date.now();
    const attemptedModel = this.resolveAttemptedModel();
    let attempt = 0;
    let currentContext: PineGenerationContext = context;
    let lastRun: { output: PineGenerationOutput; log: HomeAiExecutionLog } | null = null;
    let lastFailureReason: string | null = null;
    let lastInvalidReasonCodes: string[] = [];
    let lastReviewerIssues: SanitizedPineReviewIssue[] = [];

    await this.emitPineProgress(options?.onProgress, '生成リクエスト送信', 5);

    while (attempt <= maxRepairAttempts) {
      await this.emitPineProgress(options?.onProgress, 'LLMでPine生成', Math.min(25 + attempt * 15, 55));
      const run = await this.generatePineScriptSingleAttempt(currentContext, attemptedModel, startedAt);
      lastRun = run;

      const mergedOutputWarnings = [...run.output.warnings];
      for (const warning of aggregateWarnings) {
        mergedOutputWarnings.push(warning);
      }

      if (!validateOutput) {
        return {
          output: {
            ...run.output,
            warnings: Array.from(new Set(mergedOutputWarnings)),
            repairAttempts: attempt,
          },
          log: {
            ...run.log,
            retryCount: attempt,
            durationMs: Date.now() - startedAt,
          },
        };
      }

      const assessed = validateOutput(run.output.generatedScript);
      for (const warning of assessed.warnings) {
        aggregateWarnings.push(warning);
      }
      const providerInvalidReasonCodes = run.output.invalidReasonCodes ?? [];
      const combinedInvalidReasonCodes = Array.from(
        new Set([...providerInvalidReasonCodes, ...assessed.invalidReasonCodes]),
      );
      const providerFailureReason = run.output.failureReason ?? null;
      const failureReason = providerFailureReason ?? assessed.failureReason;
      lastFailureReason = failureReason;
      lastInvalidReasonCodes = combinedInvalidReasonCodes;

      const normalizedGeneratedScript = assessed.normalizedScript;
      if (!assessed.failureReason && normalizedGeneratedScript) {
        await this.emitPineProgress(options?.onProgress, '生成結果レビュー', Math.min(55 + attempt * 10, 75));
        const review = reviewOutput
          ? await reviewOutput(normalizedGeneratedScript)
          : await this.reviewPineScriptWithProvider(context, normalizedGeneratedScript, attempt);
        const errorReviewIssues = review.issues.filter((issue) => issue.severity === 'error');
        const blockingReviewIssues = this.selectBlockingPineReviewIssues(errorReviewIssues);
        if (blockingReviewIssues.length > 0) {
          const selectedRepairIssues = this.selectPineReviewRepairIssues(blockingReviewIssues);
          const sanitizedRepairIssues = this.sanitizePineReviewIssues(selectedRepairIssues, { includeRepairTemplate: true });
          const sanitizedReviewerIssues = this.sanitizePineReviewIssues(selectedRepairIssues);
          const reviewInvalidReasonCodes = blockingReviewIssues.map((issue) => `reviewer_${issue.code}`);
          const canRepairReview = attempt < maxRepairAttempts && selectedRepairIssues.length > 0;
          lastFailureReason = 'pine_review_needs_repair';
          lastInvalidReasonCodes = Array.from(new Set([...combinedInvalidReasonCodes, ...reviewInvalidReasonCodes]));
          lastReviewerIssues = sanitizedReviewerIssues;

          if (!canRepairReview) {
            return {
              output: {
                ...run.output,
                generatedScript: null,
                warnings: Array.from(
                  new Set([
                    ...mergedOutputWarnings,
                    ...assessed.warnings,
                    `Pine reviewer が修復対象の問題を ${errorReviewIssues.length} 件検出しました。`,
                  ]),
                ),
                status: 'failed',
                repairAttempts: attempt,
                failureReason: 'pine_review_needs_repair',
                invalidReasonCodes: lastInvalidReasonCodes,
                reviewerSummary: review.summary,
                reviewerIssues: sanitizedReviewerIssues,
              },
              log: {
                ...run.log,
                retryCount: attempt,
                durationMs: Date.now() - startedAt,
              },
            };
          }

          attempt += 1;
          await this.emitPineProgress(options?.onProgress, '必要に応じて修正', Math.min(70 + attempt * 5, 85));
          currentContext = {
            ...context,
            repairRequest: {
              attempt,
              invalidReasonCodes: lastInvalidReasonCodes,
              failureReason: 'pine_review_needs_repair',
              previousScript: normalizedGeneratedScript,
              reviewIssues: sanitizedRepairIssues,
            },
          };
          aggregateWarnings.push(`Pine reviewer の指摘により、修復リトライ${attempt}回目を実行しました。`);
          continue;
        }

        return {
          output: {
            ...run.output,
            generatedScript: normalizedGeneratedScript,
            warnings: Array.from(new Set([...mergedOutputWarnings, ...assessed.warnings])),
            status: 'generated',
            repairAttempts: attempt,
            failureReason: null,
            invalidReasonCodes: assessed.invalidReasonCodes,
            reviewerSummary: review.summary,
          },
          log: {
            ...run.log,
            retryCount: attempt,
            durationMs: Date.now() - startedAt,
          },
        };
      }

      const providerOutputCanRepair =
        run.output.status === 'failed' &&
        providerInvalidReasonCodes.some((code) =>
          ['provider_invalid_response', 'malformed_json', 'generated_script_missing'].includes(code),
        );
      const canRepair = (assessed.retryable || providerOutputCanRepair) && attempt < maxRepairAttempts;
      if (!canRepair) {
        return {
          output: {
            ...run.output,
            generatedScript: null,
            warnings: Array.from(new Set([...mergedOutputWarnings, ...assessed.warnings])),
            status: 'failed',
            repairAttempts: attempt,
            failureReason,
            invalidReasonCodes: combinedInvalidReasonCodes,
          },
          log: {
            ...run.log,
            retryCount: attempt,
            durationMs: Date.now() - startedAt,
          },
        };
      }

      attempt += 1;
      await this.emitPineProgress(options?.onProgress, '必要に応じて修正', Math.min(65 + attempt * 8, 85));
      currentContext = {
        ...context,
        repairRequest: {
          attempt,
          invalidReasonCodes: combinedInvalidReasonCodes,
          failureReason: failureReason ?? 'invalid_output',
          previousScript: run.output.generatedScript,
        },
      };
      aggregateWarnings.push(`Pine生成結果の検証に失敗したため、修復リトライ${attempt}回目を実行しました。`);
    }

    if (!lastRun) {
      throw new Error('pine_generation_unexpected_state');
    }

    return {
      output: {
        ...lastRun.output,
        generatedScript: null,
        warnings: Array.from(new Set([...lastRun.output.warnings, ...aggregateWarnings])),
        status: 'failed',
        repairAttempts: maxRepairAttempts,
        failureReason: lastFailureReason ?? 'Pine generation failed after retries.',
        invalidReasonCodes: lastInvalidReasonCodes,
        reviewerIssues: lastReviewerIssues,
      },
      log: {
        ...lastRun.log,
        retryCount: maxRepairAttempts,
        durationMs: Date.now() - startedAt,
      },
    };
  }

  private resolveAttemptedModel(): string {
    if (this.provider.providerType === 'local_llm') {
      return env.PRIMARY_LOCAL_MODEL;
    }
    if (this.provider.providerType === 'openai_api') {
      return env.FALLBACK_API_MODEL;
    }
    return 'mock-v1';
  }

  private async emitPineProgress(
    onProgress: PineGenerationProgressHandler | undefined,
    stage: PineGenerationProgressStage,
    progressPercent: number,
  ) {
    if (!onProgress) return;
    try {
      await onProgress({
        stage,
        progressPercent: Math.max(0, Math.min(100, Math.round(progressPercent))),
      });
    } catch {
      // Progress reporting must not fail generation.
    }
  }

  private selectBlockingPineReviewIssues(issues: PineReviewIssue[]): PineReviewIssue[] {
    return issues.filter((issue) => this.getPineReviewRepairPriority(issue.code) > 0);
  }

  private selectPineReviewRepairIssues(issues: PineReviewIssue[]): PineReviewIssue[] {
    const selectedByCode = new Map<PineReviewIssueCode, PineReviewIssue>();
    for (const issue of issues) {
      if (issue.severity !== 'error' || !issue.repairable) continue;
      if (this.getPineReviewRepairPriority(issue.code) <= 0) continue;
      if (selectedByCode.has(issue.code)) continue;
      selectedByCode.set(issue.code, issue);
    }
    return Array.from(selectedByCode.values())
      .sort((left, right) => this.getPineReviewRepairPriority(right.code) - this.getPineReviewRepairPriority(left.code))
      .slice(0, 3);
  }

  private getPineReviewRepairPriority(code: PineReviewIssueCode): number {
    return PINE_REVIEW_REPAIR_PRIORITIES[code] ?? 0;
  }

  private sanitizePineReviewIssues(
    issues: PineReviewIssue[],
    options: { includeRepairTemplate?: boolean } = {},
  ): SanitizedPineReviewIssue[] {
    return issues.slice(0, 8).map((issue) => {
      const repairTemplate = PINE_REVIEW_REPAIR_TEMPLATES[issue.code];
      return {
        code: /^[a-z_]+$/i.test(issue.code) ? issue.code : 'other',
        severity: issue.severity,
        repair_hint: this.sanitizePineReviewText(issue.repair_hint || issue.message),
        ...(options.includeRepairTemplate && repairTemplate ? { repair_template: repairTemplate } : {}),
      };
    });
  }

  private sanitizePineReviewText(value: string): string {
    const trimmed = value.replace(/\s+/g, ' ').trim();
    const redacted = /https?:\/\/|endpoint|model|secret|token|credential|stack|local path/i.test(trimmed)
      ? 'Fix the sanitized Pine reviewer issue without exposing provider details.'
      : trimmed;
    return redacted.slice(0, 180);
  }

  private shouldFallbackToStub(): boolean {
    return this.enableStubFallback && this.provider.providerType !== 'stub';
  }

  private toProviderFailureError(error: unknown): Error {
    const message = error instanceof Error ? error.message : String(error);
    return new Error(`ai_provider_failed(${this.provider.providerType}): ${message}`);
  }

  private async reviewPineScriptWithProvider(
    context: PineGenerationContext,
    generatedScript: string,
    repairAttempt: number,
  ): Promise<PineReviewResult> {
    const deterministicReview = reviewGeneratedPineScriptDeterministic(generatedScript);
    if (!this.provider.reviewPineScript || this.provider.providerType === 'stub') {
      return deterministicReview;
    }

    try {
      const providerReview = await this.provider.reviewPineScript({
        generatedScript,
        naturalLanguageSpec: context.naturalLanguageSpec,
        targetMarket: context.targetMarket,
        targetTimeframe: context.targetTimeframe,
        repairAttempt,
      });
      return this.mergePineReviews(deterministicReview, providerReview);
    } catch {
      return this.mergePineReviews(deterministicReview, {
        schema_name: 'pine_review_result',
        schema_version: '1.0',
        status: 'pass',
        issues: [
          {
            code: 'provider_review_unavailable',
            severity: 'warning',
            message: 'Pine reviewer provider was unavailable; deterministic review was used.',
            repair_hint: 'Retry provider review manually if needed.',
            repairable: false,
          },
        ],
        summary: {
          issue_count: 1,
          error_count: 0,
          warning_count: 1,
          repairable_issue_count: 0,
        },
      });
    }
  }

  private mergePineReviews(base: PineReviewResult, extra: PineReviewResult): PineReviewResult {
    const seen = new Set<string>();
    const issues = [...base.issues, ...extra.issues].filter((issue) => {
      const key = `${issue.code}:${issue.severity}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const errorCount = issues.filter((issue) => issue.severity === 'error').length;
    const warningIssueCount = issues.filter((issue) => issue.severity === 'warning').length;
    const repairableIssueCount = issues.filter((issue) => issue.repairable).length;
    return {
      schema_name: 'pine_review_result',
      schema_version: '1.0',
      status: errorCount > 0 ? 'needs_repair' : 'pass',
      issues,
      summary: {
        issue_count: issues.length,
        error_count: errorCount,
        warning_count: warningIssueCount,
        repairable_issue_count: repairableIssueCount,
      },
    };
  }

  private async generatePineScriptSingleAttempt(
    context: PineGenerationContext,
    attemptedModel: string,
    startedAt: number,
  ): Promise<{ output: PineGenerationOutput; log: HomeAiExecutionLog }> {
    try {
      const output = await this.provider.generatePineScript(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: this.provider.providerType === 'openai_api',
          escalationReason: null,
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.generatedScript ?? '').length / 4),
          estimatedCostUsd: this.provider.providerType === 'openai_api' ? 0.001 : 0,
          provider: this.provider.providerType,
          fallbackToStub: false,
        },
      };
    } catch (error) {
      if (!this.shouldFallbackToStub()) {
        throw this.toProviderFailureError(error);
      }
      const output = await this.stubProvider.generatePineScript(context);
      return {
        output,
        log: {
          initialModel: attemptedModel,
          finalModel: output.modelName,
          escalated: false,
          escalationReason: 'provider_failed_fallback_to_stub',
          retryCount: 0,
          durationMs: Date.now() - startedAt,
          estimatedTokens: Math.ceil((output.generatedScript ?? '').length / 4),
          estimatedCostUsd: 0,
          provider: this.provider.providerType,
          fallbackToStub: true,
        },
      };
    }
  }
}
