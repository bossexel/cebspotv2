const fs = require("fs");
const path = require("path");

const filePath = path.join(
  __dirname,
  "..",
  "node_modules",
  "@expo",
  "cli",
  "build",
  "src",
  "start",
  "server",
  "AsyncNgrok.js"
);

const original = "const TUNNEL_TIMEOUT = 10 * 1000;";
const previousPatched =
  "const TUNNEL_TIMEOUT = Number(process.env.EXPO_NGROK_TUNNEL_TIMEOUT || 60 * 1000);";
const patched =
  "const TUNNEL_TIMEOUT = Number(process.env.EXPO_NGROK_TUNNEL_TIMEOUT || 120 * 1000);";
const connectionPropsPattern =
  /    async _getConnectionPropsAsync\(\) \{\r?\n        const userDefinedSubdomain = _env\.env\.EXPO_TUNNEL_SUBDOMAIN;/;
const connectionPropsPatched =
  '    async _getConnectionPropsAsync() {\n        if (process.env.EXPO_TUNNEL_RANDOM_URL !== "0") {\n            debug("Using random ngrok URL");\n            return {};\n        }\n        const userDefinedSubdomain = _env.env.EXPO_TUNNEL_SUBDOMAIN;';
const globalConfigOriginal =
  'const configPath = _path().join((0, _userSettings.getSettingsDirectory)(), "ngrok.yml");';
const globalConfigPatched =
  'const configPath = process.env.EXPO_NGROK_CONFIG_PATH || _path().join((0, _userSettings.getSettingsDirectory)(), "ngrok.yml");';
const projectConfigPatched =
  'const projectConfigPath = _path().join(this.projectRoot, "expo-ngrok.yml");\n            const configPath = process.env.EXPO_NGROK_CONFIG_PATH || (require("fs").existsSync(projectConfigPath) ? projectConfigPath : _path().join((0, _userSettings.getSettingsDirectory)(), "ngrok.yml"));';
const authtokenLine = "                authtoken: NGROK_CONFIG.authToken,\n                configPath,";
const authtokenPatched =
  '                authtoken: NGROK_CONFIG.authToken,\n                configPath,\n                region: process.env.EXPO_NGROK_REGION || "ap",';
const unsafeToString =
  'throw new _errors.CommandError("NGROK_CONNECT", error.toString() + _chalk().default.gray("\\nCheck the Ngrok status page for outages: https://status.ngrok.com/"));';
const safeToString =
  'const message = error == null ? "ngrok failed without returning an error object" : error.toString();\n                throw new _errors.CommandError("NGROK_CONNECT", message + _chalk().default.gray("\\nCheck the Ngrok status page for outages: https://status.ngrok.com/"));';
const unsafeErrorCode =
  "if ((0, _ngrokResolver.isNgrokClientError)(error) && error.body.error_code === 103)";
const safeErrorCode =
  "if ((0, _ngrokResolver.isNgrokClientError)(error) && error.body && error.body.error_code === 103)";

if (!fs.existsSync(filePath)) {
  console.warn("[expo-ngrok-timeout] Expo CLI file not found; skipping patch.");
  process.exit(0);
}

let source = fs.readFileSync(filePath, "utf8");
let changed = false;

if (!source.includes(patched) && (source.includes(original) || source.includes(previousPatched))) {
  source = source.replace(source.includes(original) ? original : previousPatched, patched);
  changed = true;
} else if (!source.includes(patched)) {
  console.warn("[expo-ngrok-timeout] Expected timeout line not found; skipping patch.");
}

if (!source.includes("EXPO_TUNNEL_RANDOM_URL") && connectionPropsPattern.test(source)) {
  source = source.replace(connectionPropsPattern, connectionPropsPatched);
  changed = true;
} else if (!source.includes("EXPO_TUNNEL_RANDOM_URL")) {
  console.warn("[expo-ngrok-timeout] Expected connection props block not found; skipping patch.");
}

if (source.includes("if (process.env.EXPO_TUNNEL_RANDOM_URL) {")) {
  source = source.replace(
    "if (process.env.EXPO_TUNNEL_RANDOM_URL) {",
    'if (process.env.EXPO_TUNNEL_RANDOM_URL !== "0") {'
  );
  changed = true;
}

if (source.includes(globalConfigOriginal)) {
  source = source.replace(globalConfigOriginal, projectConfigPatched);
  changed = true;
}

if (source.includes(globalConfigPatched)) {
  source = source.replace(globalConfigPatched, projectConfigPatched);
  changed = true;
}

if (!source.includes("EXPO_NGROK_REGION") && source.includes(authtokenLine)) {
  source = source.replace(authtokenLine, authtokenPatched);
  changed = true;
}

if (source.includes(unsafeToString)) {
  source = source.replace(unsafeToString, safeToString);
  changed = true;
}

if (source.includes(unsafeErrorCode)) {
  source = source.replace(unsafeErrorCode, safeErrorCode);
  changed = true;
}

if (changed) {
  fs.writeFileSync(filePath, source);
  console.log("[expo-ngrok-timeout] Patched Expo ngrok tunnel behavior.");
}
