import { maxLinesRule } from './max-lines';

/**
 * `markdownlint-cli2` loads a custom rule by module path and may either
 * `require()` the module or dynamically `import()` it and read `.default`.
 * `export =` emits a bare `module.exports = maxLinesRule`, which yields the
 * rule object itself on both paths — `export default` would emit
 * `exports.default` and hand markdownlint a namespace object on the
 * `require()` path.
 */
export = maxLinesRule;
