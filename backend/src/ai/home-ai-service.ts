import { AlertSummaryContext } from './adapter';
import { env } from '../env';
import { reviewGeneratedPineScriptDeterministic } from '../strategy/pine';
import type { PineReviewResult } from '../strategy/pine';
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

  async generatePineScript(
    context: PineGenerationContext,
    options?: {
      maxRepairAttempts?: number;
      validateOutput?: (script: string | null) => PineRepairValidation;
      reviewOutput?: PineReview;
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

    while (attempt <= maxRepairAttempts) {
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
        const review = reviewOutput
          ? await reviewOutput(normalizedGeneratedScript)
          : await this.reviewPineScriptWithProvider(context, normalizedGeneratedScript, attempt);
        const errorReviewIssues = review.issues.filter((issue) => issue.severity === 'error');
        if (errorReviewIssues.length > 0) {
          const reviewInvalidReasonCodes = errorReviewIssues.map((issue) => `reviewer_${issue.code}`);
          const canRepairReview = attempt < maxRepairAttempts && errorReviewIssues.some((issue) => issue.repairable);
          lastFailureReason = 'pine_review_needs_repair';
          lastInvalidReasonCodes = Array.from(new Set([...combinedInvalidReasonCodes, ...reviewInvalidReasonCodes]));

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
              },
              log: {
                ...run.log,
                retryCount: attempt,
                durationMs: Date.now() - startedAt,
              },
            };
          }

          attempt += 1;
          currentContext = {
            ...context,
            repairRequest: {
              attempt,
              invalidReasonCodes: lastInvalidReasonCodes,
              failureReason: 'pine_review_needs_repair',
              previousScript: normalizedGeneratedScript,
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
