import dotenv from "dotenv";
dotenv.config();

const config = {
  PORT: process.env.PORT,
  MONGO_URI: process.env.MONGO_URI,
  JWT_USER_PASSWORD: process.env.JWT_PASSWORD,
  OPENAI_API_KEY: process.env.OPENAI_API_KEY,
  FRONTEND_URL: process.env.FRONTEND_URL,
};
export default config;