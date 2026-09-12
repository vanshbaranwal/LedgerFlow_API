import express from "express";
import cookieParser from "cookie-parser";
import authRouter from "./routes/auth.routes.js";
import accountRouter from "./routes/account.routes.js";
import transactionRouter from "./routes/transaction.routes.js";
import ledgerRouter from "./routes/ledger.routes.js";

const app = express();


app.use(express.json()); // this is used to let the express server read the data coming from req.body
app.use(cookieParser()); // this is used to set the token into the cookies

app.use("/api/auth", authRouter);
app.use("/api/accounts", accountRouter);
app.use("/api/transactions", transactionRouter);
app.use("/api/ledger", ledgerRouter);

export default app;
