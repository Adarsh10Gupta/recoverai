const app = require("./app");
const config = require("./config/env");

app.listen(config.port, () => {
  console.log(`RecoverAI backend running on port ${config.port}`);
});
