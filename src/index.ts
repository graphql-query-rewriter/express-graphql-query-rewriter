import { RequestHandler, Response } from 'express';
import * as graphqlHTTP from 'express-graphql';
import { RewriteHandler, Rewriter } from 'graphql-query-rewriter';

interface RewriterMiddlewareOpts {
  rewriters: Rewriter[];
  ignoreParsingErrors?: boolean;
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

const graphqlRewriterMiddleware = ({
  rewriters,
  ignoreParsingErrors = true
}: RewriterMiddlewareOpts): RequestHandler =>
  // tslint:disable-next-line: only-arrow-functions
  async function(req, res, next) {
    try {
      const params = await (graphqlHTTP as any).getGraphQLParams(req);
      const { query, variables, operationName } = params;
      if (!query) {
        return next();
      }
      const rewriteHandler = new RewriteHandler(rewriters);
      const newQueryAndVariables = rewriteHandler.rewriteRequest(query, variables || undefined);
      const newBody = {
        operationName,
        query: newQueryAndVariables.query,
        variables: newQueryAndVariables.variables
      };
      if (typeof req.body === 'object' && !(req.body instanceof Buffer)) {
        req.body = { ...req.body, ...newBody };
      } else {
        req.body = newBody;
      }
      req._rewriteHandler = rewriteHandler;
      rewriteResJson(res);
    } catch (err) {
      if (!ignoreParsingErrors) return next(err);
    }
    next();
  };

export { graphqlRewriterMiddleware };
