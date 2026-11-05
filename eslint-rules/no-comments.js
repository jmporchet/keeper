export const noComments = {
  meta: {
    type: "problem",
    docs: {
      description: "Disallow comments",
    },
    schema: [],
    messages: {
      forbidden: "Comments are forbidden.",
    },
  },
  create(context) {
    return {
      Program() {
        for (const comment of context.sourceCode.getAllComments()) {
          context.report({ loc: comment.loc, messageId: "forbidden" });
        }
      },
    };
  },
};
