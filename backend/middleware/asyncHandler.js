// Wraps an async route handler so any thrown/rejected error is forwarded to
// Express's error pipeline (where errorHandler will format the response).
// Saves a try/catch in every controller.
//
//   router.get('/', asyncHandler(getProducts))

module.exports = (fn) => (req, res, next) => {
  Promise.resolve(fn(req, res, next)).catch(next);
};
