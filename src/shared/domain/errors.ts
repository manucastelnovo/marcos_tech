/**
 * Domain errors are thrown by use cases and translated into a serialisable
 * result at the Server Action boundary. Nothing below that boundary knows
 * about HTTP, React, or form state.
 */
export class DomainError extends Error {
  constructor(
    message: string,
    readonly code: string,
  ) {
    super(message);
    this.name = new.target.name;
  }
}

/** The caller asked for something that does not exist, or was soft-deleted. */
export class NotFoundError extends DomainError {
  constructor(entity: string, id?: string) {
    super(id ? `${entity} ${id} no existe` : `${entity} no existe`, "NOT_FOUND");
  }
}

/** The caller is authenticated but their role does not permit this action. */
export class ForbiddenError extends DomainError {
  constructor(message = "No tenés permiso para realizar esta acción") {
    super(message, "FORBIDDEN");
  }
}

/** The caller is not authenticated at all. */
export class UnauthenticatedError extends DomainError {
  constructor() {
    super("Tu sesión expiró. Iniciá sesión nuevamente.", "UNAUTHENTICATED");
  }
}

/** Input violated a business rule that Zod cannot express on its own. */
export class BusinessRuleError extends DomainError {
  constructor(message: string) {
    super(message, "BUSINESS_RULE");
  }
}

/** A repair status change that the state machine does not allow. */
export class InvalidStatusTransitionError extends DomainError {
  constructor(from: string, to: string) {
    super(`No se puede pasar de "${from}" a "${to}"`, "INVALID_TRANSITION");
  }
}
