// tslint:disable-next-line:no-namespace
declare namespace Express {
  interface Request {
    _rewriteHandler?: import('graphql-query-rewriter').RewriteHandler;
  }

  interface Response {
    _isRewritten?: boolean;
  }
}
