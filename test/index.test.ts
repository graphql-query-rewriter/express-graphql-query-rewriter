import { graphqlRewriterMiddleware } from '../src';
import { buildSchema } from 'graphql';
import * as graphqlHTTP from 'express-graphql';
import * as express from 'express';
import * as request from 'supertest';
import {
  FieldArgTypeRewriter,
  FieldArgsToInputTypeRewriter,
  NestFieldOutputsRewriter
} from 'graphql-query-rewriter';

const schema = buildSchema(`
  type Query {
    getPokemon(id: ID!): Pokemon
  }

  type Mutation {
    makePokemon(input: MakePokemonInput!): MakePokemonOutput
  }

  type Pokemon {
    name: String!
    id: ID!
  }

  input MakePokemonInput {
    name: String!
  }

  type MakePokemonOutput {
    pokemon: Pokemon!
  }
`);

const rootValue = {
  getPokemon: ({ id }: any) => {
    if (id.toString() !== '7') return null;
    return {
      id: 7,
      name: 'Charmander'
    };
  },
  makePokemon: ({ input }: any) => ({
    pokemon: {
      id: '17',
      name: input.name
    }
  })
};

describe('middleware test', () => {
  it('rewrites queries before express-graphql receives them', async () => {
    const app = express();

    app.use(
      '/graphql',
      graphqlRewriterMiddleware({
        rewriters: [
          new FieldArgTypeRewriter({
            fieldName: 'getPokemon',
            argName: 'id',
            oldType: 'String!',
            newType: 'ID!'
          })
        ]
      })
    );

    app.use(
      '/graphql',
      graphqlHTTP({
        schema,
        rootValue
      })
    );

    // in the past, we accidentally used `String!` instead of `ID`
    // so we need to rewrite the query to this old query will work still
    const deprecatedQuery = `
      query getByIdWithWrongType($id: String!) {
        getPokemon(id: $id) {
          id
          name
        }
      }
    `;

    const deprecatedRes = await request(app)
      .post('/graphql')
      .send({ query: deprecatedQuery, variables: { id: '7' } });
    expect(deprecatedRes.body.errors).toBe(undefined);
    expect(deprecatedRes.body.data.getPokemon).toEqual({
      id: '7',
      name: 'Charmander'
    });

    // the new version of the query should still work too
    const newQuery = `
      query getByIdWithCorrectType($id: ID!) {
        getPokemon(id: $id) {
          id
          name
        }
      }
    `;

    const newRes = await request(app)
      .post('/graphql')
      .send({ query: newQuery, variables: { id: '7' } });
    expect(newRes.body.errors).toBe(undefined);
    expect(newRes.body.data.getPokemon).toEqual({
      id: '7',
      name: 'Charmander'
    });
  });

  it('rewrites mutations and responses too', async () => {
    const app = express();

    app.use(
      '/graphql',
      graphqlRewriterMiddleware({
        rewriters: [
          new FieldArgsToInputTypeRewriter({
            fieldName: 'makePokemon',
            argNames: ['name']
          }),
          new NestFieldOutputsRewriter({
            fieldName: 'makePokemon',
            newOutputName: 'pokemon',
            outputsToNest: ['id', 'name']
          })
        ]
      })
    );

    app.use(
      '/graphql',
      graphqlHTTP({
        schema,
        rootValue
      })
    );

    // in the past, we didn't use input or output types correctly
    // so we need to rewrite the query to this old query will work still
    const deprecatedQuery = `
      mutation makePokemonWithWrongType($name: String!) {
        makePokemon(name: $name) {
          id
          name
        }
      }
    `;

    const deprecatedRes = await request(app)
      .post('/graphql')
      .send({ query: deprecatedQuery, variables: { name: 'Squirtle' } });
    expect(deprecatedRes.body.errors).toBe(undefined);
    expect(deprecatedRes.body.data.makePokemon).toEqual({
      id: '17',
      name: 'Squirtle'
    });

    // the new version of the query should still work with no problem though
    const newQuery = `
      mutation makePokemon($input: MakePokemonInput!) {
        makePokemon(input: $input) {
          pokemon {
            id
            name
          }
        }
      }
    `;

    const newRes = await request(app)
      .post('/graphql')
      .send({ query: newQuery, variables: { input: { name: 'Squirtle' } } });
    expect(newRes.body.errors).toBe(undefined);
    expect(newRes.body.data.makePokemon).toEqual({
      pokemon: {
        id: '17',
        name: 'Squirtle'
      }
    });
  });
});
