// biome-ignore lint/suspicious/noExplicitAny: gancho do carregador do Node.
(require as any).extensions[".css"] = (module: any) => { module.exports = new Proxy({}, { get: (_t, key) => (key === "__esModule" ? false : String(key)) }); };
