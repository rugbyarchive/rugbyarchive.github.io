(function () {
  'use strict';
  window.RUGBY_SNAPSHOTS = {
    changes: function (snapshots) {
      var events = [];
      snapshots.forEach(function (s) {
        if (!events.length || JSON.stringify(s[1]) !== JSON.stringify(events[events.length - 1][1])) events.push(s);
      });
      return events;
    },
    at: function (snapshots, day) {
      var out = {rating:{},pos:{},order:[],last:{},played:{},counted:0,snapshot:null}, snap = null;
      for (var i = 0; i < snapshots.length; i++) { if (snapshots[i][0] > day) break; snap = snapshots[i]; }
      if (!snap) return out;
      out.snapshot = snap[0];
      for (var j = 0; j < snap[1].length; j += 3) {
        var t = snap[1][j]; out.order.push(t); out.pos[t] = snap[1][j + 1]; out.rating[t] = snap[1][j + 2];
      }
      return out;
    }
  };
})();
