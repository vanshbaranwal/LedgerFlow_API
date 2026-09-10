import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import transactionController from "../controllers/transaction.controller.js";

const router = express.Router();


router.post("/", authMiddleware.authMiddleware, transactionController.createTransaction);
router.post("/system/initial-funds", authMiddleware.authSystemUserMiddleware, transactionController.createInitialFundsTransaction);

export default router;