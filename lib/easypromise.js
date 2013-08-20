/* -*- Mode: Java; tab-width: 2; indent-tabs-mode: nil; c-basic-offset: 2 -*- */
/* vim: set shiftwidth=2 tabstop=2 autoindent cindent expandtab: */
/* Copyright 2012 Mozilla Foundation
*
* Licensed under the Apache License, Version 2.0 (the "License");
* you may not use this file except in compliance with the License.
* You may obtain a copy of the License at
*
* http://www.apache.org/licenses/LICENSE-2.0
*
* Unless required by applicable law or agreed to in writing, software
* distributed under the License is distributed on an "AS IS" BASIS,
* WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
* See the License for the specific language governing permissions and
* limitations under the License.
*/
var Promise = (function PromiseClosure() {
  'use strict';

  function isPromise(obj) {
    return typeof obj === 'object' && obj !== null &&
      typeof obj.then === 'function';
  }
  function defaultOnFulfilled(value) {
    return value;
  }
  function defaultOnRejected(reason) {
    throw reason;
  }

  function propagateFulfilled(subject, value) {
    subject.subpromisesValue = value;
    var subpromises = subject.subpromises;
    if (!subpromises) {
      return;
    }
    for (var i = 0; i < subpromises.length; i++) {
      subpromises[i].fulfill(value);
    }
    delete subject.subpromises;
  }
  function propagateRejected(subject, reason) {
    subject.subpromisesReason = reason;
    var subpromises = subject.subpromises;
    if (!subpromises) {
      return;
    }
    for (var i = 0; i < subpromises.length; i++) {
      subpromises[i].reject(reason);
    }
    delete subject.subpromises;
  }

  function performCall(callback, arg, subject) {
    try {
      var value = callback(arg);
      if (isPromise(value)) {
        value.then(function Promise_queueCall_onFulfilled(value) {
          propagateFulfilled(subject, value);
        }, function Promise_queueCall_onRejected(reason) {
          propagateRejected(subject, reason);
        });
        return;
      }

      propagateFulfilled(subject, value);
    } catch (ex) {
      propagateRejected(subject, ex);
    }
  }

  var queue = [];
  function processQueue() {
    while (queue.length > 0) {
      var task = queue[0];
      if (task.directCallback) {
        task.callback.call(task.subject, task.arg);
      } else {
        performCall(task.callback, task.arg, task.subject);
      }
      queue.shift();
    }
  }

  function queueCall(callback, arg, subject, directCallback) {
    if (queue.length === 0) {
      setTimeout(processQueue, 0);
    }
    queue.push({callback: callback, arg: arg, subject: subject,
                directCallback: directCallback});
  }

  function Promise(init, onFulfilled, onRejected) {
    this.state = 'pending';
    this.onFulfilled = typeof onFulfilled === 'function' ?
      onFulfilled : defaultOnFulfilled;
    this.onRejected = typeof onRejected === 'function' ?
      onRejected : defaultOnRejected;

    if (init) {
      init(this); // we don't define resolver yet, using itself as a resolver
    }
  }
  Promise.prototype = {
    fulfill: function Promise_fulfill(value) {
      if (this.state !== 'pending') {
        return;
      }
      this.state = 'fulfilled';
      this.value = value;
      queueCall(this.onFulfilled, value, this, false);
    },
    resolve: function Promise_resolve(value) {
      if (isPromise(value)) {
        value.then(this.resolve.bind(this), this.reject.bind(this));
      }
      this.fulfill(value);
    },
    reject: function Promise_reject(reason) {
      if (this.state !== 'pending') {
        return;
      }
      this.state = 'rejected';
      this.reason = reason;
      queueCall(this.onRejected, reason, this, false);
    },
    then: function Promise_then(onFulfilled, onRejected) {
      var promise = new Promise(null, onFulfilled, onRejected);
      if ('subpromisesValue' in this) {
        queueCall(promise.fulfill, this.subpromisesValue, promise, true);
      } else if ('subpromisesReason' in this) {
        queueCall(promise.reject, this.subpromisesReason, promise, true);
      } else {
        var subpromises = this.subpromises || (this.subpromises = []);
        subpromises.push(promise);
      }
      return promise;
    }
  };
  return Promise;
})();

// Exports for node.js
if (typeof exports !== 'undefined') {
  exports.Promise = Promise;

  // Promises/A+ testing
  exports.fulfilled = function(value) {
    var p = new Promise();
    p.fulfill(value);
    return p;
  };
  exports.rejected = function(reason) {
    var p = new Promise();
    p.reject(reason);
    return p;
  };
  exports.pending = function() {
    var p = new Promise();
    return {
      promise: p,
      fulfill: function(value) { p.fulfill(value); },
      reject: function(reason) { p.reject(reason); }
    };
  };
}
