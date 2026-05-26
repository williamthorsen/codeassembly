import { createRequire as __cjsCreateRequire } from 'node:module';
const require = __cjsCreateRequire(import.meta.url);
var __create = Object.create;
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __getProtoOf = Object.getPrototypeOf;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __require = /* @__PURE__ */ ((x) =>
  typeof require !== 'undefined'
    ? require
    : typeof Proxy !== 'undefined'
      ? new Proxy(x, {
          get: (a, b) => (typeof require !== 'undefined' ? require : a)[b],
        })
      : x)(function (x) {
  if (typeof require !== 'undefined') return require.apply(this, arguments);
  throw Error('Dynamic require of "' + x + '" is not supported');
});
var __commonJS = (cb, mod) =>
  function __require2() {
    return (mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports);
  };
var __copyProps = (to, from, except, desc) => {
  if ((from && typeof from === 'object') || typeof from === 'function') {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, {
          get: () => from[key],
          enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable,
        });
  }
  return to;
};
var __toESM = (mod, isNodeMode, target) => (
  (target = mod != null ? __create(__getProtoOf(mod)) : {}),
  __copyProps(
    // If the importer is in node compatibility mode or this is not an ESM
    // file that has been converted to a CommonJS file using a Babel-
    // compatible transform (i.e. "__esModule" has not been set), then set
    // "default" to the CommonJS "module.exports" for node compatibility.
    isNodeMode || !mod || !mod.__esModule ? __defProp(target, 'default', { value: mod, enumerable: true }) : target,
    mod,
  )
);

// ../../node_modules/.pnpm/content-type@1.0.5/node_modules/content-type/index.js
var require_content_type = __commonJS({
  '../../node_modules/.pnpm/content-type@1.0.5/node_modules/content-type/index.js'(exports) {
    'use strict';
    var PARAM_REGEXP =
      /; *([!#$%&'*+.^_`|~0-9A-Za-z-]+) *= *("(?:[\u000b\u0020\u0021\u0023-\u005b\u005d-\u007e\u0080-\u00ff]|\\[\u000b\u0020-\u00ff])*"|[!#$%&'*+.^_`|~0-9A-Za-z-]+) */g;
    var TEXT_REGEXP = /^[\u000b\u0020-\u007e\u0080-\u00ff]+$/;
    var TOKEN_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    var QESC_REGEXP = /\\([\u000b\u0020-\u00ff])/g;
    var QUOTE_REGEXP = /([\\"])/g;
    var TYPE_REGEXP = /^[!#$%&'*+.^_`|~0-9A-Za-z-]+\/[!#$%&'*+.^_`|~0-9A-Za-z-]+$/;
    exports.format = format;
    exports.parse = parse2;
    function format(obj) {
      if (!obj || typeof obj !== 'object') {
        throw new TypeError('argument obj is required');
      }
      var parameters = obj.parameters;
      var type = obj.type;
      if (!type || !TYPE_REGEXP.test(type)) {
        throw new TypeError('invalid type');
      }
      var string = type;
      if (parameters && typeof parameters === 'object') {
        var param;
        var params = Object.keys(parameters).sort();
        for (var i = 0; i < params.length; i++) {
          param = params[i];
          if (!TOKEN_REGEXP.test(param)) {
            throw new TypeError('invalid parameter name');
          }
          string += '; ' + param + '=' + qstring(parameters[param]);
        }
      }
      return string;
    }
    function parse2(string) {
      if (!string) {
        throw new TypeError('argument string is required');
      }
      var header = typeof string === 'object' ? getcontenttype(string) : string;
      if (typeof header !== 'string') {
        throw new TypeError('argument string is required to be a string');
      }
      var index = header.indexOf(';');
      var type = index !== -1 ? header.slice(0, index).trim() : header.trim();
      if (!TYPE_REGEXP.test(type)) {
        throw new TypeError('invalid media type');
      }
      var obj = new ContentType(type.toLowerCase());
      if (index !== -1) {
        var key;
        var match;
        var value3;
        PARAM_REGEXP.lastIndex = index;
        while ((match = PARAM_REGEXP.exec(header))) {
          if (match.index !== index) {
            throw new TypeError('invalid parameter format');
          }
          index += match[0].length;
          key = match[1].toLowerCase();
          value3 = match[2];
          if (value3.charCodeAt(0) === 34) {
            value3 = value3.slice(1, -1);
            if (value3.indexOf('\\') !== -1) {
              value3 = value3.replace(QESC_REGEXP, '$1');
            }
          }
          obj.parameters[key] = value3;
        }
        if (index !== header.length) {
          throw new TypeError('invalid parameter format');
        }
      }
      return obj;
    }
    function getcontenttype(obj) {
      var header;
      if (typeof obj.getHeader === 'function') {
        header = obj.getHeader('content-type');
      } else if (typeof obj.headers === 'object') {
        header = obj.headers && obj.headers['content-type'];
      }
      if (typeof header !== 'string') {
        throw new TypeError('content-type header is missing from object');
      }
      return header;
    }
    function qstring(val) {
      var str = String(val);
      if (TOKEN_REGEXP.test(str)) {
        return str;
      }
      if (str.length > 0 && !TEXT_REGEXP.test(str)) {
        throw new TypeError('invalid parameter value');
      }
      return '"' + str.replace(QUOTE_REGEXP, '\\$1') + '"';
    }
    function ContentType(type) {
      this.parameters = /* @__PURE__ */ Object.create(null);
      this.type = type;
    }
  },
});

// ../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/defaults.js
var require_defaults = __commonJS({
  '../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/defaults.js'(
    exports,
    module,
  ) {
    module.exports = {
      space: '',
      cycles: false,
      replacer: (k, v) => v,
      stringify: JSON.stringify,
    };
  },
});

// ../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/util.js
var require_util = __commonJS({
  '../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/util.js'(
    exports,
    module,
  ) {
    'use strict';
    module.exports = {
      isArray: Array.isArray,
      assign: Object.assign,
      isObject: (v) => typeof v === 'object',
      isFunction: (v) => typeof v === 'function',
      isBoolean: (v) => typeof v === 'boolean',
      isRegex: (v) => v instanceof RegExp,
      keys: Object.keys,
    };
  },
});

// ../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/index.js
var require_lib = __commonJS({
  '../../node_modules/.pnpm/json-stringify-deterministic@1.0.13/node_modules/json-stringify-deterministic/lib/index.js'(
    exports,
    module,
  ) {
    'use strict';
    var DEFAULTS = require_defaults();
    var isFunction = require_util().isFunction;
    var isBoolean = require_util().isBoolean;
    var isObject = require_util().isObject;
    var isArray = require_util().isArray;
    var isRegex = require_util().isRegex;
    var assign = require_util().assign;
    var keys3 = require_util().keys;
    function serialize(obj) {
      if (obj === null || obj === void 0) return obj;
      if (isRegex(obj)) return obj.toString();
      return obj.toJSON ? obj.toJSON() : obj;
    }
    function stringifyDeterministic(obj, opts) {
      opts = opts || assign({}, DEFAULTS);
      if (isFunction(opts)) opts = { compare: opts };
      const space = opts.space || DEFAULTS.space;
      const cycles = isBoolean(opts.cycles) ? opts.cycles : DEFAULTS.cycles;
      const replacer = opts.replacer || DEFAULTS.replacer;
      const stringify = opts.stringify || DEFAULTS.stringify;
      const compare =
        opts.compare &&
        /* @__PURE__ */ (function (f) {
          return function (node) {
            return function (a, b) {
              const aobj = { key: a, value: node[a] };
              const bobj = { key: b, value: node[b] };
              return f(aobj, bobj);
            };
          };
        })(opts.compare);
      if (!cycles) stringify(obj);
      const seen = [];
      return (function _deterministic(parent, key, node, level) {
        const indent = space ? '\n' + new Array(level + 1).join(space) : '';
        const colonSeparator = space ? ': ' : ':';
        node = serialize(node);
        node = replacer.call(parent, key, node);
        if (node === void 0) return;
        if (!isObject(node) || node === null) return stringify(node);
        if (isArray(node)) {
          const out = [];
          for (let i = 0; i < node.length; i++) {
            const item = _deterministic(node, i, node[i], level + 1) || stringify(null);
            out.push(indent + space + item);
          }
          return '[' + out.join(',') + indent + ']';
        } else {
          if (cycles) {
            if (seen.indexOf(node) !== -1) {
              return stringify('[Circular]');
            } else {
              seen.push(node);
            }
          }
          const nodeKeys = keys3(node).sort(compare && compare(node));
          const out = [];
          for (let i = 0; i < nodeKeys.length; i++) {
            const key2 = nodeKeys[i];
            const value3 = _deterministic(node, key2, node[key2], level + 1);
            if (!value3) continue;
            const keyValue = stringify(key2) + colonSeparator + value3;
            out.push(indent + space + keyValue);
          }
          seen.splice(seen.indexOf(node), 1);
          return '{' + out.join(',') + indent + '}';
        }
      })({ '': obj }, '', obj, 0);
    }
    module.exports = stringifyDeterministic;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/identity.js
var require_identity = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/identity.js'(exports) {
    'use strict';
    var ALIAS = /* @__PURE__ */ Symbol.for('yaml.alias');
    var DOC = /* @__PURE__ */ Symbol.for('yaml.document');
    var MAP = /* @__PURE__ */ Symbol.for('yaml.map');
    var PAIR = /* @__PURE__ */ Symbol.for('yaml.pair');
    var SCALAR = /* @__PURE__ */ Symbol.for('yaml.scalar');
    var SEQ = /* @__PURE__ */ Symbol.for('yaml.seq');
    var NODE_TYPE = /* @__PURE__ */ Symbol.for('yaml.node.type');
    var isAlias = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === ALIAS;
    var isDocument = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === DOC;
    var isMap = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === MAP;
    var isPair = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === PAIR;
    var isScalar2 = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SCALAR;
    var isSeq = (node) => !!node && typeof node === 'object' && node[NODE_TYPE] === SEQ;
    function isCollection(node) {
      if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
          case MAP:
          case SEQ:
            return true;
        }
      return false;
    }
    function isNode(node) {
      if (node && typeof node === 'object')
        switch (node[NODE_TYPE]) {
          case ALIAS:
          case MAP:
          case SCALAR:
          case SEQ:
            return true;
        }
      return false;
    }
    var hasAnchor = (node) => (isScalar2(node) || isCollection(node)) && !!node.anchor;
    exports.ALIAS = ALIAS;
    exports.DOC = DOC;
    exports.MAP = MAP;
    exports.NODE_TYPE = NODE_TYPE;
    exports.PAIR = PAIR;
    exports.SCALAR = SCALAR;
    exports.SEQ = SEQ;
    exports.hasAnchor = hasAnchor;
    exports.isAlias = isAlias;
    exports.isCollection = isCollection;
    exports.isDocument = isDocument;
    exports.isMap = isMap;
    exports.isNode = isNode;
    exports.isPair = isPair;
    exports.isScalar = isScalar2;
    exports.isSeq = isSeq;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/visit.js
var require_visit = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/visit.js'(exports) {
    'use strict';
    var identity = require_identity();
    var BREAK = /* @__PURE__ */ Symbol('break visit');
    var SKIP = /* @__PURE__ */ Symbol('skip children');
    var REMOVE = /* @__PURE__ */ Symbol('remove node');
    function visit(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = visit_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE) node.contents = null;
      } else visit_(null, node, visitor_, Object.freeze([]));
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    function visit_(key, node, visitor, path6) {
      const ctrl = callVisitor(key, node, visitor, path6);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path6, ctrl);
        return visit_(key, ctrl, visitor, path6);
      }
      if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
          path6 = Object.freeze(path6.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = visit_(i, node.items[i], visitor, path6);
            if (typeof ci === 'number') i = ci - 1;
            else if (ci === BREAK) return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path6 = Object.freeze(path6.concat(node));
          const ck = visit_('key', node.key, visitor, path6);
          if (ck === BREAK) return BREAK;
          else if (ck === REMOVE) node.key = null;
          const cv = visit_('value', node.value, visitor, path6);
          if (cv === BREAK) return BREAK;
          else if (cv === REMOVE) node.value = null;
        }
      }
      return ctrl;
    }
    async function visitAsync(node, visitor) {
      const visitor_ = initVisitor(visitor);
      if (identity.isDocument(node)) {
        const cd = await visitAsync_(null, node.contents, visitor_, Object.freeze([node]));
        if (cd === REMOVE) node.contents = null;
      } else await visitAsync_(null, node, visitor_, Object.freeze([]));
    }
    visitAsync.BREAK = BREAK;
    visitAsync.SKIP = SKIP;
    visitAsync.REMOVE = REMOVE;
    async function visitAsync_(key, node, visitor, path6) {
      const ctrl = await callVisitor(key, node, visitor, path6);
      if (identity.isNode(ctrl) || identity.isPair(ctrl)) {
        replaceNode(key, path6, ctrl);
        return visitAsync_(key, ctrl, visitor, path6);
      }
      if (typeof ctrl !== 'symbol') {
        if (identity.isCollection(node)) {
          path6 = Object.freeze(path6.concat(node));
          for (let i = 0; i < node.items.length; ++i) {
            const ci = await visitAsync_(i, node.items[i], visitor, path6);
            if (typeof ci === 'number') i = ci - 1;
            else if (ci === BREAK) return BREAK;
            else if (ci === REMOVE) {
              node.items.splice(i, 1);
              i -= 1;
            }
          }
        } else if (identity.isPair(node)) {
          path6 = Object.freeze(path6.concat(node));
          const ck = await visitAsync_('key', node.key, visitor, path6);
          if (ck === BREAK) return BREAK;
          else if (ck === REMOVE) node.key = null;
          const cv = await visitAsync_('value', node.value, visitor, path6);
          if (cv === BREAK) return BREAK;
          else if (cv === REMOVE) node.value = null;
        }
      }
      return ctrl;
    }
    function initVisitor(visitor) {
      if (typeof visitor === 'object' && (visitor.Collection || visitor.Node || visitor.Value)) {
        return Object.assign(
          {
            Alias: visitor.Node,
            Map: visitor.Node,
            Scalar: visitor.Node,
            Seq: visitor.Node,
          },
          visitor.Value && {
            Map: visitor.Value,
            Scalar: visitor.Value,
            Seq: visitor.Value,
          },
          visitor.Collection && {
            Map: visitor.Collection,
            Seq: visitor.Collection,
          },
          visitor,
        );
      }
      return visitor;
    }
    function callVisitor(key, node, visitor, path6) {
      if (typeof visitor === 'function') return visitor(key, node, path6);
      if (identity.isMap(node)) return visitor.Map?.(key, node, path6);
      if (identity.isSeq(node)) return visitor.Seq?.(key, node, path6);
      if (identity.isPair(node)) return visitor.Pair?.(key, node, path6);
      if (identity.isScalar(node)) return visitor.Scalar?.(key, node, path6);
      if (identity.isAlias(node)) return visitor.Alias?.(key, node, path6);
      return void 0;
    }
    function replaceNode(key, path6, node) {
      const parent = path6[path6.length - 1];
      if (identity.isCollection(parent)) {
        parent.items[key] = node;
      } else if (identity.isPair(parent)) {
        if (key === 'key') parent.key = node;
        else parent.value = node;
      } else if (identity.isDocument(parent)) {
        parent.contents = node;
      } else {
        const pt = identity.isAlias(parent) ? 'alias' : 'scalar';
        throw new Error(`Cannot replace node with ${pt} parent`);
      }
    }
    exports.visit = visit;
    exports.visitAsync = visitAsync;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/directives.js
var require_directives = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/directives.js'(exports) {
    'use strict';
    var identity = require_identity();
    var visit = require_visit();
    var escapeChars = {
      '!': '%21',
      ',': '%2C',
      '[': '%5B',
      ']': '%5D',
      '{': '%7B',
      '}': '%7D',
    };
    var escapeTagName = (tn) => tn.replace(/[!,[\]{}]/g, (ch) => escapeChars[ch]);
    var Directives = class _Directives {
      constructor(yaml, tags) {
        this.docStart = null;
        this.docEnd = false;
        this.yaml = Object.assign({}, _Directives.defaultYaml, yaml);
        this.tags = Object.assign({}, _Directives.defaultTags, tags);
      }
      clone() {
        const copy = new _Directives(this.yaml, this.tags);
        copy.docStart = this.docStart;
        return copy;
      }
      /**
       * During parsing, get a Directives instance for the current document and
       * update the stream state according to the current version's spec.
       */
      atDocument() {
        const res = new _Directives(this.yaml, this.tags);
        switch (this.yaml.version) {
          case '1.1':
            this.atNextDocument = true;
            break;
          case '1.2':
            this.atNextDocument = false;
            this.yaml = {
              explicit: _Directives.defaultYaml.explicit,
              version: '1.2',
            };
            this.tags = Object.assign({}, _Directives.defaultTags);
            break;
        }
        return res;
      }
      /**
       * @param onError - May be called even if the action was successful
       * @returns `true` on success
       */
      add(line, onError) {
        if (this.atNextDocument) {
          this.yaml = { explicit: _Directives.defaultYaml.explicit, version: '1.1' };
          this.tags = Object.assign({}, _Directives.defaultTags);
          this.atNextDocument = false;
        }
        const parts = line.trim().split(/[ \t]+/);
        const name = parts.shift();
        switch (name) {
          case '%TAG': {
            if (parts.length !== 2) {
              onError(0, '%TAG directive should contain exactly two parts');
              if (parts.length < 2) return false;
            }
            const [handle, prefix] = parts;
            this.tags[handle] = prefix;
            return true;
          }
          case '%YAML': {
            this.yaml.explicit = true;
            if (parts.length !== 1) {
              onError(0, '%YAML directive should contain exactly one part');
              return false;
            }
            const [version] = parts;
            if (version === '1.1' || version === '1.2') {
              this.yaml.version = version;
              return true;
            } else {
              const isValid = /^\d+\.\d+$/.test(version);
              onError(6, `Unsupported YAML version ${version}`, isValid);
              return false;
            }
          }
          default:
            onError(0, `Unknown directive ${name}`, true);
            return false;
        }
      }
      /**
       * Resolves a tag, matching handles to those defined in %TAG directives.
       *
       * @returns Resolved tag, which may also be the non-specific tag `'!'` or a
       *   `'!local'` tag, or `null` if unresolvable.
       */
      tagName(source, onError) {
        if (source === '!') return '!';
        if (source[0] !== '!') {
          onError(`Not a valid tag: ${source}`);
          return null;
        }
        if (source[1] === '<') {
          const verbatim = source.slice(2, -1);
          if (verbatim === '!' || verbatim === '!!') {
            onError(`Verbatim tags aren't resolved, so ${source} is invalid.`);
            return null;
          }
          if (source[source.length - 1] !== '>') onError('Verbatim tags must end with a >');
          return verbatim;
        }
        const [, handle, suffix] = source.match(/^(.*!)([^!]*)$/s);
        if (!suffix) onError(`The ${source} tag has no suffix`);
        const prefix = this.tags[handle];
        if (prefix) {
          try {
            return prefix + decodeURIComponent(suffix);
          } catch (error) {
            onError(String(error));
            return null;
          }
        }
        if (handle === '!') return source;
        onError(`Could not resolve tag: ${source}`);
        return null;
      }
      /**
       * Given a fully resolved tag, returns its printable string form,
       * taking into account current tag prefixes and defaults.
       */
      tagString(tag) {
        for (const [handle, prefix] of Object.entries(this.tags)) {
          if (tag.startsWith(prefix)) return handle + escapeTagName(tag.substring(prefix.length));
        }
        return tag[0] === '!' ? tag : `!<${tag}>`;
      }
      toString(doc) {
        const lines = this.yaml.explicit ? [`%YAML ${this.yaml.version || '1.2'}`] : [];
        const tagEntries = Object.entries(this.tags);
        let tagNames;
        if (doc && tagEntries.length > 0 && identity.isNode(doc.contents)) {
          const tags = {};
          visit.visit(doc.contents, (_key, node) => {
            if (identity.isNode(node) && node.tag) tags[node.tag] = true;
          });
          tagNames = Object.keys(tags);
        } else tagNames = [];
        for (const [handle, prefix] of tagEntries) {
          if (handle === '!!' && prefix === 'tag:yaml.org,2002:') continue;
          if (!doc || tagNames.some((tn) => tn.startsWith(prefix))) lines.push(`%TAG ${handle} ${prefix}`);
        }
        return lines.join('\n');
      }
    };
    Directives.defaultYaml = { explicit: false, version: '1.2' };
    Directives.defaultTags = { '!!': 'tag:yaml.org,2002:' };
    exports.Directives = Directives;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/anchors.js
var require_anchors = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/anchors.js'(exports) {
    'use strict';
    var identity = require_identity();
    var visit = require_visit();
    function anchorIsValid(anchor) {
      if (/[\x00-\x19\s,[\]{}]/.test(anchor)) {
        const sa = JSON.stringify(anchor);
        const msg = `Anchor must not contain whitespace or control characters: ${sa}`;
        throw new Error(msg);
      }
      return true;
    }
    function anchorNames(root) {
      const anchors = /* @__PURE__ */ new Set();
      visit.visit(root, {
        Value(_key, node) {
          if (node.anchor) anchors.add(node.anchor);
        },
      });
      return anchors;
    }
    function findNewAnchor(prefix, exclude) {
      for (let i = 1; true; ++i) {
        const name = `${prefix}${i}`;
        if (!exclude.has(name)) return name;
      }
    }
    function createNodeAnchors(doc, prefix) {
      const aliasObjects = [];
      const sourceObjects = /* @__PURE__ */ new Map();
      let prevAnchors = null;
      return {
        onAnchor: (source) => {
          aliasObjects.push(source);
          prevAnchors ?? (prevAnchors = anchorNames(doc));
          const anchor = findNewAnchor(prefix, prevAnchors);
          prevAnchors.add(anchor);
          return anchor;
        },
        /**
         * With circular references, the source node is only resolved after all
         * of its child nodes are. This is why anchors are set only after all of
         * the nodes have been created.
         */
        setAnchors: () => {
          for (const source of aliasObjects) {
            const ref = sourceObjects.get(source);
            if (
              typeof ref === 'object' &&
              ref.anchor &&
              (identity.isScalar(ref.node) || identity.isCollection(ref.node))
            ) {
              ref.node.anchor = ref.anchor;
            } else {
              const error = new Error('Failed to resolve repeated object (this should not happen)');
              error.source = source;
              throw error;
            }
          }
        },
        sourceObjects,
      };
    }
    exports.anchorIsValid = anchorIsValid;
    exports.anchorNames = anchorNames;
    exports.createNodeAnchors = createNodeAnchors;
    exports.findNewAnchor = findNewAnchor;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/applyReviver.js
var require_applyReviver = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/applyReviver.js'(exports) {
    'use strict';
    function applyReviver(reviver, obj, key, val) {
      if (val && typeof val === 'object') {
        if (Array.isArray(val)) {
          for (let i = 0, len = val.length; i < len; ++i) {
            const v0 = val[i];
            const v1 = applyReviver(reviver, val, String(i), v0);
            if (v1 === void 0) delete val[i];
            else if (v1 !== v0) val[i] = v1;
          }
        } else if (val instanceof Map) {
          for (const k of Array.from(val.keys())) {
            const v0 = val.get(k);
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0) val.delete(k);
            else if (v1 !== v0) val.set(k, v1);
          }
        } else if (val instanceof Set) {
          for (const v0 of Array.from(val)) {
            const v1 = applyReviver(reviver, val, v0, v0);
            if (v1 === void 0) val.delete(v0);
            else if (v1 !== v0) {
              val.delete(v0);
              val.add(v1);
            }
          }
        } else {
          for (const [k, v0] of Object.entries(val)) {
            const v1 = applyReviver(reviver, val, k, v0);
            if (v1 === void 0) delete val[k];
            else if (v1 !== v0) val[k] = v1;
          }
        }
      }
      return reviver.call(obj, key, val);
    }
    exports.applyReviver = applyReviver;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/toJS.js
var require_toJS = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/toJS.js'(exports) {
    'use strict';
    var identity = require_identity();
    function toJS(value3, arg, ctx) {
      if (Array.isArray(value3)) return value3.map((v, i) => toJS(v, String(i), ctx));
      if (value3 && typeof value3.toJSON === 'function') {
        if (!ctx || !identity.hasAnchor(value3)) return value3.toJSON(arg, ctx);
        const data = { aliasCount: 0, count: 1, res: void 0 };
        ctx.anchors.set(value3, data);
        ctx.onCreate = (res2) => {
          data.res = res2;
          delete ctx.onCreate;
        };
        const res = value3.toJSON(arg, ctx);
        if (ctx.onCreate) ctx.onCreate(res);
        return res;
      }
      if (typeof value3 === 'bigint' && !ctx?.keep) return Number(value3);
      return value3;
    }
    exports.toJS = toJS;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Node.js
var require_Node = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Node.js'(exports) {
    'use strict';
    var applyReviver = require_applyReviver();
    var identity = require_identity();
    var toJS = require_toJS();
    var NodeBase = class {
      constructor(type) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: type });
      }
      /** Create a copy of this node.  */
      clone() {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (this.range) copy.range = this.range.slice();
        return copy;
      }
      /** A plain JavaScript representation of this node. */
      toJS(doc, { mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        if (!identity.isDocument(doc)) throw new TypeError('A document argument is required');
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc,
          keep: true,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100,
        };
        const res = toJS.toJS(this, '', ctx);
        if (typeof onAnchor === 'function')
          for (const { count, res: res2 } of ctx.anchors.values()) onAnchor(res2, count);
        return typeof reviver === 'function' ? applyReviver.applyReviver(reviver, { '': res }, '', res) : res;
      }
    };
    exports.NodeBase = NodeBase;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Alias.js
var require_Alias = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Alias.js'(exports) {
    'use strict';
    var anchors = require_anchors();
    var visit = require_visit();
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var Alias = class extends Node.NodeBase {
      constructor(source) {
        super(identity.ALIAS);
        this.source = source;
        Object.defineProperty(this, 'tag', {
          set() {
            throw new Error('Alias nodes cannot have tags');
          },
        });
      }
      /**
       * Resolve the value of this alias within `doc`, finding the last
       * instance of the `source` anchor before this node.
       */
      resolve(doc, ctx) {
        if (ctx?.maxAliasCount === 0) throw new ReferenceError('Alias resolution is disabled');
        let nodes;
        if (ctx?.aliasResolveCache) {
          nodes = ctx.aliasResolveCache;
        } else {
          nodes = [];
          visit.visit(doc, {
            Node: (_key, node) => {
              if (identity.isAlias(node) || identity.hasAnchor(node)) nodes.push(node);
            },
          });
          if (ctx) ctx.aliasResolveCache = nodes;
        }
        let found = void 0;
        for (const node of nodes) {
          if (node === this) break;
          if (node.anchor === this.source) found = node;
        }
        return found;
      }
      toJSON(_arg, ctx) {
        if (!ctx) return { source: this.source };
        const { anchors: anchors2, doc, maxAliasCount } = ctx;
        const source = this.resolve(doc, ctx);
        if (!source) {
          const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
          throw new ReferenceError(msg);
        }
        let data = anchors2.get(source);
        if (!data) {
          toJS.toJS(source, null, ctx);
          data = anchors2.get(source);
        }
        if (data?.res === void 0) {
          const msg = 'This should not happen: Alias anchor was not resolved?';
          throw new ReferenceError(msg);
        }
        if (maxAliasCount >= 0) {
          data.count += 1;
          if (data.aliasCount === 0) data.aliasCount = getAliasCount(doc, source, anchors2);
          if (data.count * data.aliasCount > maxAliasCount) {
            const msg = 'Excessive alias count indicates a resource exhaustion attack';
            throw new ReferenceError(msg);
          }
        }
        return data.res;
      }
      toString(ctx, _onComment, _onChompKeep) {
        const src = `*${this.source}`;
        if (ctx) {
          anchors.anchorIsValid(this.source);
          if (ctx.options.verifyAliasOrder && !ctx.anchors.has(this.source)) {
            const msg = `Unresolved alias (the anchor must be set before the alias): ${this.source}`;
            throw new Error(msg);
          }
          if (ctx.implicitKey) return `${src} `;
        }
        return src;
      }
    };
    function getAliasCount(doc, node, anchors2) {
      if (identity.isAlias(node)) {
        const source = node.resolve(doc);
        const anchor = anchors2 && source && anchors2.get(source);
        return anchor ? anchor.count * anchor.aliasCount : 0;
      } else if (identity.isCollection(node)) {
        let count = 0;
        for (const item of node.items) {
          const c = getAliasCount(doc, item, anchors2);
          if (c > count) count = c;
        }
        return count;
      } else if (identity.isPair(node)) {
        const kc = getAliasCount(doc, node.key, anchors2);
        const vc = getAliasCount(doc, node.value, anchors2);
        return Math.max(kc, vc);
      }
      return 1;
    }
    exports.Alias = Alias;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Scalar.js
var require_Scalar = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Scalar.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Node = require_Node();
    var toJS = require_toJS();
    var isScalarValue = (value3) => !value3 || (typeof value3 !== 'function' && typeof value3 !== 'object');
    var Scalar = class extends Node.NodeBase {
      constructor(value3) {
        super(identity.SCALAR);
        this.value = value3;
      }
      toJSON(arg, ctx) {
        return ctx?.keep ? this.value : toJS.toJS(this.value, arg, ctx);
      }
      toString() {
        return String(this.value);
      }
    };
    Scalar.BLOCK_FOLDED = 'BLOCK_FOLDED';
    Scalar.BLOCK_LITERAL = 'BLOCK_LITERAL';
    Scalar.PLAIN = 'PLAIN';
    Scalar.QUOTE_DOUBLE = 'QUOTE_DOUBLE';
    Scalar.QUOTE_SINGLE = 'QUOTE_SINGLE';
    exports.Scalar = Scalar;
    exports.isScalarValue = isScalarValue;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/createNode.js
var require_createNode = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/createNode.js'(exports) {
    'use strict';
    var Alias = require_Alias();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var defaultTagPrefix = 'tag:yaml.org,2002:';
    function findTagObject(value3, tagName, tags) {
      if (tagName) {
        const match = tags.filter((t) => t.tag === tagName);
        const tagObj = match.find((t) => !t.format) ?? match[0];
        if (!tagObj) throw new Error(`Tag ${tagName} not found`);
        return tagObj;
      }
      return tags.find((t) => t.identify?.(value3) && !t.format);
    }
    function createNode(value3, tagName, ctx) {
      if (identity.isDocument(value3)) value3 = value3.contents;
      if (identity.isNode(value3)) return value3;
      if (identity.isPair(value3)) {
        const map2 = ctx.schema[identity.MAP].createNode?.(ctx.schema, null, ctx);
        map2.items.push(value3);
        return map2;
      }
      if (
        value3 instanceof String ||
        value3 instanceof Number ||
        value3 instanceof Boolean ||
        (typeof BigInt !== 'undefined' && value3 instanceof BigInt)
      ) {
        value3 = value3.valueOf();
      }
      const { aliasDuplicateObjects, onAnchor, onTagObj, schema, sourceObjects } = ctx;
      let ref = void 0;
      if (aliasDuplicateObjects && value3 && typeof value3 === 'object') {
        ref = sourceObjects.get(value3);
        if (ref) {
          ref.anchor ?? (ref.anchor = onAnchor(value3));
          return new Alias.Alias(ref.anchor);
        } else {
          ref = { anchor: null, node: null };
          sourceObjects.set(value3, ref);
        }
      }
      if (tagName?.startsWith('!!')) tagName = defaultTagPrefix + tagName.slice(2);
      let tagObj = findTagObject(value3, tagName, schema.tags);
      if (!tagObj) {
        if (value3 && typeof value3.toJSON === 'function') {
          value3 = value3.toJSON();
        }
        if (!value3 || typeof value3 !== 'object') {
          const node2 = new Scalar.Scalar(value3);
          if (ref) ref.node = node2;
          return node2;
        }
        tagObj =
          value3 instanceof Map
            ? schema[identity.MAP]
            : Symbol.iterator in Object(value3)
              ? schema[identity.SEQ]
              : schema[identity.MAP];
      }
      if (onTagObj) {
        onTagObj(tagObj);
        delete ctx.onTagObj;
      }
      const node = tagObj?.createNode
        ? tagObj.createNode(ctx.schema, value3, ctx)
        : typeof tagObj?.nodeClass?.from === 'function'
          ? tagObj.nodeClass.from(ctx.schema, value3, ctx)
          : new Scalar.Scalar(value3);
      if (tagName) node.tag = tagName;
      else if (!tagObj.default) node.tag = tagObj.tag;
      if (ref) ref.node = node;
      return node;
    }
    exports.createNode = createNode;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Collection.js
var require_Collection = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Collection.js'(exports) {
    'use strict';
    var createNode = require_createNode();
    var identity = require_identity();
    var Node = require_Node();
    function collectionFromPath(schema, path6, value3) {
      let v = value3;
      for (let i = path6.length - 1; i >= 0; --i) {
        const k = path6[i];
        if (typeof k === 'number' && Number.isInteger(k) && k >= 0) {
          const a = [];
          a[k] = v;
          v = a;
        } else {
          v = /* @__PURE__ */ new Map([[k, v]]);
        }
      }
      return createNode.createNode(v, void 0, {
        aliasDuplicateObjects: false,
        keepUndefined: false,
        onAnchor: () => {
          throw new Error('This should not happen, please report a bug.');
        },
        schema,
        sourceObjects: /* @__PURE__ */ new Map(),
      });
    }
    var isEmptyPath = (path6) => path6 == null || (typeof path6 === 'object' && !!path6[Symbol.iterator]().next().done);
    var Collection = class extends Node.NodeBase {
      constructor(type, schema) {
        super(type);
        Object.defineProperty(this, 'schema', {
          value: schema,
          configurable: true,
          enumerable: false,
          writable: true,
        });
      }
      /**
       * Create a copy of this collection.
       *
       * @param schema - If defined, overwrites the original's schema
       */
      clone(schema) {
        const copy = Object.create(Object.getPrototypeOf(this), Object.getOwnPropertyDescriptors(this));
        if (schema) copy.schema = schema;
        copy.items = copy.items.map((it) => (identity.isNode(it) || identity.isPair(it) ? it.clone(schema) : it));
        if (this.range) copy.range = this.range.slice();
        return copy;
      }
      /**
       * Adds a value to the collection. For `!!map` and `!!omap` the value must
       * be a Pair instance or a `{ key, value }` object, which may not have a key
       * that already exists in the map.
       */
      addIn(path6, value3) {
        if (isEmptyPath(path6)) this.add(value3);
        else {
          const [key, ...rest] = path6;
          const node = this.get(key, true);
          if (identity.isCollection(node)) node.addIn(rest, value3);
          else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value3));
          else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
      /**
       * Removes a value from the collection.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path6) {
        const [key, ...rest] = path6;
        if (rest.length === 0) return this.delete(key);
        const node = this.get(key, true);
        if (identity.isCollection(node)) return node.deleteIn(rest);
        else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path6, keepScalar) {
        const [key, ...rest] = path6;
        const node = this.get(key, true);
        if (rest.length === 0) return !keepScalar && identity.isScalar(node) ? node.value : node;
        else return identity.isCollection(node) ? node.getIn(rest, keepScalar) : void 0;
      }
      hasAllNullValues(allowScalar) {
        return this.items.every((node) => {
          if (!identity.isPair(node)) return false;
          const n = node.value;
          return (
            n == null ||
            (allowScalar && identity.isScalar(n) && n.value == null && !n.commentBefore && !n.comment && !n.tag)
          );
        });
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       */
      hasIn(path6) {
        const [key, ...rest] = path6;
        if (rest.length === 0) return this.has(key);
        const node = this.get(key, true);
        return identity.isCollection(node) ? node.hasIn(rest) : false;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path6, value3) {
        const [key, ...rest] = path6;
        if (rest.length === 0) {
          this.set(key, value3);
        } else {
          const node = this.get(key, true);
          if (identity.isCollection(node)) node.setIn(rest, value3);
          else if (node === void 0 && this.schema) this.set(key, collectionFromPath(this.schema, rest, value3));
          else throw new Error(`Expected YAML collection at ${key}. Remaining path: ${rest}`);
        }
      }
    };
    exports.Collection = Collection;
    exports.collectionFromPath = collectionFromPath;
    exports.isEmptyPath = isEmptyPath;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyComment.js
var require_stringifyComment = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyComment.js'(exports) {
    'use strict';
    var stringifyComment = (str) => str.replace(/^(?!$)(?: $)?/gm, '#');
    function indentComment(comment, indent) {
      if (/^\n+$/.test(comment)) return comment.substring(1);
      return indent ? comment.replace(/^(?! *$)/gm, indent) : comment;
    }
    var lineComment = (str, indent, comment) =>
      str.endsWith('\n')
        ? indentComment(comment, indent)
        : comment.includes('\n')
          ? '\n' + indentComment(comment, indent)
          : (str.endsWith(' ') ? '' : ' ') + comment;
    exports.indentComment = indentComment;
    exports.lineComment = lineComment;
    exports.stringifyComment = stringifyComment;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/foldFlowLines.js
var require_foldFlowLines = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/foldFlowLines.js'(exports) {
    'use strict';
    var FOLD_FLOW = 'flow';
    var FOLD_BLOCK = 'block';
    var FOLD_QUOTED = 'quoted';
    function foldFlowLines(
      text,
      indent,
      mode = 'flow',
      { indentAtStart, lineWidth = 80, minContentWidth = 20, onFold, onOverflow } = {},
    ) {
      if (!lineWidth || lineWidth < 0) return text;
      if (lineWidth < minContentWidth) minContentWidth = 0;
      const endStep = Math.max(1 + minContentWidth, 1 + lineWidth - indent.length);
      if (text.length <= endStep) return text;
      const folds = [];
      const escapedFolds = {};
      let end = lineWidth - indent.length;
      if (typeof indentAtStart === 'number') {
        if (indentAtStart > lineWidth - Math.max(2, minContentWidth)) folds.push(0);
        else end = lineWidth - indentAtStart;
      }
      let split = void 0;
      let prev = void 0;
      let overflow = false;
      let i = -1;
      let escStart = -1;
      let escEnd = -1;
      if (mode === FOLD_BLOCK) {
        i = consumeMoreIndentedLines(text, i, indent.length);
        if (i !== -1) end = i + endStep;
      }
      for (let ch; (ch = text[(i += 1)]); ) {
        if (mode === FOLD_QUOTED && ch === '\\') {
          escStart = i;
          switch (text[i + 1]) {
            case 'x':
              i += 3;
              break;
            case 'u':
              i += 5;
              break;
            case 'U':
              i += 9;
              break;
            default:
              i += 1;
          }
          escEnd = i;
        }
        if (ch === '\n') {
          if (mode === FOLD_BLOCK) i = consumeMoreIndentedLines(text, i, indent.length);
          end = i + indent.length + endStep;
          split = void 0;
        } else {
          if (ch === ' ' && prev && prev !== ' ' && prev !== '\n' && prev !== '	') {
            const next = text[i + 1];
            if (next && next !== ' ' && next !== '\n' && next !== '	') split = i;
          }
          if (i >= end) {
            if (split) {
              folds.push(split);
              end = split + endStep;
              split = void 0;
            } else if (mode === FOLD_QUOTED) {
              while (prev === ' ' || prev === '	') {
                prev = ch;
                ch = text[(i += 1)];
                overflow = true;
              }
              const j = i > escEnd + 1 ? i - 2 : escStart - 1;
              if (escapedFolds[j]) return text;
              folds.push(j);
              escapedFolds[j] = true;
              end = j + endStep;
              split = void 0;
            } else {
              overflow = true;
            }
          }
        }
        prev = ch;
      }
      if (overflow && onOverflow) onOverflow();
      if (folds.length === 0) return text;
      if (onFold) onFold();
      let res = text.slice(0, folds[0]);
      for (let i2 = 0; i2 < folds.length; ++i2) {
        const fold = folds[i2];
        const end2 = folds[i2 + 1] || text.length;
        if (fold === 0)
          res = `
${indent}${text.slice(0, end2)}`;
        else {
          if (mode === FOLD_QUOTED && escapedFolds[fold]) res += `${text[fold]}\\`;
          res += `
${indent}${text.slice(fold + 1, end2)}`;
        }
      }
      return res;
    }
    function consumeMoreIndentedLines(text, i, indent) {
      let end = i;
      let start = i + 1;
      let ch = text[start];
      while (ch === ' ' || ch === '	') {
        if (i < start + indent) {
          ch = text[++i];
        } else {
          do {
            ch = text[++i];
          } while (ch && ch !== '\n');
          end = i;
          start = i + 1;
          ch = text[start];
        }
      }
      return end;
    }
    exports.FOLD_BLOCK = FOLD_BLOCK;
    exports.FOLD_FLOW = FOLD_FLOW;
    exports.FOLD_QUOTED = FOLD_QUOTED;
    exports.foldFlowLines = foldFlowLines;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyString.js
var require_stringifyString = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyString.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var foldFlowLines = require_foldFlowLines();
    var getFoldOptions = (ctx, isBlock) => ({
      indentAtStart: isBlock ? ctx.indent.length : ctx.indentAtStart,
      lineWidth: ctx.options.lineWidth,
      minContentWidth: ctx.options.minContentWidth,
    });
    var containsDocumentMarker = (str) => /^(%|---|\.\.\.)/m.test(str);
    function lineLengthOverLimit(str, lineWidth, indentLength) {
      if (!lineWidth || lineWidth < 0) return false;
      const limit = lineWidth - indentLength;
      const strLen = str.length;
      if (strLen <= limit) return false;
      for (let i = 0, start = 0; i < strLen; ++i) {
        if (str[i] === '\n') {
          if (i - start > limit) return true;
          start = i + 1;
          if (strLen - start <= limit) return false;
        }
      }
      return true;
    }
    function doubleQuotedString(value3, ctx) {
      const json = JSON.stringify(value3);
      if (ctx.options.doubleQuotedAsJSON) return json;
      const { implicitKey } = ctx;
      const minMultiLineLength = ctx.options.doubleQuotedMinMultiLineLength;
      const indent = ctx.indent || (containsDocumentMarker(value3) ? '  ' : '');
      let str = '';
      let start = 0;
      for (let i = 0, ch = json[i]; ch; ch = json[++i]) {
        if (ch === ' ' && json[i + 1] === '\\' && json[i + 2] === 'n') {
          str += json.slice(start, i) + '\\ ';
          i += 1;
          start = i;
          ch = '\\';
        }
        if (ch === '\\')
          switch (json[i + 1]) {
            case 'u':
              {
                str += json.slice(start, i);
                const code = json.substr(i + 2, 4);
                switch (code) {
                  case '0000':
                    str += '\\0';
                    break;
                  case '0007':
                    str += '\\a';
                    break;
                  case '000b':
                    str += '\\v';
                    break;
                  case '001b':
                    str += '\\e';
                    break;
                  case '0085':
                    str += '\\N';
                    break;
                  case '00a0':
                    str += '\\_';
                    break;
                  case '2028':
                    str += '\\L';
                    break;
                  case '2029':
                    str += '\\P';
                    break;
                  default:
                    if (code.substr(0, 2) === '00') str += '\\x' + code.substr(2);
                    else str += json.substr(i, 6);
                }
                i += 5;
                start = i + 1;
              }
              break;
            case 'n':
              if (implicitKey || json[i + 2] === '"' || json.length < minMultiLineLength) {
                i += 1;
              } else {
                str += json.slice(start, i) + '\n\n';
                while (json[i + 2] === '\\' && json[i + 3] === 'n' && json[i + 4] !== '"') {
                  str += '\n';
                  i += 2;
                }
                str += indent;
                if (json[i + 2] === ' ') str += '\\';
                i += 1;
                start = i + 1;
              }
              break;
            default:
              i += 1;
          }
      }
      str = start ? str + json.slice(start) : json;
      return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_QUOTED, getFoldOptions(ctx, false));
    }
    function singleQuotedString(value3, ctx) {
      if (
        ctx.options.singleQuote === false ||
        (ctx.implicitKey && value3.includes('\n')) ||
        /[ \t]\n|\n[ \t]/.test(value3)
      )
        return doubleQuotedString(value3, ctx);
      const indent = ctx.indent || (containsDocumentMarker(value3) ? '  ' : '');
      const res =
        "'" +
        value3.replace(/'/g, "''").replace(
          /\n+/g,
          `$&
${indent}`,
        ) +
        "'";
      return ctx.implicitKey
        ? res
        : foldFlowLines.foldFlowLines(res, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function quotedString(value3, ctx) {
      const { singleQuote } = ctx.options;
      let qs;
      if (singleQuote === false) qs = doubleQuotedString;
      else {
        const hasDouble = value3.includes('"');
        const hasSingle = value3.includes("'");
        if (hasDouble && !hasSingle) qs = singleQuotedString;
        else if (hasSingle && !hasDouble) qs = doubleQuotedString;
        else qs = singleQuote ? singleQuotedString : doubleQuotedString;
      }
      return qs(value3, ctx);
    }
    var blockEndNewlines;
    try {
      blockEndNewlines = new RegExp('(^|(?<!\n))\n+(?!\n|$)', 'g');
    } catch {
      blockEndNewlines = /\n+(?!\n|$)/g;
    }
    function blockString({ comment, type, value: value3 }, ctx, onComment, onChompKeep) {
      const { blockQuote, commentString, lineWidth } = ctx.options;
      if (!blockQuote || /\n[\t ]+$/.test(value3)) {
        return quotedString(value3, ctx);
      }
      const indent = ctx.indent || (ctx.forceBlockIndent || containsDocumentMarker(value3) ? '  ' : '');
      const literal =
        blockQuote === 'literal'
          ? true
          : blockQuote === 'folded' || type === Scalar.Scalar.BLOCK_FOLDED
            ? false
            : type === Scalar.Scalar.BLOCK_LITERAL
              ? true
              : !lineLengthOverLimit(value3, lineWidth, indent.length);
      if (!value3) return literal ? '|\n' : '>\n';
      let chomp;
      let endStart;
      for (endStart = value3.length; endStart > 0; --endStart) {
        const ch = value3[endStart - 1];
        if (ch !== '\n' && ch !== '	' && ch !== ' ') break;
      }
      let end = value3.substring(endStart);
      const endNlPos = end.indexOf('\n');
      if (endNlPos === -1) {
        chomp = '-';
      } else if (value3 === end || endNlPos !== end.length - 1) {
        chomp = '+';
        if (onChompKeep) onChompKeep();
      } else {
        chomp = '';
      }
      if (end) {
        value3 = value3.slice(0, -end.length);
        if (end[end.length - 1] === '\n') end = end.slice(0, -1);
        end = end.replace(blockEndNewlines, `$&${indent}`);
      }
      let startWithSpace = false;
      let startEnd;
      let startNlPos = -1;
      for (startEnd = 0; startEnd < value3.length; ++startEnd) {
        const ch = value3[startEnd];
        if (ch === ' ') startWithSpace = true;
        else if (ch === '\n') startNlPos = startEnd;
        else break;
      }
      let start = value3.substring(0, startNlPos < startEnd ? startNlPos + 1 : startEnd);
      if (start) {
        value3 = value3.substring(start.length);
        start = start.replace(/\n+/g, `$&${indent}`);
      }
      const indentSize = indent ? '2' : '1';
      let header = (startWithSpace ? indentSize : '') + chomp;
      if (comment) {
        header += ' ' + commentString(comment.replace(/ ?[\r\n]+/g, ' '));
        if (onComment) onComment();
      }
      if (!literal) {
        const foldedValue = value3
          .replace(/\n+/g, '\n$&')
          .replace(/(?:^|\n)([\t ].*)(?:([\n\t ]*)\n(?![\n\t ]))?/g, '$1$2')
          .replace(/\n+/g, `$&${indent}`);
        let literalFallback = false;
        const foldOptions = getFoldOptions(ctx, true);
        if (blockQuote !== 'folded' && type !== Scalar.Scalar.BLOCK_FOLDED) {
          foldOptions.onOverflow = () => {
            literalFallback = true;
          };
        }
        const body = foldFlowLines.foldFlowLines(
          `${start}${foldedValue}${end}`,
          indent,
          foldFlowLines.FOLD_BLOCK,
          foldOptions,
        );
        if (!literalFallback)
          return `>${header}
${indent}${body}`;
      }
      value3 = value3.replace(/\n+/g, `$&${indent}`);
      return `|${header}
${indent}${start}${value3}${end}`;
    }
    function plainString(item, ctx, onComment, onChompKeep) {
      const { type, value: value3 } = item;
      const { actualString, implicitKey, indent, indentStep, inFlow } = ctx;
      if ((implicitKey && value3.includes('\n')) || (inFlow && /[[\]{},]/.test(value3))) {
        return quotedString(value3, ctx);
      }
      if (/^[\n\t ,[\]{}#&*!|>'"%@`]|^[?-]$|^[?-][ \t]|[\n:][ \t]|[ \t]\n|[\n\t ]#|[\n\t :]$/.test(value3)) {
        return implicitKey || inFlow || !value3.includes('\n')
          ? quotedString(value3, ctx)
          : blockString(item, ctx, onComment, onChompKeep);
      }
      if (!implicitKey && !inFlow && type !== Scalar.Scalar.PLAIN && value3.includes('\n')) {
        return blockString(item, ctx, onComment, onChompKeep);
      }
      if (containsDocumentMarker(value3)) {
        if (indent === '') {
          ctx.forceBlockIndent = true;
          return blockString(item, ctx, onComment, onChompKeep);
        } else if (implicitKey && indent === indentStep) {
          return quotedString(value3, ctx);
        }
      }
      const str = value3.replace(
        /\n+/g,
        `$&
${indent}`,
      );
      if (actualString) {
        const test = (tag) => tag.default && tag.tag !== 'tag:yaml.org,2002:str' && tag.test?.test(str);
        const { compat, tags } = ctx.doc.schema;
        if (tags.some(test) || compat?.some(test)) return quotedString(value3, ctx);
      }
      return implicitKey
        ? str
        : foldFlowLines.foldFlowLines(str, indent, foldFlowLines.FOLD_FLOW, getFoldOptions(ctx, false));
    }
    function stringifyString(item, ctx, onComment, onChompKeep) {
      const { implicitKey, inFlow } = ctx;
      const ss = typeof item.value === 'string' ? item : Object.assign({}, item, { value: String(item.value) });
      let { type } = item;
      if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
        if (/[\x00-\x08\x0b-\x1f\x7f-\x9f\u{D800}-\u{DFFF}]/u.test(ss.value)) type = Scalar.Scalar.QUOTE_DOUBLE;
      }
      const _stringify = (_type) => {
        switch (_type) {
          case Scalar.Scalar.BLOCK_FOLDED:
          case Scalar.Scalar.BLOCK_LITERAL:
            return implicitKey || inFlow ? quotedString(ss.value, ctx) : blockString(ss, ctx, onComment, onChompKeep);
          case Scalar.Scalar.QUOTE_DOUBLE:
            return doubleQuotedString(ss.value, ctx);
          case Scalar.Scalar.QUOTE_SINGLE:
            return singleQuotedString(ss.value, ctx);
          case Scalar.Scalar.PLAIN:
            return plainString(ss, ctx, onComment, onChompKeep);
          default:
            return null;
        }
      };
      let res = _stringify(type);
      if (res === null) {
        const { defaultKeyType, defaultStringType } = ctx.options;
        const t = (implicitKey && defaultKeyType) || defaultStringType;
        res = _stringify(t);
        if (res === null) throw new Error(`Unsupported default string type ${t}`);
      }
      return res;
    }
    exports.stringifyString = stringifyString;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringify.js
var require_stringify = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringify.js'(exports) {
    'use strict';
    var anchors = require_anchors();
    var identity = require_identity();
    var stringifyComment = require_stringifyComment();
    var stringifyString = require_stringifyString();
    function createStringifyContext(doc, options) {
      const opt = Object.assign(
        {
          blockQuote: true,
          commentString: stringifyComment.stringifyComment,
          defaultKeyType: null,
          defaultStringType: 'PLAIN',
          directives: null,
          doubleQuotedAsJSON: false,
          doubleQuotedMinMultiLineLength: 40,
          falseStr: 'false',
          flowCollectionPadding: true,
          indentSeq: true,
          lineWidth: 80,
          minContentWidth: 20,
          nullStr: 'null',
          simpleKeys: false,
          singleQuote: null,
          trailingComma: false,
          trueStr: 'true',
          verifyAliasOrder: true,
        },
        doc.schema.toStringOptions,
        options,
      );
      let inFlow;
      switch (opt.collectionStyle) {
        case 'block':
          inFlow = false;
          break;
        case 'flow':
          inFlow = true;
          break;
        default:
          inFlow = null;
      }
      return {
        anchors: /* @__PURE__ */ new Set(),
        doc,
        flowCollectionPadding: opt.flowCollectionPadding ? ' ' : '',
        indent: '',
        indentStep: typeof opt.indent === 'number' ? ' '.repeat(opt.indent) : '  ',
        inFlow,
        options: opt,
      };
    }
    function getTagObject(tags, item) {
      if (item.tag) {
        const match = tags.filter((t) => t.tag === item.tag);
        if (match.length > 0) return match.find((t) => t.format === item.format) ?? match[0];
      }
      let tagObj = void 0;
      let obj;
      if (identity.isScalar(item)) {
        obj = item.value;
        let match = tags.filter((t) => t.identify?.(obj));
        if (match.length > 1) {
          const testMatch = match.filter((t) => t.test);
          if (testMatch.length > 0) match = testMatch;
        }
        tagObj = match.find((t) => t.format === item.format) ?? match.find((t) => !t.format);
      } else {
        obj = item;
        tagObj = tags.find((t) => t.nodeClass && obj instanceof t.nodeClass);
      }
      if (!tagObj) {
        const name = obj?.constructor?.name ?? (obj === null ? 'null' : typeof obj);
        throw new Error(`Tag not resolved for ${name} value`);
      }
      return tagObj;
    }
    function stringifyProps(node, tagObj, { anchors: anchors$1, doc }) {
      if (!doc.directives) return '';
      const props = [];
      const anchor = (identity.isScalar(node) || identity.isCollection(node)) && node.anchor;
      if (anchor && anchors.anchorIsValid(anchor)) {
        anchors$1.add(anchor);
        props.push(`&${anchor}`);
      }
      const tag = node.tag ?? (tagObj.default ? null : tagObj.tag);
      if (tag) props.push(doc.directives.tagString(tag));
      return props.join(' ');
    }
    function stringify(item, ctx, onComment, onChompKeep) {
      if (identity.isPair(item)) return item.toString(ctx, onComment, onChompKeep);
      if (identity.isAlias(item)) {
        if (ctx.doc.directives) return item.toString(ctx);
        if (ctx.resolvedAliases?.has(item)) {
          throw new TypeError(`Cannot stringify circular structure without alias nodes`);
        } else {
          if (ctx.resolvedAliases) ctx.resolvedAliases.add(item);
          else ctx.resolvedAliases = /* @__PURE__ */ new Set([item]);
          item = item.resolve(ctx.doc);
        }
      }
      let tagObj = void 0;
      const node = identity.isNode(item) ? item : ctx.doc.createNode(item, { onTagObj: (o) => (tagObj = o) });
      tagObj ?? (tagObj = getTagObject(ctx.doc.schema.tags, node));
      const props = stringifyProps(node, tagObj, ctx);
      if (props.length > 0) ctx.indentAtStart = (ctx.indentAtStart ?? 0) + props.length + 1;
      const str =
        typeof tagObj.stringify === 'function'
          ? tagObj.stringify(node, ctx, onComment, onChompKeep)
          : identity.isScalar(node)
            ? stringifyString.stringifyString(node, ctx, onComment, onChompKeep)
            : node.toString(ctx, onComment, onChompKeep);
      if (!props) return str;
      return identity.isScalar(node) || str[0] === '{' || str[0] === '['
        ? `${props} ${str}`
        : `${props}
${ctx.indent}${str}`;
    }
    exports.createStringifyContext = createStringifyContext;
    exports.stringify = stringify;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyPair.js
var require_stringifyPair = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyPair.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Scalar = require_Scalar();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyPair({ key, value: value3 }, ctx, onComment, onChompKeep) {
      const {
        allNullValues,
        doc,
        indent,
        indentStep,
        options: { commentString, indentSeq, simpleKeys },
      } = ctx;
      let keyComment = (identity.isNode(key) && key.comment) || null;
      if (simpleKeys) {
        if (keyComment) {
          throw new Error('With simple keys, key nodes cannot have comments');
        }
        if (identity.isCollection(key) || (!identity.isNode(key) && typeof key === 'object')) {
          const msg = 'With simple keys, collection cannot be used as a key value';
          throw new Error(msg);
        }
      }
      let explicitKey =
        !simpleKeys &&
        (!key ||
          (keyComment && value3 == null && !ctx.inFlow) ||
          identity.isCollection(key) ||
          (identity.isScalar(key)
            ? key.type === Scalar.Scalar.BLOCK_FOLDED || key.type === Scalar.Scalar.BLOCK_LITERAL
            : typeof key === 'object'));
      ctx = Object.assign({}, ctx, {
        allNullValues: false,
        implicitKey: !explicitKey && (simpleKeys || !allNullValues),
        indent: indent + indentStep,
      });
      let keyCommentDone = false;
      let chompKeep = false;
      let str = stringify.stringify(
        key,
        ctx,
        () => (keyCommentDone = true),
        () => (chompKeep = true),
      );
      if (!explicitKey && !ctx.inFlow && str.length > 1024) {
        if (simpleKeys) throw new Error('With simple keys, single line scalar must not span more than 1024 characters');
        explicitKey = true;
      }
      if (ctx.inFlow) {
        if (allNullValues || value3 == null) {
          if (keyCommentDone && onComment) onComment();
          return str === '' ? '?' : explicitKey ? `? ${str}` : str;
        }
      } else if ((allNullValues && !simpleKeys) || (value3 == null && explicitKey)) {
        str = `? ${str}`;
        if (keyComment && !keyCommentDone) {
          str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        } else if (chompKeep && onChompKeep) onChompKeep();
        return str;
      }
      if (keyCommentDone) keyComment = null;
      if (explicitKey) {
        if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
        str = `? ${str}
${indent}:`;
      } else {
        str = `${str}:`;
        if (keyComment) str += stringifyComment.lineComment(str, ctx.indent, commentString(keyComment));
      }
      let vsb, vcb, valueComment;
      if (identity.isNode(value3)) {
        vsb = !!value3.spaceBefore;
        vcb = value3.commentBefore;
        valueComment = value3.comment;
      } else {
        vsb = false;
        vcb = null;
        valueComment = null;
        if (value3 && typeof value3 === 'object') value3 = doc.createNode(value3);
      }
      ctx.implicitKey = false;
      if (!explicitKey && !keyComment && identity.isScalar(value3)) ctx.indentAtStart = str.length + 1;
      chompKeep = false;
      if (
        !indentSeq &&
        indentStep.length >= 2 &&
        !ctx.inFlow &&
        !explicitKey &&
        identity.isSeq(value3) &&
        !value3.flow &&
        !value3.tag &&
        !value3.anchor
      ) {
        ctx.indent = ctx.indent.substring(2);
      }
      let valueCommentDone = false;
      const valueStr = stringify.stringify(
        value3,
        ctx,
        () => (valueCommentDone = true),
        () => (chompKeep = true),
      );
      let ws = ' ';
      if (keyComment || vsb || vcb) {
        ws = vsb ? '\n' : '';
        if (vcb) {
          const cs = commentString(vcb);
          ws += `
${stringifyComment.indentComment(cs, ctx.indent)}`;
        }
        if (valueStr === '' && !ctx.inFlow) {
          if (ws === '\n' && valueComment) ws = '\n\n';
        } else {
          ws += `
${ctx.indent}`;
        }
      } else if (!explicitKey && identity.isCollection(value3)) {
        const vs0 = valueStr[0];
        const nl0 = valueStr.indexOf('\n');
        const hasNewline = nl0 !== -1;
        const flow = ctx.inFlow ?? value3.flow ?? value3.items.length === 0;
        if (hasNewline || !flow) {
          let hasPropsLine = false;
          if (hasNewline && (vs0 === '&' || vs0 === '!')) {
            let sp0 = valueStr.indexOf(' ');
            if (vs0 === '&' && sp0 !== -1 && sp0 < nl0 && valueStr[sp0 + 1] === '!') {
              sp0 = valueStr.indexOf(' ', sp0 + 1);
            }
            if (sp0 === -1 || nl0 < sp0) hasPropsLine = true;
          }
          if (!hasPropsLine)
            ws = `
${ctx.indent}`;
        }
      } else if (valueStr === '' || valueStr[0] === '\n') {
        ws = '';
      }
      str += ws + valueStr;
      if (ctx.inFlow) {
        if (valueCommentDone && onComment) onComment();
      } else if (valueComment && !valueCommentDone) {
        str += stringifyComment.lineComment(str, ctx.indent, commentString(valueComment));
      } else if (chompKeep && onChompKeep) {
        onChompKeep();
      }
      return str;
    }
    exports.stringifyPair = stringifyPair;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/log.js
var require_log = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/log.js'(exports) {
    'use strict';
    var node_process = __require('process');
    function debug(logLevel, ...messages) {
      if (logLevel === 'debug') console.log(...messages);
    }
    function warn(logLevel, warning) {
      if (logLevel === 'debug' || logLevel === 'warn') {
        if (typeof node_process.emitWarning === 'function') node_process.emitWarning(warning);
        else console.warn(warning);
      }
    }
    exports.debug = debug;
    exports.warn = warn;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/merge.js
var require_merge = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/merge.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Scalar = require_Scalar();
    var MERGE_KEY = '<<';
    var merge = {
      identify: (value3) => value3 === MERGE_KEY || (typeof value3 === 'symbol' && value3.description === MERGE_KEY),
      default: 'key',
      tag: 'tag:yaml.org,2002:merge',
      test: /^<<$/,
      resolve: () =>
        Object.assign(new Scalar.Scalar(Symbol(MERGE_KEY)), {
          addToJSMap: addMergeToJSMap,
        }),
      stringify: () => MERGE_KEY,
    };
    var isMergeKey = (ctx, key) =>
      (merge.identify(key) ||
        (identity.isScalar(key) && (!key.type || key.type === Scalar.Scalar.PLAIN) && merge.identify(key.value))) &&
      ctx?.doc.schema.tags.some((tag) => tag.tag === merge.tag && tag.default);
    function addMergeToJSMap(ctx, map2, value3) {
      const source = resolveAliasValue(ctx, value3);
      if (identity.isSeq(source)) for (const it of source.items) mergeValue(ctx, map2, it);
      else if (Array.isArray(source)) for (const it of source) mergeValue(ctx, map2, it);
      else mergeValue(ctx, map2, source);
    }
    function mergeValue(ctx, map2, value3) {
      const source = resolveAliasValue(ctx, value3);
      if (!identity.isMap(source)) throw new Error('Merge sources must be maps or map aliases');
      const srcMap = source.toJSON(null, ctx, Map);
      for (const [key, value4] of srcMap) {
        if (map2 instanceof Map) {
          if (!map2.has(key)) map2.set(key, value4);
        } else if (map2 instanceof Set) {
          map2.add(key);
        } else if (!Object.prototype.hasOwnProperty.call(map2, key)) {
          Object.defineProperty(map2, key, {
            value: value4,
            writable: true,
            enumerable: true,
            configurable: true,
          });
        }
      }
      return map2;
    }
    function resolveAliasValue(ctx, value3) {
      return ctx && identity.isAlias(value3) ? value3.resolve(ctx.doc, ctx) : value3;
    }
    exports.addMergeToJSMap = addMergeToJSMap;
    exports.isMergeKey = isMergeKey;
    exports.merge = merge;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/addPairToJSMap.js
var require_addPairToJSMap = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/addPairToJSMap.js'(exports) {
    'use strict';
    var log = require_log();
    var merge = require_merge();
    var stringify = require_stringify();
    var identity = require_identity();
    var toJS = require_toJS();
    function addPairToJSMap(ctx, map2, { key, value: value3 }) {
      if (identity.isNode(key) && key.addToJSMap) key.addToJSMap(ctx, map2, value3);
      else if (merge.isMergeKey(ctx, key)) merge.addMergeToJSMap(ctx, map2, value3);
      else {
        const jsKey = toJS.toJS(key, '', ctx);
        if (map2 instanceof Map) {
          map2.set(jsKey, toJS.toJS(value3, jsKey, ctx));
        } else if (map2 instanceof Set) {
          map2.add(jsKey);
        } else {
          const stringKey = stringifyKey(key, jsKey, ctx);
          const jsValue = toJS.toJS(value3, stringKey, ctx);
          if (stringKey in map2)
            Object.defineProperty(map2, stringKey, {
              value: jsValue,
              writable: true,
              enumerable: true,
              configurable: true,
            });
          else map2[stringKey] = jsValue;
        }
      }
      return map2;
    }
    function stringifyKey(key, jsKey, ctx) {
      if (jsKey === null) return '';
      if (typeof jsKey !== 'object') return String(jsKey);
      if (identity.isNode(key) && ctx?.doc) {
        const strCtx = stringify.createStringifyContext(ctx.doc, {});
        strCtx.anchors = /* @__PURE__ */ new Set();
        for (const node of ctx.anchors.keys()) strCtx.anchors.add(node.anchor);
        strCtx.inFlow = true;
        strCtx.inStringifyKey = true;
        const strKey = key.toString(strCtx);
        if (!ctx.mapKeyWarned) {
          let jsonStr = JSON.stringify(strKey);
          if (jsonStr.length > 40) jsonStr = jsonStr.substring(0, 36) + '..."';
          log.warn(
            ctx.doc.options.logLevel,
            `Keys with collection values will be stringified due to JS Object restrictions: ${jsonStr}. Set mapAsMap: true to use object keys.`,
          );
          ctx.mapKeyWarned = true;
        }
        return strKey;
      }
      return JSON.stringify(jsKey);
    }
    exports.addPairToJSMap = addPairToJSMap;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Pair.js
var require_Pair = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/Pair.js'(exports) {
    'use strict';
    var createNode = require_createNode();
    var stringifyPair = require_stringifyPair();
    var addPairToJSMap = require_addPairToJSMap();
    var identity = require_identity();
    function createPair(key, value3, ctx) {
      const k = createNode.createNode(key, void 0, ctx);
      const v = createNode.createNode(value3, void 0, ctx);
      return new Pair(k, v);
    }
    var Pair = class _Pair {
      constructor(key, value3 = null) {
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.PAIR });
        this.key = key;
        this.value = value3;
      }
      clone(schema) {
        let { key, value: value3 } = this;
        if (identity.isNode(key)) key = key.clone(schema);
        if (identity.isNode(value3)) value3 = value3.clone(schema);
        return new _Pair(key, value3);
      }
      toJSON(_, ctx) {
        const pair = ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        return addPairToJSMap.addPairToJSMap(ctx, pair, this);
      }
      toString(ctx, onComment, onChompKeep) {
        return ctx?.doc ? stringifyPair.stringifyPair(this, ctx, onComment, onChompKeep) : JSON.stringify(this);
      }
    };
    exports.Pair = Pair;
    exports.createPair = createPair;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyCollection.js
var require_stringifyCollection = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyCollection.js'(exports) {
    'use strict';
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyCollection(collection, ctx, options) {
      const flow = ctx.inFlow ?? collection.flow;
      const stringify2 = flow ? stringifyFlowCollection : stringifyBlockCollection;
      return stringify2(collection, ctx, options);
    }
    function stringifyBlockCollection(
      { comment, items },
      ctx,
      { blockItemPrefix, flowChars, itemIndent, onChompKeep, onComment },
    ) {
      const {
        indent,
        options: { commentString },
      } = ctx;
      const itemCtx = Object.assign({}, ctx, { indent: itemIndent, type: null });
      let chompKeep = false;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment2 = null;
        if (identity.isNode(item)) {
          if (!chompKeep && item.spaceBefore) lines.push('');
          addCommentBefore(ctx, lines, item.commentBefore, chompKeep);
          if (item.comment) comment2 = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (!chompKeep && ik.spaceBefore) lines.push('');
            addCommentBefore(ctx, lines, ik.commentBefore, chompKeep);
          }
        }
        chompKeep = false;
        let str2 = stringify.stringify(
          item,
          itemCtx,
          () => (comment2 = null),
          () => (chompKeep = true),
        );
        if (comment2) str2 += stringifyComment.lineComment(str2, itemIndent, commentString(comment2));
        if (chompKeep && comment2) chompKeep = false;
        lines.push(blockItemPrefix + str2);
      }
      let str;
      if (lines.length === 0) {
        str = flowChars.start + flowChars.end;
      } else {
        str = lines[0];
        for (let i = 1; i < lines.length; ++i) {
          const line = lines[i];
          str += line
            ? `
${indent}${line}`
            : '\n';
        }
      }
      if (comment) {
        str += '\n' + stringifyComment.indentComment(commentString(comment), indent);
        if (onComment) onComment();
      } else if (chompKeep && onChompKeep) onChompKeep();
      return str;
    }
    function stringifyFlowCollection({ items }, ctx, { flowChars, itemIndent }) {
      const {
        indent,
        indentStep,
        flowCollectionPadding: fcPadding,
        options: { commentString },
      } = ctx;
      itemIndent += indentStep;
      const itemCtx = Object.assign({}, ctx, {
        indent: itemIndent,
        inFlow: true,
        type: null,
      });
      let reqNewline = false;
      let linesAtValue = 0;
      const lines = [];
      for (let i = 0; i < items.length; ++i) {
        const item = items[i];
        let comment = null;
        if (identity.isNode(item)) {
          if (item.spaceBefore) lines.push('');
          addCommentBefore(ctx, lines, item.commentBefore, false);
          if (item.comment) comment = item.comment;
        } else if (identity.isPair(item)) {
          const ik = identity.isNode(item.key) ? item.key : null;
          if (ik) {
            if (ik.spaceBefore) lines.push('');
            addCommentBefore(ctx, lines, ik.commentBefore, false);
            if (ik.comment) reqNewline = true;
          }
          const iv = identity.isNode(item.value) ? item.value : null;
          if (iv) {
            if (iv.comment) comment = iv.comment;
            if (iv.commentBefore) reqNewline = true;
          } else if (item.value == null && ik?.comment) {
            comment = ik.comment;
          }
        }
        if (comment) reqNewline = true;
        let str = stringify.stringify(item, itemCtx, () => (comment = null));
        reqNewline || (reqNewline = lines.length > linesAtValue || str.includes('\n'));
        if (i < items.length - 1) {
          str += ',';
        } else if (ctx.options.trailingComma) {
          if (ctx.options.lineWidth > 0) {
            reqNewline ||
              (reqNewline =
                lines.reduce((sum, line) => sum + line.length + 2, 2) + (str.length + 2) > ctx.options.lineWidth);
          }
          if (reqNewline) {
            str += ',';
          }
        }
        if (comment) str += stringifyComment.lineComment(str, itemIndent, commentString(comment));
        lines.push(str);
        linesAtValue = lines.length;
      }
      const { start, end } = flowChars;
      if (lines.length === 0) {
        return start + end;
      } else {
        if (!reqNewline) {
          const len = lines.reduce((sum, line) => sum + line.length + 2, 2);
          reqNewline = ctx.options.lineWidth > 0 && len > ctx.options.lineWidth;
        }
        if (reqNewline) {
          let str = start;
          for (const line of lines)
            str += line
              ? `
${indentStep}${indent}${line}`
              : '\n';
          return `${str}
${indent}${end}`;
        } else {
          return `${start}${fcPadding}${lines.join(' ')}${fcPadding}${end}`;
        }
      }
    }
    function addCommentBefore({ indent, options: { commentString } }, lines, comment, chompKeep) {
      if (comment && chompKeep) comment = comment.replace(/^\n+/, '');
      if (comment) {
        const ic = stringifyComment.indentComment(commentString(comment), indent);
        lines.push(ic.trimStart());
      }
    }
    exports.stringifyCollection = stringifyCollection;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLMap.js
var require_YAMLMap = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLMap.js'(exports) {
    'use strict';
    var stringifyCollection = require_stringifyCollection();
    var addPairToJSMap = require_addPairToJSMap();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    function findPair(items, key) {
      const k = identity.isScalar(key) ? key.value : key;
      for (const it of items) {
        if (identity.isPair(it)) {
          if (it.key === key || it.key === k) return it;
          if (identity.isScalar(it.key) && it.key.value === k) return it;
        }
      }
      return void 0;
    }
    var YAMLMap = class extends Collection.Collection {
      static get tagName() {
        return 'tag:yaml.org,2002:map';
      }
      constructor(schema) {
        super(identity.MAP, schema);
        this.items = [];
      }
      /**
       * A generic collection parsing method that can be extended
       * to other node classes that inherit from YAMLMap
       */
      static from(schema, obj, ctx) {
        const { keepUndefined, replacer } = ctx;
        const map2 = new this(schema);
        const add = (key, value3) => {
          if (typeof replacer === 'function') value3 = replacer.call(obj, key, value3);
          else if (Array.isArray(replacer) && !replacer.includes(key)) return;
          if (value3 !== void 0 || keepUndefined) map2.items.push(Pair.createPair(key, value3, ctx));
        };
        if (obj instanceof Map) {
          for (const [key, value3] of obj) add(key, value3);
        } else if (obj && typeof obj === 'object') {
          for (const key of Object.keys(obj)) add(key, obj[key]);
        }
        if (typeof schema.sortMapEntries === 'function') {
          map2.items.sort(schema.sortMapEntries);
        }
        return map2;
      }
      /**
       * Adds a value to the collection.
       *
       * @param overwrite - If not set `true`, using a key that is already in the
       *   collection will throw. Otherwise, overwrites the previous value.
       */
      add(pair, overwrite) {
        let _pair;
        if (identity.isPair(pair)) _pair = pair;
        else if (!pair || typeof pair !== 'object' || !('key' in pair)) {
          _pair = new Pair.Pair(pair, pair?.value);
        } else _pair = new Pair.Pair(pair.key, pair.value);
        const prev = findPair(this.items, _pair.key);
        const sortEntries = this.schema?.sortMapEntries;
        if (prev) {
          if (!overwrite) throw new Error(`Key ${_pair.key} already set`);
          if (identity.isScalar(prev.value) && Scalar.isScalarValue(_pair.value)) prev.value.value = _pair.value;
          else prev.value = _pair.value;
        } else if (sortEntries) {
          const i = this.items.findIndex((item) => sortEntries(_pair, item) < 0);
          if (i === -1) this.items.push(_pair);
          else this.items.splice(i, 0, _pair);
        } else {
          this.items.push(_pair);
        }
      }
      delete(key) {
        const it = findPair(this.items, key);
        if (!it) return false;
        const del = this.items.splice(this.items.indexOf(it), 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const it = findPair(this.items, key);
        const node = it?.value;
        return (!keepScalar && identity.isScalar(node) ? node.value : node) ?? void 0;
      }
      has(key) {
        return !!findPair(this.items, key);
      }
      set(key, value3) {
        this.add(new Pair.Pair(key, value3), true);
      }
      /**
       * @param ctx - Conversion context, originally set in Document#toJS()
       * @param {Class} Type - If set, forces the returned collection type
       * @returns Instance of Type, Map, or Object
       */
      toJSON(_, ctx, Type) {
        const map2 = Type ? new Type() : ctx?.mapAsMap ? /* @__PURE__ */ new Map() : {};
        if (ctx?.onCreate) ctx.onCreate(map2);
        for (const item of this.items) addPairToJSMap.addPairToJSMap(ctx, map2, item);
        return map2;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx) return JSON.stringify(this);
        for (const item of this.items) {
          if (!identity.isPair(item))
            throw new Error(`Map items must all be pairs; found ${JSON.stringify(item)} instead`);
        }
        if (!ctx.allNullValues && this.hasAllNullValues(false)) ctx = Object.assign({}, ctx, { allNullValues: true });
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: '',
          flowChars: { start: '{', end: '}' },
          itemIndent: ctx.indent || '',
          onChompKeep,
          onComment,
        });
      }
    };
    exports.YAMLMap = YAMLMap;
    exports.findPair = findPair;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/map.js
var require_map = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/map.js'(exports) {
    'use strict';
    var identity = require_identity();
    var YAMLMap = require_YAMLMap();
    var map2 = {
      collection: 'map',
      default: true,
      nodeClass: YAMLMap.YAMLMap,
      tag: 'tag:yaml.org,2002:map',
      resolve(map3, onError) {
        if (!identity.isMap(map3)) onError('Expected a mapping for this tag');
        return map3;
      },
      createNode: (schema, obj, ctx) => YAMLMap.YAMLMap.from(schema, obj, ctx),
    };
    exports.map = map2;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLSeq.js
var require_YAMLSeq = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/nodes/YAMLSeq.js'(exports) {
    'use strict';
    var createNode = require_createNode();
    var stringifyCollection = require_stringifyCollection();
    var Collection = require_Collection();
    var identity = require_identity();
    var Scalar = require_Scalar();
    var toJS = require_toJS();
    var YAMLSeq = class extends Collection.Collection {
      static get tagName() {
        return 'tag:yaml.org,2002:seq';
      }
      constructor(schema) {
        super(identity.SEQ, schema);
        this.items = [];
      }
      add(value3) {
        this.items.push(value3);
      }
      /**
       * Removes a value from the collection.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       *
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number') return false;
        const del = this.items.splice(idx, 1);
        return del.length > 0;
      }
      get(key, keepScalar) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number') return void 0;
        const it = this.items[idx];
        return !keepScalar && identity.isScalar(it) ? it.value : it;
      }
      /**
       * Checks if the collection includes a value with the key `key`.
       *
       * `key` must contain a representation of an integer for this to succeed.
       * It may be wrapped in a `Scalar`.
       */
      has(key) {
        const idx = asItemIndex(key);
        return typeof idx === 'number' && idx < this.items.length;
      }
      /**
       * Sets a value in this collection. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       *
       * If `key` does not contain a representation of an integer, this will throw.
       * It may be wrapped in a `Scalar`.
       */
      set(key, value3) {
        const idx = asItemIndex(key);
        if (typeof idx !== 'number') throw new Error(`Expected a valid index, not ${key}.`);
        const prev = this.items[idx];
        if (identity.isScalar(prev) && Scalar.isScalarValue(value3)) prev.value = value3;
        else this.items[idx] = value3;
      }
      toJSON(_, ctx) {
        const seq = [];
        if (ctx?.onCreate) ctx.onCreate(seq);
        let i = 0;
        for (const item of this.items) seq.push(toJS.toJS(item, String(i++), ctx));
        return seq;
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx) return JSON.stringify(this);
        return stringifyCollection.stringifyCollection(this, ctx, {
          blockItemPrefix: '- ',
          flowChars: { start: '[', end: ']' },
          itemIndent: (ctx.indent || '') + '  ',
          onChompKeep,
          onComment,
        });
      }
      static from(schema, obj, ctx) {
        const { replacer } = ctx;
        const seq = new this(schema);
        if (obj && Symbol.iterator in Object(obj)) {
          let i = 0;
          for (let it of obj) {
            if (typeof replacer === 'function') {
              const key = obj instanceof Set ? it : String(i++);
              it = replacer.call(obj, key, it);
            }
            seq.items.push(createNode.createNode(it, void 0, ctx));
          }
        }
        return seq;
      }
    };
    function asItemIndex(key) {
      let idx = identity.isScalar(key) ? key.value : key;
      if (idx && typeof idx === 'string') idx = Number(idx);
      return typeof idx === 'number' && Number.isInteger(idx) && idx >= 0 ? idx : null;
    }
    exports.YAMLSeq = YAMLSeq;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/seq.js
var require_seq = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/seq.js'(exports) {
    'use strict';
    var identity = require_identity();
    var YAMLSeq = require_YAMLSeq();
    var seq = {
      collection: 'seq',
      default: true,
      nodeClass: YAMLSeq.YAMLSeq,
      tag: 'tag:yaml.org,2002:seq',
      resolve(seq2, onError) {
        if (!identity.isSeq(seq2)) onError('Expected a sequence for this tag');
        return seq2;
      },
      createNode: (schema, obj, ctx) => YAMLSeq.YAMLSeq.from(schema, obj, ctx),
    };
    exports.seq = seq;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/string.js
var require_string = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/string.js'(exports) {
    'use strict';
    var stringifyString = require_stringifyString();
    var string = {
      identify: (value3) => typeof value3 === 'string',
      default: true,
      tag: 'tag:yaml.org,2002:str',
      resolve: (str) => str,
      stringify(item, ctx, onComment, onChompKeep) {
        ctx = Object.assign({ actualString: true }, ctx);
        return stringifyString.stringifyString(item, ctx, onComment, onChompKeep);
      },
    };
    exports.string = string;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/null.js
var require_null = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/common/null.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var nullTag = {
      identify: (value3) => value3 == null,
      createNode: () => new Scalar.Scalar(null),
      default: true,
      tag: 'tag:yaml.org,2002:null',
      test: /^(?:~|[Nn]ull|NULL)?$/,
      resolve: () => new Scalar.Scalar(null),
      stringify: ({ source }, ctx) =>
        typeof source === 'string' && nullTag.test.test(source) ? source : ctx.options.nullStr,
    };
    exports.nullTag = nullTag;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/bool.js
var require_bool = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/bool.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var boolTag = {
      identify: (value3) => typeof value3 === 'boolean',
      default: true,
      tag: 'tag:yaml.org,2002:bool',
      test: /^(?:[Tt]rue|TRUE|[Ff]alse|FALSE)$/,
      resolve: (str) => new Scalar.Scalar(str[0] === 't' || str[0] === 'T'),
      stringify({ source, value: value3 }, ctx) {
        if (source && boolTag.test.test(source)) {
          const sv = source[0] === 't' || source[0] === 'T';
          if (value3 === sv) return source;
        }
        return value3 ? ctx.options.trueStr : ctx.options.falseStr;
      },
    };
    exports.boolTag = boolTag;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyNumber.js
var require_stringifyNumber = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyNumber.js'(exports) {
    'use strict';
    function stringifyNumber({ format, minFractionDigits, tag, value: value3 }) {
      if (typeof value3 === 'bigint') return String(value3);
      const num = typeof value3 === 'number' ? value3 : Number(value3);
      if (!isFinite(num)) return isNaN(num) ? '.nan' : num < 0 ? '-.inf' : '.inf';
      let n = Object.is(value3, -0) ? '-0' : JSON.stringify(value3);
      if (
        !format &&
        minFractionDigits &&
        (!tag || tag === 'tag:yaml.org,2002:float') &&
        /^-?\d/.test(n) &&
        !n.includes('e')
      ) {
        let i = n.indexOf('.');
        if (i < 0) {
          i = n.length;
          n += '.';
        }
        let d = minFractionDigits - (n.length - i - 1);
        while (d-- > 0) n += '0';
      }
      return n;
    }
    exports.stringifyNumber = stringifyNumber;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/float.js
var require_float = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/float.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) =>
        str.slice(-3).toLowerCase() === 'nan'
          ? NaN
          : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber,
    };
    var floatExp = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      format: 'EXP',
      test: /^[-+]?(?:\.[0-9]+|[0-9]+(?:\.[0-9]*)?)[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      },
    };
    var float = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      test: /^[-+]?(?:\.[0-9]+|[0-9]+\.[0-9]*)$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str));
        const dot = str.indexOf('.');
        if (dot !== -1 && str[str.length - 1] === '0') node.minFractionDigits = str.length - dot - 1;
        return node;
      },
      stringify: stringifyNumber.stringifyNumber,
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/int.js
var require_int = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/int.js'(exports) {
    'use strict';
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value3) => typeof value3 === 'bigint' || Number.isInteger(value3);
    var intResolve = (str, offset, radix, { intAsBigInt }) =>
      intAsBigInt ? BigInt(str) : parseInt(str.substring(offset), radix);
    function intStringify(node, radix, prefix) {
      const { value: value3 } = node;
      if (intIdentify(value3) && value3 >= 0) return prefix + value3.toString(radix);
      return stringifyNumber.stringifyNumber(node);
    }
    var intOct = {
      identify: (value3) => intIdentify(value3) && value3 >= 0,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'OCT',
      test: /^0o[0-7]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 8, opt),
      stringify: (node) => intStringify(node, 8, '0o'),
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      test: /^[-+]?[0-9]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber,
    };
    var intHex = {
      identify: (value3) => intIdentify(value3) && value3 >= 0,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'HEX',
      test: /^0x[0-9a-fA-F]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, '0x'),
    };
    exports.int = int;
    exports.intHex = intHex;
    exports.intOct = intOct;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/schema.js
var require_schema = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/core/schema.js'(exports) {
    'use strict';
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = [
      map2.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.boolTag,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
    ];
    exports.schema = schema;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/json/schema.js
var require_schema2 = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/json/schema.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var map2 = require_map();
    var seq = require_seq();
    function intIdentify(value3) {
      return typeof value3 === 'bigint' || Number.isInteger(value3);
    }
    var stringifyJSON = ({ value: value3 }) => JSON.stringify(value3);
    var jsonScalars = [
      {
        identify: (value3) => typeof value3 === 'string',
        default: true,
        tag: 'tag:yaml.org,2002:str',
        resolve: (str) => str,
        stringify: stringifyJSON,
      },
      {
        identify: (value3) => value3 == null,
        createNode: () => new Scalar.Scalar(null),
        default: true,
        tag: 'tag:yaml.org,2002:null',
        test: /^null$/,
        resolve: () => null,
        stringify: stringifyJSON,
      },
      {
        identify: (value3) => typeof value3 === 'boolean',
        default: true,
        tag: 'tag:yaml.org,2002:bool',
        test: /^true$|^false$/,
        resolve: (str) => str === 'true',
        stringify: stringifyJSON,
      },
      {
        identify: intIdentify,
        default: true,
        tag: 'tag:yaml.org,2002:int',
        test: /^-?(?:0|[1-9][0-9]*)$/,
        resolve: (str, _onError, { intAsBigInt }) => (intAsBigInt ? BigInt(str) : parseInt(str, 10)),
        stringify: ({ value: value3 }) => (intIdentify(value3) ? value3.toString() : JSON.stringify(value3)),
      },
      {
        identify: (value3) => typeof value3 === 'number',
        default: true,
        tag: 'tag:yaml.org,2002:float',
        test: /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]*)?(?:[eE][-+]?[0-9]+)?$/,
        resolve: (str) => parseFloat(str),
        stringify: stringifyJSON,
      },
    ];
    var jsonError = {
      default: true,
      tag: '',
      test: /^/,
      resolve(str, onError) {
        onError(`Unresolved plain scalar ${JSON.stringify(str)}`);
        return str;
      },
    };
    var schema = [map2.map, seq.seq].concat(jsonScalars, jsonError);
    exports.schema = schema;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/binary.js
var require_binary = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/binary.js'(exports) {
    'use strict';
    var node_buffer = __require('buffer');
    var Scalar = require_Scalar();
    var stringifyString = require_stringifyString();
    var binary = {
      identify: (value3) => value3 instanceof Uint8Array,
      // Buffer inherits from Uint8Array
      default: false,
      tag: 'tag:yaml.org,2002:binary',
      /**
       * Returns a Buffer in node and an Uint8Array in browsers
       *
       * To use the resulting buffer as an image, you'll want to do something like:
       *
       *   const blob = new Blob([buffer], { type: 'image/jpeg' })
       *   document.querySelector('#photo').src = URL.createObjectURL(blob)
       */
      resolve(src, onError) {
        if (typeof node_buffer.Buffer === 'function') {
          return node_buffer.Buffer.from(src, 'base64');
        } else if (typeof atob === 'function') {
          const str = atob(src.replace(/[\n\r]/g, ''));
          const buffer = new Uint8Array(str.length);
          for (let i = 0; i < str.length; ++i) buffer[i] = str.charCodeAt(i);
          return buffer;
        } else {
          onError('This environment does not support reading binary tags; either Buffer or atob is required');
          return src;
        }
      },
      stringify({ comment, type, value: value3 }, ctx, onComment, onChompKeep) {
        if (!value3) return '';
        const buf = value3;
        let str;
        if (typeof node_buffer.Buffer === 'function') {
          str =
            buf instanceof node_buffer.Buffer
              ? buf.toString('base64')
              : node_buffer.Buffer.from(buf.buffer).toString('base64');
        } else if (typeof btoa === 'function') {
          let s = '';
          for (let i = 0; i < buf.length; ++i) s += String.fromCharCode(buf[i]);
          str = btoa(s);
        } else {
          throw new Error('This environment does not support writing binary tags; either Buffer or btoa is required');
        }
        type ?? (type = Scalar.Scalar.BLOCK_LITERAL);
        if (type !== Scalar.Scalar.QUOTE_DOUBLE) {
          const lineWidth = Math.max(ctx.options.lineWidth - ctx.indent.length, ctx.options.minContentWidth);
          const n = Math.ceil(str.length / lineWidth);
          const lines = new Array(n);
          for (let i = 0, o = 0; i < n; ++i, o += lineWidth) {
            lines[i] = str.substr(o, lineWidth);
          }
          str = lines.join(type === Scalar.Scalar.BLOCK_LITERAL ? '\n' : ' ');
        }
        return stringifyString.stringifyString({ comment, type, value: str }, ctx, onComment, onChompKeep);
      },
    };
    exports.binary = binary;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/pairs.js
var require_pairs = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/pairs.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLSeq = require_YAMLSeq();
    function resolvePairs(seq, onError) {
      if (identity.isSeq(seq)) {
        for (let i = 0; i < seq.items.length; ++i) {
          let item = seq.items[i];
          if (identity.isPair(item)) continue;
          else if (identity.isMap(item)) {
            if (item.items.length > 1) onError('Each pair must have its own sequence indicator');
            const pair = item.items[0] || new Pair.Pair(new Scalar.Scalar(null));
            if (item.commentBefore)
              pair.key.commentBefore = pair.key.commentBefore
                ? `${item.commentBefore}
${pair.key.commentBefore}`
                : item.commentBefore;
            if (item.comment) {
              const cn = pair.value ?? pair.key;
              cn.comment = cn.comment
                ? `${item.comment}
${cn.comment}`
                : item.comment;
            }
            item = pair;
          }
          seq.items[i] = identity.isPair(item) ? item : new Pair.Pair(item);
        }
      } else onError('Expected a sequence for this tag');
      return seq;
    }
    function createPairs(schema, iterable, ctx) {
      const { replacer } = ctx;
      const pairs2 = new YAMLSeq.YAMLSeq(schema);
      pairs2.tag = 'tag:yaml.org,2002:pairs';
      let i = 0;
      if (iterable && Symbol.iterator in Object(iterable))
        for (let it of iterable) {
          if (typeof replacer === 'function') it = replacer.call(iterable, String(i++), it);
          let key, value3;
          if (Array.isArray(it)) {
            if (it.length === 2) {
              key = it[0];
              value3 = it[1];
            } else throw new TypeError(`Expected [key, value] tuple: ${it}`);
          } else if (it && it instanceof Object) {
            const keys3 = Object.keys(it);
            if (keys3.length === 1) {
              key = keys3[0];
              value3 = it[key];
            } else {
              throw new TypeError(`Expected tuple with one key, not ${keys3.length} keys`);
            }
          } else {
            key = it;
          }
          pairs2.items.push(Pair.createPair(key, value3, ctx));
        }
      return pairs2;
    }
    var pairs = {
      collection: 'seq',
      default: false,
      tag: 'tag:yaml.org,2002:pairs',
      resolve: resolvePairs,
      createNode: createPairs,
    };
    exports.createPairs = createPairs;
    exports.pairs = pairs;
    exports.resolvePairs = resolvePairs;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/omap.js
var require_omap = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/omap.js'(exports) {
    'use strict';
    var identity = require_identity();
    var toJS = require_toJS();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var pairs = require_pairs();
    var YAMLOMap = class _YAMLOMap extends YAMLSeq.YAMLSeq {
      constructor() {
        super();
        this.add = YAMLMap.YAMLMap.prototype.add.bind(this);
        this.delete = YAMLMap.YAMLMap.prototype.delete.bind(this);
        this.get = YAMLMap.YAMLMap.prototype.get.bind(this);
        this.has = YAMLMap.YAMLMap.prototype.has.bind(this);
        this.set = YAMLMap.YAMLMap.prototype.set.bind(this);
        this.tag = _YAMLOMap.tag;
      }
      /**
       * If `ctx` is given, the return type is actually `Map<unknown, unknown>`,
       * but TypeScript won't allow widening the signature of a child method.
       */
      toJSON(_, ctx) {
        if (!ctx) return super.toJSON(_);
        const map2 = /* @__PURE__ */ new Map();
        if (ctx?.onCreate) ctx.onCreate(map2);
        for (const pair of this.items) {
          let key, value3;
          if (identity.isPair(pair)) {
            key = toJS.toJS(pair.key, '', ctx);
            value3 = toJS.toJS(pair.value, key, ctx);
          } else {
            key = toJS.toJS(pair, '', ctx);
          }
          if (map2.has(key)) throw new Error('Ordered maps must not include duplicate keys');
          map2.set(key, value3);
        }
        return map2;
      }
      static from(schema, iterable, ctx) {
        const pairs$1 = pairs.createPairs(schema, iterable, ctx);
        const omap2 = new this();
        omap2.items = pairs$1.items;
        return omap2;
      }
    };
    YAMLOMap.tag = 'tag:yaml.org,2002:omap';
    var omap = {
      collection: 'seq',
      identify: (value3) => value3 instanceof Map,
      nodeClass: YAMLOMap,
      default: false,
      tag: 'tag:yaml.org,2002:omap',
      resolve(seq, onError) {
        const pairs$1 = pairs.resolvePairs(seq, onError);
        const seenKeys = [];
        for (const { key } of pairs$1.items) {
          if (identity.isScalar(key)) {
            if (seenKeys.includes(key.value)) {
              onError(`Ordered maps must not include duplicate keys: ${key.value}`);
            } else {
              seenKeys.push(key.value);
            }
          }
        }
        return Object.assign(new YAMLOMap(), pairs$1);
      },
      createNode: (schema, iterable, ctx) => YAMLOMap.from(schema, iterable, ctx),
    };
    exports.YAMLOMap = YAMLOMap;
    exports.omap = omap;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/bool.js
var require_bool2 = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/bool.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    function boolStringify({ value: value3, source }, ctx) {
      const boolObj = value3 ? trueTag : falseTag;
      if (source && boolObj.test.test(source)) return source;
      return value3 ? ctx.options.trueStr : ctx.options.falseStr;
    }
    var trueTag = {
      identify: (value3) => value3 === true,
      default: true,
      tag: 'tag:yaml.org,2002:bool',
      test: /^(?:Y|y|[Yy]es|YES|[Tt]rue|TRUE|[Oo]n|ON)$/,
      resolve: () => new Scalar.Scalar(true),
      stringify: boolStringify,
    };
    var falseTag = {
      identify: (value3) => value3 === false,
      default: true,
      tag: 'tag:yaml.org,2002:bool',
      test: /^(?:N|n|[Nn]o|NO|[Ff]alse|FALSE|[Oo]ff|OFF)$/,
      resolve: () => new Scalar.Scalar(false),
      stringify: boolStringify,
    };
    exports.falseTag = falseTag;
    exports.trueTag = trueTag;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/float.js
var require_float2 = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/float.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var stringifyNumber = require_stringifyNumber();
    var floatNaN = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      test: /^(?:[-+]?\.(?:inf|Inf|INF)|\.nan|\.NaN|\.NAN)$/,
      resolve: (str) =>
        str.slice(-3).toLowerCase() === 'nan'
          ? NaN
          : str[0] === '-'
            ? Number.NEGATIVE_INFINITY
            : Number.POSITIVE_INFINITY,
      stringify: stringifyNumber.stringifyNumber,
    };
    var floatExp = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      format: 'EXP',
      test: /^[-+]?(?:[0-9][0-9_]*)?(?:\.[0-9_]*)?[eE][-+]?[0-9]+$/,
      resolve: (str) => parseFloat(str.replace(/_/g, '')),
      stringify(node) {
        const num = Number(node.value);
        return isFinite(num) ? num.toExponential() : stringifyNumber.stringifyNumber(node);
      },
    };
    var float = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      test: /^[-+]?(?:[0-9][0-9_]*)?\.[0-9_]*$/,
      resolve(str) {
        const node = new Scalar.Scalar(parseFloat(str.replace(/_/g, '')));
        const dot = str.indexOf('.');
        if (dot !== -1) {
          const f = str.substring(dot + 1).replace(/_/g, '');
          if (f[f.length - 1] === '0') node.minFractionDigits = f.length;
        }
        return node;
      },
      stringify: stringifyNumber.stringifyNumber,
    };
    exports.float = float;
    exports.floatExp = floatExp;
    exports.floatNaN = floatNaN;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/int.js
var require_int2 = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/int.js'(exports) {
    'use strict';
    var stringifyNumber = require_stringifyNumber();
    var intIdentify = (value3) => typeof value3 === 'bigint' || Number.isInteger(value3);
    function intResolve(str, offset, radix, { intAsBigInt }) {
      const sign = str[0];
      if (sign === '-' || sign === '+') offset += 1;
      str = str.substring(offset).replace(/_/g, '');
      if (intAsBigInt) {
        switch (radix) {
          case 2:
            str = `0b${str}`;
            break;
          case 8:
            str = `0o${str}`;
            break;
          case 16:
            str = `0x${str}`;
            break;
        }
        const n2 = BigInt(str);
        return sign === '-' ? BigInt(-1) * n2 : n2;
      }
      const n = parseInt(str, radix);
      return sign === '-' ? -1 * n : n;
    }
    function intStringify(node, radix, prefix) {
      const { value: value3 } = node;
      if (intIdentify(value3)) {
        const str = value3.toString(radix);
        return value3 < 0 ? '-' + prefix + str.substr(1) : prefix + str;
      }
      return stringifyNumber.stringifyNumber(node);
    }
    var intBin = {
      identify: intIdentify,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'BIN',
      test: /^[-+]?0b[0-1_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 2, opt),
      stringify: (node) => intStringify(node, 2, '0b'),
    };
    var intOct = {
      identify: intIdentify,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'OCT',
      test: /^[-+]?0[0-7_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 1, 8, opt),
      stringify: (node) => intStringify(node, 8, '0'),
    };
    var int = {
      identify: intIdentify,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      test: /^[-+]?[0-9][0-9_]*$/,
      resolve: (str, _onError, opt) => intResolve(str, 0, 10, opt),
      stringify: stringifyNumber.stringifyNumber,
    };
    var intHex = {
      identify: intIdentify,
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'HEX',
      test: /^[-+]?0x[0-9a-fA-F_]+$/,
      resolve: (str, _onError, opt) => intResolve(str, 2, 16, opt),
      stringify: (node) => intStringify(node, 16, '0x'),
    };
    exports.int = int;
    exports.intBin = intBin;
    exports.intHex = intHex;
    exports.intOct = intOct;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/set.js
var require_set = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/set.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSet = class _YAMLSet extends YAMLMap.YAMLMap {
      constructor(schema) {
        super(schema);
        this.tag = _YAMLSet.tag;
      }
      add(key) {
        let pair;
        if (identity.isPair(key)) pair = key;
        else if (key && typeof key === 'object' && 'key' in key && 'value' in key && key.value === null)
          pair = new Pair.Pair(key.key, null);
        else pair = new Pair.Pair(key, null);
        const prev = YAMLMap.findPair(this.items, pair.key);
        if (!prev) this.items.push(pair);
      }
      /**
       * If `keepPair` is `true`, returns the Pair matching `key`.
       * Otherwise, returns the value of that Pair's key.
       */
      get(key, keepPair) {
        const pair = YAMLMap.findPair(this.items, key);
        return !keepPair && identity.isPair(pair) ? (identity.isScalar(pair.key) ? pair.key.value : pair.key) : pair;
      }
      set(key, value3) {
        if (typeof value3 !== 'boolean')
          throw new Error(`Expected boolean value for set(key, value) in a YAML set, not ${typeof value3}`);
        const prev = YAMLMap.findPair(this.items, key);
        if (prev && !value3) {
          this.items.splice(this.items.indexOf(prev), 1);
        } else if (!prev && value3) {
          this.items.push(new Pair.Pair(key));
        }
      }
      toJSON(_, ctx) {
        return super.toJSON(_, ctx, Set);
      }
      toString(ctx, onComment, onChompKeep) {
        if (!ctx) return JSON.stringify(this);
        if (this.hasAllNullValues(true))
          return super.toString(Object.assign({}, ctx, { allNullValues: true }), onComment, onChompKeep);
        else throw new Error('Set items must all have null values');
      }
      static from(schema, iterable, ctx) {
        const { replacer } = ctx;
        const set2 = new this(schema);
        if (iterable && Symbol.iterator in Object(iterable))
          for (let value3 of iterable) {
            if (typeof replacer === 'function') value3 = replacer.call(iterable, value3, value3);
            set2.items.push(Pair.createPair(value3, null, ctx));
          }
        return set2;
      }
    };
    YAMLSet.tag = 'tag:yaml.org,2002:set';
    var set = {
      collection: 'map',
      identify: (value3) => value3 instanceof Set,
      nodeClass: YAMLSet,
      default: false,
      tag: 'tag:yaml.org,2002:set',
      createNode: (schema, iterable, ctx) => YAMLSet.from(schema, iterable, ctx),
      resolve(map2, onError) {
        if (identity.isMap(map2)) {
          if (map2.hasAllNullValues(true)) return Object.assign(new YAMLSet(), map2);
          else onError('Set items must all have null values');
        } else onError('Expected a mapping for this tag');
        return map2;
      },
    };
    exports.YAMLSet = YAMLSet;
    exports.set = set;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js
var require_timestamp = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/timestamp.js'(exports) {
    'use strict';
    var stringifyNumber = require_stringifyNumber();
    function parseSexagesimal(str, asBigInt) {
      const sign = str[0];
      const parts = sign === '-' || sign === '+' ? str.substring(1) : str;
      const num = (n) => (asBigInt ? BigInt(n) : Number(n));
      const res = parts
        .replace(/_/g, '')
        .split(':')
        .reduce((res2, p) => res2 * num(60) + num(p), num(0));
      return sign === '-' ? num(-1) * res : res;
    }
    function stringifySexagesimal(node) {
      let { value: value3 } = node;
      let num = (n) => n;
      if (typeof value3 === 'bigint') num = (n) => BigInt(n);
      else if (isNaN(value3) || !isFinite(value3)) return stringifyNumber.stringifyNumber(node);
      let sign = '';
      if (value3 < 0) {
        sign = '-';
        value3 *= num(-1);
      }
      const _60 = num(60);
      const parts = [value3 % _60];
      if (value3 < 60) {
        parts.unshift(0);
      } else {
        value3 = (value3 - parts[0]) / _60;
        parts.unshift(value3 % _60);
        if (value3 >= 60) {
          value3 = (value3 - parts[0]) / _60;
          parts.unshift(value3);
        }
      }
      return (
        sign +
        parts
          .map((n) => String(n).padStart(2, '0'))
          .join(':')
          .replace(/000000\d*$/, '')
      );
    }
    var intTime = {
      identify: (value3) => typeof value3 === 'bigint' || Number.isInteger(value3),
      default: true,
      tag: 'tag:yaml.org,2002:int',
      format: 'TIME',
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+$/,
      resolve: (str, _onError, { intAsBigInt }) => parseSexagesimal(str, intAsBigInt),
      stringify: stringifySexagesimal,
    };
    var floatTime = {
      identify: (value3) => typeof value3 === 'number',
      default: true,
      tag: 'tag:yaml.org,2002:float',
      format: 'TIME',
      test: /^[-+]?[0-9][0-9_]*(?::[0-5]?[0-9])+\.[0-9_]*$/,
      resolve: (str) => parseSexagesimal(str, false),
      stringify: stringifySexagesimal,
    };
    var timestamp = {
      identify: (value3) => value3 instanceof Date,
      default: true,
      tag: 'tag:yaml.org,2002:timestamp',
      // If the time zone is omitted, the timestamp is assumed to be specified in UTC. The time part
      // may be omitted altogether, resulting in a date format. In such a case, the time part is
      // assumed to be 00:00:00Z (start of day, UTC).
      test: RegExp(
        '^([0-9]{4})-([0-9]{1,2})-([0-9]{1,2})(?:(?:t|T|[ \\t]+)([0-9]{1,2}):([0-9]{1,2}):([0-9]{1,2}(\\.[0-9]+)?)(?:[ \\t]*(Z|[-+][012]?[0-9](?::[0-9]{2})?))?)?$',
      ),
      resolve(str) {
        const match = str.match(timestamp.test);
        if (!match) throw new Error('!!timestamp expects a date, starting with yyyy-mm-dd');
        const [, year, month, day, hour, minute, second] = match.map(Number);
        const millisec = match[7] ? Number((match[7] + '00').substr(1, 3)) : 0;
        let date = Date.UTC(year, month - 1, day, hour || 0, minute || 0, second || 0, millisec);
        const tz = match[8];
        if (tz && tz !== 'Z') {
          let d = parseSexagesimal(tz, false);
          if (Math.abs(d) < 30) d *= 60;
          date -= 6e4 * d;
        }
        return new Date(date);
      },
      stringify: ({ value: value3 }) => value3?.toISOString().replace(/(T00:00:00)?\.000Z$/, '') ?? '',
    };
    exports.floatTime = floatTime;
    exports.intTime = intTime;
    exports.timestamp = timestamp;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/schema.js
var require_schema3 = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/yaml-1.1/schema.js'(exports) {
    'use strict';
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var binary = require_binary();
    var bool = require_bool2();
    var float = require_float2();
    var int = require_int2();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var set = require_set();
    var timestamp = require_timestamp();
    var schema = [
      map2.map,
      seq.seq,
      string.string,
      _null.nullTag,
      bool.trueTag,
      bool.falseTag,
      int.intBin,
      int.intOct,
      int.int,
      int.intHex,
      float.floatNaN,
      float.floatExp,
      float.float,
      binary.binary,
      merge.merge,
      omap.omap,
      pairs.pairs,
      set.set,
      timestamp.intTime,
      timestamp.floatTime,
      timestamp.timestamp,
    ];
    exports.schema = schema;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/tags.js
var require_tags = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/tags.js'(exports) {
    'use strict';
    var map2 = require_map();
    var _null = require_null();
    var seq = require_seq();
    var string = require_string();
    var bool = require_bool();
    var float = require_float();
    var int = require_int();
    var schema = require_schema();
    var schema$1 = require_schema2();
    var binary = require_binary();
    var merge = require_merge();
    var omap = require_omap();
    var pairs = require_pairs();
    var schema$2 = require_schema3();
    var set = require_set();
    var timestamp = require_timestamp();
    var schemas = /* @__PURE__ */ new Map([
      ['core', schema.schema],
      ['failsafe', [map2.map, seq.seq, string.string]],
      ['json', schema$1.schema],
      ['yaml11', schema$2.schema],
      ['yaml-1.1', schema$2.schema],
    ]);
    var tagsByName = {
      binary: binary.binary,
      bool: bool.boolTag,
      float: float.float,
      floatExp: float.floatExp,
      floatNaN: float.floatNaN,
      floatTime: timestamp.floatTime,
      int: int.int,
      intHex: int.intHex,
      intOct: int.intOct,
      intTime: timestamp.intTime,
      map: map2.map,
      merge: merge.merge,
      null: _null.nullTag,
      omap: omap.omap,
      pairs: pairs.pairs,
      seq: seq.seq,
      set: set.set,
      timestamp: timestamp.timestamp,
    };
    var coreKnownTags = {
      'tag:yaml.org,2002:binary': binary.binary,
      'tag:yaml.org,2002:merge': merge.merge,
      'tag:yaml.org,2002:omap': omap.omap,
      'tag:yaml.org,2002:pairs': pairs.pairs,
      'tag:yaml.org,2002:set': set.set,
      'tag:yaml.org,2002:timestamp': timestamp.timestamp,
    };
    function getTags(customTags, schemaName, addMergeTag) {
      const schemaTags = schemas.get(schemaName);
      if (schemaTags && !customTags) {
        return addMergeTag && !schemaTags.includes(merge.merge) ? schemaTags.concat(merge.merge) : schemaTags.slice();
      }
      let tags = schemaTags;
      if (!tags) {
        if (Array.isArray(customTags)) tags = [];
        else {
          const keys3 = Array.from(schemas.keys())
            .filter((key) => key !== 'yaml11')
            .map((key) => JSON.stringify(key))
            .join(', ');
          throw new Error(`Unknown schema "${schemaName}"; use one of ${keys3} or define customTags array`);
        }
      }
      if (Array.isArray(customTags)) {
        for (const tag of customTags) tags = tags.concat(tag);
      } else if (typeof customTags === 'function') {
        tags = customTags(tags.slice());
      }
      if (addMergeTag) tags = tags.concat(merge.merge);
      return tags.reduce((tags2, tag) => {
        const tagObj = typeof tag === 'string' ? tagsByName[tag] : tag;
        if (!tagObj) {
          const tagName = JSON.stringify(tag);
          const keys3 = Object.keys(tagsByName)
            .map((key) => JSON.stringify(key))
            .join(', ');
          throw new Error(`Unknown custom tag ${tagName}; use one of ${keys3}`);
        }
        if (!tags2.includes(tagObj)) tags2.push(tagObj);
        return tags2;
      }, []);
    }
    exports.coreKnownTags = coreKnownTags;
    exports.getTags = getTags;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/Schema.js
var require_Schema = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/schema/Schema.js'(exports) {
    'use strict';
    var identity = require_identity();
    var map2 = require_map();
    var seq = require_seq();
    var string = require_string();
    var tags = require_tags();
    var sortMapEntriesByKey = (a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0);
    var Schema = class _Schema {
      constructor({ compat, customTags, merge, resolveKnownTags, schema, sortMapEntries, toStringDefaults }) {
        this.compat = Array.isArray(compat)
          ? tags.getTags(compat, 'compat')
          : compat
            ? tags.getTags(null, compat)
            : null;
        this.name = (typeof schema === 'string' && schema) || 'core';
        this.knownTags = resolveKnownTags ? tags.coreKnownTags : {};
        this.tags = tags.getTags(customTags, this.name, merge);
        this.toStringOptions = toStringDefaults ?? null;
        Object.defineProperty(this, identity.MAP, { value: map2.map });
        Object.defineProperty(this, identity.SCALAR, { value: string.string });
        Object.defineProperty(this, identity.SEQ, { value: seq.seq });
        this.sortMapEntries =
          typeof sortMapEntries === 'function' ? sortMapEntries : sortMapEntries === true ? sortMapEntriesByKey : null;
      }
      clone() {
        const copy = Object.create(_Schema.prototype, Object.getOwnPropertyDescriptors(this));
        copy.tags = this.tags.slice();
        return copy;
      }
    };
    exports.Schema = Schema;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyDocument.js
var require_stringifyDocument = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/stringify/stringifyDocument.js'(exports) {
    'use strict';
    var identity = require_identity();
    var stringify = require_stringify();
    var stringifyComment = require_stringifyComment();
    function stringifyDocument(doc, options) {
      const lines = [];
      let hasDirectives = options.directives === true;
      if (options.directives !== false && doc.directives) {
        const dir = doc.directives.toString(doc);
        if (dir) {
          lines.push(dir);
          hasDirectives = true;
        } else if (doc.directives.docStart) hasDirectives = true;
      }
      if (hasDirectives) lines.push('---');
      const ctx = stringify.createStringifyContext(doc, options);
      const { commentString } = ctx.options;
      if (doc.commentBefore) {
        if (lines.length !== 1) lines.unshift('');
        const cs = commentString(doc.commentBefore);
        lines.unshift(stringifyComment.indentComment(cs, ''));
      }
      let chompKeep = false;
      let contentComment = null;
      if (doc.contents) {
        if (identity.isNode(doc.contents)) {
          if (doc.contents.spaceBefore && hasDirectives) lines.push('');
          if (doc.contents.commentBefore) {
            const cs = commentString(doc.contents.commentBefore);
            lines.push(stringifyComment.indentComment(cs, ''));
          }
          ctx.forceBlockIndent = !!doc.comment;
          contentComment = doc.contents.comment;
        }
        const onChompKeep = contentComment ? void 0 : () => (chompKeep = true);
        let body = stringify.stringify(doc.contents, ctx, () => (contentComment = null), onChompKeep);
        if (contentComment) body += stringifyComment.lineComment(body, '', commentString(contentComment));
        if ((body[0] === '|' || body[0] === '>') && lines[lines.length - 1] === '---') {
          lines[lines.length - 1] = `--- ${body}`;
        } else lines.push(body);
      } else {
        lines.push(stringify.stringify(doc.contents, ctx));
      }
      if (doc.directives?.docEnd) {
        if (doc.comment) {
          const cs = commentString(doc.comment);
          if (cs.includes('\n')) {
            lines.push('...');
            lines.push(stringifyComment.indentComment(cs, ''));
          } else {
            lines.push(`... ${cs}`);
          }
        } else {
          lines.push('...');
        }
      } else {
        let dc = doc.comment;
        if (dc && chompKeep) dc = dc.replace(/^\n+/, '');
        if (dc) {
          if ((!chompKeep || contentComment) && lines[lines.length - 1] !== '') lines.push('');
          lines.push(stringifyComment.indentComment(commentString(dc), ''));
        }
      }
      return lines.join('\n') + '\n';
    }
    exports.stringifyDocument = stringifyDocument;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/Document.js
var require_Document = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/doc/Document.js'(exports) {
    'use strict';
    var Alias = require_Alias();
    var Collection = require_Collection();
    var identity = require_identity();
    var Pair = require_Pair();
    var toJS = require_toJS();
    var Schema = require_Schema();
    var stringifyDocument = require_stringifyDocument();
    var anchors = require_anchors();
    var applyReviver = require_applyReviver();
    var createNode = require_createNode();
    var directives = require_directives();
    var Document = class _Document {
      constructor(value3, replacer, options) {
        this.commentBefore = null;
        this.comment = null;
        this.errors = [];
        this.warnings = [];
        Object.defineProperty(this, identity.NODE_TYPE, { value: identity.DOC });
        let _replacer = null;
        if (typeof replacer === 'function' || Array.isArray(replacer)) {
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const opt = Object.assign(
          {
            intAsBigInt: false,
            keepSourceTokens: false,
            logLevel: 'warn',
            prettyErrors: true,
            strict: true,
            stringKeys: false,
            uniqueKeys: true,
            version: '1.2',
          },
          options,
        );
        this.options = opt;
        let { version } = opt;
        if (options?._directives) {
          this.directives = options._directives.atDocument();
          if (this.directives.yaml.explicit) version = this.directives.yaml.version;
        } else this.directives = new directives.Directives({ version });
        this.setSchema(version, options);
        this.contents = value3 === void 0 ? null : this.createNode(value3, _replacer, options);
      }
      /**
       * Create a deep copy of this Document and its contents.
       *
       * Custom Node values that inherit from `Object` still refer to their original instances.
       */
      clone() {
        const copy = Object.create(_Document.prototype, {
          [identity.NODE_TYPE]: { value: identity.DOC },
        });
        copy.commentBefore = this.commentBefore;
        copy.comment = this.comment;
        copy.errors = this.errors.slice();
        copy.warnings = this.warnings.slice();
        copy.options = Object.assign({}, this.options);
        if (this.directives) copy.directives = this.directives.clone();
        copy.schema = this.schema.clone();
        copy.contents = identity.isNode(this.contents) ? this.contents.clone(copy.schema) : this.contents;
        if (this.range) copy.range = this.range.slice();
        return copy;
      }
      /** Adds a value to the document. */
      add(value3) {
        if (assertCollection(this.contents)) this.contents.add(value3);
      }
      /** Adds a value to the document. */
      addIn(path6, value3) {
        if (assertCollection(this.contents)) this.contents.addIn(path6, value3);
      }
      /**
       * Create a new `Alias` node, ensuring that the target `node` has the required anchor.
       *
       * If `node` already has an anchor, `name` is ignored.
       * Otherwise, the `node.anchor` value will be set to `name`,
       * or if an anchor with that name is already present in the document,
       * `name` will be used as a prefix for a new unique anchor.
       * If `name` is undefined, the generated anchor will use 'a' as a prefix.
       */
      createAlias(node, name) {
        if (!node.anchor) {
          const prev = anchors.anchorNames(this);
          node.anchor = !name || prev.has(name) ? anchors.findNewAnchor(name || 'a', prev) : name; // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
        }
        return new Alias.Alias(node.anchor);
      }
      createNode(value3, replacer, options) {
        let _replacer = void 0;
        if (typeof replacer === 'function') {
          value3 = replacer.call({ '': value3 }, '', value3);
          _replacer = replacer;
        } else if (Array.isArray(replacer)) {
          const keyToStr = (v) => typeof v === 'number' || v instanceof String || v instanceof Number;
          const asStr = replacer.filter(keyToStr).map(String);
          if (asStr.length > 0) replacer = replacer.concat(asStr);
          _replacer = replacer;
        } else if (options === void 0 && replacer) {
          options = replacer;
          replacer = void 0;
        }
        const { aliasDuplicateObjects, anchorPrefix, flow, keepUndefined, onTagObj, tag } = options ?? {};
        const { onAnchor, setAnchors, sourceObjects } = anchors.createNodeAnchors(
          this,
          // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
          anchorPrefix || 'a',
        );
        const ctx = {
          aliasDuplicateObjects: aliasDuplicateObjects ?? true,
          keepUndefined: keepUndefined ?? false,
          onAnchor,
          onTagObj,
          replacer: _replacer,
          schema: this.schema,
          sourceObjects,
        };
        const node = createNode.createNode(value3, tag, ctx);
        if (flow && identity.isCollection(node)) node.flow = true;
        setAnchors();
        return node;
      }
      /**
       * Convert a key and a value into a `Pair` using the current schema,
       * recursively wrapping all values as `Scalar` or `Collection` nodes.
       */
      createPair(key, value3, options = {}) {
        const k = this.createNode(key, null, options);
        const v = this.createNode(value3, null, options);
        return new Pair.Pair(k, v);
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      delete(key) {
        return assertCollection(this.contents) ? this.contents.delete(key) : false;
      }
      /**
       * Removes a value from the document.
       * @returns `true` if the item was found and removed.
       */
      deleteIn(path6) {
        if (Collection.isEmptyPath(path6)) {
          if (this.contents == null) return false;
          this.contents = null;
          return true;
        }
        return assertCollection(this.contents) ? this.contents.deleteIn(path6) : false;
      }
      /**
       * Returns item at `key`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      get(key, keepScalar) {
        return identity.isCollection(this.contents) ? this.contents.get(key, keepScalar) : void 0;
      }
      /**
       * Returns item at `path`, or `undefined` if not found. By default unwraps
       * scalar values from their surrounding node; to disable set `keepScalar` to
       * `true` (collections are always returned intact).
       */
      getIn(path6, keepScalar) {
        if (Collection.isEmptyPath(path6))
          return !keepScalar && identity.isScalar(this.contents) ? this.contents.value : this.contents;
        return identity.isCollection(this.contents) ? this.contents.getIn(path6, keepScalar) : void 0;
      }
      /**
       * Checks if the document includes a value with the key `key`.
       */
      has(key) {
        return identity.isCollection(this.contents) ? this.contents.has(key) : false;
      }
      /**
       * Checks if the document includes a value at `path`.
       */
      hasIn(path6) {
        if (Collection.isEmptyPath(path6)) return this.contents !== void 0;
        return identity.isCollection(this.contents) ? this.contents.hasIn(path6) : false;
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      set(key, value3) {
        if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, [key], value3);
        } else if (assertCollection(this.contents)) {
          this.contents.set(key, value3);
        }
      }
      /**
       * Sets a value in this document. For `!!set`, `value` needs to be a
       * boolean to add/remove the item from the set.
       */
      setIn(path6, value3) {
        if (Collection.isEmptyPath(path6)) {
          this.contents = value3;
        } else if (this.contents == null) {
          this.contents = Collection.collectionFromPath(this.schema, Array.from(path6), value3);
        } else if (assertCollection(this.contents)) {
          this.contents.setIn(path6, value3);
        }
      }
      /**
       * Change the YAML version and schema used by the document.
       * A `null` version disables support for directives, explicit tags, anchors, and aliases.
       * It also requires the `schema` option to be given as a `Schema` instance value.
       *
       * Overrides all previously set schema options.
       */
      setSchema(version, options = {}) {
        if (typeof version === 'number') version = String(version);
        let opt;
        switch (version) {
          case '1.1':
            if (this.directives) this.directives.yaml.version = '1.1';
            else this.directives = new directives.Directives({ version: '1.1' });
            opt = { resolveKnownTags: false, schema: 'yaml-1.1' };
            break;
          case '1.2':
          case 'next':
            if (this.directives) this.directives.yaml.version = version;
            else this.directives = new directives.Directives({ version });
            opt = { resolveKnownTags: true, schema: 'core' };
            break;
          case null:
            if (this.directives) delete this.directives;
            opt = null;
            break;
          default: {
            const sv = JSON.stringify(version);
            throw new Error(`Expected '1.1', '1.2' or null as first argument, but found: ${sv}`);
          }
        }
        if (options.schema instanceof Object) this.schema = options.schema;
        else if (opt) this.schema = new Schema.Schema(Object.assign(opt, options));
        else throw new Error(`With a null YAML version, the { schema: Schema } option is required`);
      }
      // json & jsonArg are only used from toJSON()
      toJS({ json, jsonArg, mapAsMap, maxAliasCount, onAnchor, reviver } = {}) {
        const ctx = {
          anchors: /* @__PURE__ */ new Map(),
          doc: this,
          keep: !json,
          mapAsMap: mapAsMap === true,
          mapKeyWarned: false,
          maxAliasCount: typeof maxAliasCount === 'number' ? maxAliasCount : 100,
        };
        const res = toJS.toJS(this.contents, jsonArg ?? '', ctx);
        if (typeof onAnchor === 'function')
          for (const { count, res: res2 } of ctx.anchors.values()) onAnchor(res2, count);
        return typeof reviver === 'function' ? applyReviver.applyReviver(reviver, { '': res }, '', res) : res;
      }
      /**
       * A JSON representation of the document `contents`.
       *
       * @param jsonArg Used by `JSON.stringify` to indicate the array index or
       *   property name.
       */
      toJSON(jsonArg, onAnchor) {
        return this.toJS({ json: true, jsonArg, mapAsMap: false, onAnchor });
      }
      /** A YAML representation of the document. */
      toString(options = {}) {
        if (this.errors.length > 0) throw new Error('Document with errors cannot be stringified');
        if ('indent' in options && (!Number.isInteger(options.indent) || Number(options.indent) <= 0)) {
          const s = JSON.stringify(options.indent);
          throw new Error(`"indent" option must be a positive integer, not ${s}`);
        }
        return stringifyDocument.stringifyDocument(this, options);
      }
    };
    function assertCollection(contents) {
      if (identity.isCollection(contents)) return true;
      throw new Error('Expected a YAML collection as document contents');
    }
    exports.Document = Document;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/errors.js
var require_errors = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/errors.js'(exports) {
    'use strict';
    var YAMLError = class extends Error {
      constructor(name, pos, code, message) {
        super();
        this.name = name;
        this.code = code;
        this.message = message;
        this.pos = pos;
      }
    };
    var YAMLParseError = class extends YAMLError {
      constructor(pos, code, message) {
        super('YAMLParseError', pos, code, message);
      }
    };
    var YAMLWarning = class extends YAMLError {
      constructor(pos, code, message) {
        super('YAMLWarning', pos, code, message);
      }
    };
    var prettifyError = (src, lc) => (error) => {
      if (error.pos[0] === -1) return;
      error.linePos = error.pos.map((pos) => lc.linePos(pos));
      const { line, col } = error.linePos[0];
      error.message += ` at line ${line}, column ${col}`;
      let ci = col - 1;
      let lineStr = src.substring(lc.lineStarts[line - 1], lc.lineStarts[line]).replace(/[\n\r]+$/, '');
      if (ci >= 60 && lineStr.length > 80) {
        const trimStart = Math.min(ci - 39, lineStr.length - 79);
        lineStr = '\u2026' + lineStr.substring(trimStart);
        ci -= trimStart - 1;
      }
      if (lineStr.length > 80) lineStr = lineStr.substring(0, 79) + '\u2026';
      if (line > 1 && /^ *$/.test(lineStr.substring(0, ci))) {
        let prev = src.substring(lc.lineStarts[line - 2], lc.lineStarts[line - 1]);
        if (prev.length > 80) prev = prev.substring(0, 79) + '\u2026\n';
        lineStr = prev + lineStr;
      }
      if (/[^ ]/.test(lineStr)) {
        let count = 1;
        const end = error.linePos[1];
        if (end?.line === line && end.col > col) {
          count = Math.max(1, Math.min(end.col - col, 80 - ci));
        }
        const pointer = ' '.repeat(ci) + '^'.repeat(count);
        error.message += `:

${lineStr}
${pointer}
`;
      }
    };
    exports.YAMLError = YAMLError;
    exports.YAMLParseError = YAMLParseError;
    exports.YAMLWarning = YAMLWarning;
    exports.prettifyError = prettifyError;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-props.js
var require_resolve_props = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-props.js'(exports) {
    'use strict';
    function resolveProps(tokens, { flow, indicator, next, offset, onError, parentIndent, startOnNewline }) {
      let spaceBefore = false;
      let atNewline = startOnNewline;
      let hasSpace = startOnNewline;
      let comment = '';
      let commentSep = '';
      let hasNewline = false;
      let reqSpace = false;
      let tab = null;
      let anchor = null;
      let tag = null;
      let newlineAfterProp = null;
      let comma = null;
      let found = null;
      let start = null;
      for (const token2 of tokens) {
        if (reqSpace) {
          if (token2.type !== 'space' && token2.type !== 'newline' && token2.type !== 'comma')
            onError(
              token2.offset,
              'MISSING_CHAR',
              'Tags and anchors must be separated from the next token by white space',
            );
          reqSpace = false;
        }
        if (tab) {
          if (atNewline && token2.type !== 'comment' && token2.type !== 'newline') {
            onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
          }
          tab = null;
        }
        switch (token2.type) {
          case 'space':
            if (
              !flow &&
              (indicator !== 'doc-start' || next?.type !== 'flow-collection') &&
              token2.source.includes('	')
            ) {
              tab = token2;
            }
            hasSpace = true;
            break;
          case 'comment': {
            if (!hasSpace)
              onError(token2, 'MISSING_CHAR', 'Comments must be separated from other tokens by white space characters');
            const cb = token2.source.substring(1) || ' ';
            if (!comment) comment = cb;
            else comment += commentSep + cb;
            commentSep = '';
            atNewline = false;
            break;
          }
          case 'newline':
            if (atNewline) {
              if (comment) comment += token2.source;
              else if (!found || indicator !== 'seq-item-ind') spaceBefore = true;
            } else commentSep += token2.source;
            atNewline = true;
            hasNewline = true;
            if (anchor || tag) newlineAfterProp = token2;
            hasSpace = true;
            break;
          case 'anchor':
            if (anchor) onError(token2, 'MULTIPLE_ANCHORS', 'A node can have at most one anchor');
            if (token2.source.endsWith(':'))
              onError(token2.offset + token2.source.length - 1, 'BAD_ALIAS', 'Anchor ending in : is ambiguous', true);
            anchor = token2;
            start ?? (start = token2.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          case 'tag': {
            if (tag) onError(token2, 'MULTIPLE_TAGS', 'A node can have at most one tag');
            tag = token2;
            start ?? (start = token2.offset);
            atNewline = false;
            hasSpace = false;
            reqSpace = true;
            break;
          }
          case indicator:
            if (anchor || tag)
              onError(token2, 'BAD_PROP_ORDER', `Anchors and tags must be after the ${token2.source} indicator`);
            if (found) onError(token2, 'UNEXPECTED_TOKEN', `Unexpected ${token2.source} in ${flow ?? 'collection'}`);
            found = token2;
            atNewline = indicator === 'seq-item-ind' || indicator === 'explicit-key-ind';
            hasSpace = false;
            break;
          case 'comma':
            if (flow) {
              if (comma) onError(token2, 'UNEXPECTED_TOKEN', `Unexpected , in ${flow}`);
              comma = token2;
              atNewline = false;
              hasSpace = false;
              break;
            }
          // else fallthrough
          default:
            onError(token2, 'UNEXPECTED_TOKEN', `Unexpected ${token2.type} token`);
            atNewline = false;
            hasSpace = false;
        }
      }
      const last = tokens[tokens.length - 1];
      const end = last ? last.offset + last.source.length : offset;
      if (
        reqSpace &&
        next &&
        next.type !== 'space' &&
        next.type !== 'newline' &&
        next.type !== 'comma' &&
        (next.type !== 'scalar' || next.source !== '')
      ) {
        onError(next.offset, 'MISSING_CHAR', 'Tags and anchors must be separated from the next token by white space');
      }
      if (
        tab &&
        ((atNewline && tab.indent <= parentIndent) || next?.type === 'block-map' || next?.type === 'block-seq')
      )
        onError(tab, 'TAB_AS_INDENT', 'Tabs are not allowed as indentation');
      return {
        comma,
        found,
        spaceBefore,
        comment,
        hasNewline,
        anchor,
        tag,
        newlineAfterProp,
        end,
        start: start ?? end,
      };
    }
    exports.resolveProps = resolveProps;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-contains-newline.js
var require_util_contains_newline = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-contains-newline.js'(exports) {
    'use strict';
    function containsNewline(key) {
      if (!key) return null;
      switch (key.type) {
        case 'alias':
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
          if (key.source.includes('\n')) return true;
          if (key.end) {
            for (const st of key.end) if (st.type === 'newline') return true;
          }
          return false;
        case 'flow-collection':
          for (const it of key.items) {
            for (const st of it.start) if (st.type === 'newline') return true;
            if (it.sep) {
              for (const st of it.sep) if (st.type === 'newline') return true;
            }
            if (containsNewline(it.key) || containsNewline(it.value)) return true;
          }
          return false;
        default:
          return true;
      }
    }
    exports.containsNewline = containsNewline;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-flow-indent-check.js
var require_util_flow_indent_check = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-flow-indent-check.js'(exports) {
    'use strict';
    var utilContainsNewline = require_util_contains_newline();
    function flowIndentCheck(indent, fc, onError) {
      if (fc?.type === 'flow-collection') {
        const end = fc.end[0];
        if (
          end.indent === indent &&
          (end.source === ']' || end.source === '}') &&
          utilContainsNewline.containsNewline(fc)
        ) {
          const msg = 'Flow end indicator should be more indented than parent';
          onError(end, 'BAD_INDENT', msg, true);
        }
      }
    }
    exports.flowIndentCheck = flowIndentCheck;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-map-includes.js
var require_util_map_includes = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-map-includes.js'(exports) {
    'use strict';
    var identity = require_identity();
    function mapIncludes(ctx, items, search) {
      const { uniqueKeys } = ctx.options;
      if (uniqueKeys === false) return false;
      const isEqual =
        typeof uniqueKeys === 'function'
          ? uniqueKeys
          : (a, b) => a === b || (identity.isScalar(a) && identity.isScalar(b) && a.value === b.value);
      return items.some((pair) => isEqual(pair.key, search));
    }
    exports.mapIncludes = mapIncludes;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-map.js
var require_resolve_block_map = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-map.js'(exports) {
    'use strict';
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    var utilMapIncludes = require_util_map_includes();
    var startColMsg = 'All mapping items must start at the same column';
    function resolveBlockMap({ composeNode, composeEmptyNode }, ctx, bm, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLMap.YAMLMap;
      const map2 = new NodeClass(ctx.schema);
      if (ctx.atRoot) ctx.atRoot = false;
      let offset = bm.offset;
      let commentEnd = null;
      for (const collItem of bm.items) {
        const { start, key, sep, value: value3 } = collItem;
        const keyProps = resolveProps.resolveProps(start, {
          indicator: 'explicit-key-ind',
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: bm.indent,
          startOnNewline: true,
        });
        const implicitKey = !keyProps.found;
        if (implicitKey) {
          if (key) {
            if (key.type === 'block-seq')
              onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'A block sequence may not be used as an implicit map key');
            else if ('indent' in key && key.indent !== bm.indent) onError(offset, 'BAD_INDENT', startColMsg);
          }
          if (!keyProps.anchor && !keyProps.tag && !sep) {
            commentEnd = keyProps.end;
            if (keyProps.comment) {
              if (map2.comment) map2.comment += '\n' + keyProps.comment;
              else map2.comment = keyProps.comment;
            }
            continue;
          }
          if (keyProps.newlineAfterProp || utilContainsNewline.containsNewline(key)) {
            onError(
              key ?? start[start.length - 1],
              'MULTILINE_IMPLICIT_KEY',
              'Implicit keys need to be on a single line',
            );
          }
        } else if (keyProps.found?.indent !== bm.indent) {
          onError(offset, 'BAD_INDENT', startColMsg);
        }
        ctx.atKey = true;
        const keyStart = keyProps.end;
        const keyNode = key
          ? composeNode(ctx, key, keyProps, onError)
          : composeEmptyNode(ctx, keyStart, start, null, keyProps, onError);
        if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, key, onError);
        ctx.atKey = false;
        if (utilMapIncludes.mapIncludes(ctx, map2.items, keyNode))
          onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
        const valueProps = resolveProps.resolveProps(sep ?? [], {
          indicator: 'map-value-ind',
          next: value3,
          offset: keyNode.range[2],
          onError,
          parentIndent: bm.indent,
          startOnNewline: !key || key.type === 'block-scalar',
        });
        offset = valueProps.end;
        if (valueProps.found) {
          if (implicitKey) {
            if (value3?.type === 'block-map' && !valueProps.hasNewline)
              onError(offset, 'BLOCK_AS_IMPLICIT_KEY', 'Nested mappings are not allowed in compact mappings');
            if (ctx.options.strict && keyProps.start < valueProps.found.offset - 1024)
              onError(
                keyNode.range,
                'KEY_OVER_1024_CHARS',
                'The : indicator must be at most 1024 chars after the start of an implicit block mapping key',
              );
          }
          const valueNode = value3
            ? composeNode(ctx, value3, valueProps, onError)
            : composeEmptyNode(ctx, offset, sep, null, valueProps, onError);
          if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bm.indent, value3, onError);
          offset = valueNode.range[2];
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
          map2.items.push(pair);
        } else {
          if (implicitKey)
            onError(keyNode.range, 'MISSING_CHAR', 'Implicit map keys need to be followed by map values');
          if (valueProps.comment) {
            if (keyNode.comment) keyNode.comment += '\n' + valueProps.comment;
            else keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode);
          if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
          map2.items.push(pair);
        }
      }
      if (commentEnd && commentEnd < offset) onError(commentEnd, 'IMPOSSIBLE', 'Map comment with trailing content');
      map2.range = [bm.offset, offset, commentEnd ?? offset];
      return map2;
    }
    exports.resolveBlockMap = resolveBlockMap;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-seq.js
var require_resolve_block_seq = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-seq.js'(exports) {
    'use strict';
    var YAMLSeq = require_YAMLSeq();
    var resolveProps = require_resolve_props();
    var utilFlowIndentCheck = require_util_flow_indent_check();
    function resolveBlockSeq({ composeNode, composeEmptyNode }, ctx, bs, onError, tag) {
      const NodeClass = tag?.nodeClass ?? YAMLSeq.YAMLSeq;
      const seq = new NodeClass(ctx.schema);
      if (ctx.atRoot) ctx.atRoot = false;
      if (ctx.atKey) ctx.atKey = false;
      let offset = bs.offset;
      let commentEnd = null;
      for (const { start, value: value3 } of bs.items) {
        const props = resolveProps.resolveProps(start, {
          indicator: 'seq-item-ind',
          next: value3,
          offset,
          onError,
          parentIndent: bs.indent,
          startOnNewline: true,
        });
        if (!props.found) {
          if (props.anchor || props.tag || value3) {
            if (value3?.type === 'block-seq')
              onError(props.end, 'BAD_INDENT', 'All sequence items must start at the same column');
            else onError(offset, 'MISSING_CHAR', 'Sequence item without - indicator');
          } else {
            commentEnd = props.end;
            if (props.comment) seq.comment = props.comment;
            continue;
          }
        }
        const node = value3
          ? composeNode(ctx, value3, props, onError)
          : composeEmptyNode(ctx, props.end, start, null, props, onError);
        if (ctx.schema.compat) utilFlowIndentCheck.flowIndentCheck(bs.indent, value3, onError);
        offset = node.range[2];
        seq.items.push(node);
      }
      seq.range = [bs.offset, offset, commentEnd ?? offset];
      return seq;
    }
    exports.resolveBlockSeq = resolveBlockSeq;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-end.js
var require_resolve_end = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-end.js'(exports) {
    'use strict';
    function resolveEnd(end, offset, reqSpace, onError) {
      let comment = '';
      if (end) {
        let hasSpace = false;
        let sep = '';
        for (const token2 of end) {
          const { source, type } = token2;
          switch (type) {
            case 'space':
              hasSpace = true;
              break;
            case 'comment': {
              if (reqSpace && !hasSpace)
                onError(
                  token2,
                  'MISSING_CHAR',
                  'Comments must be separated from other tokens by white space characters',
                );
              const cb = source.substring(1) || ' ';
              if (!comment) comment = cb;
              else comment += sep + cb;
              sep = '';
              break;
            }
            case 'newline':
              if (comment) sep += source;
              hasSpace = true;
              break;
            default:
              onError(token2, 'UNEXPECTED_TOKEN', `Unexpected ${type} at node end`);
          }
          offset += source.length;
        }
      }
      return { comment, offset };
    }
    exports.resolveEnd = resolveEnd;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-collection.js
var require_resolve_flow_collection = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-collection.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Pair = require_Pair();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    var utilContainsNewline = require_util_contains_newline();
    var utilMapIncludes = require_util_map_includes();
    var blockMsg = 'Block collections are not allowed within flow collections';
    var isBlock = (token2) => token2 && (token2.type === 'block-map' || token2.type === 'block-seq');
    function resolveFlowCollection({ composeNode, composeEmptyNode }, ctx, fc, onError, tag) {
      const isMap = fc.start.source === '{';
      const fcName = isMap ? 'flow map' : 'flow sequence';
      const NodeClass = tag?.nodeClass ?? (isMap ? YAMLMap.YAMLMap : YAMLSeq.YAMLSeq);
      const coll = new NodeClass(ctx.schema);
      coll.flow = true;
      const atRoot = ctx.atRoot;
      if (atRoot) ctx.atRoot = false;
      if (ctx.atKey) ctx.atKey = false;
      let offset = fc.offset + fc.start.source.length;
      for (let i = 0; i < fc.items.length; ++i) {
        const collItem = fc.items[i];
        const { start, key, sep, value: value3 } = collItem;
        const props = resolveProps.resolveProps(start, {
          flow: fcName,
          indicator: 'explicit-key-ind',
          next: key ?? sep?.[0],
          offset,
          onError,
          parentIndent: fc.indent,
          startOnNewline: false,
        });
        if (!props.found) {
          if (!props.anchor && !props.tag && !sep && !value3) {
            if (i === 0 && props.comma) onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
            else if (i < fc.items.length - 1)
              onError(props.start, 'UNEXPECTED_TOKEN', `Unexpected empty item in ${fcName}`);
            if (props.comment) {
              if (coll.comment) coll.comment += '\n' + props.comment;
              else coll.comment = props.comment;
            }
            offset = props.end;
            continue;
          }
          if (!isMap && ctx.options.strict && utilContainsNewline.containsNewline(key))
            onError(
              key,
              // checked by containsNewline()
              'MULTILINE_IMPLICIT_KEY',
              'Implicit keys of flow sequence pairs need to be on a single line',
            );
        }
        if (i === 0) {
          if (props.comma) onError(props.comma, 'UNEXPECTED_TOKEN', `Unexpected , in ${fcName}`);
        } else {
          if (!props.comma) onError(props.start, 'MISSING_CHAR', `Missing , between ${fcName} items`);
          if (props.comment) {
            let prevItemComment = '';
            loop: for (const st of start) {
              switch (st.type) {
                case 'comma':
                case 'space':
                  break;
                case 'comment':
                  prevItemComment = st.source.substring(1);
                  break loop;
                default:
                  break loop;
              }
            }
            if (prevItemComment) {
              let prev = coll.items[coll.items.length - 1];
              if (identity.isPair(prev)) prev = prev.value ?? prev.key;
              if (prev.comment) prev.comment += '\n' + prevItemComment;
              else prev.comment = prevItemComment;
              props.comment = props.comment.substring(prevItemComment.length + 1);
            }
          }
        }
        if (!isMap && !sep && !props.found) {
          const valueNode = value3
            ? composeNode(ctx, value3, props, onError)
            : composeEmptyNode(ctx, props.end, sep, null, props, onError);
          coll.items.push(valueNode);
          offset = valueNode.range[2];
          if (isBlock(value3)) onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
        } else {
          ctx.atKey = true;
          const keyStart = props.end;
          const keyNode = key
            ? composeNode(ctx, key, props, onError)
            : composeEmptyNode(ctx, keyStart, start, null, props, onError);
          if (isBlock(key)) onError(keyNode.range, 'BLOCK_IN_FLOW', blockMsg);
          ctx.atKey = false;
          const valueProps = resolveProps.resolveProps(sep ?? [], {
            flow: fcName,
            indicator: 'map-value-ind',
            next: value3,
            offset: keyNode.range[2],
            onError,
            parentIndent: fc.indent,
            startOnNewline: false,
          });
          if (valueProps.found) {
            if (!isMap && !props.found && ctx.options.strict) {
              if (sep)
                for (const st of sep) {
                  if (st === valueProps.found) break;
                  if (st.type === 'newline') {
                    onError(
                      st,
                      'MULTILINE_IMPLICIT_KEY',
                      'Implicit keys of flow sequence pairs need to be on a single line',
                    );
                    break;
                  }
                }
              if (props.start < valueProps.found.offset - 1024)
                onError(
                  valueProps.found,
                  'KEY_OVER_1024_CHARS',
                  'The : indicator must be at most 1024 chars after the start of an implicit flow sequence key',
                );
            }
          } else if (value3) {
            if ('source' in value3 && value3.source?.[0] === ':')
              onError(value3, 'MISSING_CHAR', `Missing space after : in ${fcName}`);
            else onError(valueProps.start, 'MISSING_CHAR', `Missing , or : between ${fcName} items`);
          }
          const valueNode = value3
            ? composeNode(ctx, value3, valueProps, onError)
            : valueProps.found
              ? composeEmptyNode(ctx, valueProps.end, sep, null, valueProps, onError)
              : null;
          if (valueNode) {
            if (isBlock(value3)) onError(valueNode.range, 'BLOCK_IN_FLOW', blockMsg);
          } else if (valueProps.comment) {
            if (keyNode.comment) keyNode.comment += '\n' + valueProps.comment;
            else keyNode.comment = valueProps.comment;
          }
          const pair = new Pair.Pair(keyNode, valueNode);
          if (ctx.options.keepSourceTokens) pair.srcToken = collItem;
          if (isMap) {
            const map2 = coll;
            if (utilMapIncludes.mapIncludes(ctx, map2.items, keyNode))
              onError(keyStart, 'DUPLICATE_KEY', 'Map keys must be unique');
            map2.items.push(pair);
          } else {
            const map2 = new YAMLMap.YAMLMap(ctx.schema);
            map2.flow = true;
            map2.items.push(pair);
            const endRange = (valueNode ?? keyNode).range;
            map2.range = [keyNode.range[0], endRange[1], endRange[2]];
            coll.items.push(map2);
          }
          offset = valueNode ? valueNode.range[2] : valueProps.end;
        }
      }
      const expectedEnd = isMap ? '}' : ']';
      const [ce, ...ee] = fc.end;
      let cePos = offset;
      if (ce?.source === expectedEnd) cePos = ce.offset + ce.source.length;
      else {
        const name = fcName[0].toUpperCase() + fcName.substring(1);
        const msg = atRoot
          ? `${name} must end with a ${expectedEnd}`
          : `${name} in block collection must be sufficiently indented and end with a ${expectedEnd}`;
        onError(offset, atRoot ? 'MISSING_CHAR' : 'BAD_INDENT', msg);
        if (ce && ce.source.length !== 1) ee.unshift(ce);
      }
      if (ee.length > 0) {
        const end = resolveEnd.resolveEnd(ee, cePos, ctx.options.strict, onError);
        if (end.comment) {
          if (coll.comment) coll.comment += '\n' + end.comment;
          else coll.comment = end.comment;
        }
        coll.range = [fc.offset, cePos, end.offset];
      } else {
        coll.range = [fc.offset, cePos, cePos];
      }
      return coll;
    }
    exports.resolveFlowCollection = resolveFlowCollection;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-collection.js
var require_compose_collection = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-collection.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var resolveBlockMap = require_resolve_block_map();
    var resolveBlockSeq = require_resolve_block_seq();
    var resolveFlowCollection = require_resolve_flow_collection();
    function resolveCollection(CN, ctx, token2, onError, tagName, tag) {
      const coll =
        token2.type === 'block-map'
          ? resolveBlockMap.resolveBlockMap(CN, ctx, token2, onError, tag)
          : token2.type === 'block-seq'
            ? resolveBlockSeq.resolveBlockSeq(CN, ctx, token2, onError, tag)
            : resolveFlowCollection.resolveFlowCollection(CN, ctx, token2, onError, tag);
      const Coll = coll.constructor;
      if (tagName === '!' || tagName === Coll.tagName) {
        coll.tag = Coll.tagName;
        return coll;
      }
      if (tagName) coll.tag = tagName;
      return coll;
    }
    function composeCollection(CN, ctx, token2, props, onError) {
      const tagToken = props.tag;
      const tagName = !tagToken
        ? null
        : ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, 'TAG_RESOLVE_FAILED', msg));
      if (token2.type === 'block-seq') {
        const { anchor, newlineAfterProp: nl } = props;
        const lastProp =
          anchor && tagToken ? (anchor.offset > tagToken.offset ? anchor : tagToken) : (anchor ?? tagToken);
        if (lastProp && (!nl || nl.offset < lastProp.offset)) {
          const message = 'Missing newline after block sequence props';
          onError(lastProp, 'MISSING_CHAR', message);
        }
      }
      const expType =
        token2.type === 'block-map'
          ? 'map'
          : token2.type === 'block-seq'
            ? 'seq'
            : token2.start.source === '{'
              ? 'map'
              : 'seq';
      if (
        !tagToken ||
        !tagName ||
        tagName === '!' ||
        (tagName === YAMLMap.YAMLMap.tagName && expType === 'map') ||
        (tagName === YAMLSeq.YAMLSeq.tagName && expType === 'seq')
      ) {
        return resolveCollection(CN, ctx, token2, onError, tagName);
      }
      let tag = ctx.schema.tags.find((t) => t.tag === tagName && t.collection === expType);
      if (!tag) {
        const kt = ctx.schema.knownTags[tagName];
        if (kt?.collection === expType) {
          ctx.schema.tags.push(Object.assign({}, kt, { default: false }));
          tag = kt;
        } else {
          if (kt) {
            onError(
              tagToken,
              'BAD_COLLECTION_TYPE',
              `${kt.tag} used for ${expType} collection, but expects ${kt.collection ?? 'scalar'}`,
              true,
            );
          } else {
            onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, true);
          }
          return resolveCollection(CN, ctx, token2, onError, tagName);
        }
      }
      const coll = resolveCollection(CN, ctx, token2, onError, tagName, tag);
      const res = tag.resolve?.(coll, (msg) => onError(tagToken, 'TAG_RESOLVE_FAILED', msg), ctx.options) ?? coll;
      const node = identity.isNode(res) ? res : new Scalar.Scalar(res);
      node.range = coll.range;
      node.tag = tagName;
      if (tag?.format) node.format = tag.format;
      return node;
    }
    exports.composeCollection = composeCollection;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-scalar.js
var require_resolve_block_scalar = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-block-scalar.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    function resolveBlockScalar(ctx, scalar, onError) {
      const start = scalar.offset;
      const header = parseBlockScalarHeader(scalar, ctx.options.strict, onError);
      if (!header) return { value: '', type: null, comment: '', range: [start, start, start] };
      const type = header.mode === '>' ? Scalar.Scalar.BLOCK_FOLDED : Scalar.Scalar.BLOCK_LITERAL;
      const lines = scalar.source ? splitLines(scalar.source) : [];
      let chompStart = lines.length;
      for (let i = lines.length - 1; i >= 0; --i) {
        const content = lines[i][1];
        if (content === '' || content === '\r') chompStart = i;
        else break;
      }
      if (chompStart === 0) {
        const value4 = header.chomp === '+' && lines.length > 0 ? '\n'.repeat(Math.max(1, lines.length - 1)) : '';
        let end2 = start + header.length;
        if (scalar.source) end2 += scalar.source.length;
        return { value: value4, type, comment: header.comment, range: [start, end2, end2] };
      }
      let trimIndent = scalar.indent + header.indent;
      let offset = scalar.offset + header.length;
      let contentStart = 0;
      for (let i = 0; i < chompStart; ++i) {
        const [indent, content] = lines[i];
        if (content === '' || content === '\r') {
          if (header.indent === 0 && indent.length > trimIndent) trimIndent = indent.length;
        } else {
          if (indent.length < trimIndent) {
            const message =
              'Block scalars with more-indented leading empty lines must use an explicit indentation indicator';
            onError(offset + indent.length, 'MISSING_CHAR', message);
          }
          if (header.indent === 0) trimIndent = indent.length;
          contentStart = i;
          if (trimIndent === 0 && !ctx.atRoot) {
            const message = 'Block scalar values in collections must be indented';
            onError(offset, 'BAD_INDENT', message);
          }
          break;
        }
        offset += indent.length + content.length + 1;
      }
      for (let i = lines.length - 1; i >= chompStart; --i) {
        if (lines[i][0].length > trimIndent) chompStart = i + 1;
      }
      let value3 = '';
      let sep = '';
      let prevMoreIndented = false;
      for (let i = 0; i < contentStart; ++i) value3 += lines[i][0].slice(trimIndent) + '\n';
      for (let i = contentStart; i < chompStart; ++i) {
        let [indent, content] = lines[i];
        offset += indent.length + content.length + 1;
        const crlf = content[content.length - 1] === '\r';
        if (crlf) content = content.slice(0, -1);
        if (content && indent.length < trimIndent) {
          const src = header.indent ? 'explicit indentation indicator' : 'first line';
          const message = `Block scalar lines must not be less indented than their ${src}`;
          onError(offset - content.length - (crlf ? 2 : 1), 'BAD_INDENT', message);
          indent = '';
        }
        if (type === Scalar.Scalar.BLOCK_LITERAL) {
          value3 += sep + indent.slice(trimIndent) + content;
          sep = '\n';
        } else if (indent.length > trimIndent || content[0] === '	') {
          if (sep === ' ') sep = '\n';
          else if (!prevMoreIndented && sep === '\n') sep = '\n\n';
          value3 += sep + indent.slice(trimIndent) + content;
          sep = '\n';
          prevMoreIndented = true;
        } else if (content === '') {
          if (sep === '\n') value3 += '\n';
          else sep = '\n';
        } else {
          value3 += sep + content;
          sep = ' ';
          prevMoreIndented = false;
        }
      }
      switch (header.chomp) {
        case '-':
          break;
        case '+':
          for (let i = chompStart; i < lines.length; ++i) value3 += '\n' + lines[i][0].slice(trimIndent);
          if (value3[value3.length - 1] !== '\n') value3 += '\n';
          break;
        default:
          value3 += '\n';
      }
      const end = start + header.length + scalar.source.length;
      return { value: value3, type, comment: header.comment, range: [start, end, end] };
    }
    function parseBlockScalarHeader({ offset, props }, strict, onError) {
      if (props[0].type !== 'block-scalar-header') {
        onError(props[0], 'IMPOSSIBLE', 'Block scalar header not found');
        return null;
      }
      const { source } = props[0];
      const mode = source[0];
      let indent = 0;
      let chomp = '';
      let error = -1;
      for (let i = 1; i < source.length; ++i) {
        const ch = source[i];
        if (!chomp && (ch === '-' || ch === '+')) chomp = ch;
        else {
          const n = Number(ch);
          if (!indent && n) indent = n;
          else if (error === -1) error = offset + i;
        }
      }
      if (error !== -1) onError(error, 'UNEXPECTED_TOKEN', `Block scalar header includes extra characters: ${source}`);
      let hasSpace = false;
      let comment = '';
      let length3 = source.length;
      for (let i = 1; i < props.length; ++i) {
        const token2 = props[i];
        switch (token2.type) {
          case 'space':
            hasSpace = true;
          // fallthrough
          case 'newline':
            length3 += token2.source.length;
            break;
          case 'comment':
            if (strict && !hasSpace) {
              const message = 'Comments must be separated from other tokens by white space characters';
              onError(token2, 'MISSING_CHAR', message);
            }
            length3 += token2.source.length;
            comment = token2.source.substring(1);
            break;
          case 'error':
            onError(token2, 'UNEXPECTED_TOKEN', token2.message);
            length3 += token2.source.length;
            break;
          /* istanbul ignore next should not happen */
          default: {
            const message = `Unexpected token in block scalar header: ${token2.type}`;
            onError(token2, 'UNEXPECTED_TOKEN', message);
            const ts = token2.source;
            if (ts && typeof ts === 'string') length3 += ts.length;
          }
        }
      }
      return { mode, indent, chomp, comment, length: length3 };
    }
    function splitLines(source) {
      const split = source.split(/\n( *)/);
      const first = split[0];
      const m = first.match(/^( *)/);
      const line0 = m?.[1] ? [m[1], first.slice(m[1].length)] : ['', first];
      const lines = [line0];
      for (let i = 1; i < split.length; i += 2) lines.push([split[i], split[i + 1]]);
      return lines;
    }
    exports.resolveBlockScalar = resolveBlockScalar;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-scalar.js
var require_resolve_flow_scalar = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/resolve-flow-scalar.js'(exports) {
    'use strict';
    var Scalar = require_Scalar();
    var resolveEnd = require_resolve_end();
    function resolveFlowScalar(scalar, strict, onError) {
      const { offset, type, source, end } = scalar;
      let _type;
      let value3;
      const _onError = (rel, code, msg) => onError(offset + rel, code, msg);
      switch (type) {
        case 'scalar':
          _type = Scalar.Scalar.PLAIN;
          value3 = plainValue(source, _onError);
          break;
        case 'single-quoted-scalar':
          _type = Scalar.Scalar.QUOTE_SINGLE;
          value3 = singleQuotedValue(source, _onError);
          break;
        case 'double-quoted-scalar':
          _type = Scalar.Scalar.QUOTE_DOUBLE;
          value3 = doubleQuotedValue(source, _onError);
          break;
        /* istanbul ignore next should not happen */
        default:
          onError(scalar, 'UNEXPECTED_TOKEN', `Expected a flow scalar value, but found: ${type}`);
          return {
            value: '',
            type: null,
            comment: '',
            range: [offset, offset + source.length, offset + source.length],
          };
      }
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, strict, onError);
      return {
        value: value3,
        type: _type,
        comment: re.comment,
        range: [offset, valueEnd, re.offset],
      };
    }
    function plainValue(source, onError) {
      let badChar = '';
      switch (source[0]) {
        /* istanbul ignore next should not happen */
        case '	':
          badChar = 'a tab character';
          break;
        case ',':
          badChar = 'flow indicator character ,';
          break;
        case '%':
          badChar = 'directive indicator character %';
          break;
        case '|':
        case '>': {
          badChar = `block scalar indicator ${source[0]}`;
          break;
        }
        case '@':
        case '`': {
          badChar = `reserved character ${source[0]}`;
          break;
        }
      }
      if (badChar) onError(0, 'BAD_SCALAR_START', `Plain value cannot start with ${badChar}`);
      return foldLines(source);
    }
    function singleQuotedValue(source, onError) {
      if (source[source.length - 1] !== "'" || source.length === 1)
        onError(source.length, 'MISSING_CHAR', "Missing closing 'quote");
      return foldLines(source.slice(1, -1)).replace(/''/g, "'");
    }
    function foldLines(source) {
      let first, line;
      try {
        first = new RegExp('(.*?)(?<![ 	])[ 	]*\r?\n', 'sy');
        line = new RegExp('[ 	]*(.*?)(?:(?<![ 	])[ 	]*)?\r?\n', 'sy');
      } catch {
        first = /(.*?)[ \t]*\r?\n/sy;
        line = /[ \t]*(.*?)[ \t]*\r?\n/sy;
      }
      let match = first.exec(source);
      if (!match) return source;
      let res = match[1];
      let sep = ' ';
      let pos = first.lastIndex;
      line.lastIndex = pos;
      while ((match = line.exec(source))) {
        if (match[1] === '') {
          if (sep === '\n') res += sep;
          else sep = '\n';
        } else {
          res += sep + match[1];
          sep = ' ';
        }
        pos = line.lastIndex;
      }
      const last = /[ \t]*(.*)/sy;
      last.lastIndex = pos;
      match = last.exec(source);
      return res + sep + (match?.[1] ?? '');
    }
    function doubleQuotedValue(source, onError) {
      let res = '';
      for (let i = 1; i < source.length - 1; ++i) {
        const ch = source[i];
        if (ch === '\r' && source[i + 1] === '\n') continue;
        if (ch === '\n') {
          const { fold, offset } = foldNewline(source, i);
          res += fold;
          i = offset;
        } else if (ch === '\\') {
          let next = source[++i];
          const cc = escapeCodes[next];
          if (cc) res += cc;
          else if (next === '\n') {
            next = source[i + 1];
            while (next === ' ' || next === '	') next = source[++i + 1];
          } else if (next === '\r' && source[i + 1] === '\n') {
            next = source[++i + 1];
            while (next === ' ' || next === '	') next = source[++i + 1];
          } else if (next === 'x' || next === 'u' || next === 'U') {
            const length3 = next === 'x' ? 2 : next === 'u' ? 4 : 8;
            res += parseCharCode(source, i + 1, length3, onError);
            i += length3;
          } else {
            const raw = source.substr(i - 1, 2);
            onError(i - 1, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
            res += raw;
          }
        } else if (ch === ' ' || ch === '	') {
          const wsStart = i;
          let next = source[i + 1];
          while (next === ' ' || next === '	') next = source[++i + 1];
          if (next !== '\n' && !(next === '\r' && source[i + 2] === '\n'))
            res += i > wsStart ? source.slice(wsStart, i + 1) : ch;
        } else {
          res += ch;
        }
      }
      if (source[source.length - 1] !== '"' || source.length === 1)
        onError(source.length, 'MISSING_CHAR', 'Missing closing "quote');
      return res;
    }
    function foldNewline(source, offset) {
      let fold = '';
      let ch = source[offset + 1];
      while (ch === ' ' || ch === '	' || ch === '\n' || ch === '\r') {
        if (ch === '\r' && source[offset + 2] !== '\n') break;
        if (ch === '\n') fold += '\n';
        offset += 1;
        ch = source[offset + 1];
      }
      if (!fold) fold = ' ';
      return { fold, offset };
    }
    var escapeCodes = {
      0: '\0',
      // null character
      a: '\x07',
      // bell character
      b: '\b',
      // backspace
      e: '\x1B',
      // escape character
      f: '\f',
      // form feed
      n: '\n',
      // line feed
      r: '\r',
      // carriage return
      t: '	',
      // horizontal tab
      v: '\v',
      // vertical tab
      N: '\x85',
      // Unicode next line
      _: '\xA0',
      // Unicode non-breaking space
      L: '\u2028',
      // Unicode line separator
      P: '\u2029',
      // Unicode paragraph separator
      ' ': ' ',
      '"': '"',
      '/': '/',
      '\\': '\\',
      '	': '	',
    };
    function parseCharCode(source, offset, length3, onError) {
      const cc = source.substr(offset, length3);
      const ok = cc.length === length3 && /^[0-9a-fA-F]+$/.test(cc);
      const code = ok ? parseInt(cc, 16) : NaN;
      try {
        return String.fromCodePoint(code);
      } catch {
        const raw = source.substr(offset - 2, length3 + 2);
        onError(offset - 2, 'BAD_DQ_ESCAPE', `Invalid escape sequence ${raw}`);
        return raw;
      }
    }
    exports.resolveFlowScalar = resolveFlowScalar;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-scalar.js
var require_compose_scalar = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-scalar.js'(exports) {
    'use strict';
    var identity = require_identity();
    var Scalar = require_Scalar();
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    function composeScalar(ctx, token2, tagToken, onError) {
      const {
        value: value3,
        type,
        comment,
        range,
      } = token2.type === 'block-scalar'
        ? resolveBlockScalar.resolveBlockScalar(ctx, token2, onError)
        : resolveFlowScalar.resolveFlowScalar(token2, ctx.options.strict, onError);
      const tagName = tagToken
        ? ctx.directives.tagName(tagToken.source, (msg) => onError(tagToken, 'TAG_RESOLVE_FAILED', msg))
        : null;
      let tag;
      if (ctx.options.stringKeys && ctx.atKey) {
        tag = ctx.schema[identity.SCALAR];
      } else if (tagName) tag = findScalarTagByName(ctx.schema, value3, tagName, tagToken, onError);
      else if (token2.type === 'scalar') tag = findScalarTagByTest(ctx, value3, token2, onError);
      else tag = ctx.schema[identity.SCALAR];
      let scalar;
      try {
        const res = tag.resolve(value3, (msg) => onError(tagToken ?? token2, 'TAG_RESOLVE_FAILED', msg), ctx.options);
        scalar = identity.isScalar(res) ? res : new Scalar.Scalar(res);
      } catch (error) {
        const msg = error instanceof Error ? error.message : String(error);
        onError(tagToken ?? token2, 'TAG_RESOLVE_FAILED', msg);
        scalar = new Scalar.Scalar(value3);
      }
      scalar.range = range;
      scalar.source = value3;
      if (type) scalar.type = type;
      if (tagName) scalar.tag = tagName;
      if (tag.format) scalar.format = tag.format;
      if (comment) scalar.comment = comment;
      return scalar;
    }
    function findScalarTagByName(schema, value3, tagName, tagToken, onError) {
      if (tagName === '!') return schema[identity.SCALAR];
      const matchWithTest = [];
      for (const tag of schema.tags) {
        if (!tag.collection && tag.tag === tagName) {
          if (tag.default && tag.test) matchWithTest.push(tag);
          else return tag;
        }
      }
      for (const tag of matchWithTest) if (tag.test?.test(value3)) return tag;
      const kt = schema.knownTags[tagName];
      if (kt && !kt.collection) {
        schema.tags.push(Object.assign({}, kt, { default: false, test: void 0 }));
        return kt;
      }
      onError(tagToken, 'TAG_RESOLVE_FAILED', `Unresolved tag: ${tagName}`, tagName !== 'tag:yaml.org,2002:str');
      return schema[identity.SCALAR];
    }
    function findScalarTagByTest({ atKey, directives, schema }, value3, token2, onError) {
      const tag =
        schema.tags.find(
          (tag2) => (tag2.default === true || (atKey && tag2.default === 'key')) && tag2.test?.test(value3),
        ) || schema[identity.SCALAR];
      if (schema.compat) {
        const compat = schema.compat.find((tag2) => tag2.default && tag2.test?.test(value3)) ?? schema[identity.SCALAR];
        if (tag.tag !== compat.tag) {
          const ts = directives.tagString(tag.tag);
          const cs = directives.tagString(compat.tag);
          const msg = `Value may be parsed as either ${ts} or ${cs}`;
          onError(token2, 'TAG_RESOLVE_FAILED', msg, true);
        }
      }
      return tag;
    }
    exports.composeScalar = composeScalar;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-empty-scalar-position.js
var require_util_empty_scalar_position = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/util-empty-scalar-position.js'(exports) {
    'use strict';
    function emptyScalarPosition(offset, before, pos) {
      if (before) {
        pos ?? (pos = before.length);
        for (let i = pos - 1; i >= 0; --i) {
          let st = before[i];
          switch (st.type) {
            case 'space':
            case 'comment':
            case 'newline':
              offset -= st.source.length;
              continue;
          }
          st = before[++i];
          while (st?.type === 'space') {
            offset += st.source.length;
            st = before[++i];
          }
          break;
        }
      }
      return offset;
    }
    exports.emptyScalarPosition = emptyScalarPosition;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-node.js
var require_compose_node = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-node.js'(exports) {
    'use strict';
    var Alias = require_Alias();
    var identity = require_identity();
    var composeCollection = require_compose_collection();
    var composeScalar = require_compose_scalar();
    var resolveEnd = require_resolve_end();
    var utilEmptyScalarPosition = require_util_empty_scalar_position();
    var CN = { composeNode, composeEmptyNode };
    function composeNode(ctx, token2, props, onError) {
      const atKey = ctx.atKey;
      const { spaceBefore, comment, anchor, tag } = props;
      let node;
      let isSrcToken = true;
      switch (token2.type) {
        case 'alias':
          node = composeAlias(ctx, token2, onError);
          if (anchor || tag) onError(token2, 'ALIAS_PROPS', 'An alias node must not specify any properties');
          break;
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'block-scalar':
          node = composeScalar.composeScalar(ctx, token2, tag, onError);
          if (anchor) node.anchor = anchor.source.substring(1);
          break;
        case 'block-map':
        case 'block-seq':
        case 'flow-collection':
          try {
            node = composeCollection.composeCollection(CN, ctx, token2, props, onError);
            if (anchor) node.anchor = anchor.source.substring(1);
          } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            onError(token2, 'RESOURCE_EXHAUSTION', message);
          }
          break;
        default: {
          const message = token2.type === 'error' ? token2.message : `Unsupported token (type: ${token2.type})`;
          onError(token2, 'UNEXPECTED_TOKEN', message);
          isSrcToken = false;
        }
      }
      node ?? (node = composeEmptyNode(ctx, token2.offset, void 0, null, props, onError));
      if (anchor && node.anchor === '') onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
      if (
        atKey &&
        ctx.options.stringKeys &&
        (!identity.isScalar(node) ||
          typeof node.value !== 'string' ||
          (node.tag && node.tag !== 'tag:yaml.org,2002:str'))
      ) {
        const msg = 'With stringKeys, all keys must be strings';
        onError(tag ?? token2, 'NON_STRING_KEY', msg);
      }
      if (spaceBefore) node.spaceBefore = true;
      if (comment) {
        if (token2.type === 'scalar' && token2.source === '') node.comment = comment;
        else node.commentBefore = comment;
      }
      if (ctx.options.keepSourceTokens && isSrcToken) node.srcToken = token2;
      return node;
    }
    function composeEmptyNode(ctx, offset, before, pos, { spaceBefore, comment, anchor, tag, end }, onError) {
      const token2 = {
        type: 'scalar',
        offset: utilEmptyScalarPosition.emptyScalarPosition(offset, before, pos),
        indent: -1,
        source: '',
      };
      const node = composeScalar.composeScalar(ctx, token2, tag, onError);
      if (anchor) {
        node.anchor = anchor.source.substring(1);
        if (node.anchor === '') onError(anchor, 'BAD_ALIAS', 'Anchor cannot be an empty string');
      }
      if (spaceBefore) node.spaceBefore = true;
      if (comment) {
        node.comment = comment;
        node.range[2] = end;
      }
      return node;
    }
    function composeAlias({ options }, { offset, source, end }, onError) {
      const alias = new Alias.Alias(source.substring(1));
      if (alias.source === '') onError(offset, 'BAD_ALIAS', 'Alias cannot be an empty string');
      if (alias.source.endsWith(':'))
        onError(offset + source.length - 1, 'BAD_ALIAS', 'Alias ending in : is ambiguous', true);
      const valueEnd = offset + source.length;
      const re = resolveEnd.resolveEnd(end, valueEnd, options.strict, onError);
      alias.range = [offset, valueEnd, re.offset];
      if (re.comment) alias.comment = re.comment;
      return alias;
    }
    exports.composeEmptyNode = composeEmptyNode;
    exports.composeNode = composeNode;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-doc.js
var require_compose_doc = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/compose-doc.js'(exports) {
    'use strict';
    var Document = require_Document();
    var composeNode = require_compose_node();
    var resolveEnd = require_resolve_end();
    var resolveProps = require_resolve_props();
    function composeDoc(options, directives, { offset, start, value: value3, end }, onError) {
      const opts = Object.assign({ _directives: directives }, options);
      const doc = new Document.Document(void 0, opts);
      const ctx = {
        atKey: false,
        atRoot: true,
        directives: doc.directives,
        options: doc.options,
        schema: doc.schema,
      };
      const props = resolveProps.resolveProps(start, {
        indicator: 'doc-start',
        next: value3 ?? end?.[0],
        offset,
        onError,
        parentIndent: 0,
        startOnNewline: true,
      });
      if (props.found) {
        doc.directives.docStart = true;
        if (value3 && (value3.type === 'block-map' || value3.type === 'block-seq') && !props.hasNewline)
          onError(props.end, 'MISSING_CHAR', 'Block collection cannot start on same line with directives-end marker');
      }
      doc.contents = value3
        ? composeNode.composeNode(ctx, value3, props, onError)
        : composeNode.composeEmptyNode(ctx, props.end, start, null, props, onError);
      const contentEnd = doc.contents.range[2];
      const re = resolveEnd.resolveEnd(end, contentEnd, false, onError);
      if (re.comment) doc.comment = re.comment;
      doc.range = [offset, contentEnd, re.offset];
      return doc;
    }
    exports.composeDoc = composeDoc;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/composer.js
var require_composer = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/compose/composer.js'(exports) {
    'use strict';
    var node_process = __require('process');
    var directives = require_directives();
    var Document = require_Document();
    var errors = require_errors();
    var identity = require_identity();
    var composeDoc = require_compose_doc();
    var resolveEnd = require_resolve_end();
    function getErrorPos(src) {
      if (typeof src === 'number') return [src, src + 1];
      if (Array.isArray(src)) return src.length === 2 ? src : [src[0], src[1]];
      const { offset, source } = src;
      return [offset, offset + (typeof source === 'string' ? source.length : 1)];
    }
    function parsePrelude(prelude) {
      let comment = '';
      let atComment = false;
      let afterEmptyLine = false;
      for (let i = 0; i < prelude.length; ++i) {
        const source = prelude[i];
        switch (source[0]) {
          case '#':
            comment += (comment === '' ? '' : afterEmptyLine ? '\n\n' : '\n') + (source.substring(1) || ' ');
            atComment = true;
            afterEmptyLine = false;
            break;
          case '%':
            if (prelude[i + 1]?.[0] !== '#') i += 1;
            atComment = false;
            break;
          default:
            if (!atComment) afterEmptyLine = true;
            atComment = false;
        }
      }
      return { comment, afterEmptyLine };
    }
    var Composer = class {
      constructor(options = {}) {
        this.doc = null;
        this.atDirectives = false;
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
        this.onError = (source, code, message, warning) => {
          const pos = getErrorPos(source);
          if (warning) this.warnings.push(new errors.YAMLWarning(pos, code, message));
          else this.errors.push(new errors.YAMLParseError(pos, code, message));
        };
        this.directives = new directives.Directives({ version: options.version || '1.2' });
        this.options = options;
      }
      decorate(doc, afterDoc) {
        const { comment, afterEmptyLine } = parsePrelude(this.prelude);
        if (comment) {
          const dc = doc.contents;
          if (afterDoc) {
            doc.comment = doc.comment
              ? `${doc.comment}
${comment}`
              : comment;
          } else if (afterEmptyLine || doc.directives.docStart || !dc) {
            doc.commentBefore = comment;
          } else if (identity.isCollection(dc) && !dc.flow && dc.items.length > 0) {
            let it = dc.items[0];
            if (identity.isPair(it)) it = it.key;
            const cb = it.commentBefore;
            it.commentBefore = cb
              ? `${comment}
${cb}`
              : comment;
          } else {
            const cb = dc.commentBefore;
            dc.commentBefore = cb
              ? `${comment}
${cb}`
              : comment;
          }
        }
        if (afterDoc) {
          for (let i = 0; i < this.errors.length; ++i) doc.errors.push(this.errors[i]);
          for (let i = 0; i < this.warnings.length; ++i) doc.warnings.push(this.warnings[i]);
        } else {
          doc.errors = this.errors;
          doc.warnings = this.warnings;
        }
        this.prelude = [];
        this.errors = [];
        this.warnings = [];
      }
      /**
       * Current stream status information.
       *
       * Mostly useful at the end of input for an empty stream.
       */
      streamInfo() {
        return {
          comment: parsePrelude(this.prelude).comment,
          directives: this.directives,
          errors: this.errors,
          warnings: this.warnings,
        };
      }
      /**
       * Compose tokens into documents.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *compose(tokens, forceDoc = false, endOffset = -1) {
        for (const token2 of tokens) yield* this.next(token2);
        yield* this.end(forceDoc, endOffset);
      }
      /** Advance the composer by one CST token. */
      *next(token2) {
        if (node_process.env.LOG_STREAM) console.dir(token2, { depth: null });
        switch (token2.type) {
          case 'directive':
            this.directives.add(token2.source, (offset, message, warning) => {
              const pos = getErrorPos(token2);
              pos[0] += offset;
              this.onError(pos, 'BAD_DIRECTIVE', message, warning);
            });
            this.prelude.push(token2.source);
            this.atDirectives = true;
            break;
          case 'document': {
            const doc = composeDoc.composeDoc(this.options, this.directives, token2, this.onError);
            if (this.atDirectives && !doc.directives.docStart)
              this.onError(token2, 'MISSING_CHAR', 'Missing directives-end/doc-start indicator line');
            this.decorate(doc, false);
            if (this.doc) yield this.doc;
            this.doc = doc;
            this.atDirectives = false;
            break;
          }
          case 'byte-order-mark':
          case 'space':
            break;
          case 'comment':
          case 'newline':
            this.prelude.push(token2.source);
            break;
          case 'error': {
            const msg = token2.source ? `${token2.message}: ${JSON.stringify(token2.source)}` : token2.message;
            const error = new errors.YAMLParseError(getErrorPos(token2), 'UNEXPECTED_TOKEN', msg);
            if (this.atDirectives || !this.doc) this.errors.push(error);
            else this.doc.errors.push(error);
            break;
          }
          case 'doc-end': {
            if (!this.doc) {
              const msg = 'Unexpected doc-end without preceding document';
              this.errors.push(new errors.YAMLParseError(getErrorPos(token2), 'UNEXPECTED_TOKEN', msg));
              break;
            }
            this.doc.directives.docEnd = true;
            const end = resolveEnd.resolveEnd(
              token2.end,
              token2.offset + token2.source.length,
              this.doc.options.strict,
              this.onError,
            );
            this.decorate(this.doc, true);
            if (end.comment) {
              const dc = this.doc.comment;
              this.doc.comment = dc
                ? `${dc}
${end.comment}`
                : end.comment;
            }
            this.doc.range[2] = end.offset;
            break;
          }
          default:
            this.errors.push(
              new errors.YAMLParseError(getErrorPos(token2), 'UNEXPECTED_TOKEN', `Unsupported token ${token2.type}`),
            );
        }
      }
      /**
       * Call at end of input to yield any remaining document.
       *
       * @param forceDoc - If the stream contains no document, still emit a final document including any comments and directives that would be applied to a subsequent document.
       * @param endOffset - Should be set if `forceDoc` is also set, to set the document range end and to indicate errors correctly.
       */
      *end(forceDoc = false, endOffset = -1) {
        if (this.doc) {
          this.decorate(this.doc, true);
          yield this.doc;
          this.doc = null;
        } else if (forceDoc) {
          const opts = Object.assign({ _directives: this.directives }, this.options);
          const doc = new Document.Document(void 0, opts);
          if (this.atDirectives) this.onError(endOffset, 'MISSING_CHAR', 'Missing directives-end indicator line');
          doc.range = [0, endOffset, endOffset];
          this.decorate(doc, false);
          yield doc;
        }
      }
    };
    exports.Composer = Composer;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-scalar.js
var require_cst_scalar = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-scalar.js'(exports) {
    'use strict';
    var resolveBlockScalar = require_resolve_block_scalar();
    var resolveFlowScalar = require_resolve_flow_scalar();
    var errors = require_errors();
    var stringifyString = require_stringifyString();
    function resolveAsScalar(token2, strict = true, onError) {
      if (token2) {
        const _onError = (pos, code, message) => {
          const offset = typeof pos === 'number' ? pos : Array.isArray(pos) ? pos[0] : pos.offset;
          if (onError) onError(offset, code, message);
          else throw new errors.YAMLParseError([offset, offset + 1], code, message);
        };
        switch (token2.type) {
          case 'scalar':
          case 'single-quoted-scalar':
          case 'double-quoted-scalar':
            return resolveFlowScalar.resolveFlowScalar(token2, strict, _onError);
          case 'block-scalar':
            return resolveBlockScalar.resolveBlockScalar({ options: { strict } }, token2, _onError);
        }
      }
      return null;
    }
    function createScalarToken(value3, context) {
      const { implicitKey = false, indent, inFlow = false, offset = -1, type = 'PLAIN' } = context;
      const source = stringifyString.stringifyString(
        { type, value: value3 },
        {
          implicitKey,
          indent: indent > 0 ? ' '.repeat(indent) : '',
          inFlow,
          options: { blockQuote: true, lineWidth: -1 },
        },
      );
      const end = context.end ?? [{ type: 'newline', offset: -1, indent, source: '\n' }];
      switch (source[0]) {
        case '|':
        case '>': {
          const he = source.indexOf('\n');
          const head2 = source.substring(0, he);
          const body = source.substring(he + 1) + '\n';
          const props = [{ type: 'block-scalar-header', offset, indent, source: head2 }];
          if (!addEndtoBlockProps(props, end)) props.push({ type: 'newline', offset: -1, indent, source: '\n' });
          return { type: 'block-scalar', offset, indent, props, source: body };
        }
        case '"':
          return { type: 'double-quoted-scalar', offset, indent, source, end };
        case "'":
          return { type: 'single-quoted-scalar', offset, indent, source, end };
        default:
          return { type: 'scalar', offset, indent, source, end };
      }
    }
    function setScalarValue(token2, value3, context = {}) {
      let { afterKey = false, implicitKey = false, inFlow = false, type } = context;
      let indent = 'indent' in token2 ? token2.indent : null;
      if (afterKey && typeof indent === 'number') indent += 2;
      if (!type)
        switch (token2.type) {
          case 'single-quoted-scalar':
            type = 'QUOTE_SINGLE';
            break;
          case 'double-quoted-scalar':
            type = 'QUOTE_DOUBLE';
            break;
          case 'block-scalar': {
            const header = token2.props[0];
            if (header.type !== 'block-scalar-header') throw new Error('Invalid block scalar header');
            type = header.source[0] === '>' ? 'BLOCK_FOLDED' : 'BLOCK_LITERAL';
            break;
          }
          default:
            type = 'PLAIN';
        }
      const source = stringifyString.stringifyString(
        { type, value: value3 },
        {
          implicitKey: implicitKey || indent === null,
          indent: indent !== null && indent > 0 ? ' '.repeat(indent) : '',
          inFlow,
          options: { blockQuote: true, lineWidth: -1 },
        },
      );
      switch (source[0]) {
        case '|':
        case '>':
          setBlockScalarValue(token2, source);
          break;
        case '"':
          setFlowScalarValue(token2, source, 'double-quoted-scalar');
          break;
        case "'":
          setFlowScalarValue(token2, source, 'single-quoted-scalar');
          break;
        default:
          setFlowScalarValue(token2, source, 'scalar');
      }
    }
    function setBlockScalarValue(token2, source) {
      const he = source.indexOf('\n');
      const head2 = source.substring(0, he);
      const body = source.substring(he + 1) + '\n';
      if (token2.type === 'block-scalar') {
        const header = token2.props[0];
        if (header.type !== 'block-scalar-header') throw new Error('Invalid block scalar header');
        header.source = head2;
        token2.source = body;
      } else {
        const { offset } = token2;
        const indent = 'indent' in token2 ? token2.indent : -1;
        const props = [{ type: 'block-scalar-header', offset, indent, source: head2 }];
        if (!addEndtoBlockProps(props, 'end' in token2 ? token2.end : void 0))
          props.push({ type: 'newline', offset: -1, indent, source: '\n' });
        for (const key of Object.keys(token2)) if (key !== 'type' && key !== 'offset') delete token2[key];
        Object.assign(token2, { type: 'block-scalar', indent, props, source: body });
      }
    }
    function addEndtoBlockProps(props, end) {
      if (end)
        for (const st of end)
          switch (st.type) {
            case 'space':
            case 'comment':
              props.push(st);
              break;
            case 'newline':
              props.push(st);
              return true;
          }
      return false;
    }
    function setFlowScalarValue(token2, source, type) {
      switch (token2.type) {
        case 'scalar':
        case 'double-quoted-scalar':
        case 'single-quoted-scalar':
          token2.type = type;
          token2.source = source;
          break;
        case 'block-scalar': {
          const end = token2.props.slice(1);
          let oa = source.length;
          if (token2.props[0].type === 'block-scalar-header') oa -= token2.props[0].source.length;
          for (const tok of end) tok.offset += oa;
          delete token2.props;
          Object.assign(token2, { type, source, end });
          break;
        }
        case 'block-map':
        case 'block-seq': {
          const offset = token2.offset + source.length;
          const nl = { type: 'newline', offset, indent: token2.indent, source: '\n' };
          delete token2.items;
          Object.assign(token2, { type, source, end: [nl] });
          break;
        }
        default: {
          const indent = 'indent' in token2 ? token2.indent : -1;
          const end =
            'end' in token2 && Array.isArray(token2.end)
              ? token2.end.filter((st) => st.type === 'space' || st.type === 'comment' || st.type === 'newline')
              : [];
          for (const key of Object.keys(token2)) if (key !== 'type' && key !== 'offset') delete token2[key];
          Object.assign(token2, { type, indent, source, end });
        }
      }
    }
    exports.createScalarToken = createScalarToken;
    exports.resolveAsScalar = resolveAsScalar;
    exports.setScalarValue = setScalarValue;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-stringify.js
var require_cst_stringify = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-stringify.js'(exports) {
    'use strict';
    var stringify = (cst) => ('type' in cst ? stringifyToken(cst) : stringifyItem(cst));
    function stringifyToken(token2) {
      switch (token2.type) {
        case 'block-scalar': {
          let res = '';
          for (const tok of token2.props) res += stringifyToken(tok);
          return res + token2.source;
        }
        case 'block-map':
        case 'block-seq': {
          let res = '';
          for (const item of token2.items) res += stringifyItem(item);
          return res;
        }
        case 'flow-collection': {
          let res = token2.start.source;
          for (const item of token2.items) res += stringifyItem(item);
          for (const st of token2.end) res += st.source;
          return res;
        }
        case 'document': {
          let res = stringifyItem(token2);
          if (token2.end) for (const st of token2.end) res += st.source;
          return res;
        }
        default: {
          let res = token2.source;
          if ('end' in token2 && token2.end) for (const st of token2.end) res += st.source;
          return res;
        }
      }
    }
    function stringifyItem({ start, key, sep, value: value3 }) {
      let res = '';
      for (const st of start) res += st.source;
      if (key) res += stringifyToken(key);
      if (sep) for (const st of sep) res += st.source;
      if (value3) res += stringifyToken(value3);
      return res;
    }
    exports.stringify = stringify;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-visit.js
var require_cst_visit = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst-visit.js'(exports) {
    'use strict';
    var BREAK = /* @__PURE__ */ Symbol('break visit');
    var SKIP = /* @__PURE__ */ Symbol('skip children');
    var REMOVE = /* @__PURE__ */ Symbol('remove item');
    function visit(cst, visitor) {
      if ('type' in cst && cst.type === 'document') cst = { start: cst.start, value: cst.value };
      _visit(Object.freeze([]), cst, visitor);
    }
    visit.BREAK = BREAK;
    visit.SKIP = SKIP;
    visit.REMOVE = REMOVE;
    visit.itemAtPath = (cst, path6) => {
      let item = cst;
      for (const [field, index] of path6) {
        const tok = item?.[field];
        if (tok && 'items' in tok) {
          item = tok.items[index];
        } else return void 0;
      }
      return item;
    };
    visit.parentCollection = (cst, path6) => {
      const parent = visit.itemAtPath(cst, path6.slice(0, -1));
      const field = path6[path6.length - 1][0];
      const coll = parent?.[field];
      if (coll && 'items' in coll) return coll;
      throw new Error('Parent collection not found');
    };
    function _visit(path6, item, visitor) {
      let ctrl = visitor(item, path6);
      if (typeof ctrl === 'symbol') return ctrl;
      for (const field of ['key', 'value']) {
        const token2 = item[field];
        if (token2 && 'items' in token2) {
          for (let i = 0; i < token2.items.length; ++i) {
            const ci = _visit(Object.freeze(path6.concat([[field, i]])), token2.items[i], visitor);
            if (typeof ci === 'number') i = ci - 1;
            else if (ci === BREAK) return BREAK;
            else if (ci === REMOVE) {
              token2.items.splice(i, 1);
              i -= 1;
            }
          }
          if (typeof ctrl === 'function' && field === 'key') ctrl = ctrl(item, path6);
        }
      }
      return typeof ctrl === 'function' ? ctrl(item, path6) : ctrl;
    }
    exports.visit = visit;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst.js
var require_cst = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/cst.js'(exports) {
    'use strict';
    var cstScalar = require_cst_scalar();
    var cstStringify = require_cst_stringify();
    var cstVisit = require_cst_visit();
    var BOM = '\uFEFF';
    var DOCUMENT = '';
    var FLOW_END = '';
    var SCALAR = '';
    var isCollection = (token2) => !!token2 && 'items' in token2;
    var isScalar2 = (token2) =>
      !!token2 &&
      (token2.type === 'scalar' ||
        token2.type === 'single-quoted-scalar' ||
        token2.type === 'double-quoted-scalar' ||
        token2.type === 'block-scalar');
    function prettyToken(token2) {
      switch (token2) {
        case BOM:
          return '<BOM>';
        case DOCUMENT:
          return '<DOC>';
        case FLOW_END:
          return '<FLOW_END>';
        case SCALAR:
          return '<SCALAR>';
        default:
          return JSON.stringify(token2);
      }
    }
    function tokenType(source) {
      switch (source) {
        case BOM:
          return 'byte-order-mark';
        case DOCUMENT:
          return 'doc-mode';
        case FLOW_END:
          return 'flow-error-end';
        case SCALAR:
          return 'scalar';
        case '---':
          return 'doc-start';
        case '...':
          return 'doc-end';
        case '':
        case '\n':
        case '\r\n':
          return 'newline';
        case '-':
          return 'seq-item-ind';
        case '?':
          return 'explicit-key-ind';
        case ':':
          return 'map-value-ind';
        case '{':
          return 'flow-map-start';
        case '}':
          return 'flow-map-end';
        case '[':
          return 'flow-seq-start';
        case ']':
          return 'flow-seq-end';
        case ',':
          return 'comma';
      }
      switch (source[0]) {
        case ' ':
        case '	':
          return 'space';
        case '#':
          return 'comment';
        case '%':
          return 'directive-line';
        case '*':
          return 'alias';
        case '&':
          return 'anchor';
        case '!':
          return 'tag';
        case "'":
          return 'single-quoted-scalar';
        case '"':
          return 'double-quoted-scalar';
        case '|':
        case '>':
          return 'block-scalar-header';
      }
      return null;
    }
    exports.createScalarToken = cstScalar.createScalarToken;
    exports.resolveAsScalar = cstScalar.resolveAsScalar;
    exports.setScalarValue = cstScalar.setScalarValue;
    exports.stringify = cstStringify.stringify;
    exports.visit = cstVisit.visit;
    exports.BOM = BOM;
    exports.DOCUMENT = DOCUMENT;
    exports.FLOW_END = FLOW_END;
    exports.SCALAR = SCALAR;
    exports.isCollection = isCollection;
    exports.isScalar = isScalar2;
    exports.prettyToken = prettyToken;
    exports.tokenType = tokenType;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/lexer.js
var require_lexer = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/lexer.js'(exports) {
    'use strict';
    var cst = require_cst();
    function isEmpty(ch) {
      switch (ch) {
        case void 0:
        case ' ':
        case '\n':
        case '\r':
        case '	':
          return true;
        default:
          return false;
      }
    }
    var hexDigits = new Set('0123456789ABCDEFabcdef');
    var tagChars = new Set("0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-#;/?:@&=+$_.!~*'()");
    var flowIndicatorChars = new Set(',[]{}');
    var invalidAnchorChars = new Set(' ,[]{}\n\r	');
    var isNotAnchorChar = (ch) => !ch || invalidAnchorChars.has(ch);
    var Lexer = class {
      constructor() {
        this.atEnd = false;
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        this.buffer = '';
        this.flowKey = false;
        this.flowLevel = 0;
        this.indentNext = 0;
        this.indentValue = 0;
        this.lineEndPos = null;
        this.next = null;
        this.pos = 0;
      }
      /**
       * Generate YAML tokens from the `source` string. If `incomplete`,
       * a part of the last line may be left as a buffer for the next call.
       *
       * @returns A generator of lexical tokens
       */
      *lex(source, incomplete = false) {
        if (source) {
          if (typeof source !== 'string') throw TypeError('source is not a string');
          this.buffer = this.buffer ? this.buffer + source : source;
          this.lineEndPos = null;
        }
        this.atEnd = !incomplete;
        let next = this.next ?? 'stream';
        while (next && (incomplete || this.hasChars(1))) next = yield* this.parseNext(next);
      }
      atLineEnd() {
        let i = this.pos;
        let ch = this.buffer[i];
        while (ch === ' ' || ch === '	') ch = this.buffer[++i];
        if (!ch || ch === '#' || ch === '\n') return true;
        if (ch === '\r') return this.buffer[i + 1] === '\n';
        return false;
      }
      charAt(n) {
        return this.buffer[this.pos + n];
      }
      continueScalar(offset) {
        let ch = this.buffer[offset];
        if (this.indentNext > 0) {
          let indent = 0;
          while (ch === ' ') ch = this.buffer[++indent + offset];
          if (ch === '\r') {
            const next = this.buffer[indent + offset + 1];
            if (next === '\n' || (!next && !this.atEnd)) return offset + indent + 1;
          }
          return ch === '\n' || indent >= this.indentNext || (!ch && !this.atEnd) ? offset + indent : -1;
        }
        if (ch === '-' || ch === '.') {
          const dt = this.buffer.substr(offset, 3);
          if ((dt === '---' || dt === '...') && isEmpty(this.buffer[offset + 3])) return -1;
        }
        return offset;
      }
      getLine() {
        let end = this.lineEndPos;
        if (typeof end !== 'number' || (end !== -1 && end < this.pos)) {
          end = this.buffer.indexOf('\n', this.pos);
          this.lineEndPos = end;
        }
        if (end === -1) return this.atEnd ? this.buffer.substring(this.pos) : null;
        if (this.buffer[end - 1] === '\r') end -= 1;
        return this.buffer.substring(this.pos, end);
      }
      hasChars(n) {
        return this.pos + n <= this.buffer.length;
      }
      setNext(state) {
        this.buffer = this.buffer.substring(this.pos);
        this.pos = 0;
        this.lineEndPos = null;
        this.next = state;
        return null;
      }
      peek(n) {
        return this.buffer.substr(this.pos, n);
      }
      *parseNext(next) {
        switch (next) {
          case 'stream':
            return yield* this.parseStream();
          case 'line-start':
            return yield* this.parseLineStart();
          case 'block-start':
            return yield* this.parseBlockStart();
          case 'doc':
            return yield* this.parseDocument();
          case 'flow':
            return yield* this.parseFlowCollection();
          case 'quoted-scalar':
            return yield* this.parseQuotedScalar();
          case 'block-scalar':
            return yield* this.parseBlockScalar();
          case 'plain-scalar':
            return yield* this.parsePlainScalar();
        }
      }
      *parseStream() {
        let line = this.getLine();
        if (line === null) return this.setNext('stream');
        if (line[0] === cst.BOM) {
          yield* this.pushCount(1);
          line = line.substring(1);
        }
        if (line[0] === '%') {
          let dirEnd = line.length;
          let cs = line.indexOf('#');
          while (cs !== -1) {
            const ch = line[cs - 1];
            if (ch === ' ' || ch === '	') {
              dirEnd = cs - 1;
              break;
            } else {
              cs = line.indexOf('#', cs + 1);
            }
          }
          while (true) {
            const ch = line[dirEnd - 1];
            if (ch === ' ' || ch === '	') dirEnd -= 1;
            else break;
          }
          const n = (yield* this.pushCount(dirEnd)) + (yield* this.pushSpaces(true));
          yield* this.pushCount(line.length - n);
          this.pushNewline();
          return 'stream';
        }
        if (this.atLineEnd()) {
          const sp = yield* this.pushSpaces(true);
          yield* this.pushCount(line.length - sp);
          yield* this.pushNewline();
          return 'stream';
        }
        yield cst.DOCUMENT;
        return yield* this.parseLineStart();
      }
      *parseLineStart() {
        const ch = this.charAt(0);
        if (!ch && !this.atEnd) return this.setNext('line-start');
        if (ch === '-' || ch === '.') {
          if (!this.atEnd && !this.hasChars(4)) return this.setNext('line-start');
          const s = this.peek(3);
          if ((s === '---' || s === '...') && isEmpty(this.charAt(3))) {
            yield* this.pushCount(3);
            this.indentValue = 0;
            this.indentNext = 0;
            return s === '---' ? 'doc' : 'stream';
          }
        }
        this.indentValue = yield* this.pushSpaces(false);
        if (this.indentNext > this.indentValue && !isEmpty(this.charAt(1))) this.indentNext = this.indentValue;
        return yield* this.parseBlockStart();
      }
      *parseBlockStart() {
        const [ch0, ch1] = this.peek(2);
        if (!ch1 && !this.atEnd) return this.setNext('block-start');
        if ((ch0 === '-' || ch0 === '?' || ch0 === ':') && isEmpty(ch1)) {
          const n = (yield* this.pushCount(1)) + (yield* this.pushSpaces(true));
          this.indentNext = this.indentValue + 1;
          this.indentValue += n;
          return 'block-start';
        }
        return 'doc';
      }
      *parseDocument() {
        yield* this.pushSpaces(true);
        const line = this.getLine();
        if (line === null) return this.setNext('doc');
        let n = yield* this.pushIndicators();
        switch (line[n]) {
          case '#':
            yield* this.pushCount(line.length - n);
          // fallthrough
          case void 0:
            yield* this.pushNewline();
            return yield* this.parseLineStart();
          case '{':
          case '[':
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel = 1;
            return 'flow';
          case '}':
          case ']':
            yield* this.pushCount(1);
            return 'doc';
          case '*':
            yield* this.pushUntil(isNotAnchorChar);
            return 'doc';
          case '"':
          case "'":
            return yield* this.parseQuotedScalar();
          case '|':
          case '>':
            n += yield* this.parseBlockScalarHeader();
            n += yield* this.pushSpaces(true);
            yield* this.pushCount(line.length - n);
            yield* this.pushNewline();
            return yield* this.parseBlockScalar();
          default:
            return yield* this.parsePlainScalar();
        }
      }
      *parseFlowCollection() {
        let nl, sp;
        let indent = -1;
        do {
          nl = yield* this.pushNewline();
          if (nl > 0) {
            sp = yield* this.pushSpaces(false);
            this.indentValue = indent = sp;
          } else {
            sp = 0;
          }
          sp += yield* this.pushSpaces(true);
        } while (nl + sp > 0);
        const line = this.getLine();
        if (line === null) return this.setNext('flow');
        if (
          (indent !== -1 && indent < this.indentNext && line[0] !== '#') ||
          (indent === 0 && (line.startsWith('---') || line.startsWith('...')) && isEmpty(line[3]))
        ) {
          const atFlowEndMarker =
            indent === this.indentNext - 1 && this.flowLevel === 1 && (line[0] === ']' || line[0] === '}');
          if (!atFlowEndMarker) {
            this.flowLevel = 0;
            yield cst.FLOW_END;
            return yield* this.parseLineStart();
          }
        }
        let n = 0;
        while (line[n] === ',') {
          n += yield* this.pushCount(1);
          n += yield* this.pushSpaces(true);
          this.flowKey = false;
        }
        n += yield* this.pushIndicators();
        switch (line[n]) {
          case void 0:
            return 'flow';
          case '#':
            yield* this.pushCount(line.length - n);
            return 'flow';
          case '{':
          case '[':
            yield* this.pushCount(1);
            this.flowKey = false;
            this.flowLevel += 1;
            return 'flow';
          case '}':
          case ']':
            yield* this.pushCount(1);
            this.flowKey = true;
            this.flowLevel -= 1;
            return this.flowLevel ? 'flow' : 'doc';
          case '*':
            yield* this.pushUntil(isNotAnchorChar);
            return 'flow';
          case '"':
          case "'":
            this.flowKey = true;
            return yield* this.parseQuotedScalar();
          case ':': {
            const next = this.charAt(1);
            if (this.flowKey || isEmpty(next) || next === ',') {
              this.flowKey = false;
              yield* this.pushCount(1);
              yield* this.pushSpaces(true);
              return 'flow';
            }
          }
          // fallthrough
          default:
            this.flowKey = false;
            return yield* this.parsePlainScalar();
        }
      }
      *parseQuotedScalar() {
        const quote = this.charAt(0);
        let end = this.buffer.indexOf(quote, this.pos + 1);
        if (quote === "'") {
          while (end !== -1 && this.buffer[end + 1] === "'") end = this.buffer.indexOf("'", end + 2);
        } else {
          while (end !== -1) {
            let n = 0;
            while (this.buffer[end - 1 - n] === '\\') n += 1;
            if (n % 2 === 0) break;
            end = this.buffer.indexOf('"', end + 1);
          }
        }
        const qb = this.buffer.substring(0, end);
        let nl = qb.indexOf('\n', this.pos);
        if (nl !== -1) {
          while (nl !== -1) {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1) break;
            nl = qb.indexOf('\n', cs);
          }
          if (nl !== -1) {
            end = nl - (qb[nl - 1] === '\r' ? 2 : 1);
          }
        }
        if (end === -1) {
          if (!this.atEnd) return this.setNext('quoted-scalar');
          end = this.buffer.length;
        }
        yield* this.pushToIndex(end + 1, false);
        return this.flowLevel ? 'flow' : 'doc';
      }
      *parseBlockScalarHeader() {
        this.blockScalarIndent = -1;
        this.blockScalarKeep = false;
        let i = this.pos;
        while (true) {
          const ch = this.buffer[++i];
          if (ch === '+') this.blockScalarKeep = true;
          else if (ch > '0' && ch <= '9') this.blockScalarIndent = Number(ch) - 1;
          else if (ch !== '-') break;
        }
        return yield* this.pushUntil((ch) => isEmpty(ch) || ch === '#');
      }
      *parseBlockScalar() {
        let nl = this.pos - 1;
        let indent = 0;
        let ch;
        loop: for (let i2 = this.pos; (ch = this.buffer[i2]); ++i2) {
          switch (ch) {
            case ' ':
              indent += 1;
              break;
            case '\n':
              nl = i2;
              indent = 0;
              break;
            case '\r': {
              const next = this.buffer[i2 + 1];
              if (!next && !this.atEnd) return this.setNext('block-scalar');
              if (next === '\n') break;
            }
            // fallthrough
            default:
              break loop;
          }
        }
        if (!ch && !this.atEnd) return this.setNext('block-scalar');
        if (indent >= this.indentNext) {
          if (this.blockScalarIndent === -1) this.indentNext = indent;
          else {
            this.indentNext = this.blockScalarIndent + (this.indentNext === 0 ? 1 : this.indentNext);
          }
          do {
            const cs = this.continueScalar(nl + 1);
            if (cs === -1) break;
            nl = this.buffer.indexOf('\n', cs);
          } while (nl !== -1);
          if (nl === -1) {
            if (!this.atEnd) return this.setNext('block-scalar');
            nl = this.buffer.length;
          }
        }
        let i = nl + 1;
        ch = this.buffer[i];
        while (ch === ' ') ch = this.buffer[++i];
        if (ch === '	') {
          while (ch === '	' || ch === ' ' || ch === '\r' || ch === '\n') ch = this.buffer[++i];
          nl = i - 1;
        } else if (!this.blockScalarKeep) {
          do {
            let i2 = nl - 1;
            let ch2 = this.buffer[i2];
            if (ch2 === '\r') ch2 = this.buffer[--i2];
            const lastChar = i2;
            while (ch2 === ' ') ch2 = this.buffer[--i2];
            if (ch2 === '\n' && i2 >= this.pos && i2 + 1 + indent > lastChar) nl = i2;
            else break;
          } while (true);
        }
        yield cst.SCALAR;
        yield* this.pushToIndex(nl + 1, true);
        return yield* this.parseLineStart();
      }
      *parsePlainScalar() {
        const inFlow = this.flowLevel > 0;
        let end = this.pos - 1;
        let i = this.pos - 1;
        let ch;
        while ((ch = this.buffer[++i])) {
          if (ch === ':') {
            const next = this.buffer[i + 1];
            if (isEmpty(next) || (inFlow && flowIndicatorChars.has(next))) break;
            end = i;
          } else if (isEmpty(ch)) {
            let next = this.buffer[i + 1];
            if (ch === '\r') {
              if (next === '\n') {
                i += 1;
                ch = '\n';
                next = this.buffer[i + 1];
              } else end = i;
            }
            if (next === '#' || (inFlow && flowIndicatorChars.has(next))) break;
            if (ch === '\n') {
              const cs = this.continueScalar(i + 1);
              if (cs === -1) break;
              i = Math.max(i, cs - 2);
            }
          } else {
            if (inFlow && flowIndicatorChars.has(ch)) break;
            end = i;
          }
        }
        if (!ch && !this.atEnd) return this.setNext('plain-scalar');
        yield cst.SCALAR;
        yield* this.pushToIndex(end + 1, true);
        return inFlow ? 'flow' : 'doc';
      }
      *pushCount(n) {
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos += n;
          return n;
        }
        return 0;
      }
      *pushToIndex(i, allowEmpty) {
        const s = this.buffer.slice(this.pos, i);
        if (s) {
          yield s;
          this.pos += s.length;
          return s.length;
        } else if (allowEmpty) yield '';
        return 0;
      }
      *pushIndicators() {
        let n = 0;
        loop: while (true) {
          switch (this.charAt(0)) {
            case '!':
              n += yield* this.pushTag();
              n += yield* this.pushSpaces(true);
              continue loop;
            case '&':
              n += yield* this.pushUntil(isNotAnchorChar);
              n += yield* this.pushSpaces(true);
              continue loop;
            case '-':
            // this is an error
            case '?':
            // this is an error outside flow collections
            case ':': {
              const inFlow = this.flowLevel > 0;
              const ch1 = this.charAt(1);
              if (isEmpty(ch1) || (inFlow && flowIndicatorChars.has(ch1))) {
                if (!inFlow) this.indentNext = this.indentValue + 1;
                else if (this.flowKey) this.flowKey = false;
                n += yield* this.pushCount(1);
                n += yield* this.pushSpaces(true);
                continue loop;
              }
            }
          }
          break loop;
        }
        return n;
      }
      *pushTag() {
        if (this.charAt(1) === '<') {
          let i = this.pos + 2;
          let ch = this.buffer[i];
          while (!isEmpty(ch) && ch !== '>') ch = this.buffer[++i];
          return yield* this.pushToIndex(ch === '>' ? i + 1 : i, false);
        } else {
          let i = this.pos + 1;
          let ch = this.buffer[i];
          while (ch) {
            if (tagChars.has(ch)) ch = this.buffer[++i];
            else if (ch === '%' && hexDigits.has(this.buffer[i + 1]) && hexDigits.has(this.buffer[i + 2])) {
              ch = this.buffer[(i += 3)];
            } else break;
          }
          return yield* this.pushToIndex(i, false);
        }
      }
      *pushNewline() {
        const ch = this.buffer[this.pos];
        if (ch === '\n') return yield* this.pushCount(1);
        else if (ch === '\r' && this.charAt(1) === '\n') return yield* this.pushCount(2);
        else return 0;
      }
      *pushSpaces(allowTabs) {
        let i = this.pos - 1;
        let ch;
        do {
          ch = this.buffer[++i];
        } while (ch === ' ' || (allowTabs && ch === '	'));
        const n = i - this.pos;
        if (n > 0) {
          yield this.buffer.substr(this.pos, n);
          this.pos = i;
        }
        return n;
      }
      *pushUntil(test) {
        let i = this.pos;
        let ch = this.buffer[i];
        while (!test(ch)) ch = this.buffer[++i];
        return yield* this.pushToIndex(i, false);
      }
    };
    exports.Lexer = Lexer;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/line-counter.js
var require_line_counter = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/line-counter.js'(exports) {
    'use strict';
    var LineCounter = class {
      constructor() {
        this.lineStarts = [];
        this.addNewLine = (offset) => this.lineStarts.push(offset);
        this.linePos = (offset) => {
          let low = 0;
          let high = this.lineStarts.length;
          while (low < high) {
            const mid = (low + high) >> 1;
            if (this.lineStarts[mid] < offset) low = mid + 1;
            else high = mid;
          }
          if (this.lineStarts[low] === offset) return { line: low + 1, col: 1 };
          if (low === 0) return { line: 0, col: offset };
          const start = this.lineStarts[low - 1];
          return { line: low, col: offset - start + 1 };
        };
      }
    };
    exports.LineCounter = LineCounter;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/parser.js
var require_parser = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/parse/parser.js'(exports) {
    'use strict';
    var node_process = __require('process');
    var cst = require_cst();
    var lexer = require_lexer();
    function includesToken(list, type) {
      for (let i = 0; i < list.length; ++i) if (list[i].type === type) return true;
      return false;
    }
    function findNonEmptyIndex(list) {
      for (let i = 0; i < list.length; ++i) {
        switch (list[i].type) {
          case 'space':
          case 'comment':
          case 'newline':
            break;
          default:
            return i;
        }
      }
      return -1;
    }
    function isFlowToken(token2) {
      switch (token2?.type) {
        case 'alias':
        case 'scalar':
        case 'single-quoted-scalar':
        case 'double-quoted-scalar':
        case 'flow-collection':
          return true;
        default:
          return false;
      }
    }
    function getPrevProps(parent) {
      switch (parent.type) {
        case 'document':
          return parent.start;
        case 'block-map': {
          const it = parent.items[parent.items.length - 1];
          return it.sep ?? it.start;
        }
        case 'block-seq':
          return parent.items[parent.items.length - 1].start;
        /* istanbul ignore next should not happen */
        default:
          return [];
      }
    }
    function getFirstKeyStartProps(prev) {
      if (prev.length === 0) return [];
      let i = prev.length;
      loop: while (--i >= 0) {
        switch (prev[i].type) {
          case 'doc-start':
          case 'explicit-key-ind':
          case 'map-value-ind':
          case 'seq-item-ind':
          case 'newline':
            break loop;
        }
      }
      while (prev[++i]?.type === 'space') {}
      return prev.splice(i, prev.length);
    }
    function arrayPushArray(target, source) {
      if (source.length < 1e5) Array.prototype.push.apply(target, source);
      else for (let i = 0; i < source.length; ++i) target.push(source[i]);
    }
    function fixFlowSeqItems(fc) {
      if (fc.start.type === 'flow-seq-start') {
        for (const it of fc.items) {
          if (
            it.sep &&
            !it.value &&
            !includesToken(it.start, 'explicit-key-ind') &&
            !includesToken(it.sep, 'map-value-ind')
          ) {
            if (it.key) it.value = it.key;
            delete it.key;
            if (isFlowToken(it.value)) {
              if (it.value.end) arrayPushArray(it.value.end, it.sep);
              else it.value.end = it.sep;
            } else arrayPushArray(it.start, it.sep);
            delete it.sep;
          }
        }
      }
    }
    var Parser = class {
      /**
       * @param onNewLine - If defined, called separately with the start position of
       *   each new line (in `parse()`, including the start of input).
       */
      constructor(onNewLine) {
        this.atNewLine = true;
        this.atScalar = false;
        this.indent = 0;
        this.offset = 0;
        this.onKeyLine = false;
        this.stack = [];
        this.source = '';
        this.type = '';
        this.lexer = new lexer.Lexer();
        this.onNewLine = onNewLine;
      }
      /**
       * Parse `source` as a YAML stream.
       * If `incomplete`, a part of the last line may be left as a buffer for the next call.
       *
       * Errors are not thrown, but yielded as `{ type: 'error', message }` tokens.
       *
       * @returns A generator of tokens representing each directive, document, and other structure.
       */
      *parse(source, incomplete = false) {
        if (this.onNewLine && this.offset === 0) this.onNewLine(0);
        for (const lexeme of this.lexer.lex(source, incomplete)) yield* this.next(lexeme);
        if (!incomplete) yield* this.end();
      }
      /**
       * Advance the parser by the `source` of one lexical token.
       */
      *next(source) {
        this.source = source;
        if (node_process.env.LOG_TOKENS) console.log('|', cst.prettyToken(source));
        if (this.atScalar) {
          this.atScalar = false;
          yield* this.step();
          this.offset += source.length;
          return;
        }
        const type = cst.tokenType(source);
        if (!type) {
          const message = `Not a YAML token: ${source}`;
          yield* this.pop({ type: 'error', offset: this.offset, message, source });
          this.offset += source.length;
        } else if (type === 'scalar') {
          this.atNewLine = false;
          this.atScalar = true;
          this.type = 'scalar';
        } else {
          this.type = type;
          yield* this.step();
          switch (type) {
            case 'newline':
              this.atNewLine = true;
              this.indent = 0;
              if (this.onNewLine) this.onNewLine(this.offset + source.length);
              break;
            case 'space':
              if (this.atNewLine && source[0] === ' ') this.indent += source.length;
              break;
            case 'explicit-key-ind':
            case 'map-value-ind':
            case 'seq-item-ind':
              if (this.atNewLine) this.indent += source.length;
              break;
            case 'doc-mode':
            case 'flow-error-end':
              return;
            default:
              this.atNewLine = false;
          }
          this.offset += source.length;
        }
      }
      /** Call at end of input to push out any remaining constructions */
      *end() {
        while (this.stack.length > 0) yield* this.pop();
      }
      get sourceToken() {
        const st = {
          type: this.type,
          offset: this.offset,
          indent: this.indent,
          source: this.source,
        };
        return st;
      }
      *step() {
        const top = this.peek(1);
        if (this.type === 'doc-end' && top?.type !== 'doc-end') {
          while (this.stack.length > 0) yield* this.pop();
          this.stack.push({
            type: 'doc-end',
            offset: this.offset,
            source: this.source,
          });
          return;
        }
        if (!top) return yield* this.stream();
        switch (top.type) {
          case 'document':
            return yield* this.document(top);
          case 'alias':
          case 'scalar':
          case 'single-quoted-scalar':
          case 'double-quoted-scalar':
            return yield* this.scalar(top);
          case 'block-scalar':
            return yield* this.blockScalar(top);
          case 'block-map':
            return yield* this.blockMap(top);
          case 'block-seq':
            return yield* this.blockSequence(top);
          case 'flow-collection':
            return yield* this.flowCollection(top);
          case 'doc-end':
            return yield* this.documentEnd(top);
        }
        yield* this.pop();
      }
      peek(n) {
        return this.stack[this.stack.length - n];
      }
      *pop(error) {
        const token2 = error ?? this.stack.pop();
        if (!token2) {
          const message = 'Tried to pop an empty stack';
          yield { type: 'error', offset: this.offset, source: '', message };
        } else if (this.stack.length === 0) {
          yield token2;
        } else {
          const top = this.peek(1);
          if (token2.type === 'block-scalar') {
            token2.indent = 'indent' in top ? top.indent : 0;
          } else if (token2.type === 'flow-collection' && top.type === 'document') {
            token2.indent = 0;
          }
          if (token2.type === 'flow-collection') fixFlowSeqItems(token2);
          switch (top.type) {
            case 'document':
              top.value = token2;
              break;
            case 'block-scalar':
              top.props.push(token2);
              break;
            case 'block-map': {
              const it = top.items[top.items.length - 1];
              if (it.value) {
                top.items.push({ start: [], key: token2, sep: [] });
                this.onKeyLine = true;
                return;
              } else if (it.sep) {
                it.value = token2;
              } else {
                Object.assign(it, { key: token2, sep: [] });
                this.onKeyLine = !it.explicitKey;
                return;
              }
              break;
            }
            case 'block-seq': {
              const it = top.items[top.items.length - 1];
              if (it.value) top.items.push({ start: [], value: token2 });
              else it.value = token2;
              break;
            }
            case 'flow-collection': {
              const it = top.items[top.items.length - 1];
              if (!it || it.value) top.items.push({ start: [], key: token2, sep: [] });
              else if (it.sep) it.value = token2;
              else Object.assign(it, { key: token2, sep: [] });
              return;
            }
            /* istanbul ignore next should not happen */
            default:
              yield* this.pop();
              yield* this.pop(token2);
          }
          if (
            (top.type === 'document' || top.type === 'block-map' || top.type === 'block-seq') &&
            (token2.type === 'block-map' || token2.type === 'block-seq')
          ) {
            const last = token2.items[token2.items.length - 1];
            if (
              last &&
              !last.sep &&
              !last.value &&
              last.start.length > 0 &&
              findNonEmptyIndex(last.start) === -1 &&
              (token2.indent === 0 || last.start.every((st) => st.type !== 'comment' || st.indent < token2.indent))
            ) {
              if (top.type === 'document') top.end = last.start;
              else top.items.push({ start: last.start });
              token2.items.splice(-1, 1);
            }
          }
        }
      }
      *stream() {
        switch (this.type) {
          case 'directive-line':
            yield { type: 'directive', offset: this.offset, source: this.source };
            return;
          case 'byte-order-mark':
          case 'space':
          case 'comment':
          case 'newline':
            yield this.sourceToken;
            return;
          case 'doc-mode':
          case 'doc-start': {
            const doc = {
              type: 'document',
              offset: this.offset,
              start: [],
            };
            if (this.type === 'doc-start') doc.start.push(this.sourceToken);
            this.stack.push(doc);
            return;
          }
        }
        yield {
          type: 'error',
          offset: this.offset,
          message: `Unexpected ${this.type} token in YAML stream`,
          source: this.source,
        };
      }
      *document(doc) {
        if (doc.value) return yield* this.lineEnd(doc);
        switch (this.type) {
          case 'doc-start': {
            if (findNonEmptyIndex(doc.start) !== -1) {
              yield* this.pop();
              yield* this.step();
            } else doc.start.push(this.sourceToken);
            return;
          }
          case 'anchor':
          case 'tag':
          case 'space':
          case 'comment':
          case 'newline':
            doc.start.push(this.sourceToken);
            return;
        }
        const bv = this.startBlockValue(doc);
        if (bv) this.stack.push(bv);
        else {
          yield {
            type: 'error',
            offset: this.offset,
            message: `Unexpected ${this.type} token in YAML document`,
            source: this.source,
          };
        }
      }
      *scalar(scalar) {
        if (this.type === 'map-value-ind') {
          const prev = getPrevProps(this.peek(2));
          const start = getFirstKeyStartProps(prev);
          let sep;
          if (scalar.end) {
            sep = scalar.end;
            sep.push(this.sourceToken);
            delete scalar.end;
          } else sep = [this.sourceToken];
          const map2 = {
            type: 'block-map',
            offset: scalar.offset,
            indent: scalar.indent,
            items: [{ start, key: scalar, sep }],
          };
          this.onKeyLine = true;
          this.stack[this.stack.length - 1] = map2;
        } else yield* this.lineEnd(scalar);
      }
      *blockScalar(scalar) {
        switch (this.type) {
          case 'space':
          case 'comment':
          case 'newline':
            scalar.props.push(this.sourceToken);
            return;
          case 'scalar':
            scalar.source = this.source;
            this.atNewLine = true;
            this.indent = 0;
            if (this.onNewLine) {
              let nl = this.source.indexOf('\n') + 1;
              while (nl !== 0) {
                this.onNewLine(this.offset + nl);
                nl = this.source.indexOf('\n', nl) + 1;
              }
            }
            yield* this.pop();
            break;
          /* istanbul ignore next should not happen */
          default:
            yield* this.pop();
            yield* this.step();
        }
      }
      *blockMap(map2) {
        const it = map2.items[map2.items.length - 1];
        switch (this.type) {
          case 'newline':
            this.onKeyLine = false;
            if (it.value) {
              const end = 'end' in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === 'comment') end?.push(this.sourceToken);
              else map2.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              it.start.push(this.sourceToken);
            }
            return;
          case 'space':
          case 'comment':
            if (it.value) {
              map2.items.push({ start: [this.sourceToken] });
            } else if (it.sep) {
              it.sep.push(this.sourceToken);
            } else {
              if (this.atIndentedComment(it.start, map2.indent)) {
                const prev = map2.items[map2.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  map2.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
        }
        if (this.indent >= map2.indent) {
          const atMapIndent = !this.onKeyLine && this.indent === map2.indent;
          const atNextItem = atMapIndent && (it.sep || it.explicitKey) && this.type !== 'seq-item-ind';
          let start = [];
          if (atNextItem && it.sep && !it.value) {
            const nl = [];
            for (let i = 0; i < it.sep.length; ++i) {
              const st = it.sep[i];
              switch (st.type) {
                case 'newline':
                  nl.push(i);
                  break;
                case 'space':
                  break;
                case 'comment':
                  if (st.indent > map2.indent) nl.length = 0;
                  break;
                default:
                  nl.length = 0;
              }
            }
            if (nl.length >= 2) start = it.sep.splice(nl[1]);
          }
          switch (this.type) {
            case 'anchor':
            case 'tag':
              if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map2.items.push({ start });
                this.onKeyLine = true;
              } else if (it.sep) {
                it.sep.push(this.sourceToken);
              } else {
                it.start.push(this.sourceToken);
              }
              return;
            case 'explicit-key-ind':
              if (!it.sep && !it.explicitKey) {
                it.start.push(this.sourceToken);
                it.explicitKey = true;
              } else if (atNextItem || it.value) {
                start.push(this.sourceToken);
                map2.items.push({ start, explicitKey: true });
              } else {
                this.stack.push({
                  type: 'block-map',
                  offset: this.offset,
                  indent: this.indent,
                  items: [{ start: [this.sourceToken], explicitKey: true }],
                });
              }
              this.onKeyLine = true;
              return;
            case 'map-value-ind':
              if (it.explicitKey) {
                if (!it.sep) {
                  if (includesToken(it.start, 'newline')) {
                    Object.assign(it, { key: null, sep: [this.sourceToken] });
                  } else {
                    const start2 = getFirstKeyStartProps(it.start);
                    this.stack.push({
                      type: 'block-map',
                      offset: this.offset,
                      indent: this.indent,
                      items: [{ start: start2, key: null, sep: [this.sourceToken] }],
                    });
                  }
                } else if (it.value) {
                  map2.items.push({ start: [], key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, 'map-value-ind')) {
                  this.stack.push({
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start, key: null, sep: [this.sourceToken] }],
                  });
                } else if (isFlowToken(it.key) && !includesToken(it.sep, 'newline')) {
                  const start2 = getFirstKeyStartProps(it.start);
                  const key = it.key;
                  const sep = it.sep;
                  sep.push(this.sourceToken);
                  delete it.key;
                  delete it.sep;
                  this.stack.push({
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: start2, key, sep }],
                  });
                } else if (start.length > 0) {
                  it.sep = it.sep.concat(start, this.sourceToken);
                } else {
                  it.sep.push(this.sourceToken);
                }
              } else {
                if (!it.sep) {
                  Object.assign(it, { key: null, sep: [this.sourceToken] });
                } else if (it.value || atNextItem) {
                  map2.items.push({ start, key: null, sep: [this.sourceToken] });
                } else if (includesToken(it.sep, 'map-value-ind')) {
                  this.stack.push({
                    type: 'block-map',
                    offset: this.offset,
                    indent: this.indent,
                    items: [{ start: [], key: null, sep: [this.sourceToken] }],
                  });
                } else {
                  it.sep.push(this.sourceToken);
                }
              }
              this.onKeyLine = true;
              return;
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar': {
              const fs = this.flowScalar(this.type);
              if (atNextItem || it.value) {
                map2.items.push({ start, key: fs, sep: [] });
                this.onKeyLine = true;
              } else if (it.sep) {
                this.stack.push(fs);
              } else {
                Object.assign(it, { key: fs, sep: [] });
                this.onKeyLine = true;
              }
              return;
            }
            default: {
              const bv = this.startBlockValue(map2);
              if (bv) {
                if (bv.type === 'block-seq') {
                  if (!it.explicitKey && it.sep && !includesToken(it.sep, 'newline')) {
                    yield* this.pop({
                      type: 'error',
                      offset: this.offset,
                      message: 'Unexpected block-seq-ind on same line with key',
                      source: this.source,
                    });
                    return;
                  }
                } else if (atMapIndent) {
                  map2.items.push({ start });
                }
                this.stack.push(bv);
                return;
              }
            }
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *blockSequence(seq) {
        const it = seq.items[seq.items.length - 1];
        switch (this.type) {
          case 'newline':
            if (it.value) {
              const end = 'end' in it.value ? it.value.end : void 0;
              const last = Array.isArray(end) ? end[end.length - 1] : void 0;
              if (last?.type === 'comment') end?.push(this.sourceToken);
              else seq.items.push({ start: [this.sourceToken] });
            } else it.start.push(this.sourceToken);
            return;
          case 'space':
          case 'comment':
            if (it.value) seq.items.push({ start: [this.sourceToken] });
            else {
              if (this.atIndentedComment(it.start, seq.indent)) {
                const prev = seq.items[seq.items.length - 2];
                const end = prev?.value?.end;
                if (Array.isArray(end)) {
                  arrayPushArray(end, it.start);
                  end.push(this.sourceToken);
                  seq.items.pop();
                  return;
                }
              }
              it.start.push(this.sourceToken);
            }
            return;
          case 'anchor':
          case 'tag':
            if (it.value || this.indent <= seq.indent) break;
            it.start.push(this.sourceToken);
            return;
          case 'seq-item-ind':
            if (this.indent !== seq.indent) break;
            if (it.value || includesToken(it.start, 'seq-item-ind')) seq.items.push({ start: [this.sourceToken] });
            else it.start.push(this.sourceToken);
            return;
        }
        if (this.indent > seq.indent) {
          const bv = this.startBlockValue(seq);
          if (bv) {
            this.stack.push(bv);
            return;
          }
        }
        yield* this.pop();
        yield* this.step();
      }
      *flowCollection(fc) {
        const it = fc.items[fc.items.length - 1];
        if (this.type === 'flow-error-end') {
          let top;
          do {
            yield* this.pop();
            top = this.peek(1);
          } while (top?.type === 'flow-collection');
        } else if (fc.end.length === 0) {
          switch (this.type) {
            case 'comma':
            case 'explicit-key-ind':
              if (!it || it.sep) fc.items.push({ start: [this.sourceToken] });
              else it.start.push(this.sourceToken);
              return;
            case 'map-value-ind':
              if (!it || it.value) fc.items.push({ start: [], key: null, sep: [this.sourceToken] });
              else if (it.sep) it.sep.push(this.sourceToken);
              else Object.assign(it, { key: null, sep: [this.sourceToken] });
              return;
            case 'space':
            case 'comment':
            case 'newline':
            case 'anchor':
            case 'tag':
              if (!it || it.value) fc.items.push({ start: [this.sourceToken] });
              else if (it.sep) it.sep.push(this.sourceToken);
              else it.start.push(this.sourceToken);
              return;
            case 'alias':
            case 'scalar':
            case 'single-quoted-scalar':
            case 'double-quoted-scalar': {
              const fs = this.flowScalar(this.type);
              if (!it || it.value) fc.items.push({ start: [], key: fs, sep: [] });
              else if (it.sep) this.stack.push(fs);
              else Object.assign(it, { key: fs, sep: [] });
              return;
            }
            case 'flow-map-end':
            case 'flow-seq-end':
              fc.end.push(this.sourceToken);
              return;
          }
          const bv = this.startBlockValue(fc);
          if (bv) this.stack.push(bv);
          else {
            yield* this.pop();
            yield* this.step();
          }
        } else {
          const parent = this.peek(2);
          if (
            parent.type === 'block-map' &&
            ((this.type === 'map-value-ind' && parent.indent === fc.indent) ||
              (this.type === 'newline' && !parent.items[parent.items.length - 1].sep))
          ) {
            yield* this.pop();
            yield* this.step();
          } else if (this.type === 'map-value-ind' && parent.type !== 'flow-collection') {
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            fixFlowSeqItems(fc);
            const sep = fc.end.splice(1, fc.end.length);
            sep.push(this.sourceToken);
            const map2 = {
              type: 'block-map',
              offset: fc.offset,
              indent: fc.indent,
              items: [{ start, key: fc, sep }],
            };
            this.onKeyLine = true;
            this.stack[this.stack.length - 1] = map2;
          } else {
            yield* this.lineEnd(fc);
          }
        }
      }
      flowScalar(type) {
        if (this.onNewLine) {
          let nl = this.source.indexOf('\n') + 1;
          while (nl !== 0) {
            this.onNewLine(this.offset + nl);
            nl = this.source.indexOf('\n', nl) + 1;
          }
        }
        return {
          type,
          offset: this.offset,
          indent: this.indent,
          source: this.source,
        };
      }
      startBlockValue(parent) {
        switch (this.type) {
          case 'alias':
          case 'scalar':
          case 'single-quoted-scalar':
          case 'double-quoted-scalar':
            return this.flowScalar(this.type);
          case 'block-scalar-header':
            return {
              type: 'block-scalar',
              offset: this.offset,
              indent: this.indent,
              props: [this.sourceToken],
              source: '',
            };
          case 'flow-map-start':
          case 'flow-seq-start':
            return {
              type: 'flow-collection',
              offset: this.offset,
              indent: this.indent,
              start: this.sourceToken,
              items: [],
              end: [],
            };
          case 'seq-item-ind':
            return {
              type: 'block-seq',
              offset: this.offset,
              indent: this.indent,
              items: [{ start: [this.sourceToken] }],
            };
          case 'explicit-key-ind': {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            start.push(this.sourceToken);
            return {
              type: 'block-map',
              offset: this.offset,
              indent: this.indent,
              items: [{ start, explicitKey: true }],
            };
          }
          case 'map-value-ind': {
            this.onKeyLine = true;
            const prev = getPrevProps(parent);
            const start = getFirstKeyStartProps(prev);
            return {
              type: 'block-map',
              offset: this.offset,
              indent: this.indent,
              items: [{ start, key: null, sep: [this.sourceToken] }],
            };
          }
        }
        return null;
      }
      atIndentedComment(start, indent) {
        if (this.type !== 'comment') return false;
        if (this.indent <= indent) return false;
        return start.every((st) => st.type === 'newline' || st.type === 'space');
      }
      *documentEnd(docEnd) {
        if (this.type !== 'doc-mode') {
          if (docEnd.end) docEnd.end.push(this.sourceToken);
          else docEnd.end = [this.sourceToken];
          if (this.type === 'newline') yield* this.pop();
        }
      }
      *lineEnd(token2) {
        switch (this.type) {
          case 'comma':
          case 'doc-start':
          case 'doc-end':
          case 'flow-seq-end':
          case 'flow-map-end':
          case 'map-value-ind':
            yield* this.pop();
            yield* this.step();
            break;
          case 'newline':
            this.onKeyLine = false;
          // fallthrough
          case 'space':
          case 'comment':
          default:
            if (token2.end) token2.end.push(this.sourceToken);
            else token2.end = [this.sourceToken];
            if (this.type === 'newline') yield* this.pop();
        }
      }
    };
    exports.Parser = Parser;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/public-api.js
var require_public_api = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/public-api.js'(exports) {
    'use strict';
    var composer = require_composer();
    var Document = require_Document();
    var errors = require_errors();
    var log = require_log();
    var identity = require_identity();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    function parseOptions(options) {
      const prettyErrors = options.prettyErrors !== false;
      const lineCounter$1 = options.lineCounter || (prettyErrors && new lineCounter.LineCounter()) || null;
      return { lineCounter: lineCounter$1, prettyErrors };
    }
    function parseAllDocuments(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      const docs = Array.from(composer$1.compose(parser$1.parse(source)));
      if (prettyErrors && lineCounter2)
        for (const doc of docs) {
          doc.errors.forEach(errors.prettifyError(source, lineCounter2));
          doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
        }
      if (docs.length > 0) return docs;
      return Object.assign([], { empty: true }, composer$1.streamInfo());
    }
    function parseDocument(source, options = {}) {
      const { lineCounter: lineCounter2, prettyErrors } = parseOptions(options);
      const parser$1 = new parser.Parser(lineCounter2?.addNewLine);
      const composer$1 = new composer.Composer(options);
      let doc = null;
      for (const _doc of composer$1.compose(parser$1.parse(source), true, source.length)) {
        if (!doc) doc = _doc;
        else if (doc.options.logLevel !== 'silent') {
          doc.errors.push(
            new errors.YAMLParseError(
              _doc.range.slice(0, 2),
              'MULTIPLE_DOCS',
              'Source contains multiple documents; please use YAML.parseAllDocuments()',
            ),
          );
          break;
        }
      }
      if (prettyErrors && lineCounter2) {
        doc.errors.forEach(errors.prettifyError(source, lineCounter2));
        doc.warnings.forEach(errors.prettifyError(source, lineCounter2));
      }
      return doc;
    }
    function parse2(src, reviver, options) {
      let _reviver = void 0;
      if (typeof reviver === 'function') {
        _reviver = reviver;
      } else if (options === void 0 && reviver && typeof reviver === 'object') {
        options = reviver;
      }
      const doc = parseDocument(src, options);
      if (!doc) return null;
      doc.warnings.forEach((warning) => log.warn(doc.options.logLevel, warning));
      if (doc.errors.length > 0) {
        if (doc.options.logLevel !== 'silent') throw doc.errors[0];
        else doc.errors = [];
      }
      return doc.toJS(Object.assign({ reviver: _reviver }, options));
    }
    function stringify(value3, replacer, options) {
      let _replacer = null;
      if (typeof replacer === 'function' || Array.isArray(replacer)) {
        _replacer = replacer;
      } else if (options === void 0 && replacer) {
        options = replacer;
      }
      if (typeof options === 'string') options = options.length;
      if (typeof options === 'number') {
        const indent = Math.round(options);
        options = indent < 1 ? void 0 : indent > 8 ? { indent: 8 } : { indent };
      }
      if (value3 === void 0) {
        const { keepUndefined } = options ?? replacer ?? {};
        if (!keepUndefined) return void 0;
      }
      if (identity.isDocument(value3) && !_replacer) return value3.toString(options);
      return new Document.Document(value3, _replacer, options).toString(options);
    }
    exports.parse = parse2;
    exports.parseAllDocuments = parseAllDocuments;
    exports.parseDocument = parseDocument;
    exports.stringify = stringify;
  },
});

// ../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js
var require_dist = __commonJS({
  '../../node_modules/.pnpm/yaml@2.9.0/node_modules/yaml/dist/index.js'(exports) {
    'use strict';
    var composer = require_composer();
    var Document = require_Document();
    var Schema = require_Schema();
    var errors = require_errors();
    var Alias = require_Alias();
    var identity = require_identity();
    var Pair = require_Pair();
    var Scalar = require_Scalar();
    var YAMLMap = require_YAMLMap();
    var YAMLSeq = require_YAMLSeq();
    var cst = require_cst();
    var lexer = require_lexer();
    var lineCounter = require_line_counter();
    var parser = require_parser();
    var publicApi = require_public_api();
    var visit = require_visit();
    exports.Composer = composer.Composer;
    exports.Document = Document.Document;
    exports.Schema = Schema.Schema;
    exports.YAMLError = errors.YAMLError;
    exports.YAMLParseError = errors.YAMLParseError;
    exports.YAMLWarning = errors.YAMLWarning;
    exports.Alias = Alias.Alias;
    exports.isAlias = identity.isAlias;
    exports.isCollection = identity.isCollection;
    exports.isDocument = identity.isDocument;
    exports.isMap = identity.isMap;
    exports.isNode = identity.isNode;
    exports.isPair = identity.isPair;
    exports.isScalar = identity.isScalar;
    exports.isSeq = identity.isSeq;
    exports.Pair = Pair.Pair;
    exports.Scalar = Scalar.Scalar;
    exports.YAMLMap = YAMLMap.YAMLMap;
    exports.YAMLSeq = YAMLSeq.YAMLSeq;
    exports.CST = cst;
    exports.Lexer = lexer.Lexer;
    exports.LineCounter = lineCounter.LineCounter;
    exports.Parser = parser.Parser;
    exports.parse = publicApi.parse;
    exports.parseAllDocuments = publicApi.parseAllDocuments;
    exports.parseDocument = publicApi.parseDocument;
    exports.stringify = publicApi.stringify;
    exports.visit = visit.visit;
    exports.visitAsync = visit.visitAsync;
  },
});

// src/derive-session-context/cli.ts
import { execFile } from 'node:child_process';
import { realpathSync } from 'node:fs';
import { mkdir, readFile as readFile2, writeFile } from 'node:fs/promises';
import { homedir as homedir2 } from 'node:os';
import path5 from 'node:path';
import process from 'node:process';
import { fileURLToPath as fileURLToPath2 } from 'node:url';
import { promisify } from 'node:util';

// src/derive-session-context/compose-manifest.ts
import path from 'node:path';

// src/derive-session-context/extract-ticket-id.ts
var JIRA_STYLE_PATTERN = /[A-Za-z]{2,}-[0-9]+/;
var BARE_NUMERIC_PATTERN = /^[0-9]+/;
function extractTicketId(input) {
  const jiraMatch = input.branchName.match(JIRA_STYLE_PATTERN);
  if (jiraMatch !== null) {
    const id62 = jiraMatch[0].toUpperCase();
    return { ticket_id: id62, ticket_ref: id62 };
  }
  const bareMatch = input.branchName.match(BARE_NUMERIC_PATTERN);
  if (bareMatch === null) {
    return { ticket_id: null, ticket_ref: null };
  }
  const bareNumber = bareMatch[0];
  const prefix = input.ticketRefPrefix;
  if (prefix === '#') {
    return { ticket_id: bareNumber, ticket_ref: `#${bareNumber}` };
  }
  if (prefix !== void 0 && prefix !== '') {
    const id62 = `${prefix}${bareNumber}`;
    return { ticket_id: id62, ticket_ref: id62 };
  }
  return { ticket_id: bareNumber, ticket_ref: bareNumber };
}

// src/derive-session-context/compose-manifest.ts
var DEFAULT_PLATFORM = 'github';
var DEFAULT_BASE_DIR = '~/ai-artifacts';
var DEFAULT_REMOTE_NAME = 'origin';
var DEFAULT_REMOTE_BRANCH = 'main';
var DEFAULT_ARTIFACT_PATHS = Object.freeze({
  chats: 'chats',
  devlogs: 'devlogs',
  plans: 'plans',
});
function composeManifest(input) {
  const { preferences, branchName, cwd: cwd2, home, now } = input;
  const ticketRefPrefix = preferences.project?.ticket_ref_prefix;
  const ticketResult =
    ticketRefPrefix === void 0 ? extractTicketId({ branchName }) : extractTicketId({ branchName, ticketRefPrefix });
  const projectSlug = preferences.project?.slug ?? preferences.repository?.slug ?? path.basename(cwd2);
  const platform = preferences.platform ?? DEFAULT_PLATFORM;
  const remoteName = preferences.repository?.default_remote?.name ?? DEFAULT_REMOTE_NAME;
  const remoteBranch = preferences.repository?.default_remote?.default_branch ?? DEFAULT_REMOTE_BRANCH;
  const defaultBranch = `${remoteName}/${remoteBranch}`;
  const rawBaseDir = preferences.artifacts?.base_dir ?? DEFAULT_BASE_DIR;
  const artifactBaseDir = resolveBaseDir(rawBaseDir, cwd2, home);
  const artifactPaths = { ...DEFAULT_ARTIFACT_PATHS };
  const configuredPaths = preferences.artifacts?.paths;
  if (configuredPaths !== void 0) {
    for (const [key, value3] of Object.entries(configuredPaths)) {
      artifactPaths[key] = value3;
    }
  }
  return {
    ticket_id: ticketResult.ticket_id,
    ticket_ref: ticketResult.ticket_ref,
    project_slug: projectSlug,
    platform,
    default_branch: defaultBranch,
    branch_name: branchName,
    artifact_base_dir: artifactBaseDir,
    artifact_paths: artifactPaths,
    created_at: formatIsoUtc(now),
  };
}
function resolveBaseDir(rawBaseDir, cwd2, home) {
  let expanded = rawBaseDir;
  if (rawBaseDir === '~') {
    expanded = home;
  } else if (rawBaseDir.startsWith('~/')) {
    expanded = path.join(home, rawBaseDir.slice(2));
  }
  if (path.isAbsolute(expanded)) {
    return expanded;
  }
  return path.resolve(cwd2, expanded);
}
function formatIsoUtc(date) {
  return date.toISOString().replace(/\.\d{3}Z$/, 'Z');
}

// src/derive-session-context/read-preferences.ts
import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import path4 from 'node:path';

// ../../node_modules/.pnpm/@hyperjump+uri@1.3.3/node_modules/@hyperjump/uri/lib/index.js
var hexdig = `[a-fA-F0-9]`;
var unreserved = `[a-zA-Z0-9-._~]`;
var subDelims = `[!$&'()*+,;=]`;
var pctEncoded = `%${hexdig}${hexdig}`;
var decOctet = `(?:\\d|[1-9]\\d|1\\d\\d|2[0-4]\\d|25[0-5])`;
var ipV4Address = `${decOctet}\\.${decOctet}\\.${decOctet}\\.${decOctet}`;
var h16 = `${hexdig}{1,4}`;
var ls32 = `(?:${h16}:${h16}|${ipV4Address})`;
var ipV6Address = `(?:(?:${h16}:){6}${ls32}|::(?:${h16}:){5}${ls32}|(?:${h16})?::(?:${h16}:){4}${ls32}|(?:(?:${h16}:){0,1}${h16})?::(?:${h16}:){3}${ls32}|(?:(?:${h16}:){0,2}${h16})?::(?:${h16}:){2}${ls32}|(?:(?:${h16}:){0,3}${h16})?::(?:${h16}:){1}${ls32}|(?:(?:${h16}:){0,4}${h16})?::${ls32}|(?:(?:${h16}:){0,5}${h16})?::${h16}|(?:(?:${h16}:){0,6}${h16})?::)`;
var ipVFuture = `v${hexdig}+\\.(?:${unreserved}|${subDelims}|:)+`;
var ipLiteral = `\\[(?:${ipV6Address}|${ipVFuture})\\]`;
var scheme = `(?<scheme>[a-zA-Z][a-zA-Z0-9-+.]*)`;
var port = `:(?<port>\\d*)`;
var regName = `(?:${unreserved}|${pctEncoded}|${subDelims})*?`;
var host = `(?<host>${ipLiteral}|${ipV4Address}|${regName})`;
var userinfo = `(?<userinfo>(?:${unreserved}|${pctEncoded}|${subDelims}|:)*)`;
var pchar = `(?:${unreserved}|${pctEncoded}|${subDelims}|:|@)`;
var segment = `${pchar}*?`;
var pathAbEmpty = `(?:/${segment})*`;
var authority = `(?<authority>(?:${userinfo}@)?${host}(?:${port})?)`;
var path2 = `(?<path>${pathAbEmpty})`;
var pathWithoutAuthority = `(?<path2>(?!//)${segment}${pathAbEmpty})`;
var query = `(?:\\?(?<query>(?:${pchar}|/|\\?)*))?`;
var fragment = `(?:#(?<fragment>(?:${pchar}|/|\\?)*))?`;
var uri = `^${scheme}:(?://${authority}${path2}|${pathWithoutAuthority})${query}${fragment}$`;
var uriReference = `^(?:${scheme}:|)(?://${authority}${path2}|${pathWithoutAuthority})${query}${fragment}$`;
var absoluteUri = `^${scheme}:(?://${authority}${path2}|${pathWithoutAuthority})${query}$`;
var iunreserved = `[a-zA-Z0-9\\-._~\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}]`;
var iprivate = `[\\u{E000}-\\u{F8FF}\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}]`;
var iregName = `(?:${iunreserved}|${pctEncoded}|${subDelims})*?`;
var ihost = `(?<host>${ipLiteral}|${ipV4Address}|${iregName})`;
var iuserinfo = `(?<userinfo>(?:${iunreserved}|${pctEncoded}|${subDelims}|:)*)`;
var ipchar = `(?:${iunreserved}|${pctEncoded}|${subDelims}|:|@)`;
var isegment = `${ipchar}*?`;
var ipathAbEmpty = `(?:/${isegment})*`;
var iauthority = `(?<authority>(?:${iuserinfo}@)?${ihost}(?:${port})?)`;
var ipath = `(?<path>${ipathAbEmpty})`;
var ipathWithoutAuthority = `(?<path2>(?!//)${isegment}${ipathAbEmpty})`;
var iquery = `(?:\\?(?<query>(?:${ipchar}|${iprivate}|/|\\?)*))?`;
var ifragment = `(?:#(?<fragment>(?:${ipchar}|/|\\?)*))?`;
var iri = `^${scheme}:(?://${iauthority}${ipath}|${ipathWithoutAuthority})${iquery}${ifragment}$`;
var iriReference = `^(?:${scheme}:|)(?://${iauthority}${ipath}|${ipathWithoutAuthority})${iquery}${ifragment}$`;
var absoluteIri = `^${scheme}:(?://${iauthority}${ipath}|${ipathWithoutAuthority})${iquery}$`;
var resolveReference = (strategy) => (reference, base) => {
  const resolvedComponents =
    /** @type API.IdentifierComponents */
    strategy.parseReference(reference);
  if (resolvedComponents.scheme === void 0) {
    const baseComponents = strategy.parseAbsolute(base);
    resolvedComponents.scheme = baseComponents.scheme;
    if (resolvedComponents.authority === void 0) {
      resolvedComponents.authority = baseComponents.authority;
      resolvedComponents.userinfo = baseComponents.userinfo;
      resolvedComponents.host = baseComponents.host;
      resolvedComponents.port = baseComponents.port;
      if (resolvedComponents.path === '') {
        resolvedComponents.path = baseComponents.path;
        resolvedComponents.query ??= baseComponents.query;
      } else if (!resolvedComponents.path.startsWith('/')) {
        resolvedComponents.path = mergePaths(resolvedComponents.path, baseComponents);
      }
    }
  }
  return composeIdentifier(strategy, resolvedComponents);
};
var mergePaths = (path6, base) => {
  if (base.authority && base.path === '') {
    return '/' + path6;
  } else {
    const position = base.path.lastIndexOf('/');
    return position === -1 ? path6 : base.path.slice(0, position + 1) + path6;
  }
};
var isNoOpSegment = /^\.?\.\/|^\.\.?$/;
var isSlashDotSegment = /^\/\.(?:\/|$)/;
var isUpSegment = /^\/\.\.(?:\/|$)/;
var removeDotSegments = (path6) => {
  let output = '';
  while (path6.length > 0) {
    if (isNoOpSegment.test(path6)) {
      path6 = removeSegment(path6);
    } else if (isSlashDotSegment.test(path6)) {
      path6 = replaceSegmentWithSlash(path6);
    } else if (isUpSegment.test(path6)) {
      path6 = replaceSegmentWithSlash(path6);
      output = removeLastSegment(output);
    } else {
      const segment3 = getSegment(path6);
      path6 = removeSegment(path6);
      output += segment3;
    }
  }
  return output;
};
var removeSegment = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? '' : '/' + path6.slice(position + 1);
};
var replaceSegmentWithSlash = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? '/' : '/' + path6.slice(position + 1);
};
var removeLastSegment = (path6) => {
  const position = path6.lastIndexOf('/');
  return position === -1 ? path6 : path6.slice(0, position);
};
var getSegment = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? path6 : path6.slice(0, position);
};
var composeIdentifier = (strategy, components) => {
  let resolved = components.scheme.toLowerCase() + ':';
  resolved +=
    components.authority === void 0
      ? ''
      : '//' +
        (components.userinfo === void 0 ? '' : components.userinfo + '@') +
        components.host.toLowerCase() +
        (components.port === void 0 ? '' : ':' + components.port);
  resolved += strategy.normalizePath(components.path);
  resolved += components.query === void 0 ? '' : '?' + strategy.normalizeQuery(components.query);
  resolved += components.fragment === void 0 ? '' : '#' + strategy.normalizeFragment(components.fragment);
  return resolved;
};
var percentEncoded = new RegExp(pctEncoded, 'g');
var percentEncodedToChar = (isAllowed) => (match) => {
  const charCode = parseInt(match.slice(1), 16);
  const char = String.fromCharCode(charCode);
  return isAllowed(char) ? char : match.toUpperCase();
};
var isAllowedUnescapedInPath = RegExp.prototype.test.bind(new RegExp(`${unreserved}|${subDelims}|[:@]`));
var isAllowedUnescapedInIPath = RegExp.prototype.test.bind(new RegExp(`${iunreserved}|${subDelims}|[:@]`, 'u'));
var normalizePath = (isAllowed) => (segment3) =>
  removeDotSegments(segment3).replaceAll(percentEncoded, percentEncodedToChar(isAllowed));
var isAllowedUnescapedInQuery = RegExp.prototype.test.bind(new RegExp(`${unreserved}|${subDelims}|[:@/?]`));
var isAllowedUnescapedInIQuery = RegExp.prototype.test.bind(new RegExp(`${iunreserved}|${subDelims}|[:@/?]`, 'u'));
var normalizeQuery = (isAllowed) => (query3) => query3.replaceAll(percentEncoded, percentEncodedToChar(isAllowed));
var isUri = RegExp.prototype.test.bind(new RegExp(uri));
var isUriReference = RegExp.prototype.test.bind(new RegExp(uriReference));
var isAbsoluteUri = RegExp.prototype.test.bind(new RegExp(absoluteUri));
var isIri = RegExp.prototype.test.bind(new RegExp(iri, 'u'));
var isIriReference = RegExp.prototype.test.bind(new RegExp(iriReference, 'u'));
var isAbsoluteIri = RegExp.prototype.test.bind(new RegExp(absoluteIri, 'u'));
var createParser = (pattern, type) => (value3) => {
  const match = pattern.exec(value3);
  if (match === null) {
    throw Error(`Invalid ${type}: ${value3}`);
  }
  const groups =
    /** @type Record<string, string> */
    match.groups;
  if (groups.authority === void 0) {
    groups.path = groups.path2;
  }
  delete groups.path2;
  return groups;
};
var parseUri = createParser(new RegExp(uri), 'URI');
var parseUriReference = createParser(new RegExp(uriReference), 'URI-reference');
var parseAbsoluteUri = createParser(new RegExp(absoluteUri), 'absolute-URI');
var parseIri = createParser(new RegExp(iri, 'u'), 'IRI');
var parseIriReference = createParser(new RegExp(iriReference, 'u'), 'IRI-reference');
var parseAbsoluteIri = createParser(new RegExp(absoluteIri, 'u'), 'absolute-IRI');
var strategies = {
  uri: {
    parseAbsolute: parseAbsoluteUri,
    parseReference: parseUriReference,
    parse: parseUri,
    normalizePath: normalizePath(isAllowedUnescapedInPath),
    normalizeQuery: normalizeQuery(isAllowedUnescapedInQuery),
    normalizeFragment: normalizeQuery(isAllowedUnescapedInQuery),
  },
  iri: {
    parseAbsolute: parseAbsoluteIri,
    parseReference: parseIriReference,
    parse: parseIri,
    normalizePath: normalizePath(isAllowedUnescapedInIPath),
    normalizeQuery: normalizeQuery(isAllowedUnescapedInIQuery),
    normalizeFragment: normalizeQuery(isAllowedUnescapedInIQuery),
  },
};
var toAbsolute = (strategy) => (identifier) => {
  const components = strategy.parse(identifier);
  delete components.fragment;
  return composeIdentifier(strategy, components);
};
var toAbsoluteUri = toAbsolute(strategies.uri);
var toAbsoluteIri = toAbsolute(strategies.iri);
var normalize = (strategy) => (identifier) => {
  const components = strategy.parse(identifier);
  return composeIdentifier(strategy, components);
};
var normalizeUri = normalize(strategies.uri);
var normalizeIri = normalize(strategies.iri);
var resolveUri = resolveReference(strategies.uri);
var resolveIri = resolveReference(strategies.iri);
var toRelative = (strategy) => (uri4, relativeTo) => {
  const fromUri = strategy.parseAbsolute(uri4);
  const toUri = strategy.parse(relativeTo);
  if (toUri.scheme !== fromUri.scheme) {
    return relativeTo;
  }
  if (toUri.authority !== fromUri.authority) {
    return relativeTo;
  }
  let result;
  if (fromUri.path === toUri.path) {
    result = '';
  } else {
    const fromSegments = fromUri.path.split('/');
    const toSegments = toUri.path.split('/');
    let position = 0;
    while (
      fromSegments[position] === toSegments[position] &&
      position < fromSegments.length - 1 &&
      position < toSegments.length - 1
    ) {
      position++;
    }
    const segments = [];
    for (let index = position + 1; index < fromSegments.length; index++) {
      segments.push('..');
    }
    for (let index = position; index < toSegments.length; index++) {
      segments.push(toSegments[index]);
    }
    result = segments.join('/');
  }
  if (toUri.query !== void 0) {
    result += `?${toUri.query}`;
  }
  if (toUri.fragment !== void 0) {
    result += `#${toUri.fragment}`;
  }
  return result;
};
var toRelativeUri = toRelative(strategies.uri);
var toRelativeIri = toRelative(strategies.iri);

// ../../node_modules/.pnpm/@hyperjump+json-pointer@1.1.2/node_modules/@hyperjump/json-pointer/lib/index.js
var nil = '';
var pointerSegments = function* (pointer) {
  if (pointer.length > 0 && !pointer.startsWith('/')) {
    throw Error('Invalid JSON Pointer');
  }
  if (/~(?![01])/.test(pointer)) {
    throw Error('Invalid JSON Pointer');
  }
  let segmentStart = 1;
  let segmentEnd = 0;
  while (segmentEnd < pointer.length) {
    const position = pointer.indexOf('/', segmentStart);
    segmentEnd = position === -1 ? pointer.length : position;
    const segment3 = pointer.slice(segmentStart, segmentEnd);
    segmentStart = segmentEnd + 1;
    yield unescape(segment3);
  }
};
var get = (pointer, subject = void 0) => {
  if (subject === void 0) {
    const segments = [...pointerSegments(pointer)];
    return (subject2) => _get(segments, subject2);
  } else {
    return _get(pointerSegments(pointer), subject);
  }
};
var _get = (segments, subject) => {
  let cursor = nil;
  for (const segment3 of segments) {
    subject = applySegment(subject, segment3, cursor);
    cursor = append(segment3, cursor);
  }
  return subject;
};
var append = (segment3, pointer) => pointer + '/' + escape(segment3);
var escape = (segment3) => segment3.toString().replace(/~/g, '~0').replace(/\//g, '~1');
var unescape = (segment3) => segment3.toString().replace(/~1/g, '/').replace(/~0/g, '~');
var computeSegment = (value3, segment3) => {
  if (Array.isArray(value3)) {
    return segment3 === '-' ? value3.length : parseInt(segment3, 10);
  } else {
    return segment3;
  }
};
var applySegment = (value3, segment3, cursor = '') => {
  if (value3 === void 0) {
    throw TypeError(`Value at '${cursor}' is undefined and does not have property '${segment3}'`);
  } else if (value3 === null) {
    throw TypeError(`Value at '${cursor}' is null and does not have property '${segment3}'`);
  } else if (isScalar(value3)) {
    throw TypeError(`Value at '${cursor}' is a ${typeof value3} and does not have property '${segment3}'`);
  } else {
    const computedSegment = computeSegment(value3, segment3);
    if (Object.hasOwn(value3, computedSegment)) {
      return (
        /** @type API.JsonObject */
        value3[computedSegment]
      );
    }
  }
};
var isScalar = (value3) => value3 === null || typeof value3 !== 'object';

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/common.js
var jsonTypeOf = (value3) => {
  const jsType = typeof value3;
  switch (jsType) {
    case 'number':
    case 'string':
    case 'boolean':
    case 'undefined':
      return jsType;
    case 'object':
      if (Array.isArray(value3)) {
        return 'array';
      } else if (value3 === null) {
        return 'null';
      } else if (Object.getPrototypeOf(value3) === Object.prototype) {
        return 'object';
      }
    default: {
      const type = jsType === 'object' ? Object.getPrototypeOf(value3).constructor.name || 'anonymous' : jsType;
      throw Error(`Not a JSON compatible type: ${type}`);
    }
  }
};
var toAbsoluteUri2 = (uri4) => {
  const position = uri4.indexOf('#');
  const end = position === -1 ? uri4.length : position;
  return uri4.slice(0, end);
};
var uriFragment = (uri4) => decodeURIComponent(parseIriReference(uri4).fragment || '');

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords.js
var _keywords = {};
var getKeyword = (id62) => {
  if (id62.indexOf('#') !== -1) {
    const absoluteId = toAbsoluteUri2(id62);
    return { ..._keywords[absoluteId], id: id62 };
  }
  return _keywords[id62];
};
var getKeywordByName = (keyword, dialectId) => {
  const keywordId = getKeywordId(keyword, dialectId);
  if (!keywordId) {
    throw Error(`Encountered unknown keyword '${keyword}'`);
  }
  const keywordHandler = getKeyword(keywordId);
  if (!keywordHandler) {
    throw Error(
      `Encountered unsupported keyword ${keyword}. You can provide an implementation for the '${keywordId}' keyword using the 'addKeyword' function.`,
    );
  }
  return keywordHandler;
};
var addKeyword = (keywordHandler) => {
  _keywords[keywordHandler.id] = keywordHandler;
};
var _vocabularies = {};
var defineVocabulary = (id62, keywords) => {
  _vocabularies[id62] = keywords;
};
var _formats = {};
var getFormatHandler = (formatUri) => {
  return _formats[formatUri];
};
var _dialects = {};
var getKeywordId = (keyword, dialectId) => {
  const dialect = getDialect(dialectId);
  return (
    dialect.keywords[keyword] ??
    (dialect.allowUnknownKeywords || keyword.startsWith('x-')
      ? `https://json-schema.org/keyword/unknown#${keyword}`
      : void 0)
  );
};
var getKeywordName = (dialectId, keywordId) => {
  const dialect = getDialect(dialectId);
  for (const keyword in dialect.keywords) {
    if (dialect.keywords[keyword] === keywordId) {
      return keyword;
    }
  }
};
var getDialect = (dialectId) => {
  if (!(dialectId in _dialects)) {
    throw Error(`Encountered unknown dialect '${dialectId}'`);
  }
  return _dialects[dialectId];
};
var loadDialect = (dialectId, dialect, allowUnknownKeywords = false, isPersistent = true) => {
  _dialects[dialectId] = {
    keywords: {},
    allowUnknownKeywords,
    persistentDialects: _dialects[dialectId]?.persistentDialects || isPersistent,
  };
  for (const vocabularyId in dialect) {
    if (vocabularyId in _vocabularies) {
      for (const keyword in _vocabularies[vocabularyId]) {
        let keywordId = _vocabularies[vocabularyId][keyword];
        if (!dialect[vocabularyId]) {
          if (vocabularyId === 'https://json-schema.org/draft/2019-09/vocab/format') {
            keywordId = 'https://json-schema.org/keyword/draft-2019-09/format';
          } else if (!(keywordId in _keywords)) {
            keywordId = `https://json-schema.org/keyword/unknown#${keyword}`;
          }
        }
        _dialects[dialectId].keywords[keyword] = keywordId;
      }
    } else if (!allowUnknownKeywords || dialect[vocabularyId]) {
      delete _dialects[dialectId];
      throw Error(
        `Unrecognized vocabulary: ${vocabularyId}. You can define this vocabulary with the 'defineVocabulary' function.`,
      );
    }
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/media-types/media-types.js
var import_content_type = __toESM(require_content_type(), 1);
var mediaTypePlugins = {};
var addMediaTypePlugin = (contentType, plugin5) => {
  mediaTypePlugins[contentType] = plugin5;
};
var parseResponse = (response) => {
  const contentTypeText = response.headers.get('content-type');
  if (contentTypeText === null) {
    throw new UnknownMediaTypeError(
      "The media type of the response could not be determined. Make sure the response includes a 'Content-Type' header.",
      { cause: response },
    );
  }
  const contentType = (0, import_content_type.parse)(contentTypeText);
  for (const pattern in mediaTypePlugins) {
    if (mimeMatch(pattern, contentType.type)) {
      return mediaTypePlugins[pattern].parse(response);
    }
  }
  throw new UnsupportedMediaTypeError(
    contentType.type,
    `'${contentType.type}' is not supported. Use the 'addMediaTypePlugin' function to add support for this media type.`,
    {
      cause: response,
    },
  );
};
var alpha = `A-Za-z`;
var token = `[!#$%&'*\\-_.^\`|~\\d${alpha}]+`;
var mediaRange = `(?<type>${token})/(?<subType>${token}(?:\\+(?<suffix>${token}))?)`;
var mediaRangePattern = new RegExp(mediaRange);
var mimeMatch = (expected, actual) => {
  if (expected === actual) {
    return true;
  }
  const expectedMatches = mediaRangePattern.exec(expected)?.groups;
  if (!expectedMatches) {
    throw Error(`Unable to parse media-range: ${expected}`);
  }
  const actualMatches = mediaRangePattern.exec(actual)?.groups;
  if (!actualMatches) {
    throw Error(`Unable to parse media-type: ${actual}`);
  }
  if (expectedMatches.type === actualMatches.type || expectedMatches.type === '*') {
    if (expectedMatches.subType === actualMatches.subType || expectedMatches.subType === '*') {
      return true;
    }
    if (expectedMatches.subType === actualMatches.suffix) {
      return true;
    }
  }
  return false;
};
var getFileMediaType = async (path6) => {
  for (const contentType in mediaTypePlugins) {
    if (await mediaTypePlugins[contentType].fileMatcher(path6)) {
      return contentType;
    }
  }
  throw new UnknownMediaTypeError(
    `The media type of the file at '${path6}' could not be determined. Use the 'addMediaTypePlugin' function to add support for this media type.`,
  );
};
var acceptableMediaTypes = () => {
  let accept = '';
  for (const contentType in mediaTypePlugins) {
    accept = addAcceptableMediaType(accept, contentType, mediaTypePlugins[contentType].quality);
  }
  return addAcceptableMediaType(accept, '*/*', '0.001');
};
var addAcceptableMediaType = (accept, contentType, quality) => {
  if (accept.length > 0) {
    accept += ', ';
  }
  accept += contentType;
  if (quality) {
    accept += `; q=${quality}`;
  }
  return accept;
};
var UnsupportedMediaTypeError = class extends Error {
  constructor(mediaType, message = void 0) {
    super(message);
    this.name = this.constructor.name;
    this.mediaType = mediaType;
  }
};
var UnknownMediaTypeError = class extends Error {
  constructor(message = void 0) {
    super(message);
    this.name = this.constructor.name;
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/jref/index.js
var parse = (jref, reviver = void 0) => {
  return JSON.parse(jref, (key, value3) => {
    const newValue = value3 !== null && typeof value3.$ref === 'string' ? new Reference(value3.$ref) : value3;
    return reviver ? reviver(key, newValue) : newValue;
  });
};
var Reference = class {
  #href;
  #value;
  constructor(href, value3 = void 0) {
    this.#href = href;
    this.#value = value3 ?? { $ref: href };
  }
  get href() {
    return this.#href;
  }
  toJSON() {
    return this.#value;
  }
};
var jrefTypeOf = (value3) => {
  const jsType = typeof value3;
  switch (jsType) {
    case 'bigint':
      return 'number';
    case 'number':
    case 'string':
    case 'boolean':
    case 'undefined':
      return jsType;
    case 'object':
      if (value3 instanceof Reference) {
        return 'reference';
      } else if (Array.isArray(value3)) {
        return 'array';
      } else if (value3 === null) {
        return 'null';
      } else if (Object.getPrototypeOf(value3) === Object.prototype || Object.getPrototypeOf(value3) === null) {
        return 'object';
      }
    default: {
      const type = jsType === 'object' ? Object.getPrototypeOf(value3).constructor.name || 'anonymous' : jsType;
      throw Error(`Not a JRef compatible type: ${type}`);
    }
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/media-types/jref-media-type-plugin.js
var jrefMediaTypePlugin = {
  parse: async (response) => {
    return {
      baseUri: response.url,
      root: parse(await response.text()),
      anchorLocation,
    };
  },
  fileMatcher: (path6) => /[^/]\.jref$/.test(path6),
};
var anchorLocation = (fragment3) => decodeURI(fragment3 || '');

// ../../node_modules/.pnpm/@hyperjump+uri@1.3.4/node_modules/@hyperjump/uri/lib/index.js
var hexdig2 = `[a-fA-F0-9]`;
var unreserved2 = `[a-zA-Z0-9-._~]`;
var subDelims2 = `[!$&'()*+,;=]`;
var pctEncoded2 = `%${hexdig2}${hexdig2}`;
var decOctet2 = `(?:\\d|[1-9]\\d|1\\d\\d|2[0-4]\\d|25[0-5])`;
var ipV4Address2 = `${decOctet2}\\.${decOctet2}\\.${decOctet2}\\.${decOctet2}`;
var h162 = `${hexdig2}{1,4}`;
var ls322 = `(?:${h162}:${h162}|${ipV4Address2})`;
var ipV6Address2 = `(?:(?:${h162}:){6}${ls322}|::(?:${h162}:){5}${ls322}|(?:${h162})?::(?:${h162}:){4}${ls322}|(?:(?:${h162}:){0,1}${h162})?::(?:${h162}:){3}${ls322}|(?:(?:${h162}:){0,2}${h162})?::(?:${h162}:){2}${ls322}|(?:(?:${h162}:){0,3}${h162})?::(?:${h162}:){1}${ls322}|(?:(?:${h162}:){0,4}${h162})?::${ls322}|(?:(?:${h162}:){0,5}${h162})?::${h162}|(?:(?:${h162}:){0,6}${h162})?::)`;
var ipVFuture2 = `[vV]${hexdig2}+\\.(?:${unreserved2}|${subDelims2}|:)+`;
var ipLiteral2 = `\\[(?:${ipV6Address2}|${ipVFuture2})\\]`;
var scheme2 = `(?<scheme>[a-zA-Z][a-zA-Z0-9-+.]*)`;
var port2 = `:(?<port>\\d*)`;
var regName2 = `(?:${unreserved2}|${pctEncoded2}|${subDelims2})*?`;
var host2 = `(?<host>${ipLiteral2}|${ipV4Address2}|${regName2})`;
var userinfo2 = `(?<userinfo>(?:${unreserved2}|${pctEncoded2}|${subDelims2}|:)*)`;
var pchar2 = `(?:${unreserved2}|${pctEncoded2}|${subDelims2}|:|@)`;
var segment2 = `${pchar2}*?`;
var pathAbEmpty2 = `(?:/${segment2})*`;
var authority2 = `(?<authority>(?:${userinfo2}@)?${host2}(?:${port2})?)`;
var path3 = `(?<path>${pathAbEmpty2})`;
var pathWithoutAuthority2 = `(?<path2>(?!//)${segment2}${pathAbEmpty2})`;
var query2 = `(?:\\?(?<query>(?:${pchar2}|/|\\?)*))?`;
var fragment2 = `(?:#(?<fragment>(?:${pchar2}|/|\\?)*))?`;
var uri2 = `^${scheme2}:(?://${authority2}${path3}|${pathWithoutAuthority2})${query2}${fragment2}$`;
var uriReference2 = `^(?:${scheme2}:|)(?://${authority2}${path3}|${pathWithoutAuthority2})${query2}${fragment2}$`;
var absoluteUri2 = `^${scheme2}:(?://${authority2}${path3}|${pathWithoutAuthority2})${query2}$`;
var iunreserved2 = `[a-zA-Z0-9\\-._~\\u{A0}-\\u{D7FF}\\u{F900}-\\u{FDCF}\\u{FDF0}-\\u{FFEF}\\u{10000}-\\u{1FFFD}\\u{20000}-\\u{2FFFD}\\u{30000}-\\u{3FFFD}\\u{40000}-\\u{4FFFD}\\u{50000}-\\u{5FFFD}\\u{60000}-\\u{6FFFD}\\u{70000}-\\u{7FFFD}\\u{80000}-\\u{8FFFD}\\u{90000}-\\u{9FFFD}\\u{A0000}-\\u{AFFFD}\\u{B0000}-\\u{BFFFD}\\u{C0000}-\\u{CFFFD}\\u{D0000}-\\u{DFFFD}\\u{E1000}-\\u{EFFFD}]`;
var iprivate2 = `[\\u{E000}-\\u{F8FF}\\u{F0000}-\\u{FFFFD}\\u{100000}-\\u{10FFFD}]`;
var iregName2 = `(?:${iunreserved2}|${pctEncoded2}|${subDelims2})*?`;
var ihost2 = `(?<host>${ipLiteral2}|${ipV4Address2}|${iregName2})`;
var iuserinfo2 = `(?<userinfo>(?:${iunreserved2}|${pctEncoded2}|${subDelims2}|:)*)`;
var ipchar2 = `(?:${iunreserved2}|${pctEncoded2}|${subDelims2}|:|@)`;
var isegment2 = `${ipchar2}*?`;
var ipathAbEmpty2 = `(?:/${isegment2})*`;
var iauthority2 = `(?<authority>(?:${iuserinfo2}@)?${ihost2}(?:${port2})?)`;
var ipath2 = `(?<path>${ipathAbEmpty2})`;
var ipathWithoutAuthority2 = `(?<path2>(?!//)${isegment2}${ipathAbEmpty2})`;
var iquery2 = `(?:\\?(?<query>(?:${ipchar2}|${iprivate2}|/|\\?)*))?`;
var ifragment2 = `(?:#(?<fragment>(?:${ipchar2}|/|\\?)*))?`;
var iri2 = `^${scheme2}:(?://${iauthority2}${ipath2}|${ipathWithoutAuthority2})${iquery2}${ifragment2}$`;
var iriReference2 = `^(?:${scheme2}:|)(?://${iauthority2}${ipath2}|${ipathWithoutAuthority2})${iquery2}${ifragment2}$`;
var absoluteIri2 = `^${scheme2}:(?://${iauthority2}${ipath2}|${ipathWithoutAuthority2})${iquery2}$`;
var resolveReference2 = (strategy) => (reference, base) => {
  const resolvedComponents =
    /** @type API.IdentifierComponents */
    strategy.parseReference(reference);
  if (resolvedComponents.scheme === void 0) {
    const baseComponents = strategy.parseAbsolute(base);
    resolvedComponents.scheme = baseComponents.scheme;
    if (resolvedComponents.authority === void 0) {
      resolvedComponents.authority = baseComponents.authority;
      resolvedComponents.userinfo = baseComponents.userinfo;
      resolvedComponents.host = baseComponents.host;
      resolvedComponents.port = baseComponents.port;
      if (resolvedComponents.path === '') {
        resolvedComponents.path = baseComponents.path;
        resolvedComponents.query ??= baseComponents.query;
      } else if (!resolvedComponents.path.startsWith('/')) {
        resolvedComponents.path = mergePaths2(resolvedComponents.path, baseComponents);
      }
    }
  }
  return composeIdentifier2(strategy, resolvedComponents);
};
var mergePaths2 = (path6, base) => {
  if (base.authority && base.path === '') {
    return '/' + path6;
  } else {
    const position = base.path.lastIndexOf('/');
    return position === -1 ? path6 : base.path.slice(0, position + 1) + path6;
  }
};
var isNoOpSegment2 = /^\.?\.\/|^\.\.?$/;
var isSlashDotSegment2 = /^\/\.(?:\/|$)/;
var isUpSegment2 = /^\/\.\.(?:\/|$)/;
var removeDotSegments2 = (path6) => {
  let output = '';
  while (path6.length > 0) {
    if (isNoOpSegment2.test(path6)) {
      path6 = removeSegment2(path6);
    } else if (isSlashDotSegment2.test(path6)) {
      path6 = replaceSegmentWithSlash2(path6);
    } else if (isUpSegment2.test(path6)) {
      path6 = replaceSegmentWithSlash2(path6);
      output = removeLastSegment2(output);
    } else {
      const segment3 = getSegment2(path6);
      path6 = removeSegment2(path6);
      output += segment3;
    }
  }
  return output;
};
var removeSegment2 = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? '' : '/' + path6.slice(position + 1);
};
var replaceSegmentWithSlash2 = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? '/' : '/' + path6.slice(position + 1);
};
var removeLastSegment2 = (path6) => {
  const position = path6.lastIndexOf('/');
  return position === -1 ? path6 : path6.slice(0, position);
};
var getSegment2 = (path6) => {
  const position = path6.indexOf('/', 1);
  return position === -1 ? path6 : path6.slice(0, position);
};
var composeIdentifier2 = (strategy, components) => {
  let resolved = components.scheme.toLowerCase() + ':';
  resolved +=
    components.authority === void 0
      ? ''
      : '//' +
        (components.userinfo === void 0 ? '' : components.userinfo + '@') +
        components.host.toLowerCase() +
        (components.port === void 0 ? '' : ':' + components.port);
  resolved += strategy.normalizePath(components.path);
  resolved += components.query === void 0 ? '' : '?' + strategy.normalizeQuery(components.query);
  resolved += components.fragment === void 0 ? '' : '#' + strategy.normalizeFragment(components.fragment);
  return resolved;
};
var percentEncoded2 = new RegExp(pctEncoded2, 'g');
var percentEncodedToChar2 = (isAllowed) => (match) => {
  const charCode = parseInt(match.slice(1), 16);
  const char = String.fromCharCode(charCode);
  return isAllowed(char) ? char : match.toUpperCase();
};
var isAllowedUnescapedInPath2 = RegExp.prototype.test.bind(new RegExp(`${unreserved2}|${subDelims2}|[:@]`));
var isAllowedUnescapedInIPath2 = RegExp.prototype.test.bind(new RegExp(`${iunreserved2}|${subDelims2}|[:@]`, 'u'));
var normalizePath2 = (isAllowed) => (segment3) =>
  removeDotSegments2(segment3).replaceAll(percentEncoded2, percentEncodedToChar2(isAllowed));
var isAllowedUnescapedInQuery2 = RegExp.prototype.test.bind(new RegExp(`${unreserved2}|${subDelims2}|[:@/?]`));
var isAllowedUnescapedInIQuery2 = RegExp.prototype.test.bind(new RegExp(`${iunreserved2}|${subDelims2}|[:@/?]`, 'u'));
var normalizeQuery2 = (isAllowed) => (query3) => query3.replaceAll(percentEncoded2, percentEncodedToChar2(isAllowed));
var isUri2 = RegExp.prototype.test.bind(new RegExp(uri2));
var isUriReference2 = RegExp.prototype.test.bind(new RegExp(uriReference2));
var isAbsoluteUri2 = RegExp.prototype.test.bind(new RegExp(absoluteUri2));
var isIri2 = RegExp.prototype.test.bind(new RegExp(iri2, 'u'));
var isIriReference2 = RegExp.prototype.test.bind(new RegExp(iriReference2, 'u'));
var isAbsoluteIri2 = RegExp.prototype.test.bind(new RegExp(absoluteIri2, 'u'));
var createParser2 = (pattern, type) => (value3) => {
  const match = pattern.exec(value3);
  if (match === null) {
    throw Error(`Invalid ${type}: ${value3}`);
  }
  const groups =
    /** @type Record<string, string> */
    match.groups;
  if (groups.authority === void 0) {
    groups.path = groups.path2;
  }
  delete groups.path2;
  return groups;
};
var parseUri2 = createParser2(new RegExp(uri2), 'URI');
var parseUriReference2 = createParser2(new RegExp(uriReference2), 'URI-reference');
var parseAbsoluteUri2 = createParser2(new RegExp(absoluteUri2), 'absolute-URI');
var parseIri2 = createParser2(new RegExp(iri2, 'u'), 'IRI');
var parseIriReference2 = createParser2(new RegExp(iriReference2, 'u'), 'IRI-reference');
var parseAbsoluteIri2 = createParser2(new RegExp(absoluteIri2, 'u'), 'absolute-IRI');
var strategies2 = {
  uri: {
    parseAbsolute: parseAbsoluteUri2,
    parseReference: parseUriReference2,
    parse: parseUri2,
    normalizePath: normalizePath2(isAllowedUnescapedInPath2),
    normalizeQuery: normalizeQuery2(isAllowedUnescapedInQuery2),
    normalizeFragment: normalizeQuery2(isAllowedUnescapedInQuery2),
  },
  iri: {
    parseAbsolute: parseAbsoluteIri2,
    parseReference: parseIriReference2,
    parse: parseIri2,
    normalizePath: normalizePath2(isAllowedUnescapedInIPath2),
    normalizeQuery: normalizeQuery2(isAllowedUnescapedInIQuery2),
    normalizeFragment: normalizeQuery2(isAllowedUnescapedInIQuery2),
  },
};
var toAbsolute2 = (strategy) => (identifier) => {
  const components = strategy.parse(identifier);
  delete components.fragment;
  return composeIdentifier2(strategy, components);
};
var toAbsoluteUri3 = toAbsolute2(strategies2.uri);
var toAbsoluteIri2 = toAbsolute2(strategies2.iri);
var normalize2 = (strategy) => (identifier) => {
  const components = strategy.parse(identifier);
  return composeIdentifier2(strategy, components);
};
var normalizeUri2 = normalize2(strategies2.uri);
var normalizeIri2 = normalize2(strategies2.iri);
var resolveUri2 = resolveReference2(strategies2.uri);
var resolveIri2 = resolveReference2(strategies2.iri);
var toRelative2 = (strategy) => (uri4, relativeTo) => {
  const fromUri = strategy.parseAbsolute(uri4);
  const toUri = strategy.parse(relativeTo);
  if (toUri.scheme !== fromUri.scheme) {
    return relativeTo;
  }
  if (toUri.authority !== fromUri.authority) {
    return relativeTo;
  }
  let result;
  if (fromUri.path === toUri.path) {
    result = '';
  } else {
    const fromSegments = fromUri.path.split('/');
    const toSegments = toUri.path.split('/');
    let position = 0;
    while (
      fromSegments[position] === toSegments[position] &&
      position < fromSegments.length - 1 &&
      position < toSegments.length - 1
    ) {
      position++;
    }
    const segments = [];
    for (let index = position + 1; index < fromSegments.length; index++) {
      segments.push('..');
    }
    for (let index = position; index < toSegments.length; index++) {
      segments.push(toSegments[index]);
    }
    result = segments.join('/');
  }
  if (toUri.query !== void 0) {
    result += `?${toUri.query}`;
  }
  if (toUri.fragment !== void 0) {
    result += `#${toUri.fragment}`;
  }
  return result;
};
var toRelativeUri2 = toRelative2(strategies2.uri);
var toRelativeIri2 = toRelative2(strategies2.iri);

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/uri-schemes/uri-schemes.js
var uriSchemePlugins = {};
var addUriSchemePlugin = (scheme3, plugin5) => {
  uriSchemePlugins[scheme3] = plugin5;
};
var retrieve = (uri4, baseUri) => {
  uri4 = resolveIri2(uri4, baseUri);
  const { scheme: scheme3 } = parseIri2(uri4);
  if (!(scheme3 in uriSchemePlugins)) {
    throw new UnsupportedUriSchemeError(
      scheme3,
      `The '${scheme3}:' URI scheme is not supported. Use the 'addUriSchemePlugin' function to add support for '${scheme3}:' URIs.`,
    );
  }
  return uriSchemePlugins[scheme3].retrieve(uri4, baseUri);
};
var UnsupportedUriSchemeError = class extends Error {
  constructor(scheme3, message = void 0) {
    super(message);
    this.name = this.constructor.name;
    this.scheme = scheme3;
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/uri-schemes/http-scheme-plugin.js
var successStatus = /* @__PURE__ */ new Set([200, 203]);
var retrieve2 = async (uri4) => {
  const response = await fetch(uri4, { headers: { Accept: acceptableMediaTypes() } });
  if (response.status >= 400) {
    throw new HttpError(response, `Failed to retrieve '${uri4}'`);
  }
  if (!successStatus.has(response.status)) {
    throw new HttpError(response, 'Unsupported HTTP response status code');
  }
  return response;
};
var httpSchemePlugin = { retrieve: retrieve2 };
var HttpError = class extends Error {
  constructor(response, message = void 0) {
    super(`${response.status} ${response.statusText}${message ? ` -- ${message}` : ''}`);
    this.name = this.constructor.name;
    this.response = response;
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/uri-schemes/file-scheme-plugin.js
import { createReadStream } from 'node:fs';
import { readlink, lstat } from 'node:fs/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';
var retrieve3 = async (uri4, baseUri) => {
  const { scheme: scheme3 } = parseIri2(baseUri);
  if (baseUri) {
    if (scheme3 !== 'file') {
      throw Error(`Accessing a file (${uri4}) from a non-filesystem document (${baseUri}) is not allowed`);
    }
  }
  let responseUri = toAbsoluteIri2(uri4);
  const filePath = fileURLToPath(uri4);
  const stats = await lstat(filePath);
  if (stats.isSymbolicLink()) {
    responseUri = pathToFileURL(await readlink(filePath)).toString();
  }
  const contentType = await getFileMediaType(responseUri);
  const stream = createReadStream(filePath);
  const response = new Response(stream, {
    headers: { 'Content-Type': contentType },
  });
  Object.defineProperty(response, 'url', { value: responseUri });
  return response;
};
var fileSchemePlugin = { retrieve: retrieve3 };

// ../../node_modules/.pnpm/just-curry-it@5.3.0/node_modules/just-curry-it/index.mjs
var functionCurry = curry;
function curry(fn, arity) {
  return function curried() {
    if (arity == null) {
      arity = fn.length;
    }
    var args = [].slice.call(arguments);
    if (args.length >= arity) {
      return fn.apply(this, args);
    } else {
      return function () {
        return curried.apply(this, args.concat([].slice.call(arguments)));
      };
    }
  };
}

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/browser/context-uri.js
import { cwd } from 'node:process';
import { pathToFileURL as pathToFileURL2 } from 'node:url';
var contextUri = () => pathToFileURL2(cwd()) + '/';

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/browser/browser.js
var get2 = async (uri4, browser = { _cache: {} }) => {
  const baseUri = browser.document?.baseUri ?? contextUri();
  uri4 = resolveIri2(uri4, baseUri);
  const id62 = toAbsoluteIri2(uri4);
  const { fragment: fragment3 } = parseIri2(uri4);
  const cachedDocument = browser._cache[id62] ?? browser.document?.embedded?.[id62];
  if (cachedDocument) {
    browser.document = cachedDocument;
    browser.uri = uri4;
    browser.cursor = browser.document.anchorLocation(fragment3);
  } else {
    try {
      const response = await retrieve(uri4, baseUri);
      browser.document = await parseResponse(response);
      browser.uri = response.url + (fragment3 === void 0 ? '' : `#${fragment3}`);
      browser.cursor = browser.document.anchorLocation(fragment3);
    } catch (error) {
      const referencedMessage = browser.uri ? ` Referenced from '${browser.uri}'.` : '';
      throw new RetrievalError(`Unable to load resource '${uri4}'.${referencedMessage}`, error);
    }
    browser._cache[id62] = browser.document;
  }
  browser._value = get(browser.cursor, browser.document.root);
  return followReferences(browser);
};
var followReferences = (browser) =>
  jrefTypeOf(value(browser)) === 'reference' ? get2(value(browser).href, browser) : browser;
var value = (browser) => browser._value;
var typeOf = (browser) => jrefTypeOf(browser._value);
var has = (key, browser) => key in browser._value;
var length = (browser) => browser._value.length;
var step = functionCurry((key, browser) => {
  return followReferences({
    ...browser,
    cursor: append(`${key}`, browser.cursor),
    _value: browser._value[key],
  });
});
var iter = async function* (browser) {
  for (let index = 0; index < value(browser).length; index++) {
    yield step(index, browser);
  }
};
var keys = function* (browser) {
  for (const key in value(browser)) {
    yield key;
  }
};
var values = async function* (browser) {
  for (const key in value(browser)) {
    yield step(key, browser);
  }
};
var entries = async function* (browser) {
  for (const key in value(browser)) {
    yield [key, await step(key, browser)];
  }
};
var RetrievalError = class extends Error {
  constructor(message, cause) {
    super(message, { cause });
    this.name = this.constructor.name;
  }
};

// ../../node_modules/.pnpm/@hyperjump+browser@1.3.1/node_modules/@hyperjump/browser/lib/index.js
addMediaTypePlugin('application/reference+json', jrefMediaTypePlugin);
addUriSchemePlugin('http', httpSchemePlugin);
addUriSchemePlugin('https', httpSchemePlugin);
addUriSchemePlugin('file', fileSchemePlugin);

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/schema.js
var import_content_type2 = __toESM(require_content_type(), 1);
var schemaPlugin = {
  parse: async (response) => {
    const contentType = import_content_type2.default.parse(response.headers.get('content-type') ?? '');
    const contextDialectId = contentType.parameters.schema ?? contentType.parameters.profile;
    return buildSchemaDocument(await response.json(), response.url, contextDialectId);
  },
  fileMatcher: async (path6) => /(\.|\/)schema\.json$/.test(path6),
};
var schemaRegistry = {};
var getSchema = async (uri4, browser = void 0) => {
  if (!browser) {
    browser = { _cache: {} };
  }
  for (const uri5 in schemaRegistry) {
    if (!(uri5 in browser._cache)) {
      browser._cache[uri5] = schemaRegistry[uri5];
    }
  }
  const schema = await get2(uri4, { ...browser });
  if (typeof schema.document.dialectId !== 'string') {
    throw Error(`The document at ${schema.document.baseUri} is not a schema.`);
  }
  return schema;
};
var registerSchema = (schema, retrievalUri, contextDialectId) => {
  schema = structuredClone(schema);
  const document = buildSchemaDocument(schema, retrievalUri, contextDialectId);
  if (document.baseUri in schemaRegistry) {
    throw Error(
      `A schema has already been registered for '${document.baseUri}. You can use 'unregisterSchema' to remove the old schema before registering the new one.`,
    );
  }
  if (document.baseUri.startsWith('file:')) {
    throw Error(`Registering a schema with a 'file:' URI scheme is not allowed: ${document.baseUri}`);
  }
  schemaRegistry[retrievalUri ? toAbsoluteIri(retrievalUri) : document.baseUri] = document;
};
var buildSchemaDocument = (schema, id62, dialectId, embedded = {}) => {
  if (typeof schema.$schema === 'string') {
    dialectId = schema.$schema;
    delete schema.$schema;
  }
  if (!dialectId) {
    throw Error(
      "Unable to determine a dialect for the schema. The dialect can be declared in a number of ways, but the recommended way is to use the '$schema' keyword in your schema.",
    );
  }
  dialectId = toAbsoluteIri(dialectId);
  const legacyIdToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/draft-04/id');
  const idToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/id') || legacyIdToken;
  if (!schema[idToken] && !id62) {
    throw Error(
      `Unable to determine an identifier for the schema. Use the '${idToken}' keyword or pass a retrievalUri when loading the schema.`,
    );
  }
  const resolvedId = resolveIri(schema[idToken] ?? '', id62 ?? '');
  id62 = toAbsoluteIri(resolvedId);
  if (legacyIdToken && resolvedId.length > id62.length) {
    schema[idToken] = '#' + uriFragment(resolvedId);
  } else {
    delete schema[idToken];
  }
  const vocabularyToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/vocabulary');
  if (jsonTypeOf(schema[vocabularyToken]) === 'object') {
    const allowUnknownKeywords =
      schema[vocabularyToken]['https://json-schema.org/draft/2019-09/vocab/core'] ||
      schema[vocabularyToken]['https://json-schema.org/draft/2020-12/vocab/core'];
    loadDialect(id62, schema[vocabularyToken], allowUnknownKeywords, false);
    delete schema[vocabularyToken];
  }
  const anchors = { '': '' };
  const dynamicAnchors = {};
  const recursiveAnchorToken = getKeywordName(
    dialectId,
    'https://json-schema.org/keyword/draft-2019-09/recursiveAnchor',
  );
  if (schema[recursiveAnchorToken] === true) {
    dynamicAnchors[''] = `${id62}#`;
  }
  delete schema[recursiveAnchorToken];
  embedded[id62] = {
    baseUri: id62,
    dialectId,
    root: processSchema(schema, id62, dialectId, '', embedded, anchors, dynamicAnchors),
    anchorLocation: (fragment3) => {
      if (fragment3 === void 0) {
        return '';
      }
      fragment3 = decodeURI(fragment3);
      if (fragment3[0] === '/') {
        return fragment3;
      } else if (!(fragment3 in anchors)) {
        throw Error(`No such anchor '${id62}#${encodeURI(fragment3)}'`);
      } else {
        return anchors[fragment3];
      }
    },
    anchors,
    dynamicAnchors,
    embedded,
  };
  return embedded[id62];
};
var processSchema = (json, id62, dialectId, cursor, embedded, anchors, dynamicAnchors) => {
  if (jsonTypeOf(json) === 'object') {
    const embeddedDialectId = typeof json.$schema === 'string' ? toAbsoluteIri(json.$schema) : dialectId;
    const idToken = getKeywordName(embeddedDialectId, 'https://json-schema.org/keyword/id');
    if (typeof json[idToken] === 'string') {
      const embeddedId = toAbsoluteIri(resolveIri(json[idToken], id62));
      json[idToken] = embeddedId;
      embedded[embeddedId] = buildSchemaDocument(json, embeddedId, embeddedDialectId, embedded);
      return new Reference(embeddedId, {});
    }
    const legacyIdToken = getKeywordName(embeddedDialectId, 'https://json-schema.org/keyword/draft-04/id');
    if (typeof json[legacyIdToken] === 'string') {
      if (json[legacyIdToken][0] === '#') {
        const anchor = decodeURIComponent(json[legacyIdToken].slice(1));
        anchors[anchor] = cursor;
        delete json[legacyIdToken];
      } else {
        const embeddedId = toAbsoluteIri(resolveIri(json[legacyIdToken], id62));
        json[legacyIdToken] = embeddedId;
        embedded[embeddedId] = buildSchemaDocument(json, embeddedId, embeddedDialectId, embedded);
        return new Reference(embeddedId, {});
      }
    }
    const jrefToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/draft-04/ref');
    if (typeof json[jrefToken] === 'string') {
      return new Reference(json[jrefToken], json);
    }
    const anchorToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/anchor');
    if (typeof json[anchorToken] === 'string') {
      anchors[json[anchorToken]] = cursor;
      delete json[anchorToken];
    }
    const dynamicAnchorToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/dynamicAnchor');
    if (typeof json[dynamicAnchorToken] === 'string') {
      dynamicAnchors[json[dynamicAnchorToken]] = `${id62}#${encodeURI(cursor)}`;
      delete json[dynamicAnchorToken];
    }
    const legacyDynamicAnchorToken = getKeywordName(
      dialectId,
      'https://json-schema.org/keyword/draft-2020-12/dynamicAnchor',
    );
    if (typeof json[legacyDynamicAnchorToken] === 'string') {
      dynamicAnchors[json[legacyDynamicAnchorToken]] = `${id62}#${encodeURI(cursor)}`;
      anchors[json[legacyDynamicAnchorToken]] = cursor;
      delete json[legacyDynamicAnchorToken];
    }
    for (const key in json) {
      const referenceToken = getKeywordName(dialectId, 'https://json-schema.org/keyword/ref');
      if (key === referenceToken && typeof json[key] === 'string') {
        json[key] = new Reference(json[key], json[key]);
      } else {
        json[key] = processSchema(json[key], id62, dialectId, append(key, cursor), embedded, anchors, dynamicAnchors);
      }
    }
  } else if (Array.isArray(json)) {
    for (let index = 0; index < json.length; index++) {
      json[index] = processSchema(
        json[index],
        id62,
        dialectId,
        append(index, cursor),
        embedded,
        anchors,
        dynamicAnchors,
      );
    }
  }
  return json;
};
var canonicalUri = (browser) => `${browser.document.baseUri}#${encodeURI(browser.cursor)}`;

// ../../node_modules/.pnpm/@hyperjump+pact@1.4.0/node_modules/@hyperjump/pact/src/curry.js
var curry2 =
  /** @type API.curry */
  (
    (fn) =>
      (...args) => {
        const firstApplication =
          fn.length === 1
            ? /** @type Extract<typeof fn, (a: any) => any> */
              fn(args[0])
            : fn(args[0], args[1]);
        const iterable =
          /** @type I */
          args[fn.length];
        return iterable === void 0 ? firstApplication : firstApplication(iterable);
      }
  );

// ../../node_modules/.pnpm/@hyperjump+pact@1.4.0/node_modules/@hyperjump/pact/src/index.js
var map = curry2(
  (fn) =>
    function* (iter3) {
      for (const n of iter3) {
        yield fn(n);
      }
    },
);
var asyncMap = curry2(
  (fn) =>
    async function* (iter3) {
      for await (const n of iter3) {
        yield fn(n);
      }
    },
);
var tap = curry2(
  (fn) =>
    function* (iter3) {
      for (const n of iter3) {
        fn(n);
        yield n;
      }
    },
);
var asyncTap = curry2(
  (fn) =>
    async function* (iter3) {
      for await (const n of iter3) {
        await fn(n);
        yield n;
      }
    },
);
var filter = curry2(
  (fn) =>
    function* (iter3) {
      for (const n of iter3) {
        if (fn(n)) {
          yield n;
        }
      }
    },
);
var asyncFilter = curry2(
  (fn) =>
    async function* (iter3) {
      for await (const n of iter3) {
        if (await fn(n)) {
          yield n;
        }
      }
    },
);
var scan =
  /** @type API.scan */
  curry2(
    // eslint-disable-next-line @stylistic/no-extra-parens
    /** @type API.scan */
    (
      (fn, acc) =>
        function* (iter3) {
          for (const item of iter3) {
            acc = fn(
              acc,
              /** @type any */
              item,
            );
            yield acc;
          }
        }
    ),
  );
var asyncScan =
  /** @type API.asyncScan */
  curry2(
    // eslint-disable-next-line @stylistic/no-extra-parens
    /** @type API.asyncScan */
    (
      (fn, acc) =>
        async function* (iter3) {
          for await (const item of iter3) {
            acc = await fn(
              acc,
              /** @type any */
              item,
            );
            yield acc;
          }
        }
    ),
  );
var drop = curry2(
  (count) =>
    function* (iter3) {
      let index = 0;
      for (const item of iter3) {
        if (index++ >= count) {
          yield item;
        }
      }
    },
);
var asyncDrop = curry2(
  (count) =>
    async function* (iter3) {
      let index = 0;
      for await (const item of iter3) {
        if (index++ >= count) {
          yield item;
        }
      }
    },
);
var dropWhile = curry2(
  (fn) =>
    function* (iter3) {
      let dropping = true;
      for (const n of iter3) {
        if (dropping) {
          if (fn(n)) {
            continue;
          } else {
            dropping = false;
          }
        }
        yield n;
      }
    },
);
var asyncDropWhile = curry2(
  (fn) =>
    async function* (iter3) {
      let dropping = true;
      for await (const n of iter3) {
        if (dropping) {
          if (await fn(n)) {
            continue;
          } else {
            dropping = false;
          }
        }
        yield n;
      }
    },
);
var take = curry2(
  (count) =>
    function* (iter3) {
      const iterator = getIterator(iter3);
      let current;
      while (count-- > 0 && !(current = iterator.next())?.done) {
        yield current.value;
      }
    },
);
var asyncTake = curry2(
  (count) =>
    async function* (iter3) {
      const iterator = getAsyncIterator(iter3);
      let current;
      while (count-- > 0 && !(current = await iterator.next())?.done) {
        yield current.value;
      }
    },
);
var takeWhile = curry2(
  (fn) =>
    function* (iter3) {
      for (const n of iter3) {
        if (fn(n)) {
          yield n;
        } else {
          break;
        }
      }
    },
);
var asyncTakeWhile = curry2(
  (fn) =>
    async function* (iter3) {
      for await (const n of iter3) {
        if (await fn(n)) {
          yield n;
        } else {
          break;
        }
      }
    },
);
var head = (iter3) => {
  const iterator = getIterator(iter3);
  const result = iterator.next();
  return result.done ? void 0 : result.value;
};
var asyncHead = async (iter3) => {
  const iterator = getAsyncIterator(iter3);
  const result = await iterator.next();
  return result.done ? void 0 : result.value;
};
var empty = function* () {};
var zip = function* (a, b) {
  const bIter = getIterator(b);
  for (const item1 of a) {
    yield [item1, bIter.next().value];
  }
};
var concat = function* (...iters) {
  for (const iter3 of iters) {
    yield* iter3;
  }
};
var reduce =
  /** @type API.reduce */
  curry2(
    // eslint-disable-next-line @stylistic/no-extra-parens
    /** @type API.reduce */
    (
      (fn, acc) => (iter3) => {
        for (const item of iter3) {
          acc = fn(
            acc,
            /** @type any */
            item,
          );
        }
        return acc;
      }
    ),
  );
var asyncReduce =
  /** @type API.asyncReduce */
  curry2(
    // eslint-disable-next-line @stylistic/no-extra-parens
    /** @type API.asyncReduce */
    (
      (fn, acc) => async (iter3) => {
        for await (const item of iter3) {
          acc = await fn(
            acc,
            /** @type any */
            item,
          );
        }
        return acc;
      }
    ),
  );
var every = curry2((fn) => (iter3) => {
  for (const item of iter3) {
    if (!fn(item)) {
      return false;
    }
  }
  return true;
});
var asyncEvery = curry2((fn) => async (iter3) => {
  for await (const item of iter3) {
    if (!(await fn(item))) {
      return false;
    }
  }
  return true;
});
var some = curry2((fn) => (iter3) => {
  for (const item of iter3) {
    if (fn(item)) {
      return true;
    }
  }
  return false;
});
var asyncSome = curry2((fn) => async (iter3) => {
  for await (const item of iter3) {
    if (await fn(item)) {
      return true;
    }
  }
  return false;
});
var find = curry2((fn) => (iter3) => {
  for (const item of iter3) {
    if (fn(item)) {
      return item;
    }
  }
});
var asyncFind = curry2((fn) => async (iter3) => {
  for await (const item of iter3) {
    if (await fn(item)) {
      return item;
    }
  }
});
var asyncCollectArray = async (iter3) => {
  const result = [];
  for await (const item of iter3) {
    result.push(item);
  }
  return result;
};
var asyncCollectObject = async (iter3) => {
  const result = /* @__PURE__ */ Object.create(null);
  for await (const [key, value3] of iter3) {
    result[key] = value3;
  }
  return result;
};
var join = curry2((separator) => (iter3) => {
  let result = head(iter3) ?? '';
  for (const n of iter3) {
    result += separator + n;
  }
  return result;
});
var asyncJoin = curry2((separator) => async (iter3) => {
  let result = (await asyncHead(iter3)) ?? '';
  for await (const n of iter3) {
    result += separator + n;
  }
  return result;
});
var getIterator = (iter3) => {
  if (typeof iter3?.[Symbol.iterator] === 'function') {
    return iter3[Symbol.iterator]();
  } else {
    throw TypeError('`iter` is not iterable');
  }
};
var getAsyncIterator = (iter3) => {
  if (Symbol.asyncIterator in iter3 && typeof iter3[Symbol.asyncIterator] === 'function') {
    return iter3[Symbol.asyncIterator]();
  } else if (Symbol.iterator in iter3 && typeof iter3[Symbol.iterator] === 'function') {
    return asyncMap((a) => a, iter3);
  } else {
    throw TypeError('`iter` is not iterable');
  }
};
var pipe =
  /** @type (acc: any, ...fns: ((a: any) => any)[]) => any */
  (
    (acc, ...fns) => {
      return reduce((acc2, fn) => fn(acc2), acc, fns);
    }
  );

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/instance.js
var fromJs = (value3, uri4 = '', pointer = '', parent = void 0) => {
  const jsType = typeof value3;
  switch (jsType) {
    case 'number':
    case 'string':
    case 'boolean':
      return cons(uri4, pointer, value3, jsType, [], parent);
    case 'object':
      if (value3 === null) {
        return cons(uri4, pointer, value3, 'null', [], parent);
      } else if (Array.isArray(value3)) {
        const arrayNode = cons(uri4, pointer, value3, 'array', [], parent);
        arrayNode.children = value3.map((item, index) => {
          return fromJs(item, uri4, append(index, pointer), arrayNode);
        });
        return arrayNode;
      } else if (Object.getPrototypeOf(value3) === Object.prototype) {
        const objectNode = cons(uri4, pointer, value3, 'object', [], parent);
        objectNode.children = Object.entries(value3).map((entry) => {
          const propertyPointer = append(entry[0], pointer);
          const propertyNode = cons(uri4, propertyPointer, void 0, 'property', [], objectNode);
          propertyNode.children[0] = fromJs(entry[0], uri4, '*' + propertyPointer, propertyNode);
          propertyNode.children[1] = fromJs(entry[1], uri4, propertyPointer, propertyNode);
          return propertyNode;
        });
        return objectNode;
      } else if (value3 instanceof Reference) {
        return fromJs(value3.toJSON(), uri4, pointer, parent);
      }
    default: {
      const type = jsType === 'object' ? Object.getPrototypeOf(value3).constructor.name || 'anonymous' : jsType;
      throw Error(`Not a JSON compatible type: ${type}`);
    }
  }
};
var cons = (baseUri, pointer, value3, type, children, parent) => {
  const node = {
    baseUri: baseUri ? toAbsoluteIri(baseUri) : '',
    pointer,
    value: value3,
    type,
    children,
    parent,
    annotations: {},
  };
  node.root = parent?.root ?? node;
  return node;
};
var uri3 = (node) => `${node.baseUri}#${encodeURI(node.pointer)}`;
var value2 = (node) => node.value;
var typeOf2 = (node) => node.type;
var has2 = (key, node) => key in node.value;
var iter2 = function* (node) {
  if (node.type !== 'array') {
    return;
  }
  yield* node.children;
};
var keys2 = function* (node) {
  if (node.type !== 'object') {
    return;
  }
  for (const property of node.children) {
    yield property.children[0];
  }
};
var entries2 = function* (node) {
  if (node.type !== 'object') {
    return;
  }
  for (const property of node.children) {
    if (property.children.length === 2) {
      yield property.children;
    }
  }
};
var length2 = (node) => {
  if (node.type !== 'array') {
    return;
  }
  return node.children.length;
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/pubsub.js
var subscriptions = {};
var uid = 0;
var subscribe = (message, fn) => {
  if (!(message in subscriptions)) {
    subscriptions[message] = {};
  }
  const subscriptionId = `pubsub_subscription_${uid++}`;
  subscriptions[message][subscriptionId] = fn;
  return subscriptionId;
};
var publishAsync = async (message, data) => {
  const promises = [];
  if (message in subscriptions) {
    for (const subscriptionId in subscriptions[message]) {
      promises.push(subscriptions[message][subscriptionId](message, data));
    }
  }
  await Promise.all(promises);
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/configuration.js
var metaSchemaOutputFormat;
var getMetaSchemaOutputFormat = () => metaSchemaOutputFormat;
var setMetaSchemaOutputFormat = (format) => {
  metaSchemaOutputFormat = format;
};
var shouldValidateSchema = true;
var getShouldValidateSchema = () => shouldValidateSchema;
var shouldValidateFormat;
var getShouldValidateFormat = () => shouldValidateFormat;

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/invalid-schema-error.js
var InvalidSchemaError = class extends Error {
  constructor(output) {
    super('Invalid Schema');
    this.name = this.constructor.name;
    this.output = output;
  }
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/validation.js
var id = 'https://json-schema.org/evaluation/validate';
var compile = async (schema, ast) => {
  await publishAsync('validate.metaValidate', schema);
  if (!(schema.document.baseUri in ast.metaData)) {
    ast.metaData[schema.document.baseUri] = {
      dynamicAnchors: schema.document.dynamicAnchors,
    };
  }
  const url = canonicalUri(schema);
  if (!(url in ast)) {
    ast[url] = false;
    const schemaValue = value(schema);
    if (!['object', 'boolean'].includes(typeof schemaValue)) {
      throw Error(`No schema found at '${url}'`);
    }
    if (typeof schemaValue === 'boolean') {
      ast[url] = schemaValue;
    } else {
      ast[url] = await pipe(
        entries(schema),
        asyncMap(async ([keyword, keywordSchema]) => {
          const keywordHandler = getKeywordByName(keyword, schema.document.dialectId);
          if (keywordHandler.plugin) {
            ast.plugins.add(keywordHandler.plugin);
          }
          const keywordAst = await keywordHandler.compile(keywordSchema, ast, schema);
          return [keywordHandler.id, append(keyword, canonicalUri(schema)), keywordAst];
        }),
        asyncCollectArray,
      );
      ast[url].sort(keywordComparator);
    }
  }
  return url;
};
var lastKeywords = /* @__PURE__ */ new Set([
  'https://json-schema.org/keyword/unevaluatedProperties',
  'https://json-schema.org/keyword/unevaluatedItems',
]);
var keywordComparator = (_a, b) => (lastKeywords.has(b[0]) ? -1 : 1);
var interpret = (url, instance, context) => {
  let valid = true;
  for (const plugin5 of context.plugins) {
    plugin5.beforeSchema?.(url, instance, context);
  }
  if (typeof context.ast[url] === 'boolean') {
    valid = context.ast[url];
  } else {
    for (const node of context.ast[url]) {
      const [keywordId, , keywordValue] = node;
      const keyword = getKeyword(keywordId);
      const keywordContext = {
        ast: context.ast,
        plugins: context.plugins,
      };
      for (const plugin5 of context.plugins) {
        plugin5.beforeKeyword?.(node, instance, keywordContext, context, keyword);
      }
      const isKeywordValid = keyword.interpret(keywordValue, instance, keywordContext);
      if (!isKeywordValid) {
        valid = false;
      }
      for (const plugin5 of context.plugins) {
        plugin5.afterKeyword?.(node, instance, keywordContext, isKeywordValid, context, keyword);
      }
    }
  }
  for (const plugin5 of context.plugins) {
    plugin5.afterSchema?.(url, instance, context, valid);
  }
  return valid;
};
var validation_default = { id, compile, interpret };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/evaluation-plugins/basic-output.js
var BasicOutputPlugin = class {
  beforeSchema(_url, _intance, context) {
    context.errors ??= [];
  }
  beforeKeyword(_node, _instance, context) {
    context.errors = [];
  }
  afterKeyword(node, instance, context, valid, schemaContext, keyword) {
    if (!valid) {
      if (!keyword.simpleApplicator) {
        const [keywordId, schemaUri] = node;
        schemaContext.errors.push({
          keyword: keywordId,
          absoluteKeywordLocation: schemaUri,
          instanceLocation: uri3(instance),
        });
      }
      schemaContext.errors.push(...context.errors);
    }
  }
  afterSchema(url, instance, context, valid) {
    if (typeof context.ast[url] === 'boolean' && !valid) {
      context.errors.push({
        keyword: validation_default.id,
        absoluteKeywordLocation: url,
        instanceLocation: uri3(instance),
      });
    }
    this.errors = context.errors;
  }
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/evaluation-plugins/detailed-output.js
var DetailedOutputPlugin = class {
  beforeSchema(_url, _instance, context) {
    context.errors ??= [];
  }
  beforeKeyword(_node, _instance, context) {
    context.errors = [];
  }
  afterKeyword(node, instance, context, valid, schemaContext) {
    if (!valid) {
      const [keywordId, schemaUri] = node;
      const outputUnit = {
        keyword: keywordId,
        absoluteKeywordLocation: schemaUri,
        instanceLocation: uri3(instance),
      };
      schemaContext.errors.push(outputUnit);
      if (context.errors.length > 0) {
        outputUnit.errors = context.errors;
      }
    }
  }
  afterSchema(url, instance, context, valid) {
    if (typeof context.ast[url] === 'boolean' && !valid) {
      context.errors.push({
        keyword: validation_default.id,
        absoluteKeywordLocation: url,
        instanceLocation: uri3(instance),
      });
    }
    this.errors = context.errors;
  }
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/core.js
var FLAG = 'FLAG';
var BASIC = 'BASIC';
var DETAILED = 'DETAILED';
setMetaSchemaOutputFormat(FLAG);
var validate = async (url, value3 = void 0, options = void 0) => {
  const schema = await getSchema(url);
  const compiled = await compile2(schema);
  const interpretAst = (value4, options2) => interpret2(compiled, fromJs(value4), options2);
  return value3 === void 0 ? interpretAst : interpretAst(value3, options);
};
var compile2 = async (schema) => {
  const ast = { metaData: {}, plugins: /* @__PURE__ */ new Set() };
  const schemaUri = await validation_default.compile(schema, ast);
  return { ast, schemaUri };
};
var interpret2 = functionCurry(({ ast, schemaUri }, instance, options = FLAG) => {
  const outputFormat = typeof options === 'string' ? options : (options.outputFormat ?? FLAG);
  const plugins = options.plugins ?? [];
  const context = { ast, plugins: [...ast.plugins, ...plugins] };
  let outputPlugin;
  switch (outputFormat) {
    case FLAG:
      break;
    case BASIC:
      outputPlugin = new BasicOutputPlugin();
      context.plugins.push(outputPlugin);
      break;
    case DETAILED:
      outputPlugin = new DetailedOutputPlugin();
      context.plugins.push(outputPlugin);
      break;
    default:
      throw Error(`Unsupported output format '${outputFormat}'`);
  }
  const valid = validation_default.interpret(schemaUri, instance, context);
  return !valid && outputPlugin ? { valid, errors: outputPlugin.errors } : { valid };
});
var metaValidators = {};
subscribe('validate.metaValidate', async (_message, schema) => {
  if (getShouldValidateSchema() && !schema.document.validated) {
    schema.document.validated = true;
    if (!(schema.document.dialectId in metaValidators)) {
      const metaSchema = await getSchema(schema.document.dialectId, schema);
      const compiledSchema = await compile2(metaSchema);
      metaValidators[schema.document.dialectId] = interpret2(compiledSchema);
    }
    const schemaInstance = fromJs(schema.document.root, schema.document.baseUri);
    const metaResults = metaValidators[schema.document.dialectId](schemaInstance, getMetaSchemaOutputFormat());
    if (!metaResults.valid) {
      throw new InvalidSchemaError(metaResults);
    }
  }
});

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/additionalProperties.js
var id2 = 'https://json-schema.org/keyword/additionalProperties';
var compile3 = async (schema, ast, parentSchema) => {
  const propertiesKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/properties');
  const propertiesSchema = await step(propertiesKeyword, parentSchema);
  const propertyPatterns =
    typeOf(propertiesSchema) === 'object'
      ? map((propertyName) => '^' + regexEscape(propertyName) + '$', keys(propertiesSchema))
      : empty();
  const patternPropertiesKeyword = getKeywordName(
    schema.document.dialectId,
    'https://json-schema.org/keyword/patternProperties',
  );
  const patternProperties = await step(patternPropertiesKeyword, parentSchema);
  const patternPropertyPatterns = typeOf(patternProperties) === 'object' ? keys(patternProperties) : empty();
  const pattern = pipe(concat(propertyPatterns, patternPropertyPatterns), join('|')) || '(?!)';
  return [new RegExp(pattern, 'u'), await validation_default.compile(schema, ast)];
};
var regexEscape = (string) => string.replace(/[|\\{}()[\]^$+*?.]/g, '\\$&').replace(/-/g, '\\x2d');
var interpret3 = ([isDefinedProperty, additionalProperties], instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const [propertyNameNode, property] of entries2(instance)) {
    const propertyName = value2(propertyNameNode);
    if (isDefinedProperty.test(propertyName)) {
      continue;
    }
    if (!validation_default.interpret(additionalProperties, property, context)) {
      isValid = false;
    }
    context.evaluatedProperties?.add(propertyName);
  }
  return isValid;
};
var simpleApplicator = true;
var additionalProperties_default = { id: id2, compile: compile3, interpret: interpret3, simpleApplicator };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/allOf.js
var id3 = 'https://json-schema.org/keyword/allOf';
var compile4 = (schema, ast) =>
  pipe(
    iter(schema),
    asyncMap((itemSchema) => validation_default.compile(itemSchema, ast)),
    asyncCollectArray,
  );
var interpret4 = (allOf, instance, ast, dynamicAnchors, quiet) => {
  let isValid = true;
  for (const schemaUri of allOf) {
    if (!validation_default.interpret(schemaUri, instance, ast, dynamicAnchors, quiet)) {
      isValid = false;
    }
  }
  return isValid;
};
var simpleApplicator2 = true;
var allOf_default = { id: id3, compile: compile4, interpret: interpret4, simpleApplicator: simpleApplicator2 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/anchor.js
var anchor_default = { id: 'https://json-schema.org/keyword/anchor' };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/anyOf.js
var id4 = 'https://json-schema.org/keyword/anyOf';
var compile5 = (schema, ast) =>
  pipe(
    iter(schema),
    asyncMap((itemSchema) => validation_default.compile(itemSchema, ast)),
    asyncCollectArray,
  );
var interpret5 = (anyOf, instance, ast, dynamicAnchors, quiet) => {
  const matches = anyOf.filter((schemaUrl) =>
    validation_default.interpret(schemaUrl, instance, ast, dynamicAnchors, quiet),
  );
  return matches.length > 0;
};
var anyOf_default = { id: id4, compile: compile5, interpret: interpret5 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/conditional.js
var id5 = 'https://json-schema.org/keyword/conditional';
var compile6 = (schema, ast) =>
  pipe(
    iter(schema),
    schemaFlatten,
    asyncMap((subSchema) => validation_default.compile(subSchema, ast)),
    asyncCollectArray,
  );
var interpret6 = (conditional, instance, context) => {
  for (let index = 0; index < conditional.length; index += 2) {
    const isValid = validation_default.interpret(conditional[index], instance, context);
    if (index + 1 === conditional.length) {
      return isValid;
    } else if (isValid) {
      return validation_default.interpret(conditional[index + 1], instance, context);
    }
  }
  return true;
};
var schemaFlatten = async function* (iter3, depth = 1) {
  for await (const n of iter3) {
    if (depth > 0 && typeOf(n) === 'array') {
      yield* schemaFlatten(iter(n), depth - 1);
    } else {
      yield n;
    }
  }
};
var conditional_default = { id: id5, compile: compile6, interpret: interpret6 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/const.js
var import_json_stringify_deterministic = __toESM(require_lib(), 1);
var id6 = 'https://json-schema.org/keyword/const';
var compile7 = (schema) => (0, import_json_stringify_deterministic.default)(value(schema));
var interpret7 = (const_, instance) => (0, import_json_stringify_deterministic.default)(value2(instance)) === const_;
var const_default = { id: id6, compile: compile7, interpret: interpret7 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/contains.js
var id7 = 'https://json-schema.org/keyword/contains';
var compile8 = async (schema, ast, parentSchema) => {
  const contains = await validation_default.compile(schema, ast);
  const minContainsKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/minContains');
  const minContainsSchema = await step(minContainsKeyword, parentSchema);
  const minContains = typeOf(minContainsSchema) === 'number' ? value(minContainsSchema) : 1;
  const maxContainsKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/maxContains');
  const maxContainsSchema = await step(maxContainsKeyword, parentSchema);
  const maxContains = typeOf(maxContainsSchema) === 'number' ? value(maxContainsSchema) : Number.MAX_SAFE_INTEGER;
  return { contains, minContains, maxContains };
};
var interpret8 = ({ contains, minContains, maxContains }, instance, context) => {
  if (typeOf2(instance) !== 'array') {
    return true;
  }
  let matches = 0;
  let index = 0;
  for (const item of iter2(instance)) {
    if (validation_default.interpret(contains, item, context)) {
      matches++;
      context.evaluatedItems?.add(index);
    }
    index++;
  }
  return matches >= minContains && matches <= maxContains;
};
var contains_default = { id: id7, compile: compile8, interpret: interpret8 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/comment.js
var id8 = 'https://json-schema.org/keyword/comment';
var compile9 = () => void 0;
var interpret9 = () => true;
var comment_default = { id: id8, compile: compile9, interpret: interpret9 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/contentEncoding.js
var id9 = 'https://json-schema.org/keyword/contentEncoding';
var compile10 = (schema) => value(schema);
var interpret10 = () => true;
var annotation = (contentEncoding, instance) => {
  if (typeOf2(instance) !== 'string') {
    return;
  }
  return contentEncoding;
};
var contentEncoding_default = { id: id9, compile: compile10, interpret: interpret10, annotation };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/contentMediaType.js
var id10 = 'https://json-schema.org/keyword/contentMediaType';
var compile11 = (schema) => value(schema);
var interpret11 = () => true;
var annotation2 = (contentMediaType, instance) => {
  if (typeOf2(instance) !== 'string') {
    return;
  }
  return contentMediaType;
};
var contentMediaType_default = { id: id10, compile: compile11, interpret: interpret11, annotation: annotation2 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/contentSchema.js
var id11 = 'https://json-schema.org/keyword/contentSchema';
var compile12 = async (contentSchema, _ast, parentSchema) => {
  const contentMediaTypeKeyword = getKeywordName(
    contentSchema.document.dialectId,
    'https://json-schema.org/keyword/contentMediaType',
  );
  const contentMediaType = await step(contentMediaTypeKeyword, parentSchema);
  if (value(contentMediaType) === void 0) {
    return;
  }
  return value(contentSchema);
};
var interpret12 = () => true;
var annotation3 = (contentSchema, instance) => {
  if (!contentSchema || typeOf2(instance) !== 'string') {
    return;
  }
  return contentSchema;
};
var contentSchema_default = { id: id11, compile: compile12, interpret: interpret12, annotation: annotation3 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/default.js
var id12 = 'https://json-schema.org/keyword/default';
var compile13 = (schema) => value(schema);
var interpret13 = () => true;
var annotation4 = (value3) => value3;
var default_default = { id: id12, compile: compile13, interpret: interpret13, annotation: annotation4 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/definitions.js
var id13 = 'https://json-schema.org/keyword/definitions';
var compile14 = (schema, ast) =>
  pipe(
    values(schema),
    asyncMap((definitionSchema) => validation_default.compile(definitionSchema, ast)),
    asyncCollectArray,
  );
var interpret14 = () => true;
var definitions_default = { id: id13, compile: compile14, interpret: interpret14 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/dependentRequired.js
var id14 = 'https://json-schema.org/keyword/dependentRequired';
var compile15 = (schema) =>
  pipe(
    entries(schema),
    asyncMap(([key, dependentRequired]) => [key, value(dependentRequired)]),
    asyncCollectArray,
  );
var interpret15 = (dependentRequired, instance) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const [propertyName, required] of dependentRequired) {
    if (has2(propertyName, instance) && !required.every((key) => has2(key, instance))) {
      isValid = false;
    }
  }
  return isValid;
};
var dependentRequired_default = { id: id14, compile: compile15, interpret: interpret15 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/dependentSchemas.js
var id15 = 'https://json-schema.org/keyword/dependentSchemas';
var compile16 = (schema, ast) =>
  pipe(
    entries(schema),
    asyncMap(async ([key, dependentSchema]) => [key, await validation_default.compile(dependentSchema, ast)]),
    asyncCollectArray,
  );
var interpret16 = (dependentSchemas, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const [propertyName, dependentSchema] of dependentSchemas) {
    if (has2(propertyName, instance) && !validation_default.interpret(dependentSchema, instance, context)) {
      isValid = false;
    }
  }
  return isValid;
};
var simpleApplicator3 = true;
var dependentSchemas_default = {
  id: id15,
  compile: compile16,
  interpret: interpret16,
  simpleApplicator: simpleApplicator3,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/deprecated.js
var id16 = 'https://json-schema.org/keyword/deprecated';
var compile17 = (schema) => value(schema);
var interpret17 = () => true;
var annotation5 = (deprecated) => deprecated;
var deprecated_default = { id: id16, compile: compile17, interpret: interpret17, annotation: annotation5 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/description.js
var id17 = 'https://json-schema.org/keyword/description';
var compile18 = (schema) => value(schema);
var interpret18 = () => true;
var annotation6 = (description) => description;
var description_default = { id: id17, compile: compile18, interpret: interpret18, annotation: annotation6 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/dynamicAnchor.js
var dynamicAnchor_default = { id: 'https://json-schema.org/keyword/dynamicAnchor' };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/dynamicRef.js
var id18 = 'https://json-schema.org/keyword/dynamicRef';
var compile19 = async (schema, ast) => {
  const reference = value(schema);
  const self = await get2(schema.document.baseUri, schema);
  await validation_default.compile(self, ast);
  return reference.startsWith('#') ? reference.slice(1) : reference;
};
var interpret19 = (fragment3, instance, context) => {
  if (!(fragment3 in context.dynamicAnchors)) {
    throw Error(`No dynamic anchor found for "${fragment3}"`);
  }
  return validation_default.interpret(context.dynamicAnchors[fragment3], instance, context);
};
var simpleApplicator4 = true;
var plugin = {
  beforeSchema(url, _instance, context) {
    context.dynamicAnchors = {
      ...context.ast.metaData[toAbsoluteUri2(url)].dynamicAnchors,
      ...context.dynamicAnchors,
    };
  },
  beforeKeyword(_url, _instance, context, schemaContext) {
    context.dynamicAnchors = schemaContext.dynamicAnchors;
  },
};
var dynamicRef_default = {
  id: id18,
  compile: compile19,
  interpret: interpret19,
  simpleApplicator: simpleApplicator4,
  plugin,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/else.js
var id19 = 'https://json-schema.org/keyword/else';
var compile20 = async (schema, ast, parentSchema) => {
  const ifKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/if');
  if (has(ifKeyword, parentSchema)) {
    const ifSchema = await step(ifKeyword, parentSchema);
    return [await validation_default.compile(ifSchema, ast), await validation_default.compile(schema, ast)];
  } else {
    return [];
  }
};
var interpret20 = ([ifSchema, elseSchema], instance, context) => {
  return (
    ifSchema === void 0 ||
    validation_default.interpret(ifSchema, instance, { ...context, plugins: context.ast.plugins }) ||
    validation_default.interpret(elseSchema, instance, context)
  );
};
var simpleApplicator5 = true;
var else_default = { id: id19, compile: compile20, interpret: interpret20, simpleApplicator: simpleApplicator5 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/enum.js
var import_json_stringify_deterministic2 = __toESM(require_lib(), 1);
var id20 = 'https://json-schema.org/keyword/enum';
var compile21 = (schema) =>
  pipe(iter(schema), asyncMap(value), asyncMap(import_json_stringify_deterministic2.default), asyncCollectArray);
var interpret21 = (enum_, instance) => {
  const instanceValue = (0, import_json_stringify_deterministic2.default)(value2(instance));
  return enum_.some((enumValue) => instanceValue === enumValue);
};
var enum_default = { id: id20, compile: compile21, interpret: interpret21 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/examples.js
var id21 = 'https://json-schema.org/keyword/examples';
var compile22 = (schema) => value(schema);
var interpret22 = () => true;
var annotation7 = (examples) => examples;
var examples_default = { id: id21, compile: compile22, interpret: interpret22, annotation: annotation7 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/exclusiveMaximum.js
var id22 = 'https://json-schema.org/keyword/exclusiveMaximum';
var compile23 = (schema) => value(schema);
var interpret23 = (exclusiveMaximum, instance) => typeOf2(instance) !== 'number' || value2(instance) < exclusiveMaximum;
var exclusiveMaximum_default = { id: id22, compile: compile23, interpret: interpret23 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/exclusiveMinimum.js
var id23 = 'https://json-schema.org/keyword/exclusiveMinimum';
var compile24 = (schema) => value(schema);
var interpret24 = (exclusiveMinimum, instance) => typeOf2(instance) !== 'number' || value2(instance) > exclusiveMinimum;
var exclusiveMinimum_default = { id: id23, compile: compile24, interpret: interpret24 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/format.js
var id24 = 'https://json-schema.org/keyword/format';
var compile25 = (schema) => value(schema);
var interpret25 = (format, instance) => {
  const handler = getFormatHandler(formats[format]);
  if (!handler) {
    throw Error(`The '${format}' format is not supported.`);
  }
  return handler(value2(instance));
};
var annotation8 = (format) => format;
var formats = {
  'date-time': 'https://json-schema.org/format/date-time',
  date: 'https://json-schema.org/format/date',
  time: 'https://json-schema.org/format/time',
  duration: 'https://json-schema.org/format/duration',
  email: 'https://json-schema.org/format/email',
  'idn-email': 'https://json-schema.org/format/idn-email',
  hostname: 'https://json-schema.org/format/hostname',
  'idn-hostname': 'https://json-schema.org/format/idn-hostname',
  ipv4: 'https://json-schema.org/format/ipv4',
  ipv6: 'https://json-schema.org/format/ipv6',
  uri: 'https://json-schema.org/format/uri',
  'uri-reference': 'https://json-schema.org/format/uri-reference',
  iri: 'https://json-schema.org/format/iri',
  'iri-reference': 'https://json-schema.org/format/iri-reference',
  uuid: 'https://json-schema.org/format/uuid',
  'uri-template': 'https://json-schema.org/format/uri-template',
  'json-pointer': 'https://json-schema.org/format/json-pointer',
  'relative-json-pointer': 'https://json-schema.org/format/relative-json-pointer',
  regex: 'https://json-schema.org/format/regex',
};
var format_default = { id: id24, compile: compile25, interpret: interpret25, annotation: annotation8, formats };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/id.js
var id_default = { id: 'https://json-schema.org/keyword/id' };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/if.js
var id25 = 'https://json-schema.org/keyword/if';
var compile26 = (schema, ast) => validation_default.compile(schema, ast);
var interpret26 = (ifSchema, instance, context) => {
  validation_default.interpret(ifSchema, instance, context);
  return true;
};
var simpleApplicator6 = true;
var if_default = { id: id25, compile: compile26, interpret: interpret26, simpleApplicator: simpleApplicator6 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/nfa.js
var fromEpsilon = () => {
  const start = createState(false);
  const end = createState(true);
  addEpsilonTransition(start, end);
  return { start, end };
};
var fromSchema = (schema) => {
  const start = createState(false);
  const end = createState(true);
  addTransition(start, end, schema);
  return { start, end };
};
var concat2 = (first, second) => {
  if (first === void 0) {
    return second;
  }
  addEpsilonTransition(first.end, second.start);
  first.end.isEnd = false;
  return { start: first.start, end: second.end };
};
var union = (first, second) => {
  const start = createState(false);
  addEpsilonTransition(start, first.start);
  addEpsilonTransition(start, second.start);
  const end = createState(true);
  addEpsilonTransition(first.end, end);
  first.end.isEnd = false;
  addEpsilonTransition(second.end, end);
  second.end.isEnd = false;
  return { start, end };
};
var closure = (nfa) => {
  const start = createState(false);
  const end = createState(true);
  addEpsilonTransition(start, end);
  addEpsilonTransition(start, nfa.start);
  addEpsilonTransition(nfa.end, end);
  addEpsilonTransition(nfa.end, nfa.start);
  nfa.end.isEnd = false;
  return { start, end };
};
var zeroOrOne = (nfa) => {
  const start = createState(false);
  const end = createState(true);
  addEpsilonTransition(start, end);
  addEpsilonTransition(start, nfa.start);
  addEpsilonTransition(nfa.end, end);
  nfa.end.isEnd = false;
  return { start, end };
};
var oneOrMore = (nfa) => {
  const start = createState(false);
  const end = createState(true);
  addEpsilonTransition(start, nfa.start);
  addEpsilonTransition(nfa.end, end);
  addEpsilonTransition(nfa.end, nfa.start);
  nfa.end.isEnd = false;
  return { start, end };
};
var addEpsilonTransition = (from, to) => {
  from.epsilonTransitions.push(to);
};
var addTransition = (from, to, symbol) => {
  from.transition[symbol] = to;
};
var createState = (isEnd) => {
  return {
    isEnd,
    transition: {},
    epsilonTransitions: [],
  };
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/itemPattern.js
var id26 = 'https://json-schema.org/keyword/itemPattern';
var compile27 = async (schema, ast) => {
  const groups = [[]];
  let group = groups[0];
  for await (const rule of iter(schema)) {
    if (typeOf(rule) === 'string') {
      const operator = value(rule);
      if (operator === '*') {
        group.push(closure(group.pop()));
      } else if (operator === '?') {
        group.push(zeroOrOne(group.pop()));
      } else if (operator === '+') {
        group.push(oneOrMore(group.pop()));
      } else if (operator === '|') {
        group = [];
        groups.push(group);
      } else {
        throw Error(`Unsupported pattern syntax: ${operator}`);
      }
    } else {
      const node =
        typeOf(rule) === 'array' ? compile27(rule, ast) : fromSchema(await validation_default.compile(rule, ast));
      group.push(await node);
    }
  }
  return length(schema) === 0 ? fromEpsilon() : groups.map((group2) => group2.reduce(concat2)).reduce(union);
};
var interpret27 = (nfa, instance, context) => {
  if (typeOf2(instance) !== 'array') {
    return true;
  }
  let currentStates = [];
  addNextState(nfa.start, currentStates, []);
  for (const item of iter2(instance)) {
    const nextStates = [];
    for (const state of currentStates) {
      const nextState = transition(state.transition, item, context);
      if (nextState) {
        addNextState(nextState, nextStates, []);
      }
    }
    currentStates = nextStates;
  }
  return Boolean(currentStates.find((s) => s.isEnd));
};
var addNextState = (state, nextStates, visited) => {
  if (state.epsilonTransitions.length) {
    for (const epsilonState of state.epsilonTransitions) {
      if (!visited.find((visited2) => visited2 === epsilonState)) {
        visited.push(epsilonState);
        addNextState(epsilonState, nextStates, visited);
      }
    }
  } else {
    nextStates.push(state);
  }
};
var transition = (transitions, instance, context) => {
  for (const schema in transitions) {
    if (validation_default.interpret(schema, instance, context)) {
      return transitions[schema];
    }
  }
};
var itemPattern_default = { id: id26, compile: compile27, interpret: interpret27 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/items.js
var id27 = 'https://json-schema.org/keyword/items';
var compile28 = async (schema, ast, parentSchema) => {
  const prefixItemKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/prefixItems');
  const prefixItems = await step(prefixItemKeyword, parentSchema);
  const numberOfPrefixItems = typeOf(prefixItems) === 'array' ? length(prefixItems) : 0;
  return [numberOfPrefixItems, await validation_default.compile(schema, ast)];
};
var interpret28 = ([numberOfPrefixItems, items], instance, context) => {
  if (typeOf2(instance) !== 'array') {
    return true;
  }
  let isValid = true;
  let index = numberOfPrefixItems;
  for (const item of drop(numberOfPrefixItems, iter2(instance))) {
    if (!validation_default.interpret(items, item, context)) {
      isValid = false;
    }
    context.evaluatedItems?.add(index);
    index++;
  }
  return isValid;
};
var simpleApplicator7 = true;
var items_default = { id: id27, compile: compile28, interpret: interpret28, simpleApplicator: simpleApplicator7 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/maxContains.js
var id28 = 'https://json-schema.org/keyword/maxContains';
var compile29 = (schema) => value(schema);
var interpret29 = () => true;
var maxContains_default = { id: id28, compile: compile29, interpret: interpret29 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/maxItems.js
var id29 = 'https://json-schema.org/keyword/maxItems';
var compile30 = (schema) => value(schema);
var interpret30 = (maxItems, instance) => {
  return typeOf2(instance) !== 'array' || length2(instance) <= maxItems;
};
var maxItems_default = { id: id29, compile: compile30, interpret: interpret30 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/maxLength.js
var id30 = 'https://json-schema.org/keyword/maxLength';
var compile31 = (schema) => value(schema);
var interpret31 = (maxLength, instance) => {
  return typeOf2(instance) !== 'string' || [...value2(instance)].length <= maxLength;
};
var maxLength_default = { id: id30, compile: compile31, interpret: interpret31 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/maxProperties.js
var id31 = 'https://json-schema.org/keyword/maxProperties';
var compile32 = (schema) => value(schema);
var interpret32 = (maxProperties, instance) => {
  return typeOf2(instance) !== 'object' || [...keys2(instance)].length <= maxProperties;
};
var maxProperties_default = { id: id31, compile: compile32, interpret: interpret32 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/maximum.js
var id32 = 'https://json-schema.org/keyword/maximum';
var compile33 = (schema) => value(schema);
var interpret33 = (maximum, instance) => typeOf2(instance) !== 'number' || value2(instance) <= maximum;
var maximum_default = { id: id32, compile: compile33, interpret: interpret33 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/minContains.js
var id33 = 'https://json-schema.org/keyword/minContains';
var compile34 = (schema) => value(schema);
var interpret34 = () => true;
var minContains_default = { id: id33, compile: compile34, interpret: interpret34 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/minItems.js
var id34 = 'https://json-schema.org/keyword/minItems';
var compile35 = (schema) => value(schema);
var interpret35 = (minItems, instance) => {
  return typeOf2(instance) !== 'array' || length2(instance) >= minItems;
};
var minItems_default = { id: id34, compile: compile35, interpret: interpret35 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/minLength.js
var id35 = 'https://json-schema.org/keyword/minLength';
var compile36 = (schema) => value(schema);
var interpret36 = (minLength, instance) => {
  return typeOf2(instance) !== 'string' || [...value2(instance)].length >= minLength;
};
var minLength_default = { id: id35, compile: compile36, interpret: interpret36 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/minProperties.js
var id36 = 'https://json-schema.org/keyword/minProperties';
var compile37 = (schema) => value(schema);
var interpret37 = (minProperties, instance) => {
  return typeOf2(instance) !== 'object' || [...keys2(instance)].length >= minProperties;
};
var minProperties_default = { id: id36, compile: compile37, interpret: interpret37 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/minimum.js
var id37 = 'https://json-schema.org/keyword/minimum';
var compile38 = (schema) => value(schema);
var interpret38 = (minimum, instance) => typeOf2(instance) !== 'number' || value2(instance) >= minimum;
var minimum_default = { id: id37, compile: compile38, interpret: interpret38 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/multipleOf.js
var id38 = 'https://json-schema.org/keyword/multipleOf';
var compile39 = (schema) => value(schema);
var interpret39 = (multipleOf, instance) => {
  if (typeOf2(instance) !== 'number') {
    return true;
  }
  const remainder = value2(instance) % multipleOf;
  return numberEqual(0, remainder) || numberEqual(multipleOf, remainder);
};
var numberEqual = (a, b) => Math.abs(a - b) < 11920929e-14;
var multipleOf_default = { id: id38, compile: compile39, interpret: interpret39 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/not.js
var id39 = 'https://json-schema.org/keyword/not';
var compile40 = (...args) => validation_default.compile(...args);
var interpret40 = (...args) => !validation_default.interpret(...args);
var not_default = { id: id39, compile: compile40, interpret: interpret40 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/oneOf.js
var id40 = 'https://json-schema.org/keyword/oneOf';
var compile41 = (schema, ast) =>
  pipe(
    iter(schema),
    asyncMap((itemSchema) => validation_default.compile(itemSchema, ast)),
    asyncCollectArray,
  );
var interpret41 = (oneOf, instance, context) => {
  let validCount = 0;
  for (const schemaUrl of oneOf) {
    if (validation_default.interpret(schemaUrl, instance, context)) {
      validCount++;
    }
  }
  return validCount === 1;
};
var oneOf_default = { id: id40, compile: compile41, interpret: interpret41 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/pattern.js
var id41 = 'https://json-schema.org/keyword/pattern';
var compile42 = (schema) => new RegExp(value(schema), 'u');
var interpret42 = (pattern, instance) => {
  return typeOf2(instance) !== 'string' || pattern.test(value2(instance));
};
var pattern_default = { id: id41, compile: compile42, interpret: interpret42 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/patternProperties.js
var id42 = 'https://json-schema.org/keyword/patternProperties';
var compile43 = (schema, ast) =>
  pipe(
    entries(schema),
    asyncMap(async ([pattern, propertySchema]) => [
      new RegExp(pattern, 'u'),
      await validation_default.compile(propertySchema, ast),
    ]),
    asyncCollectArray,
  );
var interpret43 = (patternProperties, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const [pattern, schemaUri] of patternProperties) {
    for (const [propertyNameNode, propertyValue] of entries2(instance)) {
      const propertyName = value2(propertyNameNode);
      if (pattern.test(propertyName)) {
        if (!validation_default.interpret(schemaUri, propertyValue, context)) {
          isValid = false;
        }
        context.evaluatedProperties?.add(propertyName);
      }
    }
  }
  return isValid;
};
var simpleApplicator8 = true;
var patternProperties_default = {
  id: id42,
  compile: compile43,
  interpret: interpret43,
  simpleApplicator: simpleApplicator8,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/prefixItems.js
var id43 = 'https://json-schema.org/keyword/prefixItems';
var compile44 = (schema, ast) =>
  pipe(
    iter(schema),
    asyncMap((itemSchema) => validation_default.compile(itemSchema, ast)),
    asyncCollectArray,
  );
var interpret44 = (prefixItems, instance, context) => {
  if (typeOf2(instance) !== 'array') {
    return true;
  }
  let isValid = true;
  let index = 0;
  const instanceLength = length2(instance);
  for (const [schemaUri, item] of zip(prefixItems, iter2(instance))) {
    if (index >= instanceLength) {
      break;
    }
    if (!validation_default.interpret(schemaUri, item, context)) {
      isValid = false;
    }
    context.evaluatedItems?.add(index);
    index++;
  }
  return isValid;
};
var simpleApplicator9 = true;
var prefixItems_default = { id: id43, compile: compile44, interpret: interpret44, simpleApplicator: simpleApplicator9 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/properties.js
var id44 = 'https://json-schema.org/keyword/properties';
var compile45 = (schema, ast) =>
  pipe(
    entries(schema),
    asyncMap(async ([propertyName, propertySchema]) => [
      propertyName,
      await validation_default.compile(propertySchema, ast),
    ]),
    asyncCollectObject,
  );
var interpret45 = (properties, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const [propertyNameNode, property] of entries2(instance)) {
    const propertyName = value2(propertyNameNode);
    if (propertyName in properties) {
      if (!validation_default.interpret(properties[propertyName], property, context)) {
        isValid = false;
      }
      context.evaluatedProperties?.add(propertyName);
    }
  }
  return isValid;
};
var simpleApplicator10 = true;
var properties_default = { id: id44, compile: compile45, interpret: interpret45, simpleApplicator: simpleApplicator10 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/propertyDependencies.js
var id45 = 'https://json-schema.org/keyword/propertyDependencies';
var compile46 = (schema, ast) => {
  return pipe(
    entries(schema),
    asyncMap(async ([propertyName, valueMappings]) => {
      return [
        propertyName,
        await pipe(
          entries(valueMappings),
          asyncMap(async ([propertyValue, conditionalSchema]) => [
            propertyValue,
            await validation_default.compile(conditionalSchema, ast),
          ]),
          asyncCollectObject,
        ),
      ];
    }),
    asyncCollectObject,
  );
};
var interpret46 = (propertyDependencies, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  const instanceValue = value2(instance);
  for (const [propertyName, valueMappings] of Object.entries(propertyDependencies)) {
    const propertyValue = instanceValue[propertyName];
    if (
      has2(propertyName, instance) &&
      propertyValue in valueMappings &&
      !validation_default.interpret(valueMappings[propertyValue], instance, context)
    ) {
      isValid = false;
    }
  }
  return isValid;
};
var simpleApplicator11 = true;
var propertyDependencies_default = {
  id: id45,
  compile: compile46,
  interpret: interpret46,
  simpleApplicator: simpleApplicator11,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/propertyNames.js
var id46 = 'https://json-schema.org/keyword/propertyNames';
var compile47 = (schema, ast) => validation_default.compile(schema, ast);
var interpret47 = (propertyNames, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  let isValid = true;
  for (const key of keys2(instance)) {
    if (!validation_default.interpret(propertyNames, key, context)) {
      isValid = false;
    }
  }
  return isValid;
};
var simpleApplicator12 = true;
var propertyNames_default = {
  id: id46,
  compile: compile47,
  interpret: interpret47,
  simpleApplicator: simpleApplicator12,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/readOnly.js
var id47 = 'https://json-schema.org/keyword/readOnly';
var compile48 = (schema) => value(schema);
var interpret48 = () => true;
var annotation9 = (readOnly) => readOnly;
var readOnly_default = { id: id47, compile: compile48, interpret: interpret48, annotation: annotation9 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/ref.js
var id48 = 'https://json-schema.org/keyword/ref';
var compile49 = (...args) => validation_default.compile(...args);
var interpret49 = (...args) => validation_default.interpret(...args);
var simpleApplicator13 = true;
var ref_default = { id: id48, compile: compile49, interpret: interpret49, simpleApplicator: simpleApplicator13 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/requireAllExcept.js
var id49 = 'https://json-schema.org/keyword/requireAllExcept';
var compile50 = async (schema, _ast, parentSchema) => {
  const requireAllExcept = await value(schema);
  const propertiesKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/properties');
  const propertiesSchema = await step(propertiesKeyword, parentSchema);
  const propertyNames = typeOf(propertiesSchema) === 'object' ? keys(propertiesSchema) : [];
  const required = new Set(propertyNames);
  requireAllExcept.forEach((propertyName) => required.delete(propertyName));
  return [...required];
};
var interpret50 = (required, instance) => {
  return (
    typeOf2(instance) !== 'object' || required.every((propertyName) => Object.hasOwn(value2(instance), propertyName))
  );
};
var requireAllExcept_default = { id: id49, compile: compile50, interpret: interpret50 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/required.js
var id50 = 'https://json-schema.org/keyword/required';
var compile51 = (schema) => value(schema);
var interpret51 = (required, instance) => {
  return (
    typeOf2(instance) !== 'object' || required.every((propertyName) => Object.hasOwn(value2(instance), propertyName))
  );
};
var required_default = { id: id50, compile: compile51, interpret: interpret51 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/title.js
var id51 = 'https://json-schema.org/keyword/title';
var compile52 = (schema) => value(schema);
var interpret52 = () => true;
var annotation10 = (title) => title;
var title_default = { id: id51, compile: compile52, interpret: interpret52, annotation: annotation10 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/then.js
var id52 = 'https://json-schema.org/keyword/then';
var compile53 = async (schema, ast, parentSchema) => {
  const ifKeyword = getKeywordName(schema.document.dialectId, 'https://json-schema.org/keyword/if');
  if (has(ifKeyword, parentSchema)) {
    const ifSchema = await step(ifKeyword, parentSchema);
    return [await validation_default.compile(ifSchema, ast), await validation_default.compile(schema, ast)];
  } else {
    return [];
  }
};
var interpret53 = ([ifSchema, thenSchema], instance, context) => {
  return (
    ifSchema === void 0 ||
    !validation_default.interpret(ifSchema, instance, { ...context, plugins: context.ast.plugins }) ||
    validation_default.interpret(thenSchema, instance, context)
  );
};
var simpleApplicator14 = true;
var then_default = { id: id52, compile: compile53, interpret: interpret53, simpleApplicator: simpleApplicator14 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/type.js
var id53 = 'https://json-schema.org/keyword/type';
var compile54 = (schema) => value(schema);
var interpret54 = (type, instance) =>
  typeof type === 'string' ? isTypeOf(instance)(type) : type.some(isTypeOf(instance));
var isTypeOf = (instance) => (type) =>
  type === 'integer'
    ? typeOf2(instance) === 'number' && Number.isInteger(value2(instance))
    : typeOf2(instance) === type;
var type_default = { id: id53, compile: compile54, interpret: interpret54 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/unevaluatedItems.js
var id54 = 'https://json-schema.org/keyword/unevaluatedItems';
var compile55 = (schema, ast) => validation_default.compile(schema, ast);
var interpret55 = (unevaluatedItems, instance, context) => {
  if (typeOf2(instance) !== 'array') {
    return true;
  }
  const evaluatedItems = context.schemaEvaluatedItems;
  let isValid = true;
  let index = 0;
  for (const item of iter2(instance)) {
    if (!evaluatedItems.has(index)) {
      if (!validation_default.interpret(unevaluatedItems, item, context)) {
        isValid = false;
      }
      context.evaluatedItems?.add(index);
    }
    index++;
  }
  return isValid;
};
var simpleApplicator15 = true;
var plugin2 = {
  beforeSchema(_url, instance, context) {
    context.evaluatedItems ??= /* @__PURE__ */ new Set();
    context.schemaEvaluatedItems = /* @__PURE__ */ new Set();
    context.instanceLocation ??= uri3(instance);
  },
  beforeKeyword(_node, instance, context, schemaContext) {
    context.evaluatedItems = /* @__PURE__ */ new Set();
    context.schemaEvaluatedItems = schemaContext.schemaEvaluatedItems;
    context.instanceLocation = uri3(instance);
  },
  afterKeyword(_node, _instance, context, _valid, schemaContext) {
    for (const property of context.evaluatedItems) {
      schemaContext.schemaEvaluatedItems.add(property);
    }
  },
  afterSchema(_node, instance, context, valid) {
    if (valid && uri3(instance) === context.instanceLocation) {
      for (const property of context.schemaEvaluatedItems) {
        context.evaluatedItems.add(property);
      }
    }
  },
};
var unevaluatedItems_default = {
  id: id54,
  compile: compile55,
  interpret: interpret55,
  simpleApplicator: simpleApplicator15,
  plugin: plugin2,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/unevaluatedProperties.js
var id55 = 'https://json-schema.org/keyword/unevaluatedProperties';
var compile56 = (schema, ast) => validation_default.compile(schema, ast);
var interpret56 = (unevaluatedProperties, instance, context) => {
  if (typeOf2(instance) !== 'object') {
    return true;
  }
  const evaluatedProperties = context.schemaEvaluatedProperties;
  let isValid = true;
  for (const [propertyNameNode, property] of entries2(instance)) {
    const propertyName = value2(propertyNameNode);
    if (evaluatedProperties.has(propertyName)) {
      continue;
    }
    if (!validation_default.interpret(unevaluatedProperties, property, context)) {
      isValid = false;
    }
    context.evaluatedProperties?.add(propertyName);
  }
  return isValid;
};
var simpleApplicator16 = true;
var plugin3 = {
  beforeSchema(_url, instance, context) {
    context.evaluatedProperties ??= /* @__PURE__ */ new Set();
    context.schemaEvaluatedProperties = /* @__PURE__ */ new Set();
    context.instanceLocation ??= uri3(instance);
  },
  beforeKeyword(_node, instance, context, schemaContext) {
    context.evaluatedProperties = /* @__PURE__ */ new Set();
    context.schemaEvaluatedProperties = schemaContext.schemaEvaluatedProperties;
    context.instanceLocation = uri3(instance);
  },
  afterKeyword(_node, _instance, context, _valid, schemaContext) {
    for (const property of context.evaluatedProperties) {
      schemaContext.schemaEvaluatedProperties.add(property);
    }
  },
  afterSchema(_node, instance, context, valid) {
    if (valid && uri3(instance) === context.instanceLocation) {
      for (const property of context.schemaEvaluatedProperties) {
        context.evaluatedProperties.add(property);
      }
    }
  },
};
var unevaluatedProperties_default = {
  id: id55,
  compile: compile56,
  interpret: interpret56,
  simpleApplicator: simpleApplicator16,
  plugin: plugin3,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/uniqueItems.js
var import_json_stringify_deterministic3 = __toESM(require_lib(), 1);
var id56 = 'https://json-schema.org/keyword/uniqueItems';
var compile57 = (schema) => value(schema);
var interpret57 = (uniqueItems, instance) => {
  if (typeOf2(instance) !== 'array' || uniqueItems === false) {
    return true;
  }
  const normalizedItems = value2(instance).map(import_json_stringify_deterministic3.default);
  return new Set(normalizedItems).size === normalizedItems.length;
};
var uniqueItems_default = { id: id56, compile: compile57, interpret: interpret57 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/unknown.js
var id57 = 'https://json-schema.org/keyword/unknown';
var compile58 = (schema) => {
  const keywordName = [...pointerSegments(schema.cursor)].pop();
  return [keywordName, value(schema)];
};
var interpret58 = () => true;
var annotation11 = ([, value3]) => value3;
var unknown_default = { id: id57, compile: compile58, interpret: interpret58, annotation: annotation11 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/vocabulary.js
var vocabulary_default = { id: 'https://json-schema.org/keyword/vocabulary' };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/keywords/writeOnly.js
var id58 = 'https://json-schema.org/keyword/writeOnly';
var compile59 = (schema) => value(schema);
var interpret59 = () => true;
var annotation12 = (writeOnly) => writeOnly;
var writeOnly_default = { id: id58, compile: compile59, interpret: interpret59, annotation: annotation12 };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/lib/index.js
addMediaTypePlugin('application/schema+json', schemaPlugin);
addKeyword(additionalProperties_default);
addKeyword(allOf_default);
addKeyword(anchor_default);
addKeyword(anyOf_default);
addKeyword(conditional_default);
addKeyword(const_default);
addKeyword(contains_default);
addKeyword(comment_default);
addKeyword(contentEncoding_default);
addKeyword(contentMediaType_default);
addKeyword(contentSchema_default);
addKeyword(default_default);
addKeyword(definitions_default);
addKeyword(dependentRequired_default);
addKeyword(dependentSchemas_default);
addKeyword(deprecated_default);
addKeyword(description_default);
addKeyword(dynamicAnchor_default);
addKeyword(dynamicRef_default);
addKeyword(else_default);
addKeyword(enum_default);
addKeyword(examples_default);
addKeyword(exclusiveMaximum_default);
addKeyword(exclusiveMinimum_default);
addKeyword(format_default);
addKeyword(id_default);
addKeyword(if_default);
addKeyword(itemPattern_default);
addKeyword(items_default);
addKeyword(maxContains_default);
addKeyword(maxItems_default);
addKeyword(maxLength_default);
addKeyword(maxProperties_default);
addKeyword(maximum_default);
addKeyword(minContains_default);
addKeyword(minItems_default);
addKeyword(minLength_default);
addKeyword(minProperties_default);
addKeyword(minimum_default);
addKeyword(multipleOf_default);
addKeyword(not_default);
addKeyword(oneOf_default);
addKeyword(pattern_default);
addKeyword(patternProperties_default);
addKeyword(prefixItems_default);
addKeyword(properties_default);
addKeyword(propertyDependencies_default);
addKeyword(propertyNames_default);
addKeyword(readOnly_default);
addKeyword(ref_default);
addKeyword(requireAllExcept_default);
addKeyword(required_default);
addKeyword(title_default);
addKeyword(then_default);
addKeyword(type_default);
addKeyword(unevaluatedItems_default);
addKeyword(unevaluatedProperties_default);
addKeyword(uniqueItems_default);
addKeyword(unknown_default);
addKeyword(vocabulary_default);
addKeyword(writeOnly_default);

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/schema.js
var schema_default = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://json-schema.org/draft/2020-12/schema',
  $vocabulary: {
    'https://json-schema.org/draft/2020-12/vocab/core': true,
    'https://json-schema.org/draft/2020-12/vocab/applicator': true,
    'https://json-schema.org/draft/2020-12/vocab/unevaluated': true,
    'https://json-schema.org/draft/2020-12/vocab/validation': true,
    'https://json-schema.org/draft/2020-12/vocab/meta-data': true,
    'https://json-schema.org/draft/2020-12/vocab/format-annotation': true,
    'https://json-schema.org/draft/2020-12/vocab/content': true,
  },
  $dynamicAnchor: 'meta',
  title: 'Core and Validation specifications meta-schema',
  allOf: [
    { $ref: 'meta/core' },
    { $ref: 'meta/applicator' },
    { $ref: 'meta/unevaluated' },
    { $ref: 'meta/validation' },
    { $ref: 'meta/meta-data' },
    { $ref: 'meta/format-annotation' },
    { $ref: 'meta/content' },
  ],
  type: ['object', 'boolean'],
  properties: {
    definitions: {
      $comment:
        'While no longer an official keyword as it is replaced by $defs, this keyword is retained in the meta-schema to prevent incompatible extensions as it remains in common use.',
      type: 'object',
      additionalProperties: { $dynamicRef: '#meta' },
      default: {},
    },
    dependencies: {
      $comment:
        '"dependencies" is no longer a keyword, but schema authors should avoid redefining it to facilitate a smooth transition to "dependentSchemas" and "dependentRequired"',
      type: 'object',
      additionalProperties: {
        anyOf: [{ $dynamicRef: '#meta' }, { $ref: 'meta/validation#/$defs/stringArray' }],
      },
    },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/core.js
var core_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/core',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Core vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    $id: {
      type: 'string',
      format: 'uri-reference',
      $comment: 'Non-empty fragments not allowed.',
      pattern: '^[^#]*#?$',
    },
    $schema: {
      type: 'string',
      format: 'uri',
    },
    $anchor: {
      type: 'string',
      pattern: '^[A-Za-z_][-A-Za-z0-9._]*$',
    },
    $ref: {
      type: 'string',
      format: 'uri-reference',
    },
    $dynamicRef: {
      type: 'string',
      format: 'uri-reference',
    },
    $dynamicAnchor: {
      type: 'string',
      pattern: '^[A-Za-z_][-A-Za-z0-9._]*$',
    },
    $vocabulary: {
      type: 'object',
      propertyNames: {
        type: 'string',
        format: 'uri',
      },
      additionalProperties: {
        type: 'boolean',
      },
    },
    $comment: {
      type: 'string',
    },
    $defs: {
      type: 'object',
      additionalProperties: { $dynamicRef: '#meta' },
      default: {},
    },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/applicator.js
var applicator_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/applicator',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Applicator vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    prefixItems: { $ref: '#/$defs/schemaArray' },
    items: { $dynamicRef: '#meta' },
    contains: { $dynamicRef: '#meta' },
    additionalProperties: { $dynamicRef: '#meta' },
    properties: {
      type: 'object',
      additionalProperties: { $dynamicRef: '#meta' },
      default: {},
    },
    patternProperties: {
      type: 'object',
      additionalProperties: { $dynamicRef: '#meta' },
      propertyNames: { format: 'regex' },
      default: {},
    },
    dependentSchemas: {
      type: 'object',
      additionalProperties: {
        $dynamicRef: '#meta',
      },
    },
    propertyNames: { $dynamicRef: '#meta' },
    if: { $dynamicRef: '#meta' },
    then: { $dynamicRef: '#meta' },
    else: { $dynamicRef: '#meta' },
    allOf: { $ref: '#/$defs/schemaArray' },
    anyOf: { $ref: '#/$defs/schemaArray' },
    oneOf: { $ref: '#/$defs/schemaArray' },
    not: { $dynamicRef: '#meta' },
  },
  $defs: {
    schemaArray: {
      type: 'array',
      minItems: 1,
      items: { $dynamicRef: '#meta' },
    },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/validation.js
var validation_default2 = {
  $id: 'https://json-schema.org/draft/2020-12/meta/validation',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Validation vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    multipleOf: {
      type: 'number',
      exclusiveMinimum: 0,
    },
    maximum: {
      type: 'number',
    },
    exclusiveMaximum: {
      type: 'number',
    },
    minimum: {
      type: 'number',
    },
    exclusiveMinimum: {
      type: 'number',
    },
    maxLength: { $ref: '#/$defs/nonNegativeInteger' },
    minLength: { $ref: '#/$defs/nonNegativeIntegerDefault0' },
    pattern: {
      type: 'string',
      format: 'regex',
    },
    maxItems: { $ref: '#/$defs/nonNegativeInteger' },
    minItems: { $ref: '#/$defs/nonNegativeIntegerDefault0' },
    uniqueItems: {
      type: 'boolean',
      default: false,
    },
    maxContains: { $ref: '#/$defs/nonNegativeInteger' },
    minContains: {
      $ref: '#/$defs/nonNegativeInteger',
      default: 1,
    },
    maxProperties: { $ref: '#/$defs/nonNegativeInteger' },
    minProperties: { $ref: '#/$defs/nonNegativeIntegerDefault0' },
    required: { $ref: '#/$defs/stringArray' },
    dependentRequired: {
      type: 'object',
      additionalProperties: {
        $ref: '#/$defs/stringArray',
      },
    },
    const: true,
    enum: {
      type: 'array',
      items: true,
    },
    type: {
      anyOf: [
        { $ref: '#/$defs/simpleTypes' },
        {
          type: 'array',
          items: { $ref: '#/$defs/simpleTypes' },
          minItems: 1,
          uniqueItems: true,
        },
      ],
    },
  },
  $defs: {
    nonNegativeInteger: {
      type: 'integer',
      minimum: 0,
    },
    nonNegativeIntegerDefault0: {
      $ref: '#/$defs/nonNegativeInteger',
      default: 0,
    },
    simpleTypes: {
      enum: ['array', 'boolean', 'integer', 'null', 'number', 'object', 'string'],
    },
    stringArray: {
      type: 'array',
      items: { type: 'string' },
      uniqueItems: true,
      default: [],
    },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/meta-data.js
var meta_data_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/meta-data',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Meta-data vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    title: {
      type: 'string',
    },
    description: {
      type: 'string',
    },
    default: true,
    deprecated: {
      type: 'boolean',
      default: false,
    },
    readOnly: {
      type: 'boolean',
      default: false,
    },
    writeOnly: {
      type: 'boolean',
      default: false,
    },
    examples: {
      type: 'array',
      items: true,
    },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/format-annotation.js
var format_annotation_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/format-annotation',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Format vocabulary meta-schema for annotation results',
  type: ['object', 'boolean'],
  properties: {
    format: { type: 'string' },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/format-assertion.js
var format_assertion_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/format-assertion',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Format vocabulary meta-schema for assertion results',
  type: ['object', 'boolean'],
  properties: {
    format: { type: 'string' },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/content.js
var content_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/content',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Content vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    contentMediaType: { type: 'string' },
    contentEncoding: { type: 'string' },
    contentSchema: { $dynamicRef: '#meta' },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/meta/unevaluated.js
var unevaluated_default = {
  $id: 'https://json-schema.org/draft/2020-12/meta/unevaluated',
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $dynamicAnchor: 'meta',
  title: 'Unevaluated applicator vocabulary meta-schema',
  type: ['object', 'boolean'],
  properties: {
    unevaluatedItems: { $dynamicRef: '#meta' },
    unevaluatedProperties: { $dynamicRef: '#meta' },
  },
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/dynamicAnchor.js
var dynamicAnchor_default2 = { id: 'https://json-schema.org/keyword/draft-2020-12/dynamicAnchor' };

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/dynamicRef.js
var id59 = 'https://json-schema.org/keyword/draft-2020-12/dynamicRef';
var compile60 = async (dynamicRef, ast) => {
  const fragment3 = uriFragment(value(dynamicRef));
  const referencedSchema = await get2(value(dynamicRef), dynamicRef);
  await validation_default.compile(referencedSchema, ast);
  return [referencedSchema.document.baseUri, fragment3, canonicalUri(referencedSchema)];
};
var interpret60 = ([id62, fragment3, ref], instance, context) => {
  if (fragment3 in context.ast.metaData[id62].dynamicAnchors) {
    context.dynamicAnchors = { ...context.ast.metaData[id62].dynamicAnchors, ...context.dynamicAnchors };
    return validation_default.interpret(context.dynamicAnchors[fragment3], instance, context);
  } else {
    return validation_default.interpret(ref, instance, context);
  }
};
var simpleApplicator17 = true;
var plugin4 = {
  beforeSchema(url, _instance, context) {
    context.dynamicAnchors = {
      ...context.ast.metaData[toAbsoluteUri2(url)].dynamicAnchors,
      ...context.dynamicAnchors,
    };
  },
  beforeKeyword(_url, _instance, context, schemaContext) {
    context.dynamicAnchors = schemaContext.dynamicAnchors;
  },
};
var dynamicRef_default2 = {
  id: id59,
  compile: compile60,
  interpret: interpret60,
  simpleApplicator: simpleApplicator17,
  plugin: plugin4,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/format.js
var id60 = 'https://json-schema.org/keyword/draft-2020-12/format';
var compile61 = (schema) => value(schema);
var interpret61 = (format, instance) => {
  if (!getShouldValidateFormat()) {
    return true;
  }
  const handler = getFormatHandler(formats2[format]);
  return handler?.(value2(instance)) ?? true;
};
var annotation13 = (format) => format;
var formats2 = {
  'date-time': 'https://json-schema.org/format/date-time',
  date: 'https://json-schema.org/format/date',
  time: 'https://json-schema.org/format/time',
  duration: 'https://json-schema.org/format/duration',
  email: 'https://json-schema.org/format/email',
  'idn-email': 'https://json-schema.org/format/idn-email',
  hostname: 'https://json-schema.org/format/hostname',
  'idn-hostname': 'https://json-schema.org/format/idn-hostname',
  ipv4: 'https://json-schema.org/format/ipv4',
  ipv6: 'https://json-schema.org/format/ipv6',
  uri: 'https://json-schema.org/format/uri',
  'uri-reference': 'https://json-schema.org/format/uri-reference',
  iri: 'https://json-schema.org/format/iri',
  'iri-reference': 'https://json-schema.org/format/iri-reference',
  uuid: 'https://json-schema.org/format/uuid',
  'uri-template': 'https://json-schema.org/format/uri-template',
  'json-pointer': 'https://json-schema.org/format/json-pointer',
  'relative-json-pointer': 'https://json-schema.org/format/relative-json-pointer',
  regex: 'https://json-schema.org/format/regex',
};
var format_default2 = {
  id: id60,
  compile: compile61,
  interpret: interpret61,
  annotation: annotation13,
  formats: formats2,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/format-assertion.js
var id61 = 'https://json-schema.org/keyword/draft-2020-12/format-assertion';
var compile62 = (schema) => value(schema);
var interpret62 = (format, instance) => {
  const handler = getFormatHandler(formats3[format]);
  if (!handler) {
    throw Error(`The '${format}' format is not supported.`);
  }
  return handler(value2(instance));
};
var annotation14 = (format) => format;
var formats3 = {
  'date-time': 'https://json-schema.org/format/date-time',
  date: 'https://json-schema.org/format/date',
  time: 'https://json-schema.org/format/time',
  duration: 'https://json-schema.org/format/duration',
  email: 'https://json-schema.org/format/email',
  'idn-email': 'https://json-schema.org/format/idn-email',
  hostname: 'https://json-schema.org/format/hostname',
  'idn-hostname': 'https://json-schema.org/format/idn-hostname',
  ipv4: 'https://json-schema.org/format/ipv4',
  ipv6: 'https://json-schema.org/format/ipv6',
  uri: 'https://json-schema.org/format/uri',
  'uri-reference': 'https://json-schema.org/format/uri-reference',
  iri: 'https://json-schema.org/format/iri',
  'iri-reference': 'https://json-schema.org/format/iri-reference',
  uuid: 'https://json-schema.org/format/uuid',
  'uri-template': 'https://json-schema.org/format/uri-template',
  'json-pointer': 'https://json-schema.org/format/json-pointer',
  'relative-json-pointer': 'https://json-schema.org/format/relative-json-pointer',
  regex: 'https://json-schema.org/format/regex',
};
var format_assertion_default2 = {
  id: id61,
  compile: compile62,
  interpret: interpret62,
  annotation: annotation14,
  formats: formats3,
};

// ../../node_modules/.pnpm/@hyperjump+json-schema@1.17.6_@hyperjump+browser@1.3.1/node_modules/@hyperjump/json-schema/draft-2020-12/index.js
addKeyword(dynamicRef_default2);
addKeyword(dynamicAnchor_default2);
addKeyword(format_default2);
addKeyword(format_assertion_default2);
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/core', {
  $anchor: 'https://json-schema.org/keyword/anchor',
  $comment: 'https://json-schema.org/keyword/comment',
  $defs: 'https://json-schema.org/keyword/definitions',
  $dynamicAnchor: 'https://json-schema.org/keyword/draft-2020-12/dynamicAnchor',
  $dynamicRef: 'https://json-schema.org/keyword/draft-2020-12/dynamicRef',
  $id: 'https://json-schema.org/keyword/id',
  $ref: 'https://json-schema.org/keyword/ref',
  $vocabulary: 'https://json-schema.org/keyword/vocabulary',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/applicator', {
  additionalProperties: 'https://json-schema.org/keyword/additionalProperties',
  allOf: 'https://json-schema.org/keyword/allOf',
  anyOf: 'https://json-schema.org/keyword/anyOf',
  contains: 'https://json-schema.org/keyword/contains',
  dependentSchemas: 'https://json-schema.org/keyword/dependentSchemas',
  if: 'https://json-schema.org/keyword/if',
  then: 'https://json-schema.org/keyword/then',
  else: 'https://json-schema.org/keyword/else',
  items: 'https://json-schema.org/keyword/items',
  not: 'https://json-schema.org/keyword/not',
  oneOf: 'https://json-schema.org/keyword/oneOf',
  patternProperties: 'https://json-schema.org/keyword/patternProperties',
  prefixItems: 'https://json-schema.org/keyword/prefixItems',
  properties: 'https://json-schema.org/keyword/properties',
  propertyNames: 'https://json-schema.org/keyword/propertyNames',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/validation', {
  const: 'https://json-schema.org/keyword/const',
  dependentRequired: 'https://json-schema.org/keyword/dependentRequired',
  enum: 'https://json-schema.org/keyword/enum',
  exclusiveMaximum: 'https://json-schema.org/keyword/exclusiveMaximum',
  exclusiveMinimum: 'https://json-schema.org/keyword/exclusiveMinimum',
  maxContains: 'https://json-schema.org/keyword/maxContains',
  maxItems: 'https://json-schema.org/keyword/maxItems',
  maxLength: 'https://json-schema.org/keyword/maxLength',
  maxProperties: 'https://json-schema.org/keyword/maxProperties',
  maximum: 'https://json-schema.org/keyword/maximum',
  minContains: 'https://json-schema.org/keyword/minContains',
  minItems: 'https://json-schema.org/keyword/minItems',
  minLength: 'https://json-schema.org/keyword/minLength',
  minProperties: 'https://json-schema.org/keyword/minProperties',
  minimum: 'https://json-schema.org/keyword/minimum',
  multipleOf: 'https://json-schema.org/keyword/multipleOf',
  pattern: 'https://json-schema.org/keyword/pattern',
  required: 'https://json-schema.org/keyword/required',
  type: 'https://json-schema.org/keyword/type',
  uniqueItems: 'https://json-schema.org/keyword/uniqueItems',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/meta-data', {
  default: 'https://json-schema.org/keyword/default',
  deprecated: 'https://json-schema.org/keyword/deprecated',
  description: 'https://json-schema.org/keyword/description',
  examples: 'https://json-schema.org/keyword/examples',
  readOnly: 'https://json-schema.org/keyword/readOnly',
  title: 'https://json-schema.org/keyword/title',
  writeOnly: 'https://json-schema.org/keyword/writeOnly',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/format-annotation', {
  format: 'https://json-schema.org/keyword/draft-2020-12/format',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/format-assertion', {
  format: 'https://json-schema.org/keyword/draft-2020-12/format-assertion',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/content', {
  contentEncoding: 'https://json-schema.org/keyword/contentEncoding',
  contentMediaType: 'https://json-schema.org/keyword/contentMediaType',
  contentSchema: 'https://json-schema.org/keyword/contentSchema',
});
defineVocabulary('https://json-schema.org/draft/2020-12/vocab/unevaluated', {
  unevaluatedItems: 'https://json-schema.org/keyword/unevaluatedItems',
  unevaluatedProperties: 'https://json-schema.org/keyword/unevaluatedProperties',
});
loadDialect(
  'https://json-schema.org/draft/2020-12/schema',
  {
    'https://json-schema.org/draft/2020-12/vocab/core': true,
    'https://json-schema.org/draft/2020-12/vocab/applicator': true,
    'https://json-schema.org/draft/2020-12/vocab/validation': true,
    'https://json-schema.org/draft/2020-12/vocab/meta-data': true,
    'https://json-schema.org/draft/2020-12/vocab/format-annotation': true,
    'https://json-schema.org/draft/2020-12/vocab/content': true,
    'https://json-schema.org/draft/2020-12/vocab/unevaluated': true,
  },
  true,
);
registerSchema(schema_default);
registerSchema(core_default);
registerSchema(applicator_default);
registerSchema(validation_default2);
registerSchema(meta_data_default);
registerSchema(format_annotation_default);
registerSchema(format_assertion_default);
registerSchema(content_default);
registerSchema(unevaluated_default);

// src/derive-session-context/read-preferences.ts
var import_yaml = __toESM(require_dist(), 1);

// schemas/preferences.json
var preferences_default = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://github.com/williamthorsen/codeassembly/raw/agents-v0.1.0/packages/agents/schemas/preferences.json',
  title: 'Preferences',
  description:
    'Configuration consumed by orchestrated agent skills. Resolved from .agents/preferences.yaml at the project level, with ~/.agents/preferences.yaml as a global fallback.',
  type: 'object',
  properties: {
    $schema: {
      type: 'string',
      description: 'JSON Schema reference URI for editor tooling.',
    },
    artifacts: {
      type: 'object',
      description: 'Artifact storage configuration: where generated artifacts live and how they are categorized.',
      properties: {
        base_dir: {
          type: 'string',
          description: 'Root directory for all generated artifacts. Supports `~` expansion. Default: `~/ai-artifacts`.',
        },
        paths: {
          type: 'object',
          description:
            'Maps artifact category names (e.g., `chats`, `devlogs`, `plans`) to subdirectory names relative to the project artifact directory. Any category key is permitted; values must be strings.',
          additionalProperties: {
            type: 'string',
          },
        },
      },
    },
    commit: {
      type: 'object',
      description: 'Commit-title rendering configuration consumed by the `describe-change.sh` script.',
      properties: {
        title_format: {
          type: 'string',
          description:
            'Template string used to render commit titles. Supports tokens such as `{scope}`, `{type}`, `{title}`, `{ticket_ref}` and optional `[...]` groups that drop when their tokens are empty.',
        },
      },
      required: ['title_format'],
    },
    editors: {
      type: 'array',
      description: 'Optional list of editor configurations mapping file extensions to an editor command.',
      items: {
        type: 'object',
        properties: {
          name: {
            type: 'string',
            description: 'Display name of the editor.',
          },
          command: {
            type: 'string',
            description: 'Shell command to open files. The file path is appended as an argument.',
          },
          extensions: {
            type: 'string',
            description: 'Glob pattern for file types this editor handles (e.g., `*.md`).',
          },
        },
        required: ['name', 'command', 'extensions'],
      },
    },
    integrations: {
      type: 'object',
      description:
        'Per-integration configuration. Keys are integration names (e.g., `jira`, `github`, `linear`); each integration object must declare an `enabled` boolean.',
      additionalProperties: {
        type: 'object',
        properties: {
          enabled: {
            type: 'boolean',
            description: 'Whether the integration is enabled.',
          },
        },
        required: ['enabled'],
      },
    },
    merge: {
      type: 'object',
      description: 'Squash-merge title rendering configuration for the `merge-pr` skill family.',
      properties: {
        title_format: {
          type: 'string',
          description:
            'Template string used to render the squash-merge commit title. Supports the same token vocabulary as `commit.title_format`, plus `{pr_number}`.',
        },
        strategy: {
          type: 'string',
          description:
            'Reserved key. Not yet honored by the `merge-pr` skill family \u2014 the skill currently performs squash merges unconditionally. Recorded here so the schema does not flag the key as unknown when projects opt to set it in anticipation of future support.',
        },
        delete_branch: {
          type: 'boolean',
          description:
            'Reserved key. Not yet honored by the `merge-pr` skill family \u2014 branch deletion is currently controlled by command-line flags and platform defaults. Recorded here so the schema does not flag the key as unknown when projects opt to set it in anticipation of future support.',
        },
      },
    },
    orchestration: {
      type: 'object',
      description:
        'Configuration for the multi-phase orchestration pipeline (review rounds, severity thresholds, MCP policy, model overrides).',
      properties: {
        max_review_rounds: {
          type: 'integer',
          description:
            'Maximum iterative review rounds before marking the run `needs_manual_review`. Overridden by `--max-review-rounds`.',
        },
        approval_threshold: {
          type: 'string',
          description: 'Minimum finding severity required for code approval. Overridden by `--approval-threshold`.',
          enum: ['none', 'low', 'medium', 'high'],
        },
        budget_threshold: {
          type: 'string',
          description:
            'Minimum finding severity for spending remaining review-round budget. Overridden by `--budget-threshold`.',
          enum: ['none', 'low', 'medium', 'high'],
        },
        models: {
          type: 'object',
          description:
            'Per-role model overrides (e.g., `coder`, `architect`, `holistic_reviewer`). Any role key is permitted; values must be strings naming a model.',
          additionalProperties: {
            type: 'string',
          },
        },
        mcp_policy: {
          type: 'string',
          description:
            'How to handle MCP unavailability: `required` aborts, `optional` continues with a warning, `prompt` asks the developer.',
        },
      },
    },
    platform: {
      type: 'string',
      description:
        'Development platform. Initial supported values are `github` and `bitbucket`; new platforms can be added additively.',
      enum: ['github', 'bitbucket'],
    },
    pr: {
      type: 'object',
      description: 'Pull-request title rendering configuration.',
      properties: {
        title_format: {
          type: 'string',
          description:
            'Template string used to render pull-request titles. Supports the same token vocabulary as `commit.title_format`.',
        },
      },
      required: ['title_format'],
    },
    project: {
      type: 'object',
      description: 'Project identification configuration.',
      properties: {
        slug: {
          type: 'string',
          description: 'Project identifier used for namespacing artifacts under `{base_dir}/projects/{slug}/`.',
        },
        ticket_ref_prefix: {
          type: 'string',
          description:
            'Prefix that appears at the start of `ticket_ref`. Use `#` for GitHub issues (added at render time, omitted from file paths) or a Jira project key like `MAC-` (part of the canonical ticket ID).',
        },
      },
    },
    repository: {
      type: 'object',
      description: 'Repository configuration: default remote and (deprecated) project slug fallback.',
      properties: {
        default_remote: {
          type: 'object',
          description: 'Default git remote used when constructing remote refs such as `origin/main`.',
          properties: {
            name: {
              type: 'string',
              description: 'Name of the default git remote (e.g., `origin`).',
            },
            default_branch: {
              type: 'string',
              description: 'Default branch of the remote (e.g., `main`).',
            },
          },
          required: ['name', 'default_branch'],
        },
        slug: {
          type: 'string',
          description: 'Deprecated. Use `project.slug` instead. Kept as a fallback.',
        },
      },
    },
    ticket: {
      type: 'object',
      description: 'Ticket (issue) title rendering configuration.',
      properties: {
        title_format: {
          type: 'string',
          description:
            'Template string used to render ticket (issue) titles. Supports the same token vocabulary as `commit.title_format`.',
        },
      },
      required: ['title_format'],
    },
  },
  additionalProperties: false,
};

// src/derive-session-context/read-preferences.ts
var schemaRegistered = false;
var SCHEMA_ID = preferences_default.$id;
async function readPreferences(input) {
  const home = input.home ?? homedir();
  const projectPath = path4.join(input.cwd, '.agents', 'preferences.yaml');
  const globalPath = path4.join(home, '.agents', 'preferences.yaml');
  const project = await readOptionalYaml(projectPath);
  const global = await readOptionalYaml(globalPath);
  const merged = mergeTopLevel(global?.value, project?.value);
  await assertValidatesAgainstSchema(merged);
  const sources = {
    ...(project !== null && { project: projectPath }),
    ...(global !== null && { global: globalPath }),
  };
  return {
    preferences: merged,
    sources,
  };
}
async function readOptionalYaml(filePath) {
  let text;
  try {
    text = await readFile(filePath, 'utf8');
  } catch (error) {
    if (isEnoentError(error)) {
      return null;
    }
    throw error;
  }
  let parsed;
  try {
    parsed = (0, import_yaml.parse)(text);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`${filePath}: malformed YAML \u2014 ${message}`);
  }
  return { value: parsed ?? {} };
}
function mergeTopLevel(global, project) {
  const result = {};
  if (isRecord(global)) {
    for (const [key, value3] of Object.entries(global)) {
      result[key] = value3;
    }
  }
  if (isRecord(project)) {
    for (const [key, value3] of Object.entries(project)) {
      result[key] = value3;
    }
  }
  return result;
}
async function assertValidatesAgainstSchema(merged) {
  ensureSchemaRegistered();
  const jsonValue = toJsonValue(merged);
  const output = await validate(SCHEMA_ID, jsonValue, FLAG);
  if (!output.valid) {
    throw new Error(
      `preferences failed schema validation against ${SCHEMA_ID}. Check the contents of .agents/preferences.yaml (or the global ~/.agents/preferences.yaml).`,
    );
  }
}
function ensureSchemaRegistered() {
  if (schemaRegistered) {
    return;
  }
  try {
    registerSchema(preferences_default, SCHEMA_ID);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const isDuplicateRegistration = message.includes('already been registered') && message.includes(SCHEMA_ID);
    if (!isDuplicateRegistration) {
      throw error;
    }
  }
  schemaRegistered = true;
}
function isRecord(value3) {
  return typeof value3 === 'object' && value3 !== null && !Array.isArray(value3);
}
function isEnoentError(error) {
  if (!isRecord(error)) {
    return false;
  }
  return error.code === 'ENOENT';
}
function toJsonValue(value3) {
  if (value3 === null) {
    return null;
  }
  if (typeof value3 === 'string') {
    return value3;
  }
  if (typeof value3 === 'number') {
    return value3;
  }
  if (typeof value3 === 'boolean') {
    return value3;
  }
  if (Array.isArray(value3)) {
    return value3.map((entry) => toJsonValue(entry));
  }
  if (isRecord(value3)) {
    const result = {};
    for (const [key, entry] of Object.entries(value3)) {
      result[key] = toJsonValue(entry);
    }
    return result;
  }
  throw new TypeError(`unexpected non-JSON value of type ${typeof value3}`);
}

// src/derive-session-context/cli.ts
var execFileAsync = promisify(execFile);
var REQUIRED_MANIFEST_FIELDS = [
  'ticket_id',
  'ticket_ref',
  'project_slug',
  'platform',
  'default_branch',
  'branch_name',
  'artifact_base_dir',
  'artifact_paths',
  'created_at',
];
async function main() {
  try {
    const parsed = parseArgs(process.argv.slice(2));
    const cwd2 = parsed.cwd ?? process.cwd();
    const branch = parsed.branch ?? (await resolveCurrentBranch(cwd2));
    const manifest = await deriveSessionContext({ cwd: cwd2, branch, now: /* @__PURE__ */ new Date() });
    process.stdout.write(`${JSON.stringify(manifest, null, 2)}
`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`derive-session-context: ${message}
`);
    process.exit(1);
  }
}
async function deriveSessionContext(input) {
  if (input.branch === '' || input.branch === 'HEAD') {
    throw new Error('Detached HEAD: this script requires an active branch. Create or check out a branch first.');
  }
  const home = input.home ?? homedir2();
  const sanitizedBranch = sanitizeBranch(input.branch);
  const newPath = path5.join(input.cwd, '.agents', `${sanitizedBranch}.branch-manifest.json`);
  const oldPath = path5.join(input.cwd, '.agents', `${sanitizedBranch}.manifest.json`);
  const cached = await tryReadManifest(newPath);
  if (cached !== null) {
    return cached;
  }
  const cachedOld = await tryReadManifest(oldPath);
  if (cachedOld !== null) {
    return cachedOld;
  }
  const readResult = await readPreferences({ cwd: input.cwd, home });
  const manifest = composeManifest({
    preferences: readResult.preferences,
    branchName: input.branch,
    cwd: input.cwd,
    home,
    now: input.now,
  });
  await mkdir(path5.dirname(newPath), { recursive: true });
  await writeFile(
    newPath,
    `${JSON.stringify(manifest, null, 2)}
`,
    'utf8',
  );
  return manifest;
}
function sanitizeBranch(branch) {
  let sanitized = branch.trim().replaceAll('/', '-');
  while (sanitized.endsWith('-')) {
    sanitized = sanitized.slice(0, -1);
  }
  return sanitized;
}
async function tryReadManifest(filePath) {
  let text;
  try {
    text = await readFile2(filePath, 'utf8');
  } catch (error) {
    if (isEnoentError2(error)) {
      return null;
    }
    throw error;
  }
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!isCurrentSchema(parsed)) {
    return null;
  }
  return parsed;
}
function isCurrentSchema(value3) {
  if (!isRecord2(value3)) {
    return false;
  }
  for (const field of REQUIRED_MANIFEST_FIELDS) {
    if (!(field in value3)) {
      return false;
    }
  }
  return true;
}
function isEnoentError2(error) {
  if (!isRecord2(error)) {
    return false;
  }
  return error.code === 'ENOENT';
}
function isRecord2(value3) {
  return typeof value3 === 'object' && value3 !== null && !Array.isArray(value3);
}
async function resolveCurrentBranch(cwd2) {
  try {
    const { stdout } = await execFileAsync('git', ['-C', cwd2, 'branch', '--show-current']);
    return stdout.trim();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not resolve current branch (is this a git repository?): ${message}`);
  }
}
function parseArgs(argv) {
  let branch = null;
  let cwd2 = null;
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--branch') {
      const value3 = argv[i + 1];
      if (value3 === void 0 || value3.startsWith('--')) {
        throw new Error('--branch requires a value');
      }
      branch = value3;
      i += 1;
    } else if (arg === '--cwd') {
      const value3 = argv[i + 1];
      if (value3 === void 0 || value3.startsWith('--')) {
        throw new Error('--cwd requires a value');
      }
      cwd2 = value3;
      i += 1;
    } else if (arg !== void 0 && arg.startsWith('--branch=')) {
      branch = arg.slice('--branch='.length);
    } else if (arg !== void 0 && arg.startsWith('--cwd=')) {
      cwd2 = arg.slice('--cwd='.length);
    } else if (arg !== void 0) {
      throw new Error(`unknown argument: ${arg}`);
    }
  }
  return { branch, cwd: cwd2 };
}
if (isMain()) {
  await main();
}
function isMain() {
  const entry = process.argv[1];
  if (entry === void 0) {
    return false;
  }
  try {
    return realpathSync(fileURLToPath2(import.meta.url)) === realpathSync(entry);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    process.stderr.write(`derive-session-context: warning: could not determine entry point: ${message}
`);
    return false;
  }
}
export { deriveSessionContext, parseArgs, sanitizeBranch };
/*! Bundled license information:

content-type/index.js:
  (*!
   * content-type
   * Copyright(c) 2015 Douglas Christopher Wilson
   * MIT Licensed
   *)
*/
