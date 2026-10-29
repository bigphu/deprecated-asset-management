const { ApiError } = require('../errors');
const { recordEventSafely } = require('../../repositories/securityEvents.repo');

/**
 * Builds the 403 for a refused request and records it as a security event. `details` says what was
 * missing: { required: [...] } when all of the keys are needed, { requiredAny: [...] } for any one of them.
 */
function deny(req, details, message = 'You do not have permission to perform this action') {
  recordEventSafely({
    type: 'authz.permission_denied',
    actorUserId: req.auth ? req.auth.user_id : null,
    sessionId: req.auth ? req.auth.id : null,
    ipAddress: req.ip,
    details: { ...details, method: req.method, path: req.originalUrl },
  });
  return new ApiError(403, 'FORBIDDEN', message);
}

/** Every one of the keys is needed. */
function requirePermissions(...permissionKeys) {
  return function (req, res, next) {
    const permissions = req.auth && req.auth.permissionSet;
    if (!permissions || permissionKeys.some((key) => !permissions.has(key))) {
      return next(deny(req, { required: permissionKeys }));
    }
    next();
  };
}

/** At least one of the keys is needed; the handler then decides what each key allows. */
function requireAnyPermission(...permissionKeys) {
  return function (req, res, next) {
    const permissions = req.auth && req.auth.permissionSet;
    if (!permissions || permissionKeys.every((key) => !permissions.has(key))) {
      return next(deny(req, { requiredAny: permissionKeys }));
    }
    next();
  };
}

module.exports = { requirePermissions, requireAnyPermission, deny };
