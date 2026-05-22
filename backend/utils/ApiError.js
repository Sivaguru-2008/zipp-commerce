// Thrown by services/controllers to produce a structured error response
// that errorHandler will turn into { success:false, message, errors? }.
class ApiError extends Error {
  constructor(status, message, errors = null) {
    super(message);
    this.status = status;
    this.errors = errors;
    this.isOperational = true;
  }
}

module.exports = ApiError;
