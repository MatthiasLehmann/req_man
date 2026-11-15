/* Minimale MCP-Apps-Anbindung (Spezifikation 2026-01-26): JSON-RPC 2.0 über postMessage zum Host.
   Kein Baukasten, keine externen Skripte – die Ansicht ist eine einzige HTML-Datei. */
var ReqManApp = (function () {
  var pending = {}, nextId = 1, handlers = {}, hostContext = {};

  function send(msg) {
    msg.jsonrpc = "2.0";
    window.parent.postMessage(msg, "*");
  }
  function request(method, params) {
    return new Promise(function (resolve, reject) {
      var id = nextId++;
      pending[id] = { resolve: resolve, reject: reject };
      send({ id: id, method: method, params: params });
    });
  }
  function notify(method, params) { send({ method: method, params: params || {} }); }

  function applyContext(ctx) {
    if (!ctx) return;
    hostContext = Object.assign(hostContext, ctx);
    var root = document.documentElement;
    if (ctx.theme) { root.setAttribute("data-theme", ctx.theme); root.style.colorScheme = ctx.theme; }
    var vars = ctx.styles && ctx.styles.variables;
    if (vars) Object.keys(vars).forEach(function (k) { if (vars[k]) root.style.setProperty(k, vars[k]); });
  }

  window.addEventListener("message", function (ev) {
    if (ev.source !== window.parent) return;           // nur Nachrichten des Hosts
    var m = ev.data;
    if (!m || m.jsonrpc !== "2.0") return;
    if (m.method === undefined) {                       // Antwort auf eine Anfrage der Ansicht
      var p = pending[m.id];
      if (!p) return;
      delete pending[m.id];
      if (m.error) p.reject(new Error(m.error.message || "Fehler")); else p.resolve(m.result);
      return;
    }
    if (m.method === "ui/notifications/host-context-changed") applyContext(m.params);
    var h = handlers[m.method];
    if (h) h(m.params || {});
    if (m.id !== undefined) send({ id: m.id, result: {} });   // z. B. ui/resource-teardown
  });

  function start(opts) {
    handlers["ui/notifications/tool-result"] = opts.onResult;
    request("ui/initialize", {
      protocolVersion: "2026-01-26",
      appInfo: { name: opts.name, version: "1.0.0" },
      appCapabilities: {}
    }).then(function (res) {
      applyContext(res && res.hostContext);
      notify("ui/notifications/initialized");
    }).catch(function () { if (opts.onNoHost) opts.onNoHost(); });
    if (window.ResizeObserver) {
      new ResizeObserver(function () {
        notify("ui/notifications/size-changed", { width: document.documentElement.scrollWidth, height: document.documentElement.scrollHeight });
      }).observe(document.body);
    }
  }

  function callTool(name, args) {
    return request("tools/call", { name: name, arguments: args || {} });
  }

  /* Hilfen: immer textContent, nie HTML-Zuweisung – Texte stammen von Agenten und gelten als nicht vertrauenswürdig. */
  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined && text !== null) e.textContent = text;
    return e;
  }
  function firstText(result) {
    var c = (result && result.content || []).filter(function (x) { return x.type === "text"; })[0];
    return c ? c.text : "";
  }
  return { start: start, callTool: callTool, el: el, firstText: firstText };
})();
