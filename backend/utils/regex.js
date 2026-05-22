// Escape user input before passing it into `new RegExp(...)`.
// Prevents ReDoS and "weird character breaks the query" bugs.
exports.escapeRegex = (str) => String(str).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
