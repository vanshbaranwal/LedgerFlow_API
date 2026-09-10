import express from "express";
import authMiddleware from "../middleware/auth.middleware.js";
import accountController from "../controllers/account.controller.js";

const router = express.Router();



router.post("/", authMiddleware.authMiddleware, accountController.createAccountController);

router.get("/", authMiddleware.authMiddleware, accountController.getUserAccountsController);

router.get("/balance/:accountId", authMiddleware.authMiddleware, accountController.getAccountBalanceController);

export default router;