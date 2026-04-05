import { prisma } from '../db';
import {
  validateArtifactPointerSchema,
  validateEngineActualArtifactPayloadSchema,
  type InternalBacktestActualArtifactPayload,
  type InternalBacktestArtifactPointer,
} from './contracts';

export const ENGINE_ACTUAL_ARTIFACT_KIND = 'engine_actual_trades_and_equity';

export type InternalBacktestEngineActualArtifactReadResult = {
  pointer: InternalBacktestArtifactPointer;
  artifact: InternalBacktestActualArtifactPayload;
};

export async function getEngineActualArtifactByExecutionId(
  executionId: string,
): Promise<InternalBacktestEngineActualArtifactReadResult | null> {
  const artifact = await prisma.internalBacktestExecutionArtifact.findUnique({
    where: {
      executionId_kind: {
        executionId,
        kind: ENGINE_ACTUAL_ARTIFACT_KIND,
      },
    },
  });
  if (!artifact) {
    return null;
  }

  const pointer = validateArtifactPointerSchema({
    type: 'internal_backtest_execution',
    execution_id: executionId,
    path: artifact.path,
  });

  const payload = validateEngineActualArtifactPayloadSchema(artifact.payloadJson as unknown);
  return {
    pointer,
    artifact: payload,
  };
}
