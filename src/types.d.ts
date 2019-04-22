declare namespace Express {
  interface Request {
    _rewriteHandler?: import('graphql-query-rewriter').RewriteHandler;
  }
}

declare module 'express-graphql' {
  interface Params {
    query: string | null | undefined;
    variables: { [name: string]: any } | null | undefined;
    operationName: string | null | undefined;
    raw: boolean | null | undefined;
  }
  function getGraphQLParams(req: Request): Promise<Params>;
}
