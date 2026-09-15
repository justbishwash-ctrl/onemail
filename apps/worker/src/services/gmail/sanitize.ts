/**
 * Server-side HTML sanitizer for email bodies.
 *
 * Cloudflare Workers do not have a DOM, so we use sanitize-html npm package.
 * All email HTML goes through this before being sent to the client.
 *
 * Security: removes scripts, event handlers, iframes, forms,
 * javascript: URIs, and data: URIs from email content.
 */

import sanitizeHtmlLib from 'sanitize-html';

const ALLOWED_TAGS = [
  'a', 'abbr', 'acronym', 'address', 'area', 'b', 'bdi', 'bdo', 'big',
  'blockquote', 'br', 'caption', 'center', 'cite', 'code', 'col', 'colgroup',
  'data', 'dd', 'del', 'dfn', 'div', 'dl', 'dt', 'em', 'figcaption',
  'figure', 'font', 'footer', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'header',
  'hr', 'i', 'img', 'ins', 'kbd', 'label', 'legend', 'li', 'main', 'map',
  'mark', 'menu', 'menuitem', 'meter', 'nav', 'ol', 'p', 'pre', 'q', 'rp',
  'rt', 'ruby', 's', 'samp', 'section', 'small', 'span', 'strike', 'strong',
  'sub', 'summary', 'sup', 'table', 'tbody', 'td', 'tfoot', 'th', 'thead',
  'time', 'tr', 'tt', 'u', 'ul', 'var', 'wbr',
];

const ALLOWED_ATTRIBUTES: Record<string, string[]> = {
  '*': ['align', 'alt', 'bgcolor', 'border', 'cellpadding', 'cellspacing',
        'class', 'color', 'colspan', 'dir', 'face', 'height', 'id', 'lang',
        'rowspan', 'size', 'span', 'style', 'title', 'valign', 'width'],
  a: ['href', 'name', 'target', 'rel'],
  img: ['src', 'srcset', 'height', 'width', 'alt'],
  table: ['summary'],
  td: ['abbr', 'axis', 'headers', 'scope'],
  th: ['abbr', 'axis', 'headers', 'scope'],
  time: ['datetime'],
};

// CSS properties allowed in style attributes
const ALLOWED_STYLES = {
  '*': {
    color: [/.*/],
    'background-color': [/.*/],
    'font-size': [/.*/],
    'font-family': [/.*/],
    'font-weight': [/.*/],
    'font-style': [/.*/],
    'text-align': [/.*/],
    'text-decoration': [/.*/],
    'line-height': [/.*/],
    padding: [/.*/],
    margin: [/.*/],
    border: [/.*/],
    width: [/.*/],
    height: [/.*/],
    display: [/.*/],
  },
};

export function sanitizeHtml(html: string): string {
  return sanitizeHtmlLib(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: ALLOWED_ATTRIBUTES,
    allowedStyles: ALLOWED_STYLES,

    // Disallow javascript: and data: URIs in href/src
    allowedSchemes: ['http', 'https', 'mailto', 'cid'],
    allowedSchemesByTag: {
      img: ['http', 'https', 'cid', 'data'], // allow data: only for inline images
    },

    // Force target="_blank" and add rel for all links
    transformTags: {
      a: sanitizeHtmlLib.simpleTransform('a', {
        target: '_blank',
        rel: 'noopener noreferrer',
      }),
    },

    // Do not allow nesting tricks
    disallowedTagsMode: 'discard',
  });
}
