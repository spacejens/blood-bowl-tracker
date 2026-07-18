import type { Rule } from 'eslint';

export const maxFunctionParams: Rule.RuleModule = {
  meta: {
    type: 'problem',
    docs: {
      description:
        'enforce a maximum number of parameters, exempting constructors',
    },
    schema: [
      {
        type: 'object',
        properties: { max: { type: 'number' } },
        additionalProperties: false,
      },
    ],
  },
  create(context) {
    // Deliberately visits only concrete function nodes (declarations,
    // expressions, arrow functions) — not type-level signatures like
    // `TSFunctionType`/`TSMethodSignature`. A 4-param signature at the type
    // level still can't slip through unflagged, since any real implementation
    // is one of the three node types below.
    const options = context.options[0] as Record<string, unknown> | undefined;
    const max =
      (typeof options?.max === 'number' ? options.max : undefined) ?? 3;
    function check(node: Rule.Node & { params: unknown[] }) {
      const isConstructor =
        node.parent?.type === 'MethodDefinition' &&
        node.parent.kind === 'constructor';
      if (node.params.length > max && !isConstructor) {
        context.report({
          node,
          message: `Functions should take at most ${max} parameters. Use a named options object for more.`,
        });
      }
    }
    return {
      FunctionDeclaration: check,
      FunctionExpression: check,
      ArrowFunctionExpression: check,
    };
  },
};
