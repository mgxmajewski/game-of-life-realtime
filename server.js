require('dotenv').config();
const {GraphQLServer, PubSub, withFilter} = require("graphql-yoga");
const Jwt = require('jsonwebtoken');
const {AuthenticationError, gql, ApolloServerPluginInlineTrace} = require("apollo-server-core");
const {initialGrid} = require("./utils");
const Redis = require("ioredis");
const jwt_decode = require("jwt-decode");

const redis = new Redis();

const initialStatesArraySize = 1
const states = new Array(initialStatesArraySize);
const channel = Math.random().toString(36).slice(2, 15);
const sessions = {}
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
            pubsub.publish(channel, {sessions: sessions[id]})
            return id;
        },
        getStatesLength: () => {
            const currentSize = states.length;
            return currentSize;
        }
    },
    Subscription: {
        sessions: {
            subscribe: withFilter(
                (parent, args, {pubsub}) => {
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

const verifyToken = (token) => Jwt.verify(token, process.env.SECRET)

const authenticate = async (resolve, root, args, context, info) => {

    try {
        if (currentSubscriptionToken) {
            console.log(`currentSubscriptionToken: ` + currentSubscriptionToken);
            authorisedToken = verifyToken(currentSubscriptionToken)
        } else {
            console.log("You need to login");
            return new AuthenticationError("You need to login");
        }
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
            // currentSubscriptionToken = await subscriptionToken(connectionParams)
            const jwtWithoutSignature = await subscriptionToken(connectionParams)
            const splitToken = jwtWithoutSignature.split('.');
            const headerAndPayload = `${splitToken[0]}.${splitToken[1]}`;
            // const splitToken = jwtWithoutSignature.split('.');
            // const headerAndPayload = `${splitToken[0]}.${splitToken[1]}`;
            await redis.get(`${jwt_decode(headerAndPayload).id}`).then(function (result) {
                signatureToStitch = JSON.parse(result).signature;
                currentSubscriptionToken = `${headerAndPayload}${signatureToStitch}`
            });

        },
    },
};

server.start(options, ({port}) => {
    console.log(`Server on http://localhost:${port}/`);
});
