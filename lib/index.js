'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.createLogger = exports.install = exports.Store = undefined;

var _createClass = function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ("value" in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; }();

var _util = require('./util');

var _devtool = require('./middlewares/devtool');

var _devtool2 = _interopRequireDefault(_devtool);

var _logger = require('./middlewares/logger');

var _logger2 = _interopRequireDefault(_logger);

var _override = require('./override');

var _override2 = _interopRequireDefault(_override);

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { default: obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError("Cannot call a class as a function"); } }

var Vue = void 0;

var Store = exports.Store = function () {

  /**
   * @param {Object} options
   *        - {Object} state
   *        - {Object} actions
   *        - {Object} mutations
   *        - {Array} middlewares
   *        - {Boolean} strict
   */

  function Store() {
    var _this = this;

    var _ref = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
        _ref$state = _ref.state,
        state = _ref$state === undefined ? {} : _ref$state,
        _ref$mutations = _ref.mutations,
        mutations = _ref$mutations === undefined ? {} : _ref$mutations,
        _ref$modules = _ref.modules,
        modules = _ref$modules === undefined ? {} : _ref$modules,
        _ref$middlewares = _ref.middlewares,
        middlewares = _ref$middlewares === undefined ? [] : _ref$middlewares,
        _ref$strict = _ref.strict,
        strict = _ref$strict === undefined ? false : _ref$strict;

    _classCallCheck(this, Store);

    this._dispatching = false;
    this._rootMutations = this._mutations = mutations;
    this._modules = modules;
    // bind dispatch to self
    var dispatch = this.dispatch;
    this.dispatch = function () {
      for (var _len = arguments.length, args = Array(_len), _key = 0; _key < _len; _key++) {
        args[_key] = arguments[_key];
      }

      dispatch.apply(_this, args);
    };
    // use a Vue instance to store the state tree
    this._vm = new Vue({
      data: state
    });
    this._setupModuleState(state, modules);
    this._setupModuleMutations(modules);
    this._setupMiddlewares(middlewares, state);
    // add extra warnings in strict mode
    if (strict) {
      this._setupMutationCheck();
    }
  }

  /**
   * Getter for the entire state tree.
   * Read only.
   *
   * @return {Object}
   */

  _createClass(Store, [{
    key: 'dispatch',


    /**
     * Dispatch an action.
     *
     * @param {String} type
     */

    value: function dispatch(type) {
      for (var _len2 = arguments.length, payload = Array(_len2 > 1 ? _len2 - 1 : 0), _key2 = 1; _key2 < _len2; _key2++) {
        payload[_key2 - 1] = arguments[_key2];
      }

      var mutation = this._mutations[type];
      var prevSnapshot = this._prevSnapshot;
      var state = this.state;
      var snapshot = void 0,
          clonedPayload = void 0;
      if (mutation) {
        this._dispatching = true;
        // apply the mutation
        if (Array.isArray(mutation)) {
          mutation.forEach(function (m) {
            return m.apply(undefined, [state].concat(payload));
          });
        } else {
          mutation.apply(undefined, [state].concat(payload));
        }
        this._dispatching = false;
        // invoke middlewares
        if (this._needSnapshots) {
          snapshot = this._prevSnapshot = (0, _util.deepClone)(state);
          clonedPayload = (0, _util.deepClone)(payload);
        }
        this._middlewares.forEach(function (m) {
          if (m.onMutation) {
            if (m.snapshot) {
              m.onMutation({ type: type, payload: clonedPayload }, snapshot, prevSnapshot);
            } else {
              m.onMutation({ type: type, payload: payload }, state);
            }
          }
        });
      } else {
        console.warn('[vuex] Unknown mutation: ' + type);
      }
    }

    /**
     * Watch state changes on the store.
     * Same API as Vue's $watch, except when watching a function,
     * the function gets the state as the first argument.
     *
     * @param {String|Function} expOrFn
     * @param {Function} cb
     * @param {Object} [options]
     */

  }, {
    key: 'watch',
    value: function watch(expOrFn, cb, options) {
      var _this2 = this;

      return this._vm.$watch(function () {
        return typeof expOrFn === 'function' ? expOrFn(_this2.state) : _this2._vm.$get(expOrFn);
      }, cb, options);
    }

    /**
     * Hot update actions and mutations.
     *
     * @param {Object} options
     *        - {Object} [mutations]
     *        - {Object} [modules]
     */

  }, {
    key: 'hotUpdate',
    value: function hotUpdate() {
      var _ref2 = arguments.length > 0 && arguments[0] !== undefined ? arguments[0] : {},
          mutations = _ref2.mutations,
          modules = _ref2.modules;

      this._rootMutations = this._mutations = mutations || this._rootMutations;
      this._setupModuleMutations(modules || this._modules);
    }

    /**
     * Attach sub state tree of each module to the root tree.
     *
     * @param {Object} state
     * @param {Object} modules
     */

  }, {
    key: '_setupModuleState',
    value: function _setupModuleState(state, modules) {
      var setPath = Vue.parsers.path.setPath;

      Object.keys(modules).forEach(function (key) {
        setPath(state, key, modules[key].state);
      });
    }

    /**
     * Bind mutations for each module to its sub tree and
     * merge them all into one final mutations map.
     *
     * @param {Object} modules
     */

  }, {
    key: '_setupModuleMutations',
    value: function _setupModuleMutations(modules) {
      this._modules = modules;
      var getPath = Vue.parsers.path.getPath;

      var allMutations = [this._rootMutations];
      Object.keys(modules).forEach(function (key) {
        var module = modules[key];
        // bind mutations to sub state tree
        var mutations = {};
        Object.keys(module.mutations).forEach(function (name) {
          var original = module.mutations[name];
          mutations[name] = function (state) {
            for (var _len3 = arguments.length, args = Array(_len3 > 1 ? _len3 - 1 : 0), _key3 = 1; _key3 < _len3; _key3++) {
              args[_key3 - 1] = arguments[_key3];
            }

            original.apply(undefined, [getPath(state, key)].concat(args));
          };
        });
        allMutations.push(mutations);
      });
      this._mutations = (0, _util.mergeObjects)(allMutations);
    }

    /**
     * Setup mutation check: if the vuex instance's state is mutated
     * outside of a mutation handler, we throw en error. This effectively
     * enforces all mutations to the state to be trackable and hot-reloadble.
     * However, this comes at a run time cost since we are doing a deep
     * watch on the entire state tree, so it is only enalbed with the
     * strict option is set to true.
     */

  }, {
    key: '_setupMutationCheck',
    value: function _setupMutationCheck() {
      var _this3 = this;

      // a hack to get the watcher constructor from older versions of Vue
      // mainly because the public $watch method does not allow sync
      // watchers.
      var unwatch = this._vm.$watch('__vuex__', function (a) {
        return a;
      });
      var Watcher = this._vm._watchers[0].constructor;
      unwatch();
      /* eslint-disable no-new */
      new Watcher(this._vm, '$data', function () {
        if (!_this3._dispatching) {
          throw new Error('[vuex] Do not mutate vuex store state outside mutation handlers.');
        }
      }, { deep: true, sync: true });
      /* eslint-enable no-new */
    }

    /**
     * Setup the middlewares. The devtools middleware is always
     * included, since it does nothing if no devtool is detected.
     *
     * A middleware can demand the state it receives to be
     * "snapshots", i.e. deep clones of the actual state tree.
     *
     * @param {Array} middlewares
     * @param {Object} state
     */

  }, {
    key: '_setupMiddlewares',
    value: function _setupMiddlewares(middlewares, state) {
      this._middlewares = [_devtool2.default].concat(middlewares);
      this._needSnapshots = middlewares.some(function (m) {
        return m.snapshot;
      });
      if (this._needSnapshots) {
        console.log('[vuex] One or more of your middlewares are taking state snapshots ' + 'for each mutation. Make sure to use them only during development.');
      }
      var initialSnapshot = this._prevSnapshot = this._needSnapshots ? (0, _util.deepClone)(state) : null;
      // call init hooks
      this._middlewares.forEach(function (m) {
        if (m.onInit) {
          m.onInit(m.snapshot ? initialSnapshot : state);
        }
      });
    }
  }, {
    key: 'state',
    get: function get() {
      return this._vm._data;
    },
    set: function set(v) {
      throw new Error('[vuex] Vuex root state is read only.');
    }
  }]);

  return Store;
}();

function install(_Vue) {
  Vue = _Vue;
  (0, _override2.default)(Vue);
}

exports.install = install;
exports.createLogger = _logger2.default;

// also export the default

exports.default = {
  Store: Store,
  install: install,
  createLogger: _logger2.default
};