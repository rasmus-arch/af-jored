const createApp = require('./app');
const config = require('./config');

const app = createApp();

app.listen(config.port, () => {
  console.log(`Servern lyssnar på port ${config.port} (${config.env})`);
});

module.exports = app;
