import { NextFunction, Request, Response } from 'express';
import * as graphqlHTTP from 'express-graphql';
import { RewriteHandler, Rewriter } from 'graphql-query-rewriter';

interface RewriterMiddlewareOpts {
  rewriters: Rewriter[];
}

const rewriteResJson = (res: Response) => {
  const originalJsonFunc = res.json.bind(res);
  res.json = function(body: any) {
    if (!this.req || !this.req._rewriteHandler) return originalJsonFunc(body);
    const rewriteHandler = this.req._rewriteHandler;
    if (typeof body === 'object' && !(body instanceof Buffer) && body.data) {
      const newResponseData = rewriteHandler.rewriteResponse(body.data);
      const newResBody = { ...body, data: newResponseData };
      return originalJsonFunc(newResBody);
    }
    return originalJsonFunc(body);
  };
};

const graphqlRewriterMiddleware = ({ rewriters }: RewriterMiddlewareOpts) =>
  // tslint:disable-next-line: only-arrow-functions
  async function(req: Request, res: Response, next: NextFunction) {
    try {
      const params = await (graphqlHTTP as any).getGraphQLParams(req);
      const { query, variables, operationName } = params;
      if (!query) {
        return;
      }
      const rewriteHandler = new RewriteHandler(rewriters);
      const newQueryAndVariables = rewriteHandler.rewriteRequest(query, variables || undefined);
      const newBody = {
        operationName,
        query: newQueryAndVariables.query,
        variables: newQueryAndVariables.variables
      };
      if (typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        req.body = { ...req.body, newBody };
      } else {
        req.body = newBody;
      }
      req._rewriteHandler = rewriteHandler;
      rewriteResJson(res);
    } finally {
      next();
    }
  };

export { graphqlRewriterMiddleware };
