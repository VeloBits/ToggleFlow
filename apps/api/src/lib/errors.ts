/** HTTP-mapped errors thrown from handlers; the server error handler serializes them. */
export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
    this.name = 'HttpError';
  }
}

export const notFound = (what: string) => new HttpError(404, 'not_found', `${what} not found`);
export const forbidden = (message = 'insufficient role for this action') =>
  new HttpError(403, 'forbidden', message);
export const unauthorized = (message: string) => new HttpError(401, 'unauthorized', message);
export const badRequest = (message: string) => new HttpError(400, 'bad_request', message);
