import type { GenerateErrorCode } from "./limits.ts";

/** An error with a code the upload page can explain. The message never contains source text or secrets. */
export class GenerateError extends Error {
  code: GenerateErrorCode;
  constructor(code: GenerateErrorCode, message: string) {
    super(message);
    this.code = code;
  }
}
