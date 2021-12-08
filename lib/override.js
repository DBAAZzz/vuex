'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});

exports.default = function (Vue) {
  var _init = Vue.prototype._init;
  Vue.prototype._init = function (options) {
    options = options || {};
    var componentOptions = this.constructor.options;
    // store injection
    var store = options.store || componentOptions.store;
    if (store) {
      this.$store = store;
    } else if (options.parent && options.parent.$store) {
      this.$store = options.parent.$store;
    }
    // vuex option handling
    var vuex = options.vuex || componentOptions.vuex;
    if (vuex) {
      if (!this.$store) {
        console.warn('[vuex] store not injected. make sure to ' + 'provide the store option in your root component.');
      }
      var state = vuex.state,
          actions = vuex.actions;
      // state

      if (state) {
        options.computed = options.computed || {};
        Object.keys(state).forEach(function (key) {
          options.computed[key] = function vuexBoundGetter() {
            return state[key].call(this, this.$store.state);
          };
        });
      }
      // actions
      if (actions) {
        options.methods = options.methods || {};
        Object.keys(actions).forEach(function (key) {
          options.methods[key] = function vuexBoundAction() {
            var _actions$key;

            for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
              args[_key] = arguments[_key];
            }

            return (_actions$key = actions[key]).call.apply(_actions$key, [this, this.$store].concat(args));
          };
        });
      }
    }
    _init.call(this, options);
  };
};

module.exports = exports['default']; // export install function