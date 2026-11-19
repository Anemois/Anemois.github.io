// Where the game server runs (the server/ folder at the top of the site,
// see server/README.md). Put your own address here once it is running.
// The site is served over https, so this must be a wss:// address.
const PUBLIC_SERVER = "wss://play.example.com/ws";

// When you open the site from your own computer (localhost), it looks for a
// server started on that computer instead, so you can test without
// touching the real one.
const LOCAL_SERVER = "ws://localhost:8787/ws";

const local = ["localhost", "127.0.0.1"].includes(globalThis.location?.hostname);

export const SERVER_URL = local ? LOCAL_SERVER : PUBLIC_SERVER;

export const SERVER_READY = local || !PUBLIC_SERVER.includes("example.com");
