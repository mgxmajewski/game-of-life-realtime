const {GraphQLServer, PubSub} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError} = require("apollo-server-core");
const {stateInitializer, initialGrid} = require("./utils");
// import * as jwt from "jsonwebtoken";

const statesArraySize = 4
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

let subToken


const authenticate = async (resolve, root, args, context, info) => {
    let token;

    try {

        if (subToken) {
            token = Jwt.verify(subToken, "NeverShareYourSecret")
        } else {
            console.log('reqToken')
            token = Jwt.verify(context.req.get("Authorization"), "NeverShareYourSecret");
        }
    } catch (e) {
        return new AuthenticationError("Not authorised");
    }
    context.claims = token.claims;
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
            subToken = await connectionParams.Authorization
            console.log(subToken)
        },
    },
};

server.start(options, ({port}) => {
    console.log(`Server on http://localhost:${port}/`);
});
