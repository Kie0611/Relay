import "dotenv/config";
import { app } from "./app"

const rawPort = process.env.PORT;
const port = rawPort === undefined ? 4000 : Number(rawPort);

if (!Number.isInteger(port) || port < 1 || port > 65535) {
  throw new Error("PORT  must be an integer between 1 and 65535");
}

app.listen(port, () => {
  console.log("Server is listening on port: ", port);
})
