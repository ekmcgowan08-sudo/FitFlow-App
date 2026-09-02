/**
 * Custom global Zod error map for FitFlow.
 *
 * Zod v4 exposes `z.config({ customError })` to register an app-wide error
 * map that runs as a fallback below schema-level and per-parse messages
 * (see https://zod.dev error customization precedence). This keeps every
 * FitFlow API response using the same friendly, on-brand wording instead of
 * Zod's generic "Invalid input: expected string" defaults.
 *
 * Register once at process startup:
 *
 *   import { registerFitFlowErrorMap } from './lib/zod-error-map';
 *   registerFitFlowErrorMap();
 */
import { z } from 'zod';

/** Human-friendly label for a field path, e.g. ['profile','heightCm'] -> "profile.heightCm" */
function fieldLabel(path: PropertyKey[]): string {
  if (path.length === 0) return 'This field';
  return path.map(String).join('.');
}

export const fitFlowErrorMap: z.core.$ZodErrorMap = (issue) => {
  const field = fieldLabel(issue.path ?? []);

  switch (issue.code) {
    case 'invalid_type': {
      if (issue.input === undefined || issue.input === null) {
        return `${field} is required.`;
      }
      return `${field} must be a ${issue.expected}, not ${typeof issue.input}.`;
    }

    case 'too_small': {
      const noun = issue.origin === 'string' ? 'characters' : issue.origin === 'array' ? 'items' : '';
      if (issue.origin === 'string' || issue.origin === 'array') {
        return `${field} must have at least ${issue.minimum} ${noun}.`;
      }
      if (issue.origin === 'date') {
        return `${field} must be on or after ${new Date(Number(issue.minimum)).toISOString().slice(0, 10)}.`;
      }
      return `${field} must be at least ${issue.minimum}.`;
    }

    case 'too_big': {
      const noun = issue.origin === 'string' ? 'characters' : issue.origin === 'array' ? 'items' : '';
      if (issue.origin === 'string' || issue.origin === 'array') {
        return `${field} must have at most ${issue.maximum} ${noun}.`;
      }
      return `${field} must be at most ${issue.maximum}.`;
    }

    case 'invalid_format': {
      if (issue.format === 'email') return `${field} must be a valid email address.`;
      if (issue.format === 'uuid') return `${field} must be a valid ID.`;
      if (issue.format === 'datetime' || issue.format === 'iso_datetime') {
        return `${field} must be a valid date and time (ISO 8601).`;
      }
      return `${field} is not formatted correctly.`;
    }

    case 'invalid_value': {
      const options = Array.isArray(issue.values) ? issue.values.join(', ') : String(issue.values);
      return `${field} must be one of: ${options}.`;
    }

    case 'unrecognized_keys': {
      return `Unexpected field${issue.keys.length > 1 ? 's' : ''}: ${issue.keys.join(', ')}.`;
    }

    case 'invalid_union':
      return `${field} did not match any of the accepted formats.`;

    case 'not_multiple_of':
      return `${field} must be a multiple of ${issue.divisor}.`;

    case 'custom':
      // Preserve a message explicitly set via ctx.addIssue({ message }) in a .superRefine().
      return issue.message ?? `${field} is invalid.`;

    default:
      return `${field} is invalid.`;
  }
};

/** Registers the FitFlow error map as the global Zod fallback (call once at startup). */
export function registerFitFlowErrorMap(): void {
  z.config({ customError: fitFlowErrorMap });
}
