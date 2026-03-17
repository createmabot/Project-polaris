import crypto from 'crypto';

/**
 * Hash a secret string with SHA-256.
 * Used for tokenHash and sharedSecretHash storage/comparison.
 */
export function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}
