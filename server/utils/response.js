export const ok = (data, meta) => ({
  success: true,
  data,
  ...(meta ? { meta } : {}),
  timestamp: new Date().toISOString(),
});

export const fail = (code, message, details) => ({
  success: false,
  error: { code, message, ...(details ? { details } : {}) },
  timestamp: new Date().toISOString(),
});

export class AppError extends Error {
  constructor(code, message, statusCode = 400, details) {
    super(message);
    this.code = code;
    this.statusCode = statusCode;
    this.details = details;
  }
}
