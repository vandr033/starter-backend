import sanitizeHtml from 'sanitize-html';

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

const RICH_TEXT_ALLOWED_ATTRIBUTES: sanitizeHtml.IOptions['allowedAttributes'] = {
    a: ['href', 'target', 'rel'],
};

const RICH_TEXT_ALLOWED_SCHEMES = ['http', 'https', 'mailto', 'tel'];

export function sanitizeRichText(input: string | null | undefined): string | null | undefined {
    if (input === undefined) return undefined;
    if (input === null) return null;

    const clean = sanitizeHtml(input, {
        allowedTags: RICH_TEXT_ALLOWED_TAGS,
        allowedAttributes: RICH_TEXT_ALLOWED_ATTRIBUTES,
        allowedSchemes: RICH_TEXT_ALLOWED_SCHEMES,
        transformTags: {
            a: sanitizeHtml.simpleTransform('a', { rel: 'noopener noreferrer', target: '_blank' }),
        },
    }).trim();

    return clean.length > 0 ? clean : null;
}
