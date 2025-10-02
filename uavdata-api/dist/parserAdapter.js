"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadParser = loadParser;
exports.parseMessages = parseMessages;
const config_1 = require("./config");
const path_1 = __importDefault(require("path"));
let cached = null;
function loadParser() {
    if (!cached) {
        try {
            // eslint-disable-next-line @typescript-eslint/no-var-requires
            const mod = require(path_1.default.resolve(config_1.CONFIG.PARSER_ENTRY));
            if (!mod || typeof mod.parseMessagesUniversal !== "function") {
                throw new Error("parseMessagesUniversal not found in parser module");
            }
            cached = mod;
        }
        catch (e) {
            throw new Error(`Не удалось загрузить парсер по пути ${config_1.CONFIG.PARSER_ENTRY}: ${e?.message || e}`);
        }
    }
    return cached.parseMessagesUniversal;
}
function parseMessages(messages) {
    const fn = loadParser();
    return fn(messages);
}
