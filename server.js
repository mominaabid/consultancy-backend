import express from 'express';
import dotenv from 'dotenv';
import routes from './src/routes/index.js';
import cors from "cors";
dotenv.config();

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api/v1', routes);

const PORT = process.env.PORT || 3001;

app.listen(PORT, () => {
  console.log(` Server is running on http://localhost:${PORT}`);
});