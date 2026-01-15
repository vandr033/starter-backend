import { MensajeApi } from '../types/MensajeApi';

const extractTechnicalMessage = (error: unknown): string =>
  error instanceof Error ? error.message : 'Unknown error';

export const buildSuccessResponse = (
  message: string,
  data?: unknown,
  code = 200,
): MensajeApi =>
  new MensajeApi({
    code,
    error: false,
    message,
    data,
  });

export const buildNotFoundResponse = (
  entityLabel: string,
  message?: string,
  code = 404,
): MensajeApi =>
  new MensajeApi({
    code,
    error: true,
    message: message ?? `${entityLabel} not found`,
  });

export const buildServiceErrorResponse = (
  entityLabel: string,
  action: string,
  error: unknown,
  code = 500,
): MensajeApi =>
  new MensajeApi({
    code,
    error: true,
    message: `Unable to ${action} ${entityLabel.toLowerCase()}`,
    technicalMessage: extractTechnicalMessage(error),
  });
