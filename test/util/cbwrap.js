module.exports = function cbwrap(func) {
  var args = Array.prototype.slice.call(arguments,1);
  return function() {
    return func.apply(this,args);
  };
};
