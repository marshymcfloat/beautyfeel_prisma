/**
 * Validation schemas and utilities for unit action socket events
 * Note: Using plain JavaScript validation since backend uses JS
 */

/**
 * Validates unit action payload structure
 * @param {Object} payload - The payload to validate
 * @returns {{ valid: boolean; error?: string }}
 */
function validateUnitActionPayload(payload) {
  if (!payload || typeof payload !== "object") {
    return { valid: false, error: "Invalid payload: must be an object" };
  }

  const { unitId, availedServiceId, transactionId, accountId } = payload;

  if (!unitId || typeof unitId !== "string" || unitId.trim() === "") {
    return { valid: false, error: "Invalid unitId: must be a non-empty string" };
  }

  if (!availedServiceId || typeof availedServiceId !== "string" || availedServiceId.trim() === "") {
    return { valid: false, error: "Invalid availedServiceId: must be a non-empty string" };
  }

  if (!transactionId || typeof transactionId !== "string" || transactionId.trim() === "") {
    return { valid: false, error: "Invalid transactionId: must be a non-empty string" };
  }

  if (!accountId || typeof accountId !== "string" || accountId.trim() === "") {
    return { valid: false, error: "Invalid accountId: must be a non-empty string" };
  }

  return { valid: true };
}

/**
 * Validates accountId matches authenticated account
 * @param {string} providedAccountId - Account ID from payload
 * @param {string} authenticatedAccountId - Authenticated account ID from socket
 * @returns {{ valid: boolean; error?: string }}
 */
function validateAccountId(providedAccountId, authenticatedAccountId) {
  if (!authenticatedAccountId) {
    return { valid: false, error: "Unauthorized: No authenticated account" };
  }

  if (providedAccountId !== authenticatedAccountId) {
    return { valid: false, error: "Unauthorized: Account ID mismatch" };
  }

  return { valid: true };
}

/**
 * Creates a standardized error response for unit actions
 * @param {string} unitId - Unit ID
 * @param {string} message - Error message
 * @returns {Object} Standardized error payload
 */
function createUnitActionError(unitId, message) {
  return {
    unitId,
    message: message || "An unexpected error occurred",
  };
}

/**
 * Validates unit status for check action
 * @param {string} status - Current unit status
 * @param {string} checkedById - ID of user who checked the unit (if any)
 * @param {string} accountId - Account ID attempting to check
 * @returns {{ valid: boolean; error?: string }}
 */
function validateUnitForCheck(status, checkedById, accountId) {
  if (status !== "PENDING") {
    return { valid: false, error: `Cannot check unit: Unit status is ${status}. Only PENDING units can be checked.` };
  }

  if (checkedById) {
    if (checkedById === accountId) {
      return { valid: false, error: "Unit is already checked by you." };
    }
    return { valid: false, error: `Unit is already checked by another user.` };
  }

  return { valid: true };
}

/**
 * Validates unit status for uncheck action
 * @param {string} status - Current unit status
 * @param {string} checkedById - ID of user who checked the unit (if any)
 * @param {string} accountId - Account ID attempting to uncheck
 * @returns {{ valid: boolean; error?: string }}
 */
function validateUnitForUncheck(status, checkedById, accountId) {
  if (status !== "PENDING") {
    return { valid: false, error: `Cannot uncheck unit: Unit status is ${status}.` };
  }

  if (!checkedById) {
    return { valid: false, error: "Unit is not currently checked." };
  }

  if (checkedById !== accountId) {
    return { valid: false, error: "Cannot uncheck a unit checked by someone else." };
  }

  return { valid: true };
}

/**
 * Validates unit status for serve action
 * @param {string} status - Current unit status
 * @param {string} checkedById - ID of user who checked the unit (if any)
 * @param {string} servedById - ID of user who served the unit (if any)
 * @param {string} accountId - Account ID attempting to serve
 * @returns {{ valid: boolean; error?: string }}
 */
function validateUnitForServe(status, checkedById, servedById, accountId) {
  if (status !== "PENDING") {
    return { valid: false, error: `Cannot mark unit served: Unit status is ${status}. Only PENDING units can be marked as served.` };
  }

  if (servedById) {
    if (servedById === accountId) {
      return { valid: false, error: "Unit is already served by you." };
    }
    return { valid: false, error: `Unit is already served by another user.` };
  }

  // Optional: Require unit to be checked before serving
  // if (!checkedById) {
  //   return { valid: false, error: "Unit must be checked before it can be served." };
  // }

  return { valid: true };
}

/**
 * Validates unit status for unserve action
 * @param {string} status - Current unit status
 * @param {string} servedById - ID of user who served the unit (if any)
 * @param {string} accountId - Account ID attempting to unserve
 * @returns {{ valid: boolean; error?: string }}
 */
function validateUnitForUnserve(status, servedById, accountId) {
  if (status !== "PENDING" && status !== "DONE") {
    return { valid: false, error: `Cannot unmark unit served: Unit status is ${status}.` };
  }

  if (!servedById) {
    return { valid: false, error: "Unit is not currently served." };
  }

  if (servedById !== accountId) {
    return { valid: false, error: "Cannot unmark a unit served by someone else." };
  }

  return { valid: true };
}

module.exports = {
  validateUnitActionPayload,
  validateAccountId,
  createUnitActionError,
  validateUnitForCheck,
  validateUnitForUncheck,
  validateUnitForServe,
  validateUnitForUnserve,
};

