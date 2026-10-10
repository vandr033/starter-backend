"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.sanitizeRichText = sanitizeRichText;
const sanitize_html_1 = __importDefault(require("sanitize-html"));
const RICH_TEXT_ALLOWED_TAGS = [
    'p',
    'br',
    'strong',
    'em',
    'u',
    's',
    'blockquote',
    'ul',
    'ol',
    'li',
    'h1',
    'h2',
    'h3',
    'h4',
    'h5',
    'h6',
    'a',
];
const RICH_TEXT_ALLOWED_ATTRIBUTES = {
    a: ['href', 'target', 'rel'],
};
const RICH_TEXT_ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];
function sanitizeRichText(input) {
    if (input === undefined)
        return undefined;
    if (input === null)
        return null;
    const clean = (0, sanitize_html_1.default)(input, {
        allowedTags: RICH_TEXT_ALLOWED_TAGS,
        allowedAttributes: RICH_TEXT_ALLOWED_ATTRIBUTES,
        allowedSchemes: RICH_TEXT_ALLOWED_SCHEMES,
        transformTags: {
            a: sanitize_html_1.default.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
        },
    }).trim();
    return clean.length > 0 ? clean : null;
}
