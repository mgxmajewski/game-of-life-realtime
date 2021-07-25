const {GraphQLServer} = require('graphql-yoga');

const states = []

const typeDefs = `
    type State {
    id: ID!
    grid: Array!
    }
    
    type Query {
        states: [State!]
}
`;

const resolvers = {
    Query: {
        states: () => states,
    }
}

const server = new GraphQLServer({typeDefs, resolvers});
server.start(({port}) =>{
    console.log(`Server started on http://localhost:${port}`)
});

