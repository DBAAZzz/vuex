import { mergeObjects, deepClone } from './util'
import devtoolMiddleware from './middlewares/devtool'
import createLogger from './middlewares/logger'
import override from './override'

/**
 * Vue 根实例，通过 install 方法获取
 */
let Vue

export class Store {

  /**
   * @param {Object} options
   *        - {Object} state
   *        - {Object} actions
   *        - {Object} mutations
   *        - {Array} middlewares
   *        - {Boolean} strict
   */

  constructor ({
    state = {},
    mutations = {},
    modules = {},
    middlewares = [],
    strict = false
  } = {}) {
    // 初始化的时候没有 mutations 的方法在执行
    this._dispatching = false
    this._rootMutations = this._mutations = mutations
    this._modules = modules
    // bind dispatch to self
    const dispatch = this.dispatch
    this.dispatch = (...args) => {
      dispatch.apply(this, args)
    }
    // use a Vue instance to store the state tree
    this._vm = new Vue({
      data: state
    })
    // 绑定 state tree 到 root tree
    this._setupModuleState(state, modules)
    // 绑定 mutations 到子树，并将他们合并为一个最终的 mutations map
    this._setupModuleMutations(modules)

    this._setupMiddlewares(middlewares, state)
    // add extra warnings in strict mode
    // 如果把 strict 设置为 true, 那么 vuex 会对 state 树进行一个深观察
    // 所以为了避免不必要的性能损耗，要在生产环境中关闭严格模式
    if (strict) {
      this._setupMutationCheck()
    }
  }

  /**
   * Getter for the entire state tree.
   * Read only.
   *
   * @return {Object}
   */

  get state () {
    return this._vm._data
  }

  set state (v) {
    throw new Error('[vuex] Vuex root state is read only.')
  }

  /**
   * Dispatch an action.
   *
   * @param {String} type type为mutaions的方法名
   */

  dispatch (type, ...payload) {
    // 通过 type 来获取 mutaions 的方法名
    const mutation = this._mutations[type]
    const prevSnapshot = this._prevSnapshot

    const state = this.state
    let snapshot, clonedPayload
    if (mutation) {
      this._dispatching = true
      // 考虑到 mutation 是数组的情况
      // 在 vuex 正式版本中好像是没有这种写法的
      if (Array.isArray(mutation)) {
        mutation.forEach(m => m(state, ...payload))
      } else {
        // 执行mutaion的方法修改 state 状态
        mutation(state, ...payload)
      }
      // 执行成功后，将 dispatching 设置为 true 
      this._dispatching = false
      // invoke middlewares
      // 正式环境中好像没有这种东西
      if (this._needSnapshots) {
        snapshot = this._prevSnapshot = deepClone(state)
        clonedPayload = deepClone(payload)
      }
      this._middlewares.forEach(m => {
        if (m.onMutation) {
          if (m.snapshot) {
            m.onMutation({ type, payload: clonedPayload }, snapshot, prevSnapshot)
          } else {
            m.onMutation({ type, payload }, state)
          }
        }
      })
    } else { 
      console.warn(`[vuex] Unknown mutation: ${type}`)
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

  watch (expOrFn, cb, options) {
    return this._vm.$watch(() => {
      return typeof expOrFn === 'function'
        ? expOrFn(this.state)
        : this._vm.$get(expOrFn)
    }, cb, options)
  }

  /**
   * Hot update actions and mutations.
   *
   * @param {Object} options
   *        - {Object} [mutations]
   *        - {Object} [modules]
   */

  hotUpdate ({ mutations, modules } = {}) {
    this._rootMutations = this._mutations = mutations || this._rootMutations
    this._setupModuleMutations(modules || this._modules)
  }

  /**
   * Attach sub state tree of each module to the root tree.
   * 把每个模块的 state tree 添加到根节点树
   * @param {Object} state
   * @param {Object} modules
   */

  _setupModuleState (state, modules) {
    console.log('被执行了吧', modules)
    const { setPath } = Vue.parsers.path
    Object.keys(modules).forEach(key => {
      setPath(state, key, modules[key].state)
    })
  }

  /**
   * Bind mutations for each module to its sub tree and
   * merge them all into one final mutations map.
   * 将每个模块的 mutations 绑定到其子树，并将他们全部合并为一个最终的 mutations map
   * @param {Object} modules
   */

  _setupModuleMutations (modules) {
    this._modules = modules
    const { getPath } = Vue.parsers.path
    const allMutations = [this._rootMutations]
    Object.keys(modules).forEach(key => {
      const module = modules[key]
      // bind mutations to sub state tree
      const mutations = {}
      Object.keys(module.mutations).forEach(name => {
        const original = module.mutations[name]
        mutations[name] = (state, ...args) => {
          original(getPath(state, key), ...args)
        }
      })
      allMutations.push(mutations)
    })
    this._mutations = mergeObjects(allMutations)
  }

  /**
   * Setup mutation check: if the vuex instance's state is mutated
   * outside of a mutation handler, we throw en error. This effectively
   * enforces all mutations to the state to be trackable and hot-reloadble.
   * However, this comes at a run time cost since we are doing a deep
   * watch on the entire state tree, so it is only enalbed with the
   * strict option is set to true.
   */

  _setupMutationCheck () {
    // a hack to get the watcher constructor from older versions of Vue
    // mainly because the public $watch method does not allow sync
    // watchers.
    const unwatch = this._vm.$watch('__vuex__', a => a)
    const Watcher = this._vm._watchers[0].constructor
    unwatch()
    /* eslint-disable no-new */
    new Watcher(this._vm, '$data', () => {
      if (!this._dispatching) {
        throw new Error(
          '[vuex] Do not mutate vuex store state outside mutation handlers.'
        )
      }
    }, { deep: true, sync: true })
    /* eslint-enable no-new */
  }

  /**
   * Setup the middlewares. The devtools middleware is always
   * included, since it does nothing if no devtool is detected.
   *
   * A middleware can demand the state it receives to be
   * "snapshots", i.e. deep clones of the actual state tree.
   *  
   * 设置中间件 可能是为 dev tool用的
   * @param {Array} middlewares
   * @param {Object} state
   */

  _setupMiddlewares (middlewares, state) {
    this._middlewares = [devtoolMiddleware].concat(middlewares)
    this._needSnapshots = middlewares.some(m => m.snapshot)
    if (this._needSnapshots) {
      console.log(
        '[vuex] One or more of your middlewares are taking state snapshots ' +
        'for each mutation. Make sure to use them only during development.'
      )
    }
    const initialSnapshot = this._prevSnapshot = this._needSnapshots
      ? deepClone(state)
      : null
    // call init hooks
    this._middlewares.forEach(m => {
      if (m.onInit) {
        m.onInit(m.snapshot ? initialSnapshot : state)
      }
    })
  }
}

function install (_Vue) {
  Vue = _Vue
  override(Vue)
}

export {
  install,
  createLogger
}

// also export the default
export default {
  Store,
  install,
  createLogger
}
