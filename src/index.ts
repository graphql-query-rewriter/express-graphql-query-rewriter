import { Rewriter, RewriteHandler } from 'graphql-query-rewriter';
import { Request, Response, NextFunction } from 'express';
import { getGraphQLParams } from 'express-graphql';

interface RewriterMiddlewareOpts {
  rewriters: Rewriter[];
}

const rewriteResJson = (res: Response) => {
  const originalJson = res.json;
  res.json = function(body: any) {
    if (!this.req || !this.req._rewriteHandler) return originalJson(body);
    const rewriteHandler = this.req._rewriteHandler;
    if (typeof body === 'object' && !(body instanceof Buffer) && body.data) {
      const newResponseData = rewriteHandler.rewriteResponse(body.data);
      const newResBody = { ...body, data: newResponseData };
      return originalJson(newResBody);
    }
    return originalJson(body);
  };
};

const graphqlRewriterMiddleware = ({ rewriters }: RewriterMiddlewareOpts) => async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const params = await getGraphQLParams(req);
    const { query, variables, operationName } = params;
    if (!query) {
      return;
    }
    const rewriteHandler = new RewriteHandler(rewriters);
    const newQueryAndVariables = rewriteHandler.rewriteRequest(query, variables || undefined);
    const newBody = {
      query: newQueryAndVariables.query,
      variables: newQueryAndVariables.variables,
      operationName
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
