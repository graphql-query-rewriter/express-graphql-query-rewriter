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
    if (!this.req || !this.req._rewriteHandler || this._isRewritten) return originalJsonFunc(body);
    this._isRewritten = true;
    const rewriteHandler = this.req._rewriteHandler;
    if (typeof body === 'object' && !(body instanceof Buffer) && body.data) {
      const newResponseData = rewriteHandler.rewriteResponse(body.data);
      const newResBody = { ...body, data: newResponseData };
      return originalJsonFunc(newResBody);
    }
    return originalJsonFunc(body);
  };
};

const rewriteResRaw = (res: Response) => {
  const originalEndFunc = res.end.bind(res);
  res.end = function(body: any) {
    if (!this.req || !this.req._rewriteHandler || this._isRewritten || this.headersSent) {
      return originalEndFunc(body);
    }
    this._isRewritten = true;
    const existingHeaders = this.getHeaders();
    const isJsonContent = existingHeaders['content-type'] === 'application/json; charset=utf-8';
    const rewriteHandler = this.req._rewriteHandler;
    if (isJsonContent && body instanceof Buffer) {
      try {
        const bodyJson = JSON.parse(body.toString('utf8'));
        if (bodyJson && bodyJson.data) {
          const newResponseData = rewriteHandler.rewriteResponse(bodyJson.data);
          const newResBodyJson = { ...bodyJson, data: newResponseData };
          // assume this was pretty-printed if we're here and not in the res.json handler
          const newResBodyStr = JSON.stringify(newResBodyJson, null, 2);
          const newResChunk = Buffer.from(newResBodyStr, 'utf8');
          this.setHeader('Content-Length', String(newResChunk.length));
          return originalEndFunc(newResChunk);
        }
      } catch (err) {
        // if we can't decode the response as json, just forward it along
        return originalEndFunc(body);
      }
    }
    return originalEndFunc(body);
  };
};

const rewriteRes = (res: Response) => {
  rewriteResJson(res);
  // if res.json isn't available, or pretty-printing is enabled, express-graphql uses raw res.end()
  rewriteResRaw(res);
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
      rewriteRes(res);
    } catch (err) {
      if (!ignoreParsingErrors) return next(err);
    }
    next();
  };

export { graphqlRewriterMiddleware };
