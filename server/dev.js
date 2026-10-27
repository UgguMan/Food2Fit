const app = require('./app');
const { port } = require('./config/env');

app.listen(port, () => {
  console.log(`Food2Fit API listening on http://localhost:${port}`);
});
