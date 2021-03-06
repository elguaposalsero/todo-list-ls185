const config = require("./config");
const { Client } = require("pg");

const isProduction = (config.NODE_ENV === "production")
const CONNECTION = {
  connectionString: config.DATABASE_URL || 'postgresql://albertdorfman@localhost:5432/todo_lists',
  ssl: isProduction ? { rejectUnauthorized: false } : false
}

const logQuery = (statement, parameters) => {
  let timeStamp = new Date();
  let formattedTimeStamp = timeStamp.toString().substring(4, 24);
  console.log(formattedTimeStamp, statement, parameters);
}


module.exports = {
  async dbQuery(statement, ...parameters) {
    // This collects the parameters into one array
    let client = new Client(CONNECTION);

    await client.connect();
    logQuery(statement, parameters);
    let result = await client.query(statement, parameters);
    client.end();

    return result;
  }
}