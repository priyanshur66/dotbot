const { AsyncLocalStorage } = require("async_hooks");

const requestContextStorage = new AsyncLocalStorage();

function runWithRequestContext(context, fn) {
  return requestContextStorage.run(context, fn);
}

function getRequestContext() {
  return requestContextStorage.getStore() || {};
}

module.exports = {
  runWithRequestContext,
  getRequestContext,
};
