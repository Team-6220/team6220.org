// google.script.* for the original inventory UI, outside Apps Script.
//
// Inlined as a classic <script> at the top of the page (src/pages/apps/inventory/index.astro), so it exists
// before the original scripts run: JsCore's App.start() calls google.script.run.apiGetAll right away.
// Calls made before the sign-in check finishes wait in a queue. main.ts then calls
// window.__ggiInventory.attach(dispatch), and every call goes to the Apps Script API port in @team6220/data.
//
// Same chaining API as Apps Script:
//   google.script.run.withSuccessHandler(fn).withFailureHandler(fn).withUserObject(obj).someFunction(arg, ...)
// Each with...() returns a new runner; handlers are called asynchronously with (result, userObject).
(function () {
  "use strict";
  var queue = [];
  var dispatch = null;

  function deliver(call) {
    var p;
    try {
      p = Promise.resolve(dispatch(call.name, call.args));
    } catch (e) {
      p = Promise.reject(e);
    }
    p.then(
      function (result) {
        if (call.ok) call.ok(result, call.user);
      },
      function (err) {
        var e = err instanceof Error ? err : new Error(String(err));
        if (call.fail) call.fail(e, call.user);
        else console.error("google.script.run." + call.name + " failed", e);
      },
    );
  }

  function runner(ok, fail, user) {
    var base = {
      withSuccessHandler: function (fn) {
        return runner(fn, fail, user);
      },
      withFailureHandler: function (fn) {
        return runner(ok, fn, user);
      },
      withUserObject: function (obj) {
        return runner(ok, fail, obj);
      },
    };
    return new Proxy(base, {
      get: function (target, name) {
        if (Object.prototype.hasOwnProperty.call(target, name)) return target[name];
        // Not a server function: symbols, and "then" (so a runner is never mistaken for a Promise).
        if (typeof name !== "string" || name === "then") return undefined;
        return function () {
          var call = { name: name, args: Array.prototype.slice.call(arguments), ok: ok, fail: fail, user: user };
          if (dispatch) deliver(call);
          else queue.push(call);
        };
      },
    });
  }

  var noop = function () {};
  var g = (window.google = window.google || {});
  g.script = {
    run: runner(null, null, undefined),
    // Apps Script's dialog / sidebar host. The inventory is a normal page here, so these do nothing.
    host: { origin: location.origin, close: noop, setHeight: noop, setWidth: noop, editor: { focus: noop } },
    url: {
      getLocation: function (cb) {
        var parameter = {};
        var parameters = {};
        new URLSearchParams(location.search).forEach(function (v, k) {
          if (!(k in parameter)) parameter[k] = v;
          (parameters[k] = parameters[k] || []).push(v);
        });
        cb({ hash: location.hash.replace(/^#/, ""), parameter: parameter, parameters: parameters });
      },
    },
    history: { push: noop, replace: noop, setChangeHandler: noop },
  };

  window.__ggiInventory = {
    /** Connects google.script.run to the real functions and sends the calls that were waiting. */
    attach: function (fn) {
      dispatch = fn;
      queue.splice(0).forEach(deliver);
    },
  };
})();
