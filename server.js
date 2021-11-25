require('dotenv').config();
const {GraphQLServer, PubSub} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError} = require("apollo-server-core");
const {stateInitializer, initialGrid} = require("./utils");
// import * as jwt from "jsonwebtoken";

const statesArraySize = 1
const states = new Array(statesArraySize);

// Initialize state for user.
stateInitializer(states, initialGrid)

const typeDefs = `
  type State {
    id: ID!
    user: String!
    grid: [[String]]!
  }
  type Query {
    states: [State!]
  }
  type Mutation {
    postState(user: String!, grid: [[String]]!): ID!
    getStatesLength: String!
  }
  type Subscription {
    states: [State!]
  }
`;

const subscribers = [];
const onStatesUpdates = (fn) => subscribers.push(fn);

const resolvers = {
    Query: {
        states: () => states,
    },
    Mutation: {
        postState: async (parent, {user, grid}, {req, url}) => {
            const id = states.length;
            states.shift()
            states.push({
                id,
                user,
                grid
            });
            console.log(url)
            console.log(req.headers.authorization)
            subscribers.forEach((fn) => fn());
            return id;
        },
        getStatesLength: () => {
            const currentSize = states.length;
            subscribers.forEach((fn) => fn());
            return currentSize;
        }
    },
    Subscription: {
        states: {
            subscribe: (parent, args, {pubsub}) => {
                const channel = Math.random().toString(36).slice(2, 15);
                onStatesUpdates(() => pubsub.publish(channel, {states}));
                setTimeout(() => pubsub.publish(channel, {states}), 0);
                return pubsub.asyncIterator(channel);
            },
        },
    },
};

let currentSubscriptionToken;
const subscriptionToken = (connectionParams) => connectionParams.Authorization
const httpRequestToken = (ctx) => ctx.req.get("Authorization")

const verifyToken = (token) => Jwt.verify(token, process.env.SECRET)

const authenticate = async (resolve, root, args, context, info) => {
    let authorisedToken;
    try {
       if (currentSubscriptionToken) {
           authorisedToken = verifyToken(currentSubscriptionToken)
       } else {
           authorisedToken = verifyToken(httpRequestToken(context))
       }
    } catch (e) {
        return new AuthenticationError("Not authorised");
    }
    context.claims = authorisedToken.claims;
    return await resolve(root, args, context, info);
};

const pubsub = new PubSub();
const server = new GraphQLServer({
    typeDefs,
    resolvers,
    context: ({request, response}) => ({
        url: request ? request.protocol + "://" + request.get("host") : "",
        req: request,
        res: response,
        pubsub
    }),
    middlewares: [authenticate]
});

const options = {
    port: 4000,
    subscriptions: {
        onConnect: async (connectionParams, webSocket) => {
            currentSubscriptionToken = await subscriptionToken(connectionParams)
        },
    },
};


server.start(options, ({port}) => {
    console.log(`Server on http://localhost:${port}/`);
});
