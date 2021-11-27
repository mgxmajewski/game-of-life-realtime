require('dotenv').config();
const {GraphQLServer, PubSub} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError} = require("apollo-server-core");
const {stateInitializer, initialGrid} = require("./utils");
// import * as jwt from "jsonwebtoken";

const initialStatesArraySize = 1
const states = new Array(initialStatesArraySize);

// Initialize state for user.

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
            const token = req.headers.authorization
            const {id} = verifyToken(token);
            console.log(id)
            states.shift()
            states.push({
                id,
                user,
                grid
            });
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
let authorisedToken;
const subscriptionToken = (connectionParams) => connectionParams.Authorization
const mutationToken = (ctx) => ctx.req.get("Authorization")

const verifyToken = (token) => Jwt.verify(token, process.env.SECRET)

const authenticate = async (resolve, root, args, context, info) => {
    try {
        if (currentSubscriptionToken) {
            authorisedToken = verifyToken(currentSubscriptionToken)
        } else {
            authorisedToken = verifyToken(mutationToken(context))
        }
    } catch (e) {
        return new AuthenticationError("Not authorised");
    }
    context.claims = authorisedToken.claims;
    if (states.length === initialStatesArraySize) {
        console.log('initialization')
        stateInitializer(states, initialGrid, authorisedToken.id)
    }

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
    middlewares: [{
        Query: authenticate,
        Mutation: authenticate
    }]
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
