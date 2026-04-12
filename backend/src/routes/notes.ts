import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { prisma } from '../db';
import { AppError, formatSuccess } from '../utils/response';

interface BodyNoteCreate {
  symbolId: string;
  title: string;
  thesisText?: string;
  scenarioText?: string;
  entryConditionText?: string;
  takeProfitText?: string;
  stopLossText?: string;
  invalidationText?: string;
  nextReviewAt?: string;
}

interface BodyNoteUpdate {
  title?: string;
  thesisText?: string;
  scenarioText?: string;
  entryConditionText?: string;
  takeProfitText?: string;
  stopLossText?: string;
  invalidationText?: string;
  status?: string;
  nextReviewAt?: string;
  changeSummary?: string;
}

export const noteRoutes: FastifyPluginAsync = async (fastify, opts) => {
  // GET /api/notes/:noteId
  fastify.get<{ Params: { noteId: string } }>('/:noteId', async (request, reply) => {
    const { noteId } = request.params;
    
    const note = await prisma.researchNote.findUnique({
      where: { id: noteId },
    });

    if (!note) {
      throw new AppError(404, 'NOTE_NOT_FOUND', 'The requested research note was not found.');
    }

    return reply.status(200).send(formatSuccess(request, note));
  });

  // GET /api/notes/:noteId/revisions
  fastify.get<{ Params: { noteId: string } }>('/:noteId/revisions', async (request, reply) => {
    const { noteId } = request.params;
    
    // Validate note exists
    const note = await prisma.researchNote.findUnique({
      where: { id: noteId },
    });
    if (!note) {
      throw new AppError(404, 'NOTE_NOT_FOUND', 'The requested research note was not found.');
    }

    const revisions = await prisma.noteRevision.findMany({
      where: { researchNoteId: noteId },
      orderBy: { revisionNo: 'desc' },
      select: {
        id: true,
        revisionNo: true,
        changeSummary: true,
        createdAt: true,
      }
    });

    return reply.status(200).send(formatSuccess(request, revisions));
  });

  // POST /api/notes
  fastify.post<{ Body: BodyNoteCreate }>('/', async (request, reply) => {
    const {
      symbolId, title, thesisText, scenarioText, entryConditionText,
      takeProfitText, stopLossText, invalidationText, nextReviewAt
    } = request.body;

    if (!symbolId || !title) {
      throw new AppError(400, 'VALIDATION_ERROR', 'symbolId and title are required.');
    }

    // Verify symbol exists
    const symbol = await prisma.symbol.findUnique({ where: { id: symbolId } });
    if (!symbol) {
      throw new AppError(400, 'INVALID_SYMBOL', 'The provided symbolId is invalid.');
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const newNote = await tx.researchNote.create({
          data: {
            symbolId,
            title,
            thesisText,
            scenarioText,
            entryConditionText,
            takeProfitText,
            stopLossText,
            invalidationText,
            nextReviewAt: nextReviewAt ? new Date(nextReviewAt) : null,
          }
        });

        const newRevision = await tx.noteRevision.create({
          data: {
            researchNoteId: newNote.id,
            revisionNo: 1,
            changeSummary: '初回作成',
            snapshotJson: newNote as any,
          }
        });

        return { note: newNote, revision: newRevision };
      });

      return reply.code(201).send(formatSuccess(request, result));
    } catch (error) {
      request.log.error(error);
      throw new AppError(500, 'NOTE_CREATION_FAILED', 'Failed to create the research note.');
    }
  });

  // PATCH /api/notes/:noteId
  fastify.patch<{ Params: { noteId: string }, Body: BodyNoteUpdate }>('/:noteId', async (request, reply) => {
    const { noteId } = request.params;
    const updateData = request.body;

    if (Object.keys(updateData).length === 0) {
      throw new AppError(400, 'VALIDATION_ERROR', 'No fields to update provided.');
    }

    try {
      const result = await prisma.$transaction(async (tx) => {
        const existingNote = await tx.researchNote.findUnique({
          where: { id: noteId },
        });

        if (!existingNote) {
          throw new Error('NOTE_NOT_FOUND');
        }

        // Exclude changeSummary from actual note update
        const { changeSummary, ...noteFieldsToUpdate } = updateData;

        // Convert nextReviewAt if present
        let parsedNextReviewAt: Date | null | undefined = undefined;
        if (noteFieldsToUpdate.nextReviewAt !== undefined) {
          parsedNextReviewAt = noteFieldsToUpdate.nextReviewAt ? new Date(noteFieldsToUpdate.nextReviewAt) : null;
        }

        const dataToUpdate: any = { ...noteFieldsToUpdate };
        if (parsedNextReviewAt !== undefined) {
          dataToUpdate.nextReviewAt = parsedNextReviewAt;
        }

        const updatedNote = await tx.researchNote.update({
          where: { id: noteId },
          data: dataToUpdate,
        });

        // Get max revision
        const lastRevision = await tx.noteRevision.findFirst({
          where: { researchNoteId: noteId },
          orderBy: { revisionNo: 'desc' },
        });
        const nextRevNo = lastRevision ? lastRevision.revisionNo + 1 : 1;

        const newRevision = await tx.noteRevision.create({
          data: {
            researchNoteId: updatedNote.id,
            revisionNo: nextRevNo,
            changeSummary: changeSummary || '更新',
            snapshotJson: updatedNote as any,
          }
        });

        return { note: updatedNote, revision: newRevision };
      });

      return reply.status(200).send(formatSuccess(request, result));
    } catch (error: any) {
      if (error.message === 'NOTE_NOT_FOUND') {
        throw new AppError(404, 'NOTE_NOT_FOUND', 'The requested research note was not found.');
      }
      request.log.error(error);
      throw new AppError(500, 'NOTE_UPDATE_FAILED', 'Failed to update the research note.');
    }
  });
};
