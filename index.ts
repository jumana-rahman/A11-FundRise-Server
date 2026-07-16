import "dotenv/config";
import app from "./lib/app";
import { connectToDatabase } from "./lib/db";

const PORT = process.env.PORT || 5000;

async function start() {
  await connectToDatabase();
  app.listen(PORT, () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

if (!process.env.VERCEL) {
  start().catch(console.error);
}
