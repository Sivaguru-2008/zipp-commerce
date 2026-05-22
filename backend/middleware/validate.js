const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');

// Reads express-validator results; throws ApiError(422) when invalid so the
// central errorHandler formats the response. Use after the body()/param() chain.
module.exports = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return next(new ApiError(422, 'Validation failed', errors.array()));
  }
  next();
};
