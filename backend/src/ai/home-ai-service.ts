import { AlertSummaryContext } from './adapter';
import { env } from '../env';
import {
  createHomeAiProvider,
  createStubHomeAiProvider,
  DailySummaryContext,
  DailySummaryOutput,
  HomeAiProvider,
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

export class HomeAiService {
  constructor(
    private readonly provider: HomeAiProvider = createHomeAiProvider(),
    private readonly stubProvider: HomeAiProvider = createStubHomeAiProvider(),
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
      if (this.provider.providerType === 'stub') {
        throw error;
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
      if (this.provider.providerType === 'stub') {
        throw error;
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
      if (this.provider.providerType === 'stub') {
        throw error;
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

  private resolveAttemptedModel(): string {
    if (this.provider.providerType === 'local_llm') {
      return env.PRIMARY_LOCAL_MODEL;
    }
    if (this.provider.providerType === 'openai_api') {
      return env.FALLBACK_API_MODEL;
    }
    return 'mock-v1';
  }
}
