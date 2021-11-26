// wrapper for async middleware. Eliminats need to catch errors
const catchError = handler => {
  return (req, res, next) => {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
};
module.exports = catchError;
