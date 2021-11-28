require('dotenv').config();
const {GraphQLServer, PubSub, withFilter} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError, gql, ApolloServerPluginInlineTrace} = require("apollo-server-core");
const {stateInitializer, initialGrid} = require("./utils");
// import * as jwt from "jsonwebtoken";

const initialStatesArraySize = 1
const states = new Array(initialStatesArraySize);
// Initialize state for user.

const typeDefs = gql`
    type Session {
        state: [[String]]!
    }
    type State {
        id: ID!
        grid: [[String]]!
    }
    type Query {
        states: [State!]
        session(id: String): Session
    }
    type Mutation {
        postState(grid: [[String]]!): ID!
        getStatesLength: String!
    }
    type Subscription {
        states(userId: Int!): [State!]
    }
`;

const sessions = {}

const subscribers = [];
const onStatesUpdates = (fn) => subscribers.push(fn);

const resolvers = {
    Query: {
        states: () => states,
        session: (_, {id}) => {
        return sessions[id];
      }
    },
    Mutation: {
        postState: async (parent, {grid}, {req, url}) => {
            const token = req.headers.authorization
            const {id} = verifyToken(token);
            console.log(id)
            sessions[id] = {
                state: grid
            }
            console.log(sessions)
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
            subscribe: withFilter(
                (parent, args, {pubsub}) => {
                    const channel = Math.random().toString(36).slice(2, 15);
                    // console.log(`states: ${states}, channel: ${channel}, subscribers: ${subscribers.length}`)
                    onStatesUpdates(() => pubsub.publish(channel, {states}));
                    setTimeout(() => pubsub.publish(channel, {states}), 0);
                    return pubsub.asyncIterator(channel)
                },
                (payload, variables) => {
                    // console.log(`payload: ${JSON.stringify(payload.states[payload.states.length - 1].id)}`)
                    // console.log(`variables: ${JSON.stringify(variables.userId)}`)
                    // // console.log(typeof payload.states[payload.states.length - 1].id)
                    // // console.log(typeof variables.userId)
                    // console.log(payload.states[payload.states.length - 1].id === variables.userId)
                    // console.log(payload.states)
                    // console.log(variables.userId)
                    // console.log(variables.userId in payload.states)
                    return payload.states[payload.states.length - 1].id === variables.userId;
                }
            ),
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
    if (!sessions[authorisedToken.id]) {
        console.log('initialization')
        sessions[authorisedToken.id] = {
            state: initialGrid
        }
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
    plugins: [ApolloServerPluginInlineTrace()],
    middlewares: [{
        Query: authenticate,
        Mutation: authenticate,
        Subscription: authenticate
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
