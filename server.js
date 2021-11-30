require('dotenv').config();
const {GraphQLServer, PubSub, withFilter} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError, gql, ApolloServerPluginInlineTrace} = require("apollo-server-core");
const {initialGrid} = require("./utils");
// import * as jwt from "jsonwebtoken";

const initialStatesArraySize = 1
const states = new Array(initialStatesArraySize);
// Initialize state for user.

const typeDefs = gql`
    type Session {
        id: Int!
        state: [[String]]
    }
    type State {
        id: ID!
        grid: [[String]]!
    }
    type Query {
        #        states: [State!]
        sessions(id: String): Session
    }
    type Mutation {
        postState(grid: [[String]]!): ID!
        getStatesLength: String!
    }
    type Subscription {
        #        states(userId: Int!): [State!]
        sessions(id: Int!): Session
    }
`;

const sessions = {}

const subscribers = [];
const onStatesUpdates = (fn) => subscribers.push(fn);

const resolvers = {
    Query: {
        // states: () => states,
        sessions: (_, {id}) => {
            return sessions[id];
        }
    },
    Mutation: {
        postState: async (parent, {grid}, {req, url}) => {
            console.log(req.body.variables.grid);
            const token = req.headers.authorization
            const {id} = verifyToken(token);
            sessions[id].id = id
            sessions[id].state = grid
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
        sessions: {
            subscribe: withFilter(
                (parent, args, {pubsub}) => {
                    const channel = Math.random().toString(36).slice(2, 15);
                    onStatesUpdates(() => pubsub.publish(channel, {sessions: sessions[args.id]}));
                    console.log(sessions[args.id])
                    setTimeout(() => pubsub.publish(channel, {sessions: sessions[args.id]}), 0);
                    return pubsub.asyncIterator(channel)
                },
                // filter by id
                (payload, variables) => {
                    return variables.id === payload.sessions.id
                }
            )
        }
    },
};


let currentSubscriptionToken;
let authorisedToken;
const subscriptionToken = (connectionParams) => connectionParams.Authorization
const mutationToken = (ctx) => ctx.req.get("Authorization")

const verifyToken = (token) => Jwt.verify(token, process.env.SECRET)

const authenticate = async (resolve, root, args, context, info) => {
    console.log('popo')
    try {
        if (currentSubscriptionToken) {
            authorisedToken = verifyToken(currentSubscriptionToken)
        } else {
            authorisedToken = verifyToken(mutationToken(context))
        }
        console.log(authorisedToken.id)
    } catch (e) {
        return new AuthenticationError("Not authorised");
    }

    // Create session's initial state for freshly logged in user
    const {id} = authorisedToken
    if (!sessions[id]) {
        sessions[id] = {
            id: id,
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
