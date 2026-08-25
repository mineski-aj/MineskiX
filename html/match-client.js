// match-client.js — include in any overlay to get live match state
// Usage: <script src="/html/match-client.js"></script>
// Then: window.matchState  → current state object
//       window.onMatchState(fn) → called immediately + on every update

(function () {
  var state    = null;
  var listeners = [];

  function notify() {
    listeners.forEach(function (fn) { try { fn(state); } catch (e) {} });
  }

  function connect() {
    var es = new EventSource('/match/events');
    es.onmessage = function (e) {
      state = JSON.parse(e.data);
      window.matchState = state;
      notify();
    };
    es.onerror = function () {
      es.close();
      setTimeout(connect, 3000);
    };
  }

  window.matchState = null;
  window.onMatchState = function (fn) {
    listeners.push(fn);
    if (state) fn(state);
  };

  connect();
})();
